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
