"""
メール返信をエージェント側の Outlook ツールで実行するよう修正:
1. フローから Reply to email アクションを除去して再デプロイ
2. エージェントの Instructions にメール返信の指示を追加
3. ExternalTriggerComponent を更新
4. エージェントを再公開
"""
import json
import os
import re
import sys
import time
import uuid

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "power-platform-standard", "scripts"))
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

SOLUTION_NAME = os.getenv("SOLUTION_NAME", "IncidentManagement")
BOT_ID = os.getenv("BOT_ID", "")
BOT_SCHEMA = os.getenv("BOT_SCHEMA", "")
FLOW_NAME = "Word日報出力 - メール受信トリガー"

# Instructions に追加するメールトリガー対応セクション
EMAIL_INSTRUCTIONS_ADDITION = """
  # メールトリガー対応（自動起動時のルール）
  Power Automate のメールトリガー経由で起動された場合、メッセージ冒頭に「以下のメールで日報作成が依頼されました」と含まれます。この場合は以下のルールに従ってください:

  1) ヒアリング・最終確認をスキップする:
     - メール本文に含まれる情報だけで日報を作成する。追加質問や最終確認は行わない。
     - 不足している項目は「なし」として処理する。
     - 日付が未指定の場合は本日の日付を使用する。

  2) Word ファイル生成:
     - Work IQ Word MCP Server を使用して通常通り Word を生成する。

  3) メールで結果を返信する（必須）:
     - Word 生成が完了したら、Outlook ツールを使用して、メッセージ内の「送信者メールアドレス」宛にメールを送信する。
     - メールの件名: 「Re: {元の件名}」
     - メールの本文: 日報作成が完了した旨と、生成した Word ファイルのリンクを含める。
     - html形式でフォーマットされたメールを送信する。"""


def resolve_env_id():
    """DATAVERSE_URL から Flow API 用の環境 ID を解決"""
    envs = flow_api_call("GET", "/providers/Microsoft.ProcessSimple/environments")
    for env in envs.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        if instance_url == DATAVERSE_URL:
            return env["name"]
    raise RuntimeError(f"環境が見つかりません: {DATAVERSE_URL}")


def step1_redeploy_flow():
    """Reply アクション除去済みのフローを再デプロイ"""
    print("=" * 60)
    print("Step 1: フロー再デプロイ（Reply アクション除去）")
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

    # フロー定義を構築（Reply アクションなし）
    prompt_template = (
        "以下のメールで日報作成が依頼されました。メール本文に含まれる情報を元に、"
        "確認なしで直接 Word ファイルを生成してください。\n"
        "不足している項目は「なし」として処理してください。\n"
        "日付が指定されていない場合は本日の日付を使用してください。\n\n"
        "Word ファイル生成が完了したら、生成結果（ファイル名とリンク）を "
        "以下の送信者にメールで返信してください。\n\n"
        "■送信者メールアドレス: @{triggerOutputs()?['body/from']}\n"
        "■件名: @{triggerOutputs()?['body/subject']}\n"
        "■本文:\n@{triggerOutputs()?['body/body']}"
    )

    connref_copilot = "geek_sharedmicrosoftcopilotstudio_c68f0"
    connref_outlook = "new_sharedoffice365_c04b3"

    clientdata = {
        "properties": {
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_copilot,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
                "shared_office365": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_outlook,
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
        "description": "メール受信時にWord日報出力エージェントを起動するフロー（返信はエージェントのOutlookツールで実行）",
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
        sys.exit(1)

    odata_id = r.headers.get("OData-EntityId", "")
    wf_id = odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else None
    print(f"  ✅ フロー作成成功: {wf_id}")
    print(f"     アクション: Trigger(OnNewEmailV3) → Send_prompt_to_Copilot のみ")
    return wf_id


def step2_update_instructions():
    """エージェントの Instructions にメール返信指示を追加"""
    print("\n" + "=" * 60)
    print("Step 2: Instructions にメール返信指示を追加")
    print("=" * 60)

    # GPT コンポーネントを取得
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

    # 既にメールトリガー指示が含まれているか確認
    if "メールトリガー対応" in existing_data:
        print("  メールトリガー指示は既に含まれています。スキップ。")
        return

    # aISettings セクションを抽出して保持
    ai_settings_section = ""
    ai_idx = existing_data.find("\naISettings:")
    if ai_idx < 0:
        ai_idx = existing_data.find("aISettings:")
    if ai_idx >= 0:
        ai_settings_section = existing_data[ai_idx:].rstrip()
        data_without_ai = existing_data[:ai_idx].rstrip()
    else:
        data_without_ai = existing_data.rstrip()

    # instructions ブロックの末尾を探す
    # instructions: |- の後のインデントされたブロックの末尾に追加
    # gptCapabilities: の直前に挿入
    insert_marker = "gptCapabilities:"
    insert_idx = data_without_ai.find(insert_marker)

    if insert_idx < 0:
        # gptCapabilities がなければ conversationStarters の前に挿入
        insert_marker = "conversationStarters:"
        insert_idx = data_without_ai.find(insert_marker)

    if insert_idx > 0:
        # instructions ブロック（2スペースインデント）に追加
        before = data_without_ai[:insert_idx].rstrip()
        after = data_without_ai[insert_idx:]
        new_data = before + "\n" + EMAIL_INSTRUCTIONS_ADDITION + "\n\n" + after
    else:
        # マーカーが見つからない場合はデータ末尾に追加
        new_data = data_without_ai + "\n" + EMAIL_INSTRUCTIONS_ADDITION

    # aISettings を末尾に再付加
    if ai_settings_section:
        new_data = new_data.rstrip("\n") + "\n\n" + ai_settings_section + "\n\n"

    # 更新
    api_patch(f"botcomponents({comp_id})", {"data": new_data})
    print(f"  ✅ Instructions にメール返信指示を追加しました")
    print(f"     component: {comp_id}")


def step3_update_trigger_component(wf_id, env_id):
    """ExternalTriggerComponent を新しいフローの ID で更新"""
    print("\n" + "=" * 60)
    print("Step 3: ExternalTriggerComponent の更新")
    print("=" * 60)

    # Flow API ID を取得
    result = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows",
    )
    flow_api_id = wf_id  # フォールバック
    for flow in result.get("value", []):
        props = flow.get("properties", {})
        if props.get("workflowEntityId") == wf_id:
            flow_api_id = flow["name"]
            break

    print(f"  Dataverse workflow ID: {wf_id}")
    print(f"  Flow API ID: {flow_api_id}")

    # 既存の Outlook トリガーを削除
    existing = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{BOT_ID}' and componenttype eq 17"
        "&$select=botcomponentid,name,schemaname,data"
    )
    for comp in existing.get("value", []):
        data = comp.get("data", "")
        if "Office 365 Outlook" in data:
            api_delete(f"botcomponents({comp['botcomponentid']})")
            print(f"  既存メールトリガー削除: {comp['botcomponentid']}")

    # 新規登録
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
    """エージェントを再公開"""
    print("\n" + "=" * 60)
    print("Step 4: エージェントの再公開")
    print("=" * 60)

    bot_before = api_get(f"bots({BOT_ID})?$select=publishedon")
    print(f"  公開前 publishedon: {bot_before.get('publishedon')}")

    api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
    print("  PvaPublish 呼び出し完了")

    time.sleep(8)
    bot_after = api_get(f"bots({BOT_ID})?$select=publishedon")
    print(f"  公開後 publishedon: {bot_after.get('publishedon')}")

    if bot_before.get("publishedon") != bot_after.get("publishedon"):
        print("  ✅ 公開日が更新されました")
    else:
        print("  ⚠️ 公開日が未更新。Copilot Studio UI でも公開をお願いします")


def main():
    print("🔧 メール返信をエージェント側の Outlook ツールで実行するよう修正\n")

    # 環境 ID を解決
    env_id = resolve_env_id()
    print(f"  環境 ID: {env_id}\n")

    # Step 1: フロー再デプロイ
    wf_id = step1_redeploy_flow()

    # Step 2: Instructions 更新
    step2_update_instructions()

    # Step 3: ExternalTriggerComponent 更新
    step3_update_trigger_component(wf_id, env_id)

    # Step 4: エージェント再公開
    step4_publish()

    print("\n" + "=" * 60)
    print("✅ 修正完了")
    print("=" * 60)
    print(f"  新フロー ID: {wf_id}")
    print("  フロー構成: Trigger(OnNewEmailV3) → ExecuteCopilot のみ")
    print("  メール返信: エージェントの Outlook ツールが実行")
    print()
    print("⚠️ 次のステップ:")
    print("  1. Power Automate UI でフローの接続を認証し「オンにする」")
    print("  2. Copilot Studio UI でエージェントに Outlook ツールが追加されていることを確認")
    print("     （未追加の場合は Copilot Studio UI で Outlook コネクタをツールとして追加）")


if __name__ == "__main__":
    main()
