"""
Word日報出力 - メール受信トリガーのデプロイスクリプト

メール受信 → ExecuteCopilot → メール返信 のフローを作成し、
ExternalTriggerComponent を登録してエージェントを再公開する。
"""
import json
import os
import sys
import time
import uuid

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "power-platform-standard"))
from auth_helper import (
    DATAVERSE_URL,
    api_delete,
    api_get,
    api_patch,
    api_post,
    flow_api_call,
    get_token,
)

# ---------- 設定 ----------

SOLUTION_NAME = os.getenv("SOLUTION_NAME", "IncidentManagement")
BOT_ID = os.getenv("BOT_ID", "")
BOT_SCHEMA = os.getenv("BOT_SCHEMA", "")
ENV_ID = os.getenv("ENV_ID", "")

FLOW_NAME = "Word日報出力 - メール受信トリガー"
SUBJECT_FILTER = "【日報】"

# 既存の接続参照（.env または Copilot Studio UI で確認）
CONNREF_COPILOT = os.getenv("CONNREF_COPILOT", "")
CONNREF_OUTLOOK = os.getenv("CONNREF_OUTLOOK", "")


def build_flow_definition():
    """メール受信 → ExecuteCopilot のフロー定義を構築（メール返信はエージェント側の Outlook ツールで実行）"""

    prompt_template = (
        "以下のメールで日報作成が依頼されました。メール本文に含まれる情報を元に、"
        "確認なしで直接 Word ファイルを生成してください。\n"
        "不足している項目は「なし」として処理してください。\n"
        "日付が指定されていない場合は本日の日付を使用してください。\n\n"
        "Word ファイル生成が完了したら、「メールに返信する (V3)」ツールを使って元のメールに返信してください。\n\n"
        "【返信時のパラメータ】\n"
        "- メッセージ ID（Id of the email to reply to）: @{triggerOutputs()?['body/id']}\n"
        "- 本文（Body）: 以下の内容を含む HTML 形式で作成してください:\n"
        "  1. 「日報を作成しました。」という冒頭メッセージ\n"
        "  2. 生成した Word ファイルのファイル名\n"
        "  3. Work IQ Word MCP Server が返した OneDrive 上の Word ファイル URL をハイパーリンクとして記載\n"
        "  4. 日報の内容サマリー（日付、氏名、業務内容の概要）\n"
        "- 重要度（Importance）: Normal\n\n"
        "■送信者メールアドレス: @{triggerOutputs()?['body/from']}\n"
        "■件名: @{triggerOutputs()?['body/subject']}\n"
        "■本文:\n@{triggerOutputs()?['body/body']}"
    )

    clientdata = {
        "properties": {
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": CONNREF_COPILOT,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
                "shared_office365": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": CONNREF_OUTLOOK,
                    },
                    "api": {"name": "shared_office365"},
                },
            },
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "parameters": {
                    "$connections": {"defaultValue": {}, "type": "Object"},
                    "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                },
                "triggers": {
                    "新しいメールが届いたとき_(V3)": {
                        "type": "OpenApiConnectionNotification",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_office365",
                                "operationId": "OnNewEmailV3",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                            },
                            "parameters": {
                                "subjectFilter": SUBJECT_FILTER,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
                "actions": {
                    "Send_prompt_to_Copilot": {
                        "runAfter": {},
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_microsoftcopilotstudio",
                                "operationId": "ExecuteCopilot",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
                            },
                            "parameters": {
                                "Copilot": BOT_SCHEMA,
                                "body/message": prompt_template,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }
    return clientdata


def deploy_flow():
    """フローをデプロイ（べき等パターン）"""
    print("=" * 60)
    print("Step 1: フローのデプロイ")
    print("=" * 60)

    # べき等: 既存フロー検索
    existing = api_get(
        f"workflows?$filter=name eq '{FLOW_NAME}' and category eq 5"
        "&$select=workflowid,statecode"
    )

    if existing.get("value"):
        wf_id = existing["value"][0]["workflowid"]
        print(f"  既存フロー発見: {wf_id} → 削除して再作成")
        try:
            api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
        except Exception:
            pass
        api_delete(f"workflows({wf_id})")
        print("  既存フロー削除完了")

    # フロー定義を構築
    clientdata = build_flow_definition()

    workflow_body = {
        "name": FLOW_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": json.dumps(clientdata, ensure_ascii=False),
        "description": "メール受信時にWord日報出力エージェントを起動し、結果をメール返信するフロー",
    }

    # ソリューション内に作成
    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MSCRM.SolutionUniqueName": SOLUTION_NAME,
    }

    import requests
    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/workflows",
        headers=headers,
        json=workflow_body,
    )

    if not r.ok:
        print(f"  ❌ フロー作成失敗: {r.status_code}")
        print(f"  {r.text[:1000]}")
        # デバッグ用 JSON 出力
        debug_path = os.path.join(os.path.dirname(__file__), "flow_email_trigger_debug.json")
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON を出力: {debug_path}")
        sys.exit(1)

    odata_id = r.headers.get("OData-EntityId", "")
    wf_id = odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else None
    print(f"  ✅ フロー作成成功: {wf_id}")

    return wf_id


def activate_flow(wf_id):
    """フローを有効化"""
    print("\n" + "=" * 60)
    print("Step 2: フローの有効化")
    print("=" * 60)

    try:
        api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})
        print(f"  ✅ フロー有効化成功")
        return True
    except Exception as e:
        print(f"  ⚠️  フロー有効化失敗: {e}")
        print("  → Power Automate UI でフローを手動で有効化してください")
        return False


def get_flow_api_id(workflow_id):
    """Dataverse workflow ID から Flow API ID を取得"""
    print("\n" + "=" * 60)
    print("Step 3: Flow API ID の取得")
    print("=" * 60)

    # Flow API で検索
    result = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows?$top=50",
    )

    for flow in result.get("value", []):
        props = flow.get("properties", {})
        if props.get("workflowEntityId") == workflow_id:
            flow_api_id = flow["name"]
            print(f"  ✅ Flow API ID: {flow_api_id}")
            return flow_api_id

    # 作成直後は反映に時間がかかる場合がある
    print("  Flow API に未反映。10秒待機してリトライ...")
    time.sleep(10)

    result = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows?$top=100",
    )

    for flow in result.get("value", []):
        props = flow.get("properties", {})
        if props.get("workflowEntityId") == workflow_id:
            flow_api_id = flow["name"]
            print(f"  ✅ Flow API ID: {flow_api_id}")
            return flow_api_id

    print("  ⚠️  Flow API ID が見つかりません")
    return None


def register_external_trigger(workflow_id, flow_api_id):
    """ExternalTriggerComponent を botcomponents に登録"""
    print("\n" + "=" * 60)
    print("Step 4: ExternalTriggerComponent の登録")
    print("=" * 60)

    # 既存の Office 365 Outlook トリガーを検索（べき等）
    existing = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{BOT_ID}' and componenttype eq 17"
        "&$select=botcomponentid,name,schemaname,data"
    )

    for comp in existing.get("value", []):
        data = comp.get("data", "")
        if "Office 365 Outlook" in data:
            comp_id = comp["botcomponentid"]
            print(f"  既存メールトリガー発見: {comp_id} → 削除して再作成")
            api_delete(f"botcomponents({comp_id})")
            break

    trigger_guid = str(uuid.uuid4())
    prefix = "eml"
    schema = f"{BOT_SCHEMA}.ExternalTriggerComponent.{prefix}.{trigger_guid}"

    # PVA YAML 形式（ダブル改行で構造行を区切る）
    data_yaml = (
        f"kind: ExternalTriggerConfiguration\n\n"
        f"externalTriggerSource:\n"
        f"  kind: WorkflowExternalTrigger\n"
        f"  flowId: {workflow_id}\n\n"
        f"extensionData:\n"
        f"  flowName: {flow_api_id}\n"
        f"  flowUrl: /providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows/{flow_api_id}\n"
        f"  triggerConnectionType: Office 365 Outlook\n"
    )

    body = {
        "name": "新しいメールが届いたとき (V3)",
        "componenttype": 17,
        "schemaname": schema,
        "data": data_yaml,
        "parentbotid@odata.bind": f"/bots({BOT_ID})",
    }

    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MSCRM.SolutionName": SOLUTION_NAME,
    }

    import requests
    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/botcomponents",
        headers=headers,
        json=body,
    )

    if r.ok:
        print(f"  ✅ ExternalTriggerComponent 登録成功")
        print(f"     schema: {schema}")
    else:
        print(f"  ❌ ExternalTriggerComponent 登録失敗: {r.status_code}")
        print(f"  {r.text[:1000]}")


def publish_bot():
    """エージェントを再公開"""
    print("\n" + "=" * 60)
    print("Step 5: エージェントの再公開")
    print("=" * 60)

    try:
        api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print(f"  ✅ エージェント公開成功")
    except Exception as e:
        print(f"  ❌ エージェント公開失敗: {e}")


def main():
    print("🚀 Word日報出力 - メール受信トリガーのデプロイを開始します")
    print(f"   Bot: {BOT_SCHEMA} ({BOT_ID})")
    print(f"   フロー名: {FLOW_NAME}")
    print(f"   件名フィルタ: {SUBJECT_FILTER}")
    print()

    # Step 1: フローデプロイ
    wf_id = deploy_flow()
    if not wf_id:
        print("フロー作成に失敗しました。")
        sys.exit(1)

    # Step 2: フロー有効化
    activate_flow(wf_id)

    # Step 3: Flow API ID 取得
    flow_api_id = get_flow_api_id(wf_id)
    if not flow_api_id:
        print("⚠️  Flow API ID が取得できませんでした。手動で ExternalTriggerComponent を設定してください。")
        sys.exit(1)

    # Step 4: ExternalTriggerComponent 登録
    register_external_trigger(wf_id, flow_api_id)

    # Step 5: エージェント再公開
    publish_bot()

    print("\n" + "=" * 60)
    print("✅ デプロイ完了")
    print("=" * 60)
    print(f"  Dataverse Workflow ID: {wf_id}")
    print(f"  Flow API ID: {flow_api_id}")
    print(f"  件名フィルタ: {SUBJECT_FILTER}")
    print()
    print("📧 テスト方法:")
    print(f"  件名に「{SUBJECT_FILTER}」を含むメールを送信してください。")
    print("  エージェントが Word を作成し、結果がメールで返信されます。")


if __name__ == "__main__":
    main()
