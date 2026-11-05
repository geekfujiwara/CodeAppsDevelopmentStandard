"""Deploy a Dataverse opportunity-created trigger and HTML email notification."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

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
from auth_helper import DATAVERSE_URL, api_get, api_post, get_session, retry_metadata  # noqa: E402

PREFIX = os.getenv("PUBLISHER_PREFIX", "").strip()
SOLUTION = os.getenv("SOLUTION_NAME", "").strip()
DV_CONNREF = os.getenv("CONNECTION_REFERENCE_LOGICAL_NAME", "").strip()
FLOW_NAME = "Sales CRM 新規商談メール通知"
FLOW_DESCRIPTION = "商談作成時に商談概要をHTMLメールで本人へ通知する"
FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"
DV = "shared_commondataserviceforapps"
OUTLOOK = "shared_office365"
API_VERSION = "api-version=2016-11-01"
EMAIL_RE = re.compile(r"^[^@\s;<>]+@[^@\s;<>]+\.[^@\s;<>]+$")


def c(name: str) -> str:
    return f"{PREFIX}_{name}"


def flow_session():
    return get_session(scope="https://service.flow.microsoft.com/.default")


def environment_id() -> str:
    response = flow_session().get(
        f"{FLOW_API}/providers/Microsoft.ProcessSimple/environments?{API_VERSION}", timeout=120)
    response.raise_for_status()
    expected = DATAVERSE_URL.rstrip("/").lower()
    matches = [
        env["name"] for env in response.json().get("value", [])
        if (env.get("properties", {}).get("linkedEnvironmentMetadata", {}).get("instanceUrl") or "")
        .rstrip("/").lower() == expected
    ]
    if len(matches) != 1:
        raise RuntimeError(f"対象Dataverse URLに対応するPower Automate環境が1件必要です（検出: {len(matches)}）。")
    return matches[0]


def recipient() -> str:
    configured = os.getenv("CRM_OPPORTUNITY_CREATED_TO", "").strip()
    if configured:
        addresses = [address.strip() for address in configured.split(";") if address.strip()]
        if not addresses or any(not EMAIL_RE.fullmatch(address) for address in addresses):
            raise ValueError("CRM_OPPORTUNITY_CREATED_TO must contain valid semicolon-separated email addresses.")
        return ";".join(addresses)
    user_id = api_get("WhoAmI()")["UserId"]
    address = api_get(f"systemusers({user_id})?$select=internalemailaddress").get("internalemailaddress", "")
    if not EMAIL_RE.fullmatch(address):
        raise RuntimeError("The signed-in Dataverse user has no valid internal email address.")
    return address


def _solution_components(solution_id: str, component_type: int) -> set[str]:
    result = api_get(f"solutioncomponents?$filter=_solutionid_value eq {solution_id} "
                     f"and componenttype eq {component_type}&$select=objectid")
    return {row["objectid"] for row in result.get("value", [])}


def ensure_connection_reference(connector: str, display: str, env_id: str, apply: bool) -> str:
    solution = api_get(f"solutions?$filter=uniquename eq '{SOLUTION}'&$select=solutionid").get("value", [])
    if len(solution) != 1:
        raise RuntimeError("The configured solution must exist exactly once.")
    in_solution = _solution_components(solution[0]["solutionid"], 10088)
    if connector == DV:
        logical = DV_CONNREF
        if not logical:
            raise ValueError("CONNECTION_REFERENCE_LOGICAL_NAME is required for the Dataverse connector.")
        rows = api_get(
            f"connectionreferences?$filter=connectionreferencelogicalname eq '{logical}' and statecode eq 0"
            "&$select=connectionreferenceid,connectionreferencelogicalname,connectionid,connectorid")
        matches = rows.get("value", [])
        if len(matches) != 1 or not matches[0].get("connectionid"):
            raise RuntimeError("The configured Dataverse connection reference must exist and be bound.")
        if matches[0]["connectionreferenceid"] not in in_solution:
            raise RuntimeError("The configured Dataverse connection reference must belong to the CRM solution.")
        if matches[0].get("connectorid", "").rstrip("/").split("/")[-1] != DV:
            raise ValueError("The configured connection reference is not a Dataverse connection.")
        return logical

    connector_path = f"/providers/Microsoft.PowerApps/apis/{connector}"
    existing = api_get(
        f"connectionreferences?$filter=connectorid eq '{connector_path}' and statecode eq 0"
        "&$select=connectionreferenceid,connectionreferencelogicalname,connectionid")
    refs = [row for row in existing.get("value", []) if row.get("connectionid")]
    owned_refs = [row for row in refs if row["connectionreferenceid"] in in_solution]
    owned_refs.sort(key=lambda row: not row["connectionreferencelogicalname"].startswith(f"{PREFIX}_"))
    if owned_refs:
        return owned_refs[0]["connectionreferencelogicalname"]

    logical = c("connref_salescrm_outlook")
    if not apply:
        return f"{logical} (created on --apply if a Connected Outlook connection exists)"
    session = get_session(scope="https://service.powerapps.com/.default")
    response = session.get(
        f"{POWERAPPS_API}/providers/Microsoft.PowerApps/apis/{connector}/connections",
        params={"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'"}, timeout=120)
    response.raise_for_status()
    connected = [
        item["name"] for item in response.json().get("value", [])
        if any(state.get("status") == "Connected"
               for state in item.get("properties", {}).get("statuses", []))
    ]
    if not connected:
        raise RuntimeError(f"{display} のConnected接続がありません。接続を作成してから再実行してください。")
    body = {
        "connectionreferencelogicalname": logical,
        "connectionreferencedisplayname": "Office 365 Outlook (Sales CRM)",
        "connectorid": connector_path,
        "connectionid": connected[0],
    }
    created = api_post("connectionreferences", body, solution=SOLUTION)
    if not created:
        raise RuntimeError("Outlook connection reference creation returned no ID.")
    return logical


def _escaped_trigger_value(field: str, fallback: str = "未設定") -> str:
    source = f"triggerOutputs()?['body/{field}']"
    raw = f"coalesce({source},'{fallback}')"
    return f"replace(replace(replace({raw},'&','&amp;'),'<','&lt;'),'>','&gt;')"


def build_definition(to: str, timezone: str = "Tokyo Standard Time") -> dict:
    if not PREFIX or not SOLUTION or not DATAVERSE_URL:
        raise ValueError("DATAVERSE_URL, SOLUTION_NAME and PUBLISHER_PREFIX must be configured.")
    addresses = [address.strip() for address in to.split(";") if address.strip()]
    if not addresses or any(not EMAIL_RE.fullmatch(address) for address in addresses):
        raise ValueError("A valid email recipient is required.")
    if not timezone.strip() or any(char in timezone for char in "'\r\n"):
        raise ValueError("The notification timezone must be a non-empty Windows timezone ID.")

    fields = {
        "Compose_Opportunity_Name": _escaped_trigger_value(c("name"), "名称未設定"),
        "Compose_Customer": _escaped_trigger_value(
            f"_{c('accountid')}_value@OData.Community.Display.V1.FormattedValue"),
        "Compose_Stage": _escaped_trigger_value(
            f"{c('stage')}@OData.Community.Display.V1.FormattedValue"),
        "Compose_Amount": _escaped_trigger_value(
            f"{c('amount')}@OData.Community.Display.V1.FormattedValue"),
        "Compose_Probability": _escaped_trigger_value(c("probability")),
        "Compose_Close_Date": (
            f"if(empty(triggerOutputs()?['body/{c('estimatedclosedate')}']),'未設定',"
            f"formatDateTime(triggerOutputs()?['body/{c('estimatedclosedate')}'],'yyyy/MM/dd'))"),
        "Compose_Creator": _escaped_trigger_value(
            "_createdby_value@OData.Community.Display.V1.FormattedValue"),
        "Compose_Created_On": (
            f"formatDateTime(convertFromUtc(triggerOutputs()?['body/createdon'],"
            f"'{timezone}'),'yyyy/MM/dd HH:mm')"),
        "Compose_Next_Step": _escaped_trigger_value(c("nextstep")),
    }
    body = (
        '<html><body style="margin:0;padding:0;background-color:#f3f4f6;'
        "font-family:'Segoe UI',Meiryo,Arial,sans-serif;color:#1f2937;\">"
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background-color:#f3f4f6;"><tr><td align="center" style="padding:32px 12px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;'
        'border-radius:8px;border-collapse:separate;overflow:hidden;">'
        '<tr><td style="padding:26px 32px;background-color:#1e3a8a;border-bottom:4px solid #60a5fa;">'
        '<div style="font-size:12px;letter-spacing:1.5px;color:#bfdbfe;">SALES CRM ・ NEW OPPORTUNITY</div>'
        '<h1 style="margin:8px 0 0;font-size:23px;line-height:1.4;color:#ffffff;">新しい商談が登録されました</h1>'
        '</td></tr><tr><td style="padding:24px 32px 8px;">'
        '<p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;">'
        '営業支援CRMに新しい商談が作成されました。内容をご確認ください。</p></td></tr>'
        '<tr><td style="padding:12px 32px 24px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="border:1px solid #e5e7eb;border-collapse:collapse;">'
        '<tr><td width="150" style="padding:13px 15px;background-color:#eff6ff;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#1e3a8a;">商談名</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:15px;font-weight:600;">'
        "@{outputs('Compose_Opportunity_Name')}</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#f9fafb;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">取引先</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:14px;">'
        "@{outputs('Compose_Customer')}</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#eff6ff;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#1e3a8a;">ステージ</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:14px;">'
        "@{outputs('Compose_Stage')}</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#f9fafb;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">金額</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:14px;">'
        "@{outputs('Compose_Amount')}</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#eff6ff;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#1e3a8a;">確度</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:14px;">'
        "@{outputs('Compose_Probability')}%</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#f9fafb;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">クローズ予定</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:14px;">'
        "@{outputs('Compose_Close_Date')}</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#eff6ff;'
        'border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#1e3a8a;">次のアクション</td>'
        '<td style="padding:13px 15px;border-bottom:1px solid #e5e7eb;font-size:14px;">'
        "@{outputs('Compose_Next_Step')}</td></tr>"
        '<tr><td width="150" style="padding:13px 15px;background-color:#f9fafb;'
        'font-size:13px;font-weight:600;">作成者・日時</td>'
        '<td style="padding:13px 15px;font-size:14px;">@{outputs(\'Compose_Creator\')} ・ '
        "@{outputs('Compose_Created_On')}</td></tr>"
        '</table></td></tr><tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;'
        'font-size:12px;line-height:1.6;color:#6b7280;">'
        'このメールは商談作成をお知らせする自動通知です。返信は不要です。'
        '</td></tr></table></td></tr></table></body></html>'
    )
    actions: dict = {}
    previous = None
    for name, expression in fields.items():
        actions[name] = {
            "type": "Compose",
            "runAfter": {} if previous is None else {previous: ["Succeeded"]},
            "inputs": f"@{expression}",
        }
        previous = name
    subject = (
        f"concat('【新規商談】',coalesce(triggerOutputs()?['body/{c('name')}'],'名称未設定'))"
    )
    actions["Send_Opportunity_Email"] = {
        "type": "OpenApiConnection",
        "runAfter": {previous: ["Succeeded"]},
        "inputs": {
            "host": {
                "apiId": f"/providers/Microsoft.PowerApps/apis/{OUTLOOK}",
                "connectionName": OUTLOOK,
                "operationId": "SendEmailV2",
            },
            "parameters": {
                "emailMessage/To": to,
                "emailMessage/Subject": f"@{subject}",
                "emailMessage/Body": body,
                "emailMessage/Importance": "Normal",
            },
            "authentication": "@parameters('$authentication')",
        },
    }
    return {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "When_Opportunity_Is_Created": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{DV}",
                        "connectionName": DV,
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 1,
                        "subscriptionRequest/entityname": c("crmopportunity"),
                        "subscriptionRequest/scope": 4,
                        "subscriptionRequest/runas": 3,
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
        "actions": actions,
    }


def clientdata(definition: dict, dv_ref: str, outlook_ref: str) -> str:
    return json.dumps({
        "schemaVersion": "1.0.0.0",
        "properties": {
            "definition": definition,
            "connectionReferences": {
                DV: {"runtimeSource": "embedded",
                     "connection": {"connectionReferenceLogicalName": dv_ref},
                     "api": {"name": DV}},
                OUTLOOK: {"runtimeSource": "embedded",
                          "connection": {"connectionReferenceLogicalName": outlook_ref},
                          "api": {"name": OUTLOOK}},
            },
        },
    }, ensure_ascii=False)


def deploy(env_id: str, definition: dict, dv_ref: str, outlook_ref: str) -> str:
    rows = api_get(f"workflows?$filter=name eq '{FLOW_NAME}' and category eq 5"
                   "&$select=workflowid,statecode,statuscode,clientdata")
    existing = rows.get("value", [])
    if len(existing) > 1:
        raise RuntimeError("複数の同名フローがあるため、変更せず停止します。")
    solution = api_get(f"solutions?$filter=uniquename eq '{SOLUTION}'&$select=solutionid").get("value", [])
    if len(solution) != 1:
        raise RuntimeError("The configured solution must exist exactly once.")
    solution_flows = _solution_components(solution[0]["solutionid"], 29)
    if existing and existing[0]["workflowid"] not in solution_flows:
        raise RuntimeError("A flow with this name exists outside the CRM solution; it will not be overwritten.")
    session = get_session()
    base = f"{DATAVERSE_URL.rstrip('/')}/api/data/v9.2"
    data = clientdata(definition, dv_ref, outlook_ref)
    if existing:
        workflow_id = existing[0]["workflowid"]
        session.patch(f"{base}/workflows({workflow_id})",
                      json={"statecode": 0, "statuscode": 1}).raise_for_status()
        session.patch(f"{base}/workflows({workflow_id})",
                      json={"clientdata": data, "description": FLOW_DESCRIPTION}).raise_for_status()
    else:
        session.headers["MSCRM.SolutionUniqueName"] = SOLUTION
        response = session.post(f"{base}/workflows", json={
            "name": FLOW_NAME, "type": 1, "category": 5, "statecode": 0, "statuscode": 1,
            "primaryentity": "none", "description": FLOW_DESCRIPTION, "clientdata": data,
        })
        response.raise_for_status()
        location = response.headers.get("OData-EntityId", "")
        if not location or "(" not in location:
            raise RuntimeError("Flow created but no workflow ID was returned; inspect before retrying.")
        workflow_id = location.split("(")[-1].rstrip(")")

    time.sleep(3)
    session.patch(f"{base}/workflows({workflow_id})",
                  json={"statecode": 1, "statuscode": 2}).raise_for_status()
    time.sleep(3)
    resource_id = api_get(f"workflows({workflow_id})?$select=resourceid").get("resourceid") or workflow_id
    start = flow_session().post(
        f"{FLOW_API}/providers/Microsoft.ProcessSimple/environments/{env_id}"
        f"/flows/{resource_id}/start?{API_VERSION}", timeout=120)
    start.raise_for_status()
    actual = api_get(f"workflows({workflow_id})?$select=name,statecode,statuscode,clientdata")
    parsed = json.loads(actual["clientdata"])
    trigger = parsed["properties"]["definition"]["triggers"]["When_Opportunity_Is_Created"]
    if (actual["name"] != FLOW_NAME or actual["statecode"] != 1 or actual["statuscode"] != 2 or
            trigger["inputs"]["parameters"]["subscriptionRequest/entityname"] != c("crmopportunity")):
        raise RuntimeError("Flow activation/read-back did not match the requested opportunity trigger.")
    return workflow_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create/update and activate the solution flow.")
    args = parser.parse_args()
    if not (PREFIX and SOLUTION and DATAVERSE_URL):
        raise RuntimeError("DATAVERSE_URL, SOLUTION_NAME and PUBLISHER_PREFIX must be configured.")
    if not DV_CONNREF:
        raise RuntimeError("CONNECTION_REFERENCE_LOGICAL_NAME must be configured.")
    env_id = environment_id()
    to = recipient()
    dv_ref = ensure_connection_reference(DV, "Dataverse", env_id, args.apply)
    outlook_ref = ensure_connection_reference(OUTLOOK, "Office 365 Outlook", env_id, args.apply)
    definition = build_definition(to, os.getenv("CRM_OPPORTUNITY_CREATED_TIMEZONE", "Tokyo Standard Time"))
    print(f"Flow: {FLOW_NAME}\nSolution: {SOLUTION}\nEnvironment resolved: yes\n"
          f"Recipient resolved: yes\nDataverse and Outlook references resolved: yes")
    if not args.apply:
        print("DRY-RUN: no flow was created or activated. Pass --apply after approving the plan.")
        return 0
    workflow_id = deploy(env_id, definition, dv_ref, outlook_ref)
    print(f"PASS: opportunity-created HTML email flow activated and webhook started ({workflow_id}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
