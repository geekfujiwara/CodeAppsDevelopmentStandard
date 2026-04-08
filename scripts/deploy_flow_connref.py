"""
ソリューション対応クラウドフロー — 接続参照（Connection Reference）版

ソリューション内のフローで「接続ではなく接続参照を使用する必要があります」警告を
解消するには、connectionreferences テーブルに接続参照レコードを作成し、
フロー定義内の connectionReferences を Invoker モードで参照する。

手順:
  1. 接続参照を作成（ソリューション内）
  2. 接続参照に既存の接続を紐づけ
  3. フロー定義で接続参照の論理名を参照
  4. workflow テーブルにフローを作成（Draft → Activate）
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auth_helper import (
    DATAVERSE_URL,
    get_session,
    get_token,
    retry_metadata,
)

PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")

API = f"{DATAVERSE_URL}/api/data/v9.2"
FLOW_DISPLAY_NAME = "インシデントステータス変更通知"

# 既存の接続 ID（Power Automate 環境に事前作成済み）
DATAVERSE_CONN = "shared-commondataser-5b340afb-2617-47e7-a1d2-1dedce14012a"
OUTLOOK_CONN = "4e37ecab87084d649e537940fdac8db2"

# 接続参照の論理名（ソリューション prefix 付き）
CONNREF_DATAVERSE = f"{PREFIX}_sharedcommondataserviceforapps"
CONNREF_OUTLOOK = f"{PREFIX}_sharedoffice365"


def get_headers(solution=False):
    """API リクエスト用ヘッダー"""
    session = get_session()
    h = dict(session.headers)
    if solution:
        h["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    return h


def create_connection_reference(logical_name, display_name, connector_id, connection_id):
    """接続参照をソリューション内に作成する（べき等パターン）"""
    print(f"\n  接続参照: {display_name} ({logical_name})")

    # 既存チェック
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

        # 接続が紐づいていなければ更新
        current_conn = existing[0].get("connectionid", "")
        if current_conn != connection_id:
            print(f"    接続を更新: {current_conn} → {connection_id}")
            session_sol = get_session()
            rp = session_sol.patch(
                f"{API}/connectionreferences({ref_id})",
                json={"connectionid": connection_id},
            )
            if rp.ok:
                print(f"    ✅ 接続を紐づけました")
            else:
                print(f"    ⚠️  接続更新失敗 ({rp.status_code}): {rp.text[:200]}")
        else:
            print(f"    接続済み: {connection_id}")
        return ref_id

    # 新規作成
    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": connector_id,
        "connectionid": connection_id,
    }

    def _create():
        session_new = get_session()
        session_new.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
        resp = session_new.post(f"{API}/connectionreferences", json=body)
        resp.raise_for_status()
        return resp

    result = retry_metadata(_create, f"接続参照 {logical_name}")
    if result and hasattr(result, "headers"):
        odata_id = result.headers.get("OData-EntityId", "")
        ref_id = odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else "unknown"
        print(f"    ✅ 作成成功: {ref_id}")
        return ref_id
    return None


def build_clientdata():
    """フロー定義を構築 — 接続参照を Invoker モードで参照"""

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
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "connectionName": CONNREF_DATAVERSE,
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
                                "connectionName": CONNREF_OUTLOOK,
                                "operationId": "SendEmailV2",
                            },
                            "parameters": {
                                "emailMessage/To": "@outputs('Get_Creator')?['body/internalemailaddress']",
                                "emailMessage/Subject": "【インシデント通知】ステータスが @{outputs('Compose_Status_Label')} に変更されました",
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

    # 接続参照を Invoker モードで参照（ソリューション ALM 対応）
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


def main():
    print("=" * 60)
    print("  ソリューション対応フロー作成（接続参照版）")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print("=" * 60)

    # ── Step 1: 接続参照の作成 ────────────────────
    print("\n=== Step 1: 接続参照の作成 ===")

    create_connection_reference(
        logical_name=CONNREF_DATAVERSE,
        display_name="Dataverse (インシデント管理)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
        connection_id=DATAVERSE_CONN,
    )
    create_connection_reference(
        logical_name=CONNREF_OUTLOOK,
        display_name="Office 365 Outlook (インシデント管理)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_office365",
        connection_id=OUTLOOK_CONN,
    )

    # ── Step 2: 既存フロー検索（べき等パターン）────
    print("\n=== Step 2: 既存フロー検索 ===")
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
        print(f"  既存フロー発見: {wf_id}")
        print("  → 削除して再作成します")

        # まず無効化してから削除
        session.patch(
            f"{API}/workflows({wf_id})",
            json={"statecode": 0, "statuscode": 1},
        )
        rd = session.delete(f"{API}/workflows({wf_id})")
        if rd.ok:
            print(f"  削除完了: {wf_id}")
        else:
            print(f"  削除失敗 ({rd.status_code}): {rd.text[:300]}")
    else:
        print("  既存フローなし（新規作成）")

    # ── Step 3: workflow レコード作成（Draft → Activate）────
    print("\n=== Step 3: ソリューション対応フロー作成 ===")
    clientdata = build_clientdata()

    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": clientdata,
        "description": "インシデントのステータスが変更されたとき、作成者にメール通知を送信するフロー（接続参照版）",
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
        print("\n=== Step 3.5: フロー有効化 ===")
        ra = session.patch(
            f"{API}/workflows({wf_id})",
            json={"statecode": 1, "statuscode": 2},
        )
        if ra.ok:
            print(f"  ✅ フロー有効化成功!")
        else:
            print(f"  ⚠️  有効化失敗 ({ra.status_code}): {ra.text[:300]}")
            print("  → Power Automate UI で手動有効化してください")
    else:
        print(f"  ❌ 作成失敗 ({r2.status_code}): {r2.text[:500]}")
        debug_path = "scripts/flow_connref_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON: {debug_path}")
        sys.exit(1)

    # ── Step 4: 確認 ────
    print("\n=== Step 4: 確認 ===")
    r3 = session.get(
        f"{API}/workflows?"
        f"$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5"
        f"&$select=workflowid,name,statecode,statuscode"
    )
    r3.raise_for_status()
    flows = r3.json().get("value", [])
    if flows:
        fl = flows[0]
        state = "有効" if fl["statecode"] == 1 else "無効"
        print(f"  ✅ {fl['name']} (ID: {fl['workflowid']}) — {state}")
    else:
        print("  ⚠️  フローが見つかりません")

    print("\n✅ 完了!")
    print("  接続参照: Dataverse + Office 365 Outlook")
    print("  トリガー: インシデントのステータス列が変更されたとき")
    print("  アクション: 作成者にメール通知")


if __name__ == "__main__":
    main()
