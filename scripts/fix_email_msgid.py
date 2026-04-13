"""
修正:
1. Instructions からメールトリガー対応セクションを削除
2. フローの ExecuteCopilot プロンプトにメッセージID + 返信指示を集約
3. ExternalTriggerComponent 更新 + エージェント再公開
"""
import json
import os
import re
import sys
import time
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import (
    DATAVERSE_URL,
    api_delete,
    api_get,
    api_patch,
    api_post,
    flow_api_call,
    get_token,
)
import requests
from dotenv import load_dotenv
load_dotenv()

SOLUTION_NAME = os.getenv("SOLUTION_NAME", "IncidentManagement")
BOT_ID = os.getenv("BOT_ID", "")
BOT_SCHEMA = os.getenv("BOT_SCHEMA", "")
FLOW_NAME = "Word日報出力 - メール受信トリガー"

CONNREF_COPILOT = os.getenv("CONNREF_COPILOT", "")
CONNREF_OUTLOOK = os.getenv("CONNREF_OUTLOOK", "")


def resolve_env_id():
    envs = flow_api_call("GET", "/providers/Microsoft.ProcessSimple/environments")
    for env in envs.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        if instance_url == DATAVERSE_URL:
            return env["name"]
    raise RuntimeError(f"環境が見つかりません: {DATAVERSE_URL}")


def step1_remove_email_instructions():
    """Instructions からメールトリガー対応セクションを削除"""
    print("=" * 60)
    print("Step 1: Instructions からメール返信指示を削除")
    print("=" * 60)

    result = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{BOT_ID}' and componenttype eq 15"
        "&$select=botcomponentid,name,schemaname,data"
    )

    if not result.get("value"):
        print("  ❌ GPT コンポーネントが見つかりません")
        return

    comp = result["value"][0]
    comp_id = comp["botcomponentid"]
    existing_data = comp.get("data", "")

    # メールトリガー対応セクションを削除
    marker_start = "\n  # メールトリガー対応（自動起動時のルール）"
    marker_end_candidates = [
        "\ngptCapabilities:",
        "\nconversationStarters:",
        "\naISettings:",
    ]

    start_idx = existing_data.find(marker_start)
    if start_idx < 0:
        print("  メールトリガー指示は含まれていません。スキップ。")
        return

    # セクションの終了位置を探す
    end_idx = len(existing_data)
    section_after_marker = existing_data[start_idx + len(marker_start):]
    for candidate in marker_end_candidates:
        idx = existing_data.find(candidate, start_idx + 1)
        if idx > start_idx and idx < end_idx:
            end_idx = idx

    removed_section = existing_data[start_idx:end_idx]
    new_data = existing_data[:start_idx] + existing_data[end_idx:]

    # 余分な連続改行を整理
    while "\n\n\n\n" in new_data:
        new_data = new_data.replace("\n\n\n\n", "\n\n\n")

    api_patch(f"botcomponents({comp_id})", {"data": new_data})
    print(f"  ✅ メールトリガー指示を削除しました")
    print(f"  削除したセクション（先頭100文字）: {removed_section[:100]}...")


def step2_redeploy_flow():
    """フローを再デプロイ（メッセージID + 返信指示をプロンプトに含む）"""
    print("\n" + "=" * 60)
    print("Step 2: フロー再デプロイ（メッセージID + 返信指示をプロンプトに集約）")
    print("=" * 60)

    # 既存フロー検索・削除
    existing = api_get(
        f"workflows?$filter=name eq '{FLOW_NAME}' and category eq 5"
        "&$select=workflowid,statecode"
    )
    if existing.get("value"):
        wf_id = existing["value"][0]["workflowid"]
        print(f"  既存フロー削除: {wf_id}")
        try:
            api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
        except Exception:
            pass
        api_delete(f"workflows({wf_id})")

    # メッセージID + 返信指示をプロンプトに集約
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
                                "subjectFilter": "【日報】",
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

    workflow_body = {
        "name": FLOW_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": json.dumps(clientdata, ensure_ascii=False),
        "description": "メール受信時にWord日報出力エージェントを起動（メッセージIDを渡し、エージェントのOutlookツールで返信）",
    }

    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MSCRM.SolutionUniqueName": SOLUTION_NAME,
    }

    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/workflows",
        headers=headers,
        json=workflow_body,
    )

    if not r.ok:
        print(f"  ❌ フロー作成失敗: {r.status_code}")
        print(f"  {r.text[:1000]}")
        debug_path = os.path.join(os.path.dirname(__file__), "flow_email_trigger_debug.json")
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        sys.exit(1)

    odata_id = r.headers.get("OData-EntityId", "")
    wf_id = odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else None
    print(f"  ✅ フロー作成成功: {wf_id}")
    print(f"     プロンプトにメッセージ ID (@{{triggerOutputs()?['body/id']}}) を含む")
    return wf_id


def step3_update_trigger(wf_id, env_id):
    """ExternalTriggerComponent を更新"""
    print("\n" + "=" * 60)
    print("Step 3: ExternalTriggerComponent の更新")
    print("=" * 60)

    result = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows",
    )
    flow_api_id = wf_id
    for flow in result.get("value", []):
        props = flow.get("properties", {})
        if props.get("workflowEntityId") == wf_id:
            flow_api_id = flow["name"]
            break

    # 既存 Outlook トリガー削除
    existing = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{BOT_ID}' and componenttype eq 17"
        "&$select=botcomponentid,data"
    )
    for comp in existing.get("value", []):
        if "Office 365 Outlook" in comp.get("data", ""):
            api_delete(f"botcomponents({comp['botcomponentid']})")
            print(f"  既存メールトリガー削除: {comp['botcomponentid']}")

    trigger_guid = str(uuid.uuid4())
    schema = f"{BOT_SCHEMA}.ExternalTriggerComponent.eml.{trigger_guid}"

    data_yaml = (
        "kind: ExternalTriggerConfiguration\n"
        "externalTriggerSource:\n"
        "  kind: WorkflowExternalTrigger\n"
        f"  flowId: {wf_id}\n"
        "\n"
        "extensionData:\n"
        f"  flowName: {flow_api_id}\n"
        f"  flowUrl: /providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{flow_api_id}\n"
        "  triggerConnectionType: Office 365 Outlook\n"
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

    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/botcomponents",
        headers=headers,
        json=body,
    )
    if r.ok:
        print(f"  ✅ ExternalTriggerComponent 登録成功")
    else:
        print(f"  ❌ 登録失敗: {r.status_code} {r.text[:500]}")


def step4_publish():
    """エージェント再公開"""
    print("\n" + "=" * 60)
    print("Step 4: エージェントの再公開")
    print("=" * 60)

    api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
    print("  PvaPublish 呼び出し完了")

    time.sleep(8)
    bot = api_get(f"bots({BOT_ID})?$select=publishedon")
    print(f"  publishedon: {bot.get('publishedon')}")


def main():
    print("🔧 メッセージID をプロンプトに集約し、Instructions からメール返信指示を削除\n")

    env_id = resolve_env_id()
    print(f"  環境 ID: {env_id}\n")

    step1_remove_email_instructions()
    wf_id = step2_redeploy_flow()
    step3_update_trigger(wf_id, env_id)
    step4_publish()

    print("\n" + "=" * 60)
    print("✅ 完了")
    print("=" * 60)
    print()
    print("変更内容:")
    print("  ・Instructions: メールトリガー対応セクションを削除（チャット時の誤動作防止）")
    print("  ・フロー ExecuteCopilot プロンプトに集約:")
    print("    - メッセージ ID (@{triggerOutputs()?['body/id']})")
    print("    - 「メールに返信する (V3)」ツールで返信する指示")
    print("    - 送信者・件名・本文")
    print()
    print("⚠️ Power Automate UI でフローの接続を認証し「オンにする」を実行してください")


if __name__ == "__main__":
    main()
