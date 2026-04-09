"""
Power Automate フローデプロイスクリプト — インシデントステータス変更通知

Phase 2.5: ステータス変更トリガー → 作成者取得 → ステータスラベル変換 → メール送信

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID, MCP_CLIENT_ID を設定
  2. Power Automate 接続ページで Dataverse / Office 365 Outlook 接続を事前作成
     https://make.powerautomate.com/connections
  3. pip install azure-identity requests python-dotenv
  4. python scripts/deploy_flow.py
"""

import json
import os
import sys
import time

# scripts/ ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")

FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"
API_VER = "api-version=2016-11-01"
GRAPH_API = "https://graph.microsoft.com"

FLOW_DISPLAY_NAME = "インシデントステータス変更通知"

CONNECTORS_NEEDED = {
    "shared_commondataserviceforapps": "Dataverse",
    "shared_office365": "Office 365 Outlook",
}

# ── API ヘルパー ─────────────────────────────────────────

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

# ── Step 1: 環境 ID 解決 ─────────────────────────────────

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

# ── Step 1.5: ユーザー ObjectId 取得 ────────────────────

def get_user_object_id() -> str:
    """Graph API で現在のユーザーの ObjectId を取得"""
    token = _get_token(scope="https://graph.microsoft.com/.default")
    r = requests.get(
        f"{GRAPH_API}/v1.0/me?$select=id,displayName,mail",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    r.raise_for_status()
    user = r.json()
    print(f"  ユーザー: {user.get('displayName', '')} (ObjectId: {user['id']})")
    return user["id"]

# ── Step 2: 接続検索 ─────────────────────────────────────

def find_connections(env_id: str) -> dict:
    print("\n=== Step 2: 接続検索 ===")
    # 優先接続 ID（再認証済みの接続を指定可能）
    PREFERRED_CONNECTIONS = {
        "shared_commondataserviceforapps": "shared-commondataser-5b340afb-2617-47e7-a1d2-1dedce14012a",
    }
    connections = {}
    for connector_name, display in CONNECTORS_NEEDED.items():
        # 優先接続があればそれを使う
        if connector_name in PREFERRED_CONNECTIONS:
            found = PREFERRED_CONNECTIONS[connector_name]
            print(f"  ✅ {display}: {found} (優先接続)")
            connections[connector_name] = found
            continue
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

# ── Step 3: フロー定義構築 ────────────────────────────────

def build_flow_definition(connections: dict, user_object_id: str) -> dict:
    print("\n=== Step 3: フロー定義構築 ===")

    dataverse_conn = connections["shared_commondataserviceforapps"]
    outlook_conn = connections["shared_office365"]

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
            "When_status_changes": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": "shared_commondataserviceforapps",
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 3,
                        "subscriptionRequest/entityname": f"{PREFIX}_incident",
                        "subscriptionRequest/scope": 4,
                        "subscriptionRequest/filteringattributes": f"{PREFIX}_status",
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
                "inputs": (
                    f"@if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000000),'新規',"
                    f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000001),'対応中',"
                    f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000002),'保留',"
                    f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000003),'解決済',"
                    f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000004),'クローズ','不明')))))"
                ),
            },
            "Check_Email": {
                "type": "If",
                "runAfter": {"Compose_Status_Label": ["Succeeded"]},
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
                                    "【インシデント通知】ステータスが @{outputs('Compose_Status_Label')} に変更されました"
                                ),
                                "emailMessage/Body": (
                                    "<html><body>"
                                    "<h2>インシデント ステータス変更通知</h2>"
                                    "<table border='1' cellpadding='8' cellspacing='0' style='border-collapse:collapse;'>"
                                    f"<tr><td><b>タイトル</b></td><td>@{{triggerOutputs()?['body/{PREFIX}_name']}}</td></tr>"
                                    "<tr><td><b>新ステータス</b></td><td>@{outputs('Compose_Status_Label')}</td></tr>"
                                    "<tr><td><b>報告者</b></td><td>@{outputs('Get_Creator')?['body/fullname']}</td></tr>"
                                    "<tr><td><b>更新日時</b></td><td>@{triggerOutputs()?['body/modifiedon']}</td></tr>"
                                    "</table>"
                                    "<p>このメールは自動送信されています。</p>"
                                    "</body></html>"
                                ),
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
            "id": f"/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "tier": "NotSpecified",
        },
        "shared_office365": {
            "connectionName": outlook_conn,
            "source": "Embedded",
            "id": f"/providers/Microsoft.PowerApps/apis/shared_office365",
            "tier": "NotSpecified",
        },
    }

    print("  フロー定義構築完了")
    return definition, connection_references

# ── Step 4: デプロイ（べき等パターン）────────────────────

def deploy_flow(env_id: str, definition: dict, connection_references: dict):
    print("\n=== Step 4: フローデプロイ ===")

    # 既存フロー検索
    flows_resp = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows"
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
            "environment": {
                "name": env_id,
            },
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
        # フォールバック: デバッグ用 JSON 出力
        debug_path = "scripts/flow_definition_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(flow_payload, f, ensure_ascii=False, indent=2)
        print(f"\n  ❌ デプロイ失敗: {e}")
        print(f"  デバッグ用 JSON を保存: {debug_path}")
        print("  → Power Automate UI でインポートしてください")
        sys.exit(1)

# ── メイン ────────────────────────────────────────────────

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
    print("  トリガー: インシデントのステータス列が変更されたとき")
    print("  アクション: 作成者にメール通知")


if __name__ == "__main__":
    main()
