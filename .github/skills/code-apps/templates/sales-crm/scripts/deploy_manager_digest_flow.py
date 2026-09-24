"""マネージャー向け「朝の営業ダイジェスト」フローを作成・有効化・テスト実行する。

平日の指定時刻に、クローズ予定日を過ぎた商談・次のアクションが未設定の商談・期限切れの活動を
Dataverse から集め、1 通の HTML メールで配信先へ送る（障害が 0 件の日は送らない）。

  python scripts/deploy_manager_digest_flow.py            # 計画だけ表示（既定）
  python scripts/deploy_manager_digest_flow.py --apply    # 作成（同名フローは置き換え）して有効化
  python scripts/deploy_manager_digest_flow.py --apply --run-now   # さらに 1 回テスト実行して結果を確認

.env: DATAVERSE_URL / SOLUTION_NAME / PUBLISHER_PREFIX / CONNECTION_REFERENCE_LOGICAL_NAME（Dataverse）
      CRM_DIGEST_TO（; 区切り。省略時は実行ユーザー）/ CRM_DIGEST_HOUR（既定 8）/ CRM_DIGEST_TIMEZONE / CRM_APP_URL
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

from dotenv import load_dotenv

load_dotenv(Path.cwd() / ".env")


def _add_auth_helper_path() -> None:
    for start in (Path(__file__).resolve().parent, Path.cwd()):
        for base in (start, *start.parents):
            candidate = base / ".github" / "skills" / "standard" / "scripts"
            if (candidate / "auth_helper.py").is_file():
                sys.path.insert(0, str(candidate))
                return
    sys.exit("auth_helper.py が見つかりません。.github/skills を含む作業ルートで実行してください。")


_add_auth_helper_path()
from auth_helper import DATAVERSE_URL, api_get, get_session, retry_metadata  # noqa: E402

P = os.getenv("PUBLISHER_PREFIX", "").strip()
SOLUTION = os.getenv("SOLUTION_NAME", "").strip()
DV_CONNREF = os.getenv("CONNECTION_REFERENCE_LOGICAL_NAME", "").strip()
FLOW_NAME = "Sales CRM 朝のダイジェスト"
FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"
DV = "shared_commondataserviceforapps"
OUTLOOK = "shared_office365"
if not (P and SOLUTION and DV_CONNREF and DATAVERSE_URL):
    sys.exit(".env の DATAVERSE_URL / SOLUTION_NAME / PUBLISHER_PREFIX / CONNECTION_REFERENCE_LOGICAL_NAME を設定してください。")


def c(name: str) -> str:
    return f"{P}_{name}"


def flow_session():
    return get_session(scope="https://service.flow.microsoft.com/.default")


def environment_id() -> str:
    envs = flow_session().get(f"{FLOW_API}/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01", timeout=120)
    envs.raise_for_status()
    for env in envs.json().get("value", []):
        url = (env.get("properties", {}).get("linkedEnvironmentMetadata", {}).get("instanceUrl") or "").rstrip("/")
        if url == DATAVERSE_URL:
            return env["name"]
    sys.exit(f"Power Automate 環境が見つかりません: {DATAVERSE_URL}")


def outlook_connection_reference(env_id: str, apply: bool) -> str:
    """ソリューション内（無ければ環境内）の Outlook 接続参照を流用し、無ければ Connected の接続から作る。"""
    connector = f"/providers/Microsoft.PowerApps/apis/{OUTLOOK}"
    existing = api_get(f"connectionreferences?$filter=connectorid eq '{connector}' and statecode eq 0"
                       "&$select=connectionreferenceid,connectionreferencelogicalname,connectionid").get("value", [])
    solution_id = api_get(f"solutions?$filter=uniquename eq '{SOLUTION}'&$select=solutionid")["value"][0]["solutionid"]
    in_solution = {r["objectid"] for r in api_get(
        f"solutioncomponents?$filter=_solutionid_value eq {solution_id} and componenttype eq 10132&$select=objectid").get("value", [])}
    # 別ソリューションの接続参照を使うとソリューション間の依存が生まれるため、同じソリューション → 同じ接頭辞の順に選ぶ
    bound = sorted((r for r in existing if r.get("connectionid")),
                   key=lambda r: (r["connectionreferenceid"] not in in_solution, not r["connectionreferencelogicalname"].startswith(f"{P}_")))
    if bound:
        return bound[0]["connectionreferencelogicalname"]
    logical = c("connref_salescrm_outlook")
    if not apply:
        return f"{logical}（--apply で作成）"
    session = get_session(scope="https://service.powerapps.com/.default")
    resp = session.get(f"{POWERAPPS_API}/providers/Microsoft.PowerApps/apis/{OUTLOOK}/connections",
                       params={"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'"}, timeout=120)
    resp.raise_for_status()
    connected = [x["name"] for x in resp.json().get("value", [])
                 if any(s.get("status") == "Connected" for s in x.get("properties", {}).get("statuses", []))]
    if not connected:
        sys.exit("Office 365 Outlook の接続がありません。power-automate スキルの接続作成標準で作成してください。")
    dv = get_session()
    dv.headers["MSCRM.SolutionUniqueName"] = SOLUTION
    body = {"connectionreferencelogicalname": logical, "connectionreferencedisplayname": "Office 365 Outlook (Sales CRM)",
            "connectorid": connector, "connectionid": connected[0]}
    retry_metadata(lambda: dv.post(f"{DATAVERSE_URL}/api/data/v9.2/connectionreferences", json=body).raise_for_status(), "Outlook 接続参照")
    return logical


def recipients() -> str:
    configured = os.getenv("CRM_DIGEST_TO", "").strip()
    if configured:
        return configured
    me = api_get("WhoAmI()")["UserId"]
    return api_get(f"systemusers({me})?$select=internalemailaddress")["internalemailaddress"]


def list_action(name: str, entity: str, filter_expr: str, select: list[str], orderby: str) -> dict:
    return {
        "type": "OpenApiConnection", "runAfter": {},
        "inputs": {
            "host": {"apiId": f"/providers/Microsoft.PowerApps/apis/{DV}", "connectionName": DV, "operationId": "ListRecords"},
            "parameters": {"entityName": entity, "$filter": filter_expr, "$select": ",".join(select), "$orderby": orderby, "$top": 50},
            "authentication": "@parameters('$authentication')",
        },
    }


def table_action(source: str, run_after: str, columns: list[tuple[str, str]]) -> dict:
    return {
        "type": "Table", "runAfter": {run_after: ["Succeeded"]},
        "inputs": {"from": f"@outputs('{source}')?['body/value']", "format": "HTML",
                   "columns": [{"header": h, "value": v} for h, v in columns]},
    }


def build_definition(hour: int, timezone: str, to: str, app_url: str) -> dict:
    opps, acts = c("crmopportunities"), c("crmactivities")
    owner = "@item()?['_ownerid_value@OData.Community.Display.V1.FormattedValue']"
    fmt_day = lambda col: f"@formatDateTime(item()?['{col}'],'yyyy/MM/dd')"  # noqa: E731
    today = "@{formatDateTime(utcNow(),'yyyy-MM-dd')}"
    open_stage = f"{c('stage')} ne 100000003 and {c('stage')} ne 100000004"
    total = "add(add(length(outputs('List_Overdue_Deals')?['body/value']),length(outputs('List_No_Next_Step')?['body/value'])),length(outputs('List_Overdue_Activities')?['body/value']))"
    section = lambda title, table: (f"<h3 style=\"margin:24px 0 8px;font-size:15px;color:#0f172a\">{title}</h3>"  # noqa: E731
                                    f"<div style=\"font-size:13px\">@{{body('{table}')}}</div>")
    link = f"<p style=\"margin-top:24px\"><a href=\"{app_url}\">チーム ダッシュボードを開く</a></p>" if app_url else ""
    body = ("<div style=\"font-family:'Segoe UI',Meiryo,sans-serif;color:#334155\">"
            "<h2 style=\"margin:0 0 4px;font-size:18px;color:#0f766e\">朝の営業ダイジェスト</h2>"
            f"<p style=\"margin:0\">支援が必要な項目が <b>@{{{total}}}</b> 件あります。声かけ・1on1 で障害を取り除きましょう。</p>"
            + section("クローズ予定日を過ぎた商談", "Table_Overdue_Deals")
            + section("次のアクションが未設定の商談", "Table_No_Next_Step")
            + section("期限切れの活動", "Table_Overdue_Activities")
            + link + "<p style=\"margin-top:24px;font-size:12px;color:#94a3b8\">Sales CRM（Power Automate）から自動送信</p></div>")
    actions = {
        "List_Overdue_Deals": list_action("List_Overdue_Deals", opps, f"{open_stage} and {c('estimatedclosedate')} lt {today}",
                                          [c("name"), c("amount"), c("estimatedclosedate"), "_ownerid_value"], f"{c('estimatedclosedate')} asc"),
        "List_No_Next_Step": list_action("List_No_Next_Step", opps, f"{open_stage} and {c('nextstep')} eq null",
                                         [c("name"), c("amount"), c("estimatedclosedate"), "_ownerid_value"], f"{c('amount')} desc"),
        "List_Overdue_Activities": list_action("List_Overdue_Activities", acts, f"{c('status')} ne 100000002 and {c('duedate')} lt @{{utcNow()}}",
                                               [c("name"), c("duedate"), "_ownerid_value", f"_{c('opportunityid')}_value"], f"{c('duedate')} asc"),
    }
    actions["List_No_Next_Step"]["runAfter"] = {"List_Overdue_Deals": ["Succeeded"]}
    actions["List_Overdue_Activities"]["runAfter"] = {"List_No_Next_Step": ["Succeeded"]}
    actions["Table_Overdue_Deals"] = table_action("List_Overdue_Deals", "List_Overdue_Activities", [
        ("商談", f"@item()?['{c('name')}']"), ("担当", owner),
        ("金額", f"@item()?['{c('amount')}@OData.Community.Display.V1.FormattedValue']"), ("クローズ予定", fmt_day(c("estimatedclosedate")))])
    actions["Table_No_Next_Step"] = table_action("List_No_Next_Step", "Table_Overdue_Deals", [
        ("商談", f"@item()?['{c('name')}']"), ("担当", owner),
        ("金額", f"@item()?['{c('amount')}@OData.Community.Display.V1.FormattedValue']"), ("クローズ予定", fmt_day(c("estimatedclosedate")))])
    actions["Table_Overdue_Activities"] = table_action("List_Overdue_Activities", "Table_No_Next_Step", [
        ("活動", f"@item()?['{c('name')}']"), ("担当", owner),
        ("商談", f"@item()?['_{c('opportunityid')}_value@OData.Community.Display.V1.FormattedValue']"), ("期日", fmt_day(c("duedate")))])
    actions["If_Has_Blockers"] = {
        "type": "If", "runAfter": {"Table_Overdue_Activities": ["Succeeded"]},
        "expression": {"greater": [f"@{total}", 0]},
        "actions": {"Send_Digest": {
            "type": "OpenApiConnection", "runAfter": {},
            "inputs": {
                "host": {"apiId": f"/providers/Microsoft.PowerApps/apis/{OUTLOOK}", "connectionName": OUTLOOK, "operationId": "SendEmailV2"},
                "parameters": {"emailMessage/To": to,
                               "emailMessage/Subject": f"【営業ダイジェスト】支援が必要な項目 @{{{total}}} 件（@{{formatDateTime(convertFromUtc(utcNow(),'{timezone}'),'yyyy/MM/dd')}}）",
                               "emailMessage/Body": body, "emailMessage/Importance": "Normal"},
                "authentication": "@parameters('$authentication')",
            },
        }},
        "else": {"actions": {}},
    }
    return {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {"$authentication": {"defaultValue": {}, "type": "SecureObject"}, "$connections": {"defaultValue": {}, "type": "Object"}},
        "triggers": {"Recurrence": {"type": "Recurrence", "recurrence": {
            "frequency": "Week", "interval": 1, "timeZone": timezone,
            "schedule": {"weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "hours": [str(hour)], "minutes": [0]}}}},
        "actions": actions,
    }


def deploy(definition: dict, outlook_ref: str) -> str:
    clientdata = {"schemaVersion": "1.0.0.0", "properties": {"definition": definition, "connectionReferences": {
        DV: {"runtimeSource": "embedded", "connection": {"connectionReferenceLogicalName": DV_CONNREF}, "api": {"name": DV}},
        OUTLOOK: {"runtimeSource": "embedded", "connection": {"connectionReferenceLogicalName": outlook_ref}, "api": {"name": OUTLOOK}},
    }}}
    dv = get_session()
    base = f"{DATAVERSE_URL}/api/data/v9.2"
    for old in api_get(f"workflows?$filter=name eq '{FLOW_NAME}' and category eq 5&$select=workflowid").get("value", []):
        dv.patch(f"{base}/workflows({old['workflowid']})", json={"statecode": 0, "statuscode": 1})
        dv.delete(f"{base}/workflows({old['workflowid']})").raise_for_status()
        print(f"  - 既存フローを置き換え: {old['workflowid']}")
    dv.headers["MSCRM.SolutionUniqueName"] = SOLUTION
    resp = dv.post(f"{base}/workflows", json={
        "name": FLOW_NAME, "type": 1, "category": 5, "statecode": 0, "statuscode": 1, "primaryentity": "none",
        "description": "平日朝に、期限超過・次アクション未設定の商談と期限切れの活動をマネージャーへ配信する",
        "clientdata": json.dumps(clientdata, ensure_ascii=False)})
    if not resp.ok:
        sys.exit(f"フロー作成に失敗しました ({resp.status_code}): {resp.text[:500]}")
    workflow_id = resp.headers["OData-EntityId"].split("(")[-1].rstrip(")")
    activate = get_session().patch(f"{base}/workflows({workflow_id})", json={"statecode": 1, "statuscode": 2})
    if not activate.ok:
        sys.exit(f"有効化に失敗しました ({activate.status_code}): {activate.text[:500]}")
    print(f"  + 作成・有効化: {workflow_id}")
    return workflow_id


def run_now(env_id: str, workflow_id: str) -> int:
    flow_id = api_get(f"workflows({workflow_id})?$select=resourceid").get("resourceid") or workflow_id
    base = f"{FLOW_API}/providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{flow_id}"
    session = flow_session()
    started = session.post(f"{base}/triggers/Recurrence/run?api-version=2016-11-01", timeout=120)
    if not started.ok:
        print(f"NG: テスト実行を開始できません ({started.status_code}): {started.text[:300]}")
        return 1
    for _ in range(30):
        time.sleep(10)
        runs = session.get(f"{base}/runs?api-version=2016-11-01&$top=1", timeout=120).json().get("value", [])
        status = runs[0]["properties"]["status"] if runs else "NotStarted"
        if status not in ("Running", "Waiting", "NotStarted"):
            print(f"  テスト実行の結果: {status}")
            if status != "Succeeded":
                print(json.dumps(runs[0]["properties"].get("error", {}), ensure_ascii=False)[:500])
            return 0 if status == "Succeeded" else 1
    print("NG: 5 分以内に完了しませんでした。Power Automate の実行履歴を確認してください。")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="フローを作成（同名は置き換え）して有効化する")
    parser.add_argument("--run-now", action="store_true", help="作成後に 1 回テスト実行する（配信先へメールが届く）")
    args = parser.parse_args()

    env_id = environment_id()
    outlook_ref = outlook_connection_reference(env_id, args.apply)
    to = recipients()
    hour = int(os.getenv("CRM_DIGEST_HOUR", "8"))
    timezone = os.getenv("CRM_DIGEST_TIMEZONE", "Tokyo Standard Time")
    definition = build_definition(hour, timezone, to, os.getenv("CRM_APP_URL", "").strip())
    print(f"フロー: {FLOW_NAME}\n  環境: {env_id}\n  ソリューション: {SOLUTION}\n  配信: 平日 {hour}:00（{timezone}）→ {to}")
    print(f"  接続参照: Dataverse={DV_CONNREF} / Outlook={outlook_ref}")
    if not args.apply:
        print("DRY-RUN: 作成していません。--apply で作成・有効化します。")
        return 0
    workflow_id = deploy(definition, outlook_ref)
    return run_now(env_id, workflow_id) if args.run_now else 0


if __name__ == "__main__":
    raise SystemExit(main())
