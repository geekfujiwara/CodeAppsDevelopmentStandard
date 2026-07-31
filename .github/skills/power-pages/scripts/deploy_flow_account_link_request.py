"""
紐づけ依頼の管理者通知フローをデプロイする。

トリガー : Dataverse「行が追加されたとき」（{prefix}_accountlinkrequest）
アクション: 依頼者の contact を取得 → Office 365 Outlook で管理者にメール送信

HTTP トリガーを使わない理由は references/account-link-request-flow.md を参照
（URL を知っていれば誰でも叩けるため、なりすまし通知の踏み台になる）。

前提:
  - .env に DATAVERSE_URL / TENANT_ID / PUBLISHER_PREFIX / SOLUTION_NAME
    / ACCOUNT_LINK_REQUEST_TABLE / ACCOUNT_LINK_ADMIN_RECIPIENT
  - Dataverse と Office 365 Outlook の接続が環境に作成済み
    https://make.powerautomate.com/connections

使い方:
  python .github/skills/power-pages/scripts/deploy_flow_account_link_request.py
"""

from __future__ import annotations

import json
import os
import sys
import time

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_THIS_DIR, "..", "..", "standard", "scripts"))

import requests  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from auth_helper import DATAVERSE_URL, api_get, get_session, get_token  # noqa: E402

load_dotenv()

PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek").strip()
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "").strip()
REQUEST_TABLE = os.environ.get("ACCOUNT_LINK_REQUEST_TABLE", "").strip()
RECIPIENT = os.environ.get("ACCOUNT_LINK_ADMIN_RECIPIENT", "").strip()

API = f"{DATAVERSE_URL.rstrip('/')}/api/data/v9.2"
FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"

FLOW_NAME = "取引先企業の紐づけ依頼通知"
CONNECTOR_DATAVERSE = "shared_commondataserviceforapps"
CONNECTOR_OUTLOOK = "shared_office365"
CONNREF_DATAVERSE = f"{PREFIX}_connref_alr_dataverse"
CONNREF_OUTLOOK = f"{PREFIX}_connref_alr_outlook"
CONNECTORS = {
    CONNECTOR_DATAVERSE: "Dataverse",
    CONNECTOR_OUTLOOK: "Office 365 Outlook",
}
STATUS_OPEN = 100000000


def _require(name: str, value: str) -> str:
    if not value:
        sys.exit(f"ERROR: .env の {name} が未設定です")
    return value


def flow_api(method: str, path: str, body: dict | None = None):
    sep = "&" if "?" in path else "?"
    resp = requests.request(
        method,
        f"{FLOW_API}{path}{sep}api-version=2016-11-01",
        headers={
            "Authorization": f"Bearer {get_token(scope='https://service.flow.microsoft.com/.default')}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json() if resp.content else None


def powerapps_api(path: str, params: dict | None = None):
    resp = requests.get(
        f"{POWERAPPS_API}{path}",
        headers={
            "Authorization": f"Bearer {get_token(scope='https://service.powerapps.com/.default')}",
            "Content-Type": "application/json",
        },
        params={**(params or {}), "api-version": "2016-11-01"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json() if resp.content else None


def resolve_environment_id() -> str:
    envs = flow_api("GET", "/providers/Microsoft.ProcessSimple/environments")
    target = DATAVERSE_URL.rstrip("/")
    for env in envs.get("value", []):
        linked = env.get("properties", {}).get("linkedEnvironmentMetadata", {})
        if (linked.get("instanceUrl") or "").rstrip("/") == target:
            print(f"  環境 ID: {env['name']}")
            return env["name"]
    sys.exit(f"ERROR: DATAVERSE_URL='{DATAVERSE_URL}' に対応する環境が見つかりません")


def resolve_entity_set_name(logical: str) -> str:
    """GetItem アクションの entityName は複数形のエンティティセット名を使う。
    （トリガーの subscriptionRequest/entityname は逆に論理名でないと EntityNotFound になる）
    """
    data = api_get(
        f"EntityDefinitions(LogicalName='{logical}')?$select=EntitySetName,PrimaryIdAttribute"
    )
    return data["EntitySetName"]


def find_connections(env_id: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for connector, display in CONNECTORS.items():
        data = powerapps_api(
            f"/providers/Microsoft.PowerApps/apis/{connector}/connections",
            {"$filter": f"environment eq '{env_id}'"},
        )
        for conn in data.get("value", []):
            statuses = conn.get("properties", {}).get("statuses", [])
            if any(s.get("status") == "Connected" for s in statuses):
                found[connector] = conn["name"]
                print(f"  {display}: {conn['name']}")
                break
        if connector not in found:
            sys.exit(
                f"ERROR: {display} ({connector}) の接続がありません。\n"
                "       https://make.powerautomate.com/connections で作成してください"
            )
    return found


def upsert_connection_reference(logical_name: str, display_name: str,
                                connector_id: str, connection_id: str) -> None:
    session = get_session()
    resp = session.get(
        f"{API}/connectionreferences"
        f"?$filter=connectionreferencelogicalname eq '{logical_name}'"
        f"&$select=connectionreferenceid,connectionid"
    )
    resp.raise_for_status()
    existing = resp.json().get("value", [])
    if existing:
        ref_id = existing[0]["connectionreferenceid"]
        if existing[0].get("connectionid") != connection_id:
            session.patch(f"{API}/connectionreferences({ref_id})",
                          json={"connectionid": connection_id}).raise_for_status()
        print(f"  接続参照: {logical_name}（既存）")
        return
    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": connector_id,
        "connectionid": connection_id,
    }
    creator = get_session()
    if SOLUTION_NAME:
        creator.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    creator.post(f"{API}/connectionreferences", json=body).raise_for_status()
    print(f"  接続参照: {logical_name}（作成）")


def build_email_html() -> str:
    template = (
        '<html><head><meta charset="utf-8"></head>'
        '<body style="margin:0;padding:0;background-color:#f1f5f9;'
        "font-family:'Segoe UI',Roboto,Arial,sans-serif;\">"
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background-color:#f1f5f9;padding:32px 0;"><tr><td align="center">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'style="background-color:#ffffff;border-radius:12px;overflow:hidden;'
        'box-shadow:0 4px 24px rgba(0,0,0,0.08);">'
        '<tr><td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);'
        'padding:28px 40px;">'
        '<div style="font-size:12px;color:#94a3b8;letter-spacing:2px;'
        'text-transform:uppercase;margin-bottom:6px;">ACCOUNT LINK REQUEST</div>'
        '<div style="font-size:20px;font-weight:700;color:#ffffff;">'
        '取引先企業の紐づけ依頼が届きました</div>'
        '</td></tr>'
        '<tr><td style="padding:28px 40px 8px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">'
        '<tr style="background-color:#f8fafc;">'
        '<td style="padding:14px 20px;width:150px;border-bottom:1px solid #e2e8f0;'
        'font-size:13px;font-weight:600;color:#475569;">依頼者</td>'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;font-size:14px;'
        'color:#0f172a;">@{outputs(\'Get_Contact\')?[\'body/fullname\']}</td></tr>'
        '<tr>'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;'
        'font-size:13px;font-weight:600;color:#475569;">メール</td>'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;font-size:14px;'
        'color:#0f172a;">@{outputs(\'Get_Contact\')?[\'body/emailaddress1\']}</td></tr>'
        '<tr style="background-color:#f8fafc;">'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;'
        'font-size:13px;font-weight:600;color:#475569;">申告された会社名</td>'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;font-size:14px;'
        "font-weight:600;color:#0f172a;\">@{triggerOutputs()?['body/{prefix}_requestedcompany']}"
        '</td></tr>'
        '<tr>'
        '<td style="padding:14px 20px;font-size:13px;font-weight:600;color:#475569;">'
        '依頼日時</td>'
        '<td style="padding:14px 20px;font-size:14px;color:#0f172a;">'
        "@{formatDateTime(triggerOutputs()?['body/createdon'],'yyyy/MM/dd HH:mm')}</td></tr>"
        '</table></td></tr>'
        '<tr><td style="padding:8px 40px 28px;">'
        '<div style="padding:14px 18px;background-color:#fff7ed;border-radius:8px;'
        'border-left:4px solid #f97316;font-size:13px;color:#7c2d12;line-height:1.7;">'
        '申告された会社名は<strong>自己申告</strong>です。'
        '正規の名簿と突き合わせてから管理画面で紐づけてください。</div>'
        '</td></tr>'
        '<tr><td style="padding:0 40px 28px;">'
        '<div style="font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">'
        'このメールは Power Automate から自動送信されています。</div>'
        '</td></tr>'
        '</table></td></tr></table></body></html>'
    )
    return template.replace("{prefix}", PREFIX)


def build_clientdata() -> str:
    subject = (
        "[Power Pages] 取引先企業の紐づけ依頼: "
        "@{outputs('Get_Contact')?['body/fullname']}"
    )
    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/"
                   "schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "When_link_request_created": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/"
                                 "shared_commondataserviceforapps",
                        "connectionName": CONNECTOR_DATAVERSE,
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 1,        # 1 = Create
                        "subscriptionRequest/entityname": REQUEST_TABLE,
                        "subscriptionRequest/scope": 4,          # Organization
                        "subscriptionRequest/runas": 3,          # Modifying user
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
        "actions": {
            "Get_Contact": {
                "type": "OpenApiConnection",
                "runAfter": {},
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/"
                                 "shared_commondataserviceforapps",
                        "connectionName": CONNECTOR_DATAVERSE,
                        "operationId": "GetItem",
                    },
                    "parameters": {
                        "entityName": "contacts",
                        "recordId": f"@triggerOutputs()?['body/_{PREFIX}_contactid_value']",
                        "$select": "fullname,emailaddress1",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
            "Send_Request_Email": {
                "type": "OpenApiConnection",
                "runAfter": {"Get_Contact": ["Succeeded"]},
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                        "connectionName": CONNECTOR_OUTLOOK,
                        "operationId": "SendEmailV2",
                    },
                    "parameters": {
                        "emailMessage/To": RECIPIENT,
                        "emailMessage/Subject": subject,
                        "emailMessage/Body": build_email_html(),
                        "emailMessage/Importance": "Normal",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
    }
    # 接続参照経由（runtimeSource=embedded）でないとフロー有効化が
    # AzureResourceManagerRequestFailed で失敗する（power-automate スキルの検証済み教訓）
    connection_references = {
        CONNECTOR_DATAVERSE: {
            "runtimeSource": "embedded",
            "connection": {"connectionReferenceLogicalName": CONNREF_DATAVERSE},
            "api": {"name": CONNECTOR_DATAVERSE},
        },
        CONNECTOR_OUTLOOK: {
            "runtimeSource": "embedded",
            "connection": {"connectionReferenceLogicalName": CONNREF_OUTLOOK},
            "api": {"name": CONNECTOR_OUTLOOK},
        },
    }
    return json.dumps(
        {
            "properties": {
                "definition": definition,
                "connectionReferences": connection_references,
            },
            "schemaVersion": "1.0.0.0",
        },
        ensure_ascii=False,
    )


def deploy(env_id: str) -> str:
    session = get_session()
    resp = session.get(
        f"{API}/workflows?$filter=name eq '{FLOW_NAME}' and category eq 5"
        f"&$select=workflowid"
    )
    resp.raise_for_status()
    for existing in resp.json().get("value", []):
        wf_id = existing["workflowid"]
        session.patch(f"{API}/workflows({wf_id})", json={"statecode": 0, "statuscode": 1})
        session.delete(f"{API}/workflows({wf_id})")
        print(f"  既存フローを削除: {wf_id}")
        time.sleep(3)

    creator = get_session()
    if SOLUTION_NAME:
        creator.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    created = creator.post(
        f"{API}/workflows",
        json={
            "name": FLOW_NAME,
            "type": 1,
            "category": 5,
            "statecode": 0,
            "statuscode": 1,
            "primaryentity": "none",
            "clientdata": build_clientdata(),
            "description": "紐づけ依頼が作成されたとき、アプリ管理者にメールで通知する",
        },
    )
    if not created.ok:
        sys.exit(f"ERROR: フロー作成に失敗しました ({created.status_code}): {created.text[:500]}")
    wf_id = created.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  CREATED: {wf_id}")

    activated = session.patch(f"{API}/workflows({wf_id})",
                              json={"statecode": 1, "statuscode": 2})
    if not activated.ok:
        sys.exit(f"ERROR: フローの有効化に失敗しました ({activated.status_code}): "
                 f"{activated.text[:500]}")
    print("  ACTIVATED: フローを有効化しました")

    # Dataverse Webhook トリガーは statecode=1 だけでは webhook 登録が完了せず発火しない
    time.sleep(3)
    try:
        flow_api(
            "POST",
            f"/providers/Microsoft.ProcessSimple/environments/{env_id}"
            f"/flows/{wf_id}/start",
        )
        print("  STARTED: Webhook を登録しました")
    except Exception as exc:
        print(f"  WARNING: /start に失敗しました（フローは有効）: {exc}")
        print("    → make.powerautomate.com でフローを Off → On すれば登録されます")
    return wf_id


def main() -> None:
    _require("ACCOUNT_LINK_REQUEST_TABLE", REQUEST_TABLE)
    _require("ACCOUNT_LINK_ADMIN_RECIPIENT", RECIPIENT)

    print(f"=== 紐づけ依頼通知フロー: {FLOW_NAME} ===")
    print(f"  テーブル: {REQUEST_TABLE} / 宛先: {RECIPIENT}\n")

    print("[1/4] 環境と接続を解決...")
    env_id = resolve_environment_id()
    connections = find_connections(env_id)
    print(f"  テーブル論理名: {REQUEST_TABLE}\n")
    print("[2/4] 接続参照を作成/更新...")
    upsert_connection_reference(
        CONNREF_DATAVERSE, "Dataverse (紐づけ依頼通知)",
        "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
        connections["shared_commondataserviceforapps"],
    )
    upsert_connection_reference(
        CONNREF_OUTLOOK, "Office 365 Outlook (紐づけ依頼通知)",
        "/providers/Microsoft.PowerApps/apis/shared_office365",
        connections["shared_office365"],
    )
    print()

    print("[3/4] フローを作成...")
    wf_id = deploy(env_id)
    print()

    print("[4/4] 完了")
    print(f"  Workflow ID: {wf_id}")
    print(f"  ポータルから紐づけ依頼を送信し、{RECIPIENT} にメールが届くことを確認する")


if __name__ == "__main__":
    main()
