"""
ソリューション対応クラウドフローを Dataverse Web API で直接作成

Flow Management API ではなく、Dataverse の workflow テーブルに直接レコードを作成することで
ソリューション対応フローになる。MSCRM.SolutionUniqueName ヘッダーでソリューションに紐づける。
"""

import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
from auth_helper import get_token

load_dotenv()

DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")

API = f"{DATAVERSE_URL}/api/data/v9.2"
FLOW_DISPLAY_NAME = "インシデントステータス変更通知"

# 再認証済み接続 ID
DATAVERSE_CONN = "shared-commondataser-5b340afb-2617-47e7-a1d2-1dedce14012a"
OUTLOOK_CONN = "4e37ecab87084d649e537940fdac8db2"


def get_headers(solution=False):
    token = get_token()
    h = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }
    if solution:
        h["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    return h


def build_clientdata():
    """フロー定義 + 接続参照を clientdata JSON として構築"""
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

    connection_references = {
        "shared_commondataserviceforapps": {
            "connectionName": DATAVERSE_CONN,
            "source": "Embedded",
            "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "tier": "NotSpecified",
        },
        "shared_office365": {
            "connectionName": OUTLOOK_CONN,
            "source": "Embedded",
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
    print("  ソリューション対応フロー作成（Dataverse Web API）")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print("=" * 60)

    # Step 1: 既存フロー検索（べき等パターン）
    print("\n=== Step 1: 既存フロー検索 ===")
    r = requests.get(
        f"{API}/workflows?$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5&$select=workflowid,name,statecode",
        headers=get_headers(),
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        wf_id = existing[0]["workflowid"]
        print(f"  既存フロー発見: {wf_id}")
        print("  → 既存フローを削除して再作成します")
        rd = requests.delete(f"{API}/workflows({wf_id})", headers=get_headers())
        if rd.ok:
            print(f"  削除完了: {wf_id}")
        else:
            print(f"  削除失敗 ({rd.status_code}): {rd.text[:300]}")
    else:
        print("  既存フローなし（新規作成）")

    # Step 2: workflow レコード作成
    print("\n=== Step 2: ソリューション対応フロー作成 ===")
    clientdata = build_clientdata()

    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,          # Definition
        "category": 5,      # Modern Flow (Cloud Flow)
        "statecode": 0,     # Draft（まず下書きで作成）
        "statuscode": 1,    # Draft
        "primaryentity": "none",
        "clientdata": clientdata,
        "description": "インシデントのステータスが変更されたとき、作成者にメール通知を送信するフロー",
    }

    r2 = requests.post(
        f"{API}/workflows",
        headers=get_headers(solution=True),
        json=workflow_body,
    )

    if r2.ok:
        # レスポンスヘッダーからIDを取得
        location = r2.headers.get("OData-EntityId", "")
        wf_id = location.split("(")[-1].rstrip(")") if "(" in location else "unknown"
        print(f"  ✅ フロー作成成功! (Draft)")
        print(f"  Workflow ID: {wf_id}")

        # 有効化: statecode=1, statuscode=2 に更新
        print("\n=== Step 2.5: フロー有効化 ===")
        activate_body = {"statecode": 1, "statuscode": 2}
        ra = requests.patch(
            f"{API}/workflows({wf_id})",
            headers=get_headers(),
            json=activate_body,
        )
        if ra.ok:
            print(f"  ✅ フロー有効化成功!")
        else:
            print(f"  ⚠️  有効化失敗 ({ra.status_code}): {ra.text[:300]}")
            print("  → Power Automate UI で手動有効化してください")
    else:
        print(f"  ❌ 作成失敗 ({r2.status_code}): {r2.text[:500]}")

        # フォールバック: デバッグ用 JSON 保存
        debug_path = "scripts/flow_solution_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON: {debug_path}")
        sys.exit(1)

    # Step 3: 確認
    print("\n=== Step 3: 確認 ===")
    r3 = requests.get(
        f"{API}/workflows?$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5&$select=workflowid,name,statecode,statuscode",
        headers=get_headers(),
    )
    r3.raise_for_status()
    flows = r3.json().get("value", [])
    if flows:
        f = flows[0]
        state = "有効" if f["statecode"] == 1 else "無効"
        print(f"  ✅ {f['name']} (ID: {f['workflowid']}) — {state}")
    else:
        print("  ⚠️  フローが見つかりません")

    print("\n✅ 完了!")
    print("  トリガー: インシデントのステータス列が変更されたとき")
    print("  アクション: 作成者にメール通知")
    print(f"  → Power Automate で確認: https://make.powerautomate.com")


if __name__ == "__main__":
    main()
