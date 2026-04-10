"""
Power Automate フローデプロイ — インシデント起票通知

Phase 2.5: インシデント新規作成トリガー → 起票者取得 → 管理者にHTML通知メール送信

特徴:
  - 接続参照（Connection Reference）＋ Invoker モード → ソリューション ALM 対応
  - 接続 ID はハードコードせず PowerApps API で自動検索
  - プロフェッショナルな HTML メールデザイン

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID, ADMIN_EMAIL を設定
  2. Power Automate 接続ページで Dataverse / Office 365 Outlook 接続を事前作成
     https://make.powerautomate.com/connections
  3. python scripts/deploy_flow_create_notify.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
from dotenv import load_dotenv
from auth_helper import (
    DATAVERSE_URL,
    get_session,
    get_token,
    retry_metadata,
)

load_dotenv()

PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")

API = f"{DATAVERSE_URL}/api/data/v9.2"
POWERAPPS_API = "https://api.powerapps.com"
FLOW_API = "https://api.flow.microsoft.com"
API_VER = "api-version=2016-11-01"

FLOW_DISPLAY_NAME = "インシデント起票通知"

CONNREF_DATAVERSE = f"{PREFIX}_connref_dataverse"
CONNREF_OUTLOOK = f"{PREFIX}_connref_outlook"

CONNECTORS_NEEDED = {
    "shared_commondataserviceforapps": "Dataverse",
    "shared_office365": "Office 365 Outlook",
}


# ══════════════════════════════════════════════════════════
#  API ヘルパー
# ══════════════════════════════════════════════════════════

def powerapps_api_call(method, path, params=None):
    url = f"{POWERAPPS_API}{path}"
    headers = {
        "Authorization": f"Bearer {get_token(scope='https://service.powerapps.com/.default')}",
        "Content-Type": "application/json",
    }
    r = requests.request(
        method, url, headers=headers,
        params={**(params or {}), "api-version": "2016-11-01"},
    )
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r.json() if r.content else None


def flow_api_call(method, path, body=None):
    url = f"{FLOW_API}{path}{'&' if '?' in path else '?'}{API_VER}"
    headers = {
        "Authorization": f"Bearer {get_token(scope='https://service.flow.microsoft.com/.default')}",
        "Content-Type": "application/json",
    }
    r = requests.request(method, url, headers=headers, json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r.json() if r.content else None


# ══════════════════════════════════════════════════════════
#  Step 1: 環境 ID 解決
# ══════════════════════════════════════════════════════════

def resolve_environment_id() -> str:
    print("\n=== Step 1: 環境 ID 解決 ===")
    envs = flow_api_call("GET", "/providers/Microsoft.ProcessSimple/environments")
    for env in envs.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        if instance_url == DATAVERSE_URL:
            env_id = env["name"]
            print(f"  環境 ID: {env_id}")
            return env_id
    raise RuntimeError(
        f"環境が見つかりません。DATAVERSE_URL='{DATAVERSE_URL}' を確認してください。"
    )


# ══════════════════════════════════════════════════════════
#  Step 2: 接続自動検索（ハードコード禁止）
# ══════════════════════════════════════════════════════════

def find_connections(env_id: str) -> dict:
    print("\n=== Step 2: 接続自動検索 ===")
    connections = {}
    for connector_name, display in CONNECTORS_NEEDED.items():
        resp = None
        for attempt in range(3):
            try:
                resp = powerapps_api_call(
                    "GET",
                    f"/providers/Microsoft.PowerApps/apis/{connector_name}/connections",
                    {"$filter": f"environment eq '{env_id}'"},
                )
                break
            except Exception as e:
                if attempt < 2 and ("504" in str(e) or "502" in str(e) or "Timeout" in str(e)):
                    import time
                    wait = 10 * (attempt + 1)
                    print(f"  ⏳ {display}: タイムアウト、{wait}秒後にリトライ ({attempt + 1}/3)")
                    time.sleep(wait)
                else:
                    raise
        if resp is None:
            print(f"  ❌ {display}: API 応答なし")
            sys.exit(1)
        found = None
        for conn in resp.get("value", []):
            statuses = conn.get("properties", {}).get("statuses", [])
            if any(s.get("status") == "Connected" for s in statuses):
                found = conn["name"]
                break
        if not found:
            print(f"  ❌ {display} ({connector_name}): 接続が見つかりません")
            print(f"     → https://make.powerautomate.com/connections で作成してください")
            sys.exit(1)
        connections[connector_name] = found
        print(f"  ✅ {display}: {found}")
    return connections


# ══════════════════════════════════════════════════════════
#  Step 3: 接続参照の作成（ソリューション内）
# ══════════════════════════════════════════════════════════

def create_connection_reference(logical_name, display_name, connector_id, connection_id):
    print(f"\n  接続参照: {display_name} ({logical_name})")

    session = get_session()
    r = session.get(
        f"{API}/connectionreferences?"
        f"$filter=connectionreferencelogicalname eq '{logical_name}'"
        f"&$select=connectionreferenceid,connectionreferencelogicalname,connectionid"
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        ref_id = existing[0]["connectionreferenceid"]
        print(f"    既存: {ref_id}")
        current_conn = existing[0].get("connectionid", "")
        if current_conn != connection_id:
            print(f"    接続を更新: → {connection_id}")
            s2 = get_session()
            rp = s2.patch(
                f"{API}/connectionreferences({ref_id})",
                json={"connectionid": connection_id},
            )
            if rp.ok:
                print("    ✅ 接続紐づけ更新")
            else:
                print(f"    ⚠️  接続更新失敗 ({rp.status_code}): {rp.text[:200]}")
        return ref_id

    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": connector_id,
        "connectionid": connection_id,
    }

    def _create():
        s = get_session()
        s.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
        resp = s.post(f"{API}/connectionreferences", json=body)
        resp.raise_for_status()
        return resp

    result = retry_metadata(_create, f"接続参照 {logical_name}")
    if result and hasattr(result, "headers"):
        odata_id = result.headers.get("OData-EntityId", "")
        ref_id = odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else "unknown"
        print(f"    ✅ 作成成功: {ref_id}")
        return ref_id
    return None


# ══════════════════════════════════════════════════════════
#  Step 4: プロフェッショナル HTML メールテンプレート
# ══════════════════════════════════════════════════════════

def build_email_html() -> str:
    """プロフェッショナルなHTMLメールテンプレートを構築する。

    f-string と Power Automate 式の二重ブレース問題を避けるため、
    replace() で PREFIX を埋め込む。
    """
    template = (
        '<html>\n'
        '<head><meta charset="utf-8"></head>\n'
        '<body style="margin:0;padding:0;background-color:#f1f5f9;'
        "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;\">\n"
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background-color:#f1f5f9;padding:32px 0;">\n'
        '<tr><td align="center">\n'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'style="background-color:#ffffff;border-radius:12px;overflow:hidden;'
        'box-shadow:0 4px 24px rgba(0,0,0,0.08);">\n'
        '\n'
        '<!-- ヘッダー -->\n'
        '<tr>\n'
        '<td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 40px;">\n'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">\n'
        '<tr><td>\n'
        '<div style="font-size:13px;color:#94a3b8;letter-spacing:2px;'
        'text-transform:uppercase;margin-bottom:8px;">INCIDENT MANAGEMENT</div>\n'
        '<div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.4;">'
        '&#128680; 新しいインシデントが起票されました</div>\n'
        '</td></tr>\n'
        '</table>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- タイトル -->\n'
        '<tr>\n'
        '<td style="padding:32px 40px 16px;">\n'
        '<div style="font-size:11px;color:#64748b;text-transform:uppercase;'
        'letter-spacing:2px;margin-bottom:8px;">インシデントタイトル</div>\n'
        "<div style=\"font-size:20px;font-weight:700;color:#0f172a;line-height:1.4;\">"
        "@{triggerOutputs()?['body/{prefix}_name']}</div>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 情報テーブル -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 24px;">\n'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">\n'
        '\n'
        '<!-- ステータス -->\n'
        '<tr style="background-color:#f8fafc;">\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128994; ステータス</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        '<span style="display:inline-block;padding:4px 14px;border-radius:20px;'
        'font-size:13px;font-weight:600;color:#059669;background-color:#ecfdf5;">'
        "@{outputs('Compose_Status_Label')}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 優先度 -->\n'
        '<tr>\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128308; 優先度</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        '<span style="font-size:14px;font-weight:600;color:#0f172a;">'
        "@{triggerOutputs()?['body/{prefix}_priority@OData.Community.Display.V1.FormattedValue']}"
        '</span>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 起票者 -->\n'
        '<tr style="background-color:#f8fafc;">\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128100; 起票者</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        '<span style="font-size:14px;color:#0f172a;">'
        "@{outputs('Get_Reporter')?['body/fullname']}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 起票日時 -->\n'
        '<tr>\n'
        '<td style="padding:14px 20px;width:140px;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128197; 起票日時</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;">\n'
        '<span style="font-size:14px;color:#0f172a;">'
        "@{formatDateTime(triggerOutputs()?['body/createdon'],'yyyy/MM/dd HH:mm')}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '</table>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 説明 -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 24px;">\n'
        '<div style="font-size:11px;color:#64748b;text-transform:uppercase;'
        'letter-spacing:2px;margin-bottom:10px;">説明</div>\n'
        '<div style="padding:16px 20px;background-color:#f8fafc;border-radius:8px;'
        'border-left:4px solid #3b82f6;font-size:14px;color:#334155;line-height:1.7;">'
        "@{if(equals(coalesce(triggerOutputs()?['body/{prefix}_description'],''),'')"
        ",'（説明なし）',triggerOutputs()?['body/{prefix}_description'])}"
        '</div>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 区切り線 -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 24px;">\n'
        '<div style="height:1px;background-color:#e2e8f0;"></div>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- フッター -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 32px;">\n'
        '<div style="font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">'
        'このメールはインシデント管理システムから自動送信されています。<br>'
        'Powered by Power Automate &amp; Dataverse'
        '</div>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '</table>\n'
        '</td></tr>\n'
        '</table>\n'
        '</body>\n'
        '</html>'
    )
    return template.replace("{prefix}", PREFIX)


# ══════════════════════════════════════════════════════════
#  Step 4b: フロー定義構築
# ══════════════════════════════════════════════════════════

def build_clientdata() -> str:
    """フロー定義 JSON を構築する（接続参照 Invoker モード）"""

    # ステータスラベル変換式（replace で PREFIX 埋め込み — f-string 二重ブレース回避）
    status_expr = (
        "@if(equals(triggerOutputs()?['body/{prefix}_status'],100000000),'新規',"
        "if(equals(triggerOutputs()?['body/{prefix}_status'],100000001),'対応中',"
        "if(equals(triggerOutputs()?['body/{prefix}_status'],100000002),'解決済',"
        "if(equals(triggerOutputs()?['body/{prefix}_status'],100000003),'クローズ','不明'))))"
    ).replace("{prefix}", PREFIX)

    # メール件名（replace で PREFIX 埋め込み）
    email_subject = (
        "\U0001f6a8 [インシデント起票] @{triggerOutputs()?['body/{prefix}_name']}"
    ).replace("{prefix}", PREFIX)

    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "When_incident_created": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": CONNREF_DATAVERSE,
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 1,       # 1 = Create
                        "subscriptionRequest/entityname": f"{PREFIX}_incident",
                        "subscriptionRequest/scope": 4,         # Organization
                        "subscriptionRequest/runas": 3,         # Modifying user
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
        "actions": {
            "Get_Reporter": {
                "type": "OpenApiConnection",
                "runAfter": {},
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": CONNREF_DATAVERSE,
                        "operationId": "GetItem",
                    },
                    "parameters": {
                        "entityName": "systemusers",
                        "recordId": "@triggerOutputs()?['body/_createdby_value']",
                        "$select": "internalemailaddress,fullname",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
            "Compose_Status_Label": {
                "type": "Compose",
                "runAfter": {"Get_Reporter": ["Succeeded"]},
                "inputs": status_expr,
            },
            "Send_Notification_Email": {
                "type": "OpenApiConnection",
                "runAfter": {"Compose_Status_Label": ["Succeeded"]},
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                        "connectionName": CONNREF_OUTLOOK,
                        "operationId": "SendEmailV2",
                    },
                    "parameters": {
                        "emailMessage/To": ADMIN_EMAIL,
                        "emailMessage/Subject": email_subject,
                        "emailMessage/Body": build_email_html(),
                        "emailMessage/Importance": "High",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
    }

    connection_references = {
        CONNREF_DATAVERSE: {
            "connectionName": CONNREF_DATAVERSE,
            "source": "Invoker",
            "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "tier": "NotSpecified",
        },
        CONNREF_OUTLOOK: {
            "connectionName": CONNREF_OUTLOOK,
            "source": "Invoker",
            "id": "/providers/Microsoft.PowerApps/apis/shared_office365",
            "tier": "NotSpecified",
        },
    }

    clientdata = {
        "properties": {
            "definition": definition,
            "connectionReferences": connection_references,
        },
        "schemaVersion": "1.0.0.0",
    }
    return json.dumps(clientdata, ensure_ascii=False)


# ══════════════════════════════════════════════════════════
#  Step 5: デプロイ（べき等パターン）
# ══════════════════════════════════════════════════════════

def deploy():
    print("\n=== Step 5: 既存フロー検索 ===")
    session = get_session()
    r = session.get(
        f"{API}/workflows?"
        f"$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5"
        f"&$select=workflowid,name,statecode"
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        wf_id = existing[0]["workflowid"]
        print(f"  既存フロー発見: {wf_id} → 削除して再作成")
        session.patch(
            f"{API}/workflows({wf_id})",
            json={"statecode": 0, "statuscode": 1},
        )
        rd = session.delete(f"{API}/workflows({wf_id})")
        if rd.ok:
            print("  削除完了")
        else:
            print(f"  削除失敗 ({rd.status_code}): {rd.text[:300]}")
    else:
        print("  既存フローなし（新規作成）")

    print("\n=== Step 6: ソリューション対応フロー作成 ===")
    clientdata = build_clientdata()
    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": clientdata,
        "description": "新しいインシデントが起票されたとき、管理者に通知メールを送信するフロー",
    }

    session_sol = get_session()
    session_sol.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    r2 = session_sol.post(f"{API}/workflows", json=workflow_body)

    if r2.ok:
        location = r2.headers.get("OData-EntityId", "")
        wf_id = location.split("(")[-1].rstrip(")") if "(" in location else "unknown"
        print(f"  ✅ フロー作成成功 (Draft)")
        print(f"  Workflow ID: {wf_id}")

        # 有効化
        print("\n=== Step 7: フロー有効化 ===")
        ra = session.patch(
            f"{API}/workflows({wf_id})",
            json={"statecode": 1, "statuscode": 2},
        )
        if ra.ok:
            print("  ✅ フロー有効化成功!")
        else:
            print(f"  ⚠️  有効化失敗 ({ra.status_code}): {ra.text[:300]}")
            print("  → Power Automate UI で手動有効化してください")
            print(f"    https://make.powerautomate.com/")
        return wf_id
    else:
        print(f"  ❌ 作成失敗 ({r2.status_code}): {r2.text[:500]}")
        debug_path = "scripts/flow_create_notify_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON: {debug_path}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════
#  メイン
# ══════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  Power Automate フローデプロイ — インシデント起票通知")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  通知先: {ADMIN_EMAIL}")
    print("=" * 60)

    if not ADMIN_EMAIL:
        print("\n❌ ADMIN_EMAIL が .env に設定されていません")
        sys.exit(1)

    # Step 1: 環境 ID
    env_id = resolve_environment_id()

    # Step 2: 接続自動検索
    connections = find_connections(env_id)

    # Step 3: 接続参照作成
    print("\n=== Step 3: 接続参照の作成 ===")
    create_connection_reference(
        logical_name=CONNREF_DATAVERSE,
        display_name="Dataverse (インシデント管理)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
        connection_id=connections["shared_commondataserviceforapps"],
    )
    create_connection_reference(
        logical_name=CONNREF_OUTLOOK,
        display_name="Office 365 Outlook (インシデント管理)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_office365",
        connection_id=connections["shared_office365"],
    )

    # Step 4: フロー定義構築
    print("\n=== Step 4: フロー定義構築 ===")
    print("  HTML メールテンプレート構築完了")
    print(f"  トリガー: {PREFIX}_incident レコード作成時")
    print("  アクション: 起票者取得 → ステータスラベル変換 → 管理者メール送信")

    # Step 5-7: デプロイ
    wf_id = deploy()

    # 完了
    print("\n" + "=" * 60)
    print("  ✅ デプロイ完了!")
    print(f"  フロー: {FLOW_DISPLAY_NAME}")
    print(f"  トリガー: インシデント新規作成時")
    print(f"  通知先: {ADMIN_EMAIL}")
    print(f"  Workflow ID: {wf_id}")
    print("=" * 60)


if __name__ == "__main__":
    main()
"""
Power Automate フローデプロイスクリプト — インシデント新規作成通知

新規インシデント作成トリガー → 作成者取得 → メール送信

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID を設定
  2. Power Automate 接続ページで Dataverse / Office 365 Outlook 接続を事前作成
     https://make.powerautomate.com/connections
  3. pip install azure-identity requests python-dotenv
  4. python scripts/deploy_flow_create_notify.py
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")

FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"
API_VER = "api-version=2016-11-01"
GRAPH_API = "https://graph.microsoft.com"

FLOW_DISPLAY_NAME = "インシデント新規作成通知"

CONNECTORS_NEEDED = {
    "shared_commondataserviceforapps": "Dataverse",
    "shared_office365": "Office 365 Outlook",
}


def flow_api_call(method, path, body=None):
    url = f"{FLOW_API}{path}{'&' if '?' in path else '?'}{API_VER}"
    headers = {
        "Authorization": f"Bearer {_get_token(scope='https://service.flow.microsoft.com/.default')}",
        "Content-Type": "application/json",
    }
    r = requests.request(method, url, headers=headers, json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r.json() if r.content else None


def powerapps_api_call(method, path, params=None):
    url = f"{POWERAPPS_API}{path}"
    headers = {
        "Authorization": f"Bearer {_get_token(scope='https://service.powerapps.com/.default')}",
        "Content-Type": "application/json",
    }
    r = requests.request(method, url, headers=headers, params={**(params or {}), "api-version": "2016-11-01"})
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r.json() if r.content else None


def resolve_environment_id() -> str:
    print("\n=== Step 1: 環境 ID 解決 ===")
    envs = flow_api_call("GET", "/providers/Microsoft.ProcessSimple/environments")
    for env in envs.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        if instance_url == DATAVERSE_URL:
            env_id = env["name"]
            print(f"  環境 ID: {env_id}")
            return env_id
    raise RuntimeError(f"環境が見つかりません。DATAVERSE_URL='{DATAVERSE_URL}' を確認してください。")


def get_user_object_id() -> str:
    token = _get_token(scope="https://graph.microsoft.com/.default")
    r = requests.get(
        f"{GRAPH_API}/v1.0/me?$select=id,displayName,mail",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    r.raise_for_status()
    user = r.json()
    print(f"  ユーザー: {user.get('displayName', '')} (ObjectId: {user['id']})")
    return user["id"]


def find_connections(env_id: str) -> dict:
    print("\n=== Step 2: 接続検索 ===")
    connections = {}
    for connector_name, display in CONNECTORS_NEEDED.items():
        resp = powerapps_api_call(
            "GET",
            f"/providers/Microsoft.PowerApps/apis/{connector_name}/connections",
            {"$filter": f"environment eq '{env_id}'"},
        )
        found = None
        for conn in resp.get("value", []):
            statuses = conn.get("properties", {}).get("statuses", [])
            if any(s.get("status") == "Connected" for s in statuses):
                found = conn["name"]
                break
        if not found:
            print(f"  ❌ {display} ({connector_name}): 接続が見つかりません")
            print(f"     → https://make.powerautomate.com/connections で作成してください")
            sys.exit(1)
        connections[connector_name] = found
        print(f"  ✅ {display}: {found}")
    return connections


def build_flow_definition(connections: dict, user_object_id: str) -> dict:
    print("\n=== Step 3: フロー定義構築 ===")

    dataverse_conn = connections["shared_commondataserviceforapps"]
    outlook_conn = connections["shared_office365"]

    # ステータスラベル変換式
    status_expr = (
        f"@if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000000),'新規',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000001),'対応中',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000002),'保留',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000003),'解決済',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000004),'クローズ','不明')))))"
    )

    # 優先度ラベル変換式
    priority_expr = (
        f"@if(equals(triggerOutputs()?['body/{PREFIX}_priority'],100000000),'緊急',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_priority'],100000001),'高',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_priority'],100000002),'中',"
        f"if(equals(triggerOutputs()?['body/{PREFIX}_priority'],100000003),'低','不明'))))"
    )

    # メール本文 — f-string と Power Automate 式の混在を避けるため連結で構築
    email_body_parts = [
        "<html><body>",
        "<h2>🆕 新しいインシデントが作成されました</h2>",
        "<p>以下のインシデントが新規登録されました。確認してください。</p>",
        "<table border='1' cellpadding='8' cellspacing='0' style='border-collapse:collapse; width:100%; max-width:600px;'>",
    ]
    # タイトル行 — PREFIX を含むため f-string で構築
    email_body_parts.append(
        f"<tr style='background-color:#f0f4ff;'><td style='width:120px;'><b>タイトル</b></td>"
        f"<td>@{{triggerOutputs()?['body/{PREFIX}_name']}}</td></tr>"
    )
    # 残りの行は Power Automate 式のみ
    email_body_parts.extend([
        "<tr><td><b>ステータス</b></td><td>@{outputs('Compose_Status_Label')}</td></tr>",
        "<tr><td><b>優先度</b></td><td>@{outputs('Compose_Priority_Label')}</td></tr>",
        "<tr><td><b>報告者</b></td><td>@{outputs('Get_Creator')?['body/fullname']}</td></tr>",
        "<tr><td><b>作成日時</b></td><td>@{triggerOutputs()?['body/createdon']}</td></tr>",
    ])
    # 説明行 — PREFIX を含む
    email_body_parts.append(
        f"<tr><td><b>説明</b></td>"
        f"<td>@{{coalesce(triggerOutputs()?['body/{PREFIX}_description'],'(なし)')}}</td></tr>"
    )
    email_body_parts.extend([
        "</table>",
        "<br/>",
        "<p style='color:#666;font-size:12px;'>このメールはインシデント管理システムから自動送信されています。</p>",
        "</body></html>",
    ])
    email_body = "".join(email_body_parts)

    definition = {
        "$schema": (
            "https://schema.management.azure.com/providers/"
            "Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#"
        ),
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "When_incident_created": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": "shared_commondataserviceforapps",
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 1,  # ← 1 = Create（新規作成）
                        "subscriptionRequest/entityname": f"{PREFIX}_incident",
                        "subscriptionRequest/scope": 4,
                        "subscriptionRequest/runas": 3,
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
        "actions": {
            "Get_Creator": {
                "type": "OpenApiConnection",
                "runAfter": {},
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": "shared_commondataserviceforapps",
                        "operationId": "GetItem",
                    },
                    "parameters": {
                        "entityName": "systemusers",
                        "recordId": "@triggerOutputs()?['body/_createdby_value']",
                        "$select": "internalemailaddress,fullname",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
            "Compose_Status_Label": {
                "type": "Compose",
                "runAfter": {"Get_Creator": ["Succeeded"]},
                "inputs": status_expr,
            },
            "Compose_Priority_Label": {
                "type": "Compose",
                "runAfter": {"Get_Creator": ["Succeeded"]},
                "inputs": priority_expr,
            },
            "Check_Email": {
                "type": "If",
                "runAfter": {
                    "Compose_Status_Label": ["Succeeded"],
                    "Compose_Priority_Label": ["Succeeded"],
                },
                "expression": {
                    "not": {
                        "equals": [
                            "@coalesce(outputs('Get_Creator')?['body/internalemailaddress'],'')",
                            "",
                        ]
                    }
                },
                "actions": {
                    "Send_Email": {
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                                "connectionName": "shared_office365",
                                "operationId": "SendEmailV2",
                            },
                            "parameters": {
                                "emailMessage/To": "@outputs('Get_Creator')?['body/internalemailaddress']",
                                "emailMessage/Subject": (
                                    "【インシデント管理】新しいインシデントが作成されました"
                                ),
                                "emailMessage/Body": email_body,
                                "emailMessage/Importance": "Normal",
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
                "else": {"actions": {}},
            },
        },
    }

    connection_references = {
        "shared_commondataserviceforapps": {
            "connectionName": dataverse_conn,
            "source": "Embedded",
            "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "tier": "NotSpecified",
        },
        "shared_office365": {
            "connectionName": outlook_conn,
            "source": "Embedded",
            "id": "/providers/Microsoft.PowerApps/apis/shared_office365",
            "tier": "NotSpecified",
        },
    }

    print("  フロー定義構築完了")
    return definition, connection_references


def deploy_flow(env_id: str, definition: dict, connection_references: dict):
    print("\n=== Step 4: フローデプロイ ===")

    flows_resp = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows",
    )
    existing_flow_id = None
    for f in flows_resp.get("value", []):
        if f.get("properties", {}).get("displayName") == FLOW_DISPLAY_NAME:
            existing_flow_id = f["name"]
            break

    flow_payload = {
        "properties": {
            "displayName": FLOW_DISPLAY_NAME,
            "definition": definition,
            "connectionReferences": connection_references,
            "state": "Started",
            "environment": {"name": env_id},
        }
    }

    try:
        if existing_flow_id:
            print(f"  既存フロー更新: {existing_flow_id}")
            flow_api_call(
                "PATCH",
                f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{existing_flow_id}",
                flow_payload,
            )
        else:
            print("  新規フロー作成")
            result = flow_api_call(
                "POST",
                f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows",
                flow_payload,
            )
            new_id = result.get("name", "unknown")
            print(f"  作成完了: {new_id}")

        print("  ✅ フローデプロイ成功!")

    except Exception as e:
        debug_path = "scripts/flow_create_notify_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(flow_payload, f, ensure_ascii=False, indent=2)
        print(f"\n  ❌ デプロイ失敗: {e}")
        print(f"  デバッグ用 JSON を保存: {debug_path}")
        print("  → Power Automate UI でインポートしてください")
        sys.exit(1)


def main():
    print("=" * 60)
    print("  Power Automate フローデプロイ")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print("=" * 60)

    env_id = resolve_environment_id()
    user_oid = get_user_object_id()
    connections = find_connections(env_id)
    definition, conn_refs = build_flow_definition(connections, user_oid)
    deploy_flow(env_id, definition, conn_refs)

    print("\n✅ 完了!")
    print("  トリガー: インシデントが新規作成されたとき")
    print("  アクション: 作成者に「新しいインシデントが作成されました」メール通知")


if __name__ == "__main__":
    main()
