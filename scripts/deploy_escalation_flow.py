"""
よろず相談ボット エスカレーション通知フロー

Dataverse の yorozu_inquiry テーブルでステータスが「エスカレーション済み」に更新された時、
DXチームに通知メールを送信する。

前提:
  - .env に DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX, ADMIN_EMAIL を設定
  - Power Automate 接続ページで Dataverse / Office 365 Outlook 接続を事前作成
    https://make.powerautomate.com/connections

使い方:
  python scripts/deploy_escalation_flow.py
"""

import json
import os
import sys
import time

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", ".github", "skills", "standard", "scripts"))

import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from auth_helper import (
    DATAVERSE_URL,
    get_session,
    get_token,
    retry_metadata,
)

PREFIX = os.environ.get("PUBLISHER_PREFIX", "")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "YorozuConsultation")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")

API = f"{DATAVERSE_URL}/api/data/v9.2"
POWERAPPS_API = "https://api.powerapps.com"
FLOW_API = "https://api.flow.microsoft.com"
API_VER = "api-version=2016-11-01"

FLOW_DISPLAY_NAME = "よろず相談 エスカレーション通知"

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
        timeout=120,
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
    r = requests.request(method, url, headers=headers, json=body, timeout=60)
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
    dv_url = DATAVERSE_URL.rstrip("/")
    for env in envs.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        if instance_url == dv_url:
            env_id = env["name"]
            print(f"  環境 ID: {env_id}")
            return env_id
    raise RuntimeError(f"環境が見つかりません: {dv_url}")


# ══════════════════════════════════════════════════════════
#  Step 2: 接続自動検索
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
                    wait = 15 * (attempt + 1)
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
#  Step 3: 接続参照の作成
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
#  Step 4: フロー定義構築
# ══════════════════════════════════════════════════════════

def build_email_html() -> str:
    """エスカレーション通知メールのHTMLテンプレートを構築する。"""
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
        '<td style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);padding:32px 40px;">\n'
        '<div style="font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:2px;'
        'text-transform:uppercase;margin-bottom:8px;">YOROZU CONSULTATION</div>\n'
        '<div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.4;">'
        '&#128680; エスカレーション — DXチーム対応依頼</div>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 相談件名 -->\n'
        '<tr>\n'
        '<td style="padding:32px 40px 16px;">\n'
        '<div style="font-size:11px;color:#64748b;text-transform:uppercase;'
        'letter-spacing:2px;margin-bottom:8px;">相談件名</div>\n'
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
        '<!-- 部門 -->\n'
        '<tr style="background-color:#f8fafc;">\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#127970; 部門</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        "<span style=\"font-size:14px;color:#0f172a;\">@{outputs('Compose_Department_Label')}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 分類 -->\n'
        '<tr>\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128204; 分類</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        "<span style=\"font-size:14px;color:#0f172a;\">@{outputs('Compose_Category_Label')}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 相談者 -->\n'
        '<tr style="background-color:#f8fafc;">\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128100; 相談者</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        "<span style=\"font-size:14px;color:#0f172a;\">@{outputs('Get_Reporter')?['body/fullname']}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 満足度 -->\n'
        '<tr>\n'
        '<td style="padding:14px 20px;width:140px;border-bottom:1px solid #e2e8f0;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#11088; 満足度</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">\n'
        "<span style=\"font-size:14px;color:#0f172a;\">@{coalesce(triggerOutputs()?['body/{prefix}_satisfaction'],'未回答')} / 5</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 相談日時 -->\n'
        '<tr style="background-color:#f8fafc;">\n'
        '<td style="padding:14px 20px;width:140px;">\n'
        '<div style="font-size:13px;font-weight:600;color:#475569;">&#128197; 相談日時</div>\n'
        '</td>\n'
        '<td style="padding:14px 20px;">\n'
        "<span style=\"font-size:14px;color:#0f172a;\">@{formatDateTime(triggerOutputs()?['body/createdon'],'yyyy/MM/dd HH:mm')}</span>\n"
        '</td>\n'
        '</tr>\n'
        '\n'
        '</table>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- 質問内容 -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 24px;">\n'
        '<div style="font-size:11px;color:#64748b;text-transform:uppercase;'
        'letter-spacing:2px;margin-bottom:10px;">質問内容</div>\n'
        '<div style="padding:16px 20px;background-color:#f8fafc;border-radius:8px;'
        'border-left:4px solid #dc2626;font-size:14px;color:#334155;line-height:1.7;">'
        "@{coalesce(triggerOutputs()?['body/{prefix}_question'],'（未入力）')}"
        '</div>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- エスカレーション理由 -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 24px;">\n'
        '<div style="font-size:11px;color:#64748b;text-transform:uppercase;'
        'letter-spacing:2px;margin-bottom:10px;">エスカレーション理由</div>\n'
        '<div style="padding:16px 20px;background-color:#fef2f2;border-radius:8px;'
        'border-left:4px solid #b91c1c;font-size:14px;color:#334155;line-height:1.7;">'
        "@{coalesce(triggerOutputs()?['body/{prefix}_escalationreason'],'（理由未入力）')}"
        '</div>\n'
        '</td>\n'
        '</tr>\n'
        '\n'
        '<!-- フッター -->\n'
        '<tr>\n'
        '<td style="padding:0 40px 32px;">\n'
        '<div style="font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">'
        'このメールはよろず相談ボットから自動送信されています。<br>'
        'Powered by Power Automate &amp; Copilot Studio'
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


def build_clientdata() -> str:
    # 部門ラベル変換式
    dept_expr = (
        "@if(equals(triggerOutputs()?['body/{prefix}_department'],100000000),'物流',"
        "if(equals(triggerOutputs()?['body/{prefix}_department'],100000001),'購買',"
        "if(equals(triggerOutputs()?['body/{prefix}_department'],100000002),'品質',"
        "if(equals(triggerOutputs()?['body/{prefix}_department'],100000003),'その他','不明'))))"
    ).replace("{prefix}", PREFIX)

    # 分類ラベル変換式
    cat_expr = (
        "@if(equals(triggerOutputs()?['body/{prefix}_category'],100000000),'情報取得',"
        "if(equals(triggerOutputs()?['body/{prefix}_category'],100000001),'作業支援',"
        "if(equals(triggerOutputs()?['body/{prefix}_category'],100000002),'設計相談',"
        "if(equals(triggerOutputs()?['body/{prefix}_category'],100000003),'トラブル対応','不明'))))"
    ).replace("{prefix}", PREFIX)

    # メール件名
    email_subject = (
        "\U0001f6a8 [エスカレーション] @{triggerOutputs()?['body/{prefix}_name']}"
    ).replace("{prefix}", PREFIX)

    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "When_inquiry_escalated": {
                "type": "OpenApiConnectionWebhook",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": CONNREF_DATAVERSE,
                        "operationId": "SubscribeWebhookTrigger",
                    },
                    "parameters": {
                        "subscriptionRequest/message": 3,       # 3 = Update
                        "subscriptionRequest/entityname": f"{PREFIX}_yorozuinquiry",
                        "subscriptionRequest/scope": 4,         # Organization
                        "subscriptionRequest/runas": 3,         # Modifying user
                        "subscriptionRequest/filteringattributes": f"{PREFIX}_status",
                        "subscriptionRequest/filterexpression": f"{PREFIX}_status eq 100000004",
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
            "Compose_Department_Label": {
                "type": "Compose",
                "runAfter": {"Get_Reporter": ["Succeeded"]},
                "inputs": dept_expr,
            },
            "Compose_Category_Label": {
                "type": "Compose",
                "runAfter": {"Get_Reporter": ["Succeeded"]},
                "inputs": cat_expr,
            },
            "Send_Escalation_Email": {
                "type": "OpenApiConnection",
                "runAfter": {
                    "Compose_Department_Label": ["Succeeded"],
                    "Compose_Category_Label": ["Succeeded"],
                },
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
#  Step 5: デプロイ
# ══════════════════════════════════════════════════════════

def deploy(env_id: str):
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
        time.sleep(2)
        rd = session.delete(f"{API}/workflows({wf_id})")
        if rd.ok:
            print("  削除完了")
        else:
            print(f"  削除失敗 ({rd.status_code}): {rd.text[:300]}")
        time.sleep(3)
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
        "description": "よろず相談のステータスがエスカレーション済みに更新された時、DXチームに通知メールを送信",
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
        time.sleep(3)
        ra = session.patch(
            f"{API}/workflows({wf_id})",
            json={"statecode": 1, "statuscode": 2},
        )
        if ra.ok:
            print("  ✅ フロー有効化成功!")

            # Webhook 登録（Dataverse トリガーは /start 必須）
            print("\n=== Step 8: Webhook 登録 ===")
            time.sleep(3)
            token = get_token(scope="https://service.flow.microsoft.com/.default")
            try:
                r_start = requests.post(
                    f"{FLOW_API}/providers/Microsoft.ProcessSimple"
                    f"/environments/{env_id}/flows/{wf_id}/start?{API_VER}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=60,
                )
                r_start.raise_for_status()
                print("  ✅ Webhook /start 登録完了")
            except Exception as e:
                print(f"  ⚠️ /start 登録失敗（手動で Turn On してください）: {e}")
        else:
            print(f"  ⚠️ 有効化失敗 ({ra.status_code}): {ra.text[:300]}")
            print("  → Power Automate UI で手動有効化してください")
        return wf_id
    else:
        print(f"  ❌ 作成失敗 ({r2.status_code}): {r2.text[:500]}")
        debug_path = "flow_escalation_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON: {debug_path}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════
#  メイン
# ══════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  よろず相談ボット エスカレーション通知フロー デプロイ")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  通知先: {ADMIN_EMAIL}")
    print("=" * 60)

    if not ADMIN_EMAIL:
        print("\n❌ ADMIN_EMAIL が .env に設定されていません")
        sys.exit(1)

    if not PREFIX:
        print("\n❌ PUBLISHER_PREFIX が .env に設定されていません")
        sys.exit(1)

    env_id = resolve_environment_id()
    connections = find_connections(env_id)

    print("\n=== Step 3: 接続参照の作成 ===")
    create_connection_reference(
        logical_name=CONNREF_DATAVERSE,
        display_name="Dataverse (よろず相談)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
        connection_id=connections["shared_commondataserviceforapps"],
    )
    create_connection_reference(
        logical_name=CONNREF_OUTLOOK,
        display_name="Office 365 Outlook (よろず相談)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_office365",
        connection_id=connections["shared_office365"],
    )

    print("\n=== Step 4: フロー定義構築 ===")
    print(f"  トリガー: {PREFIX}_yorozuinquiry ステータス → エスカレーション済み")
    print("  アクション: 相談者取得 → ラベル変換 → DXチーム通知メール送信")

    wf_id = deploy(env_id)

    print("\n" + "=" * 60)
    print("  ✅ デプロイ完了!")
    print(f"  フロー: {FLOW_DISPLAY_NAME}")
    print(f"  トリガー: 相談ステータス → エスカレーション済み")
    print(f"  通知先: {ADMIN_EMAIL}")
    print(f"  Workflow ID: {wf_id}")
    print("=" * 60)


if __name__ == "__main__":
    main()
