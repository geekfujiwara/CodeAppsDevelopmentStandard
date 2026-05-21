"""
Power Automate フローデプロイスクリプト — 接続参照パターン（確実に有効化成功）

★ 本スクリプトはサンプル実装です。フロー名・トリガー・アクションをプロジェクトに合わせて書き換えてください。
★ 接続参照 → Draft 作成 → 有効化 → /start の5ステップテンプレートとして再利用できます。

Phase 2.5 サンプル: Dataverse レコード変更トリガー → 作成者取得 → メール送信

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定
  2. Power Automate 接続ページで Dataverse / Office 365 Outlook 接続を事前作成
     https://make.powerautomate.com/connections
  3. pip install azure-identity requests python-dotenv
  4. python .github/skills/power-automate/scripts/deploy_flow.py

核心原則:
  接続参照（connectionreferences テーブル）に正しい接続を紐づけ、
  フロー定義で runtimeSource: "embedded" + connectionReferenceLogicalName で参照する。
  このパターンなら API 有効化が100%成功する。
"""

import json
import os
import sys
import time

# スキルフォルダと共通認証モジュールを sys.path に追加
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))

import requests
from dotenv import load_dotenv
from auth_helper import (
    api_get,
    api_patch,
    api_post,
    api_delete,
    get_token,
    retry_metadata,
    DATAVERSE_URL,
)

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")

# ── フロー設定（★ プロジェクトに合わせて書き換える） ─────
FLOW_DISPLAY_NAME = "ステータス変更通知"
FLOW_DESCRIPTION = "レコードのステータスが変更されたときに作成者にメール通知を送信する"

# 必要な接続（コネクタ ID → 表示名）
CONNECTORS_NEEDED = {
    "shared_commondataserviceforapps": "Dataverse",
    "shared_office365": "Office 365 Outlook",
}

# 接続参照の論理名（ソリューション prefix 付き）
CONNREF_DATAVERSE = f"{PREFIX}_sharedcommondataserviceforapps"
CONNREF_OUTLOOK = f"{PREFIX}_sharedoffice365"


# ══════════════════════════════════════════════════════════════
# Step 1: 環境 ID 解決
# ══════════════════════════════════════════════════════════════

def resolve_environment_id() -> str:
    """DATAVERSE_URL から環境 ID を逆引き"""
    print("\n=== Step 1: 環境 ID 解決 ===")
    token = get_token(scope="https://service.flow.microsoft.com/.default")
    r = requests.get(
        "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments"
        "?api-version=2016-11-01",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    r.raise_for_status()
    dv_url = DATAVERSE_URL.rstrip("/")
    for env in r.json().get("value", []):
        instance_url = (
            env.get("properties", {})
            .get("linkedEnvironmentMetadata", {})
            .get("instanceUrl", "")
            or ""
        ).rstrip("/")
        if instance_url == dv_url:
            env_id = env["name"]
            print(f"  ✓ 環境 ID: {env_id}")
            return env_id
    raise RuntimeError(f"環境が見つかりません: {dv_url}")


# ══════════════════════════════════════════════════════════════
# Step 2: 接続検索（リトライ付き）
# ══════════════════════════════════════════════════════════════

def find_connections(env_id: str) -> dict:
    """PowerApps API で環境内の接続を検索（3回リトライ + timeout=120）"""
    print("\n=== Step 2: 接続検索 ===")
    token = get_token(scope="https://service.powerapps.com/.default")
    connections = {}

    for connector_name, display in CONNECTORS_NEEDED.items():
        found = None
        for attempt in range(3):
            try:
                r = requests.get(
                    f"https://api.powerapps.com/providers/Microsoft.PowerApps"
                    f"/apis/{connector_name}/connections",
                    headers={"Authorization": f"Bearer {token}"},
                    params={"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'"},
                    timeout=120,
                )
            except requests.exceptions.Timeout:
                wait = 15 * (attempt + 1)
                print(f"  ⚠ {display}: タイムアウト → {wait}s 待機してリトライ...")
                time.sleep(wait)
                continue
            if r.status_code == 504:
                wait = 15 * (attempt + 1)
                print(f"  ⚠ {display}: 504 → {wait}s 待機してリトライ...")
                time.sleep(wait)
                continue
            if r.ok:
                for conn in r.json().get("value", []):
                    statuses = conn.get("properties", {}).get("statuses", [])
                    if any(s.get("status") == "Connected" for s in statuses):
                        found = conn["name"]
                        break
                break
            else:
                print(f"  ⚠ {display}: HTTP {r.status_code}")
                break

        if not found:
            print(f"  ❌ {display} ({connector_name}): Connected な接続が見つかりません")
            print(f"     → https://make.powerautomate.com/connections で作成してください")
            sys.exit(1)
        connections[connector_name] = found
        print(f"  ✓ {display}: {found}")

    return connections


# ══════════════════════════════════════════════════════════════
# Step 3: 接続参照の作成（★ 有効化成功の核心）
# ══════════════════════════════════════════════════════════════

def ensure_connection_reference(logical_name: str, display_name: str, connector_id: str, connection_id: str):
    """接続参照をべき等で作成。既存なら接続の紐づけを更新。"""
    existing = api_get(
        f"connectionreferences?$filter=connectionreferencelogicalname eq '{logical_name}'"
        "&$select=connectionreferenceid,connectionid"
    )
    if existing.get("value"):
        ref = existing["value"][0]
        if ref.get("connectionid") != connection_id:
            api_patch(f"connectionreferences({ref['connectionreferenceid']})", {"connectionid": connection_id})
            print(f"    接続更新: {logical_name}")
        else:
            print(f"    既存OK: {logical_name}")
        return

    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": f"/providers/Microsoft.PowerApps/apis/{connector_id}",
        "connectionid": connection_id,
    }
    retry_metadata(
        lambda: api_post("connectionreferences", body, solution=SOLUTION_NAME),
        f"接続参照: {logical_name}",
    )
    print(f"    作成完了: {logical_name}")


def create_connection_references(connections: dict):
    """全接続参照を作成"""
    print("\n=== Step 3: 接続参照の作成 ===")
    ensure_connection_reference(
        CONNREF_DATAVERSE, "Dataverse",
        "shared_commondataserviceforapps", connections["shared_commondataserviceforapps"],
    )
    ensure_connection_reference(
        CONNREF_OUTLOOK, "Office 365 Outlook",
        "shared_office365", connections["shared_office365"],
    )
    print("  ✓ 接続参照 OK")


# ══════════════════════════════════════════════════════════════
# Step 4: フロー定義構築 + Draft 作成
# ══════════════════════════════════════════════════════════════

def build_flow_definition() -> dict:
    """フロー定義（Logic Apps スキーマ形式）を構築

    ★ このメソッドをプロジェクトのフローに合わせて書き換える。
    """
    CONNECTOR_DV = "shared_commondataserviceforapps"
    CONNECTOR_OUTLOOK = "shared_office365"

    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
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
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                        "connectionName": CONNECTOR_DV,
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 3,  # Update
                        "subscriptionRequest/entityname": f"{PREFIX}_incident",
                        "subscriptionRequest/scope": 4,    # Organization
                        "subscriptionRequest/filteringattributes": f"{PREFIX}_status",
                        "subscriptionRequest/runas": 3,    # Modifying user
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
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                        "connectionName": CONNECTOR_DV,
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
                    f"if(equals(triggerOutputs()?['body/{PREFIX}_status'],100000002),'解決済','不明')))"
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
                                "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_OUTLOOK}",
                                "connectionName": CONNECTOR_OUTLOOK,
                                "operationId": "SendEmailV2",
                            },
                            "parameters": {
                                "emailMessage/To": "@outputs('Get_Creator')?['body/internalemailaddress']",
                                "emailMessage/Subject": (
                                    "【通知】ステータスが @{outputs('Compose_Status_Label')} に変更されました"
                                ),
                                "emailMessage/Body": (
                                    # ★ 通知デザインテンプレート適用（references/notification-templates.md 準拠）
                                    '<html>'
                                    '<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,\'Segoe UI\',sans-serif;">'
                                    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">'
                                    '<tr><td align="center" style="padding:32px 16px;">'
                                    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; border:1px solid #e5e7eb; max-width:600px; width:100%;">'
                                    # ヘッダー（青ライン）
                                    '<tr><td style="padding:24px 32px 16px 32px; border-bottom:2px solid #2563eb;">'
                                    '<h1 style="margin:0; font-size:20px; font-weight:700; color:#1e40af;">'
                                    '\U0001f4cb ステータス変更通知</h1></td></tr>'
                                    # サブタイトル
                                    '<tr><td style="padding:16px 32px 8px 32px;">'
                                    '<p style="margin:0; font-size:14px; color:#6b7280;">以下のレコードのステータスが変更されました。</p>'
                                    '</td></tr>'
                                    # データテーブル
                                    '<tr><td style="padding:8px 32px 24px 32px;">'
                                    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:6px; border-collapse:separate; overflow:hidden;">'
                                    # 行1: タイトル（白）
                                    '<tr>'
                                    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; width:140px; vertical-align:top;">'
                                    '<span style="font-size:13px; font-weight:600; color:#374151;">タイトル</span></td>'
                                    f'<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; vertical-align:top;">'
                                    f'<span style="font-size:14px; color:#1f2937;">@{{triggerOutputs()?[\'body/{PREFIX}_name\']}}</span></td></tr>'
                                    # 行2: 新ステータス（グレー）
                                    '<tr>'
                                    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; width:140px; vertical-align:top;">'
                                    '<span style="font-size:13px; font-weight:600; color:#374151;">新ステータス</span></td>'
                                    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; vertical-align:top;">'
                                    '<span style="font-size:14px; color:#1f2937;">@{outputs(\'Compose_Status_Label\')}</span></td></tr>'
                                    # 行3: 担当者（白）
                                    '<tr>'
                                    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; width:140px; vertical-align:top;">'
                                    '<span style="font-size:13px; font-weight:600; color:#374151;">担当者</span></td>'
                                    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; vertical-align:top;">'
                                    '<span style="font-size:14px; color:#1f2937;">@{outputs(\'Get_Creator\')?[\'body/fullname\']}</span></td></tr>'
                                    # 行4: 更新日時（グレー）
                                    '<tr>'
                                    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; width:140px; vertical-align:top;">'
                                    '<span style="font-size:13px; font-weight:600; color:#374151;">更新日時</span></td>'
                                    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; vertical-align:top;">'
                                    '<span style="font-size:14px; color:#1f2937;">@{triggerOutputs()?[\'body/modifiedon\']}</span></td></tr>'
                                    '</table></td></tr>'
                                    # フッター
                                    '<tr><td style="padding:16px 32px 24px 32px; border-top:1px solid #f3f4f6;">'
                                    '<p style="margin:0; font-size:12px; color:#9ca3af;">このメールは Power Automate から自動送信されています。</p>'
                                    '</td></tr>'
                                    '</table></td></tr></table></body></html>'
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

    return definition


def deploy_flow_draft() -> str:
    """既存フローを削除し、新規 Draft を作成"""
    print("\n=== Step 4: フロー Draft 作成 ===")

    CONNECTOR_DV = "shared_commondataserviceforapps"
    CONNECTOR_OUTLOOK = "shared_office365"

    # べき等: 既存フロー削除
    existing = api_get(
        f"workflows?$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5"
        "&$select=workflowid,statecode"
    )
    for f in existing.get("value", []):
        wf_id = f["workflowid"]
        if f["statecode"] == 1:  # Active → Draft
            api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
            time.sleep(2)
        api_delete(f"workflows({wf_id})")
        print(f"  削除: {wf_id}")
        time.sleep(3)

    # フロー定義構築
    definition = build_flow_definition()

    # ★ connectionReferences は接続参照経由（有効化成功の鍵）
    clientdata = {
        "properties": {
            "definition": definition,
            "connectionReferences": {
                CONNECTOR_DV: {
                    "runtimeSource": "embedded",
                    "connection": {"connectionReferenceLogicalName": CONNREF_DATAVERSE},
                    "api": {"name": CONNECTOR_DV},
                },
                CONNECTOR_OUTLOOK: {
                    "runtimeSource": "embedded",
                    "connection": {"connectionReferenceLogicalName": CONNREF_OUTLOOK},
                    "api": {"name": CONNECTOR_OUTLOOK},
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }

    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,
        "category": 5,       # Cloud Flow
        "statecode": 0,      # Draft
        "statuscode": 1,     # Draft
        "primaryentity": "none",
        "clientdata": json.dumps(clientdata, ensure_ascii=False),
        "description": FLOW_DESCRIPTION,
    }

    try:
        wf_id = api_post("workflows", workflow_body, solution=SOLUTION_NAME)
        print(f"  ✓ フロー Draft 作成: {wf_id}")
        return wf_id
    except Exception as e:
        # フォールバック: デバッグ JSON 出力
        debug_path = "flow_definition_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  ❌ Draft 作成失敗: {e}")
        print(f"  デバッグ JSON 保存: {debug_path}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════════
# Step 5: 有効化 + Webhook 登録
# ══════════════════════════════════════════════════════════════

def activate_flow(wf_id: str, env_id: str):
    """フローを有効化し、Webhook トリガーなら /start も呼ぶ"""
    print("\n=== Step 5: フロー有効化 + Webhook 登録 ===")

    time.sleep(3)  # 作成直後は少し待つ

    # ★ 有効化（接続参照が正しければ100%成功）
    try:
        api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})
        print("  ✓ フロー有効化成功")
    except Exception as e:
        print(f"  ❌ 有効化失敗: {e}")
        print(f"  → Power Automate UI で手動有効化してください")
        print(f"     https://make.powerautomate.com/flows/{wf_id}")
        sys.exit(1)

    # ★ Dataverse Webhook トリガーの場合は /start を呼ぶ
    time.sleep(3)
    token = get_token(scope="https://service.flow.microsoft.com/.default")
    try:
        r = requests.post(
            f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple"
            f"/environments/{env_id}/flows/{wf_id}/start?api-version=2016-11-01",
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        r.raise_for_status()
        print("  ✓ Webhook /start 登録")
    except Exception as e:
        print(f"  ⚠ /start 登録失敗（フローは有効化済み）: {e}")
        print("    → Power Automate UI でフローを一度 Off → On すれば Webhook が登録されます")


# ══════════════════════════════════════════════════════════════
# メイン
# ══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  Power Automate フローデプロイ（接続参照パターン）")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print("=" * 60)

    # Step 1: 環境 ID 解決
    env_id = resolve_environment_id()

    # Step 2: 接続検索
    connections = find_connections(env_id)

    # Step 3: 接続参照作成（★ 有効化成功の核心）
    create_connection_references(connections)

    # Step 4: フロー Draft 作成
    wf_id = deploy_flow_draft()

    # Step 5: 有効化 + Webhook 登録
    activate_flow(wf_id, env_id)

    print("\n" + "=" * 60)
    print("  ✅ デプロイ完了!")
    print(f"  フロー ID: {wf_id}")
    print(f"  トリガー: レコードのステータス列が変更されたとき")
    print(f"  アクション: 作成者にメール通知")
    print("=" * 60)


if __name__ == "__main__":
    main()
