"""
AI Builder AI プロンプト デプロイスクリプト — Summarize Document For Incident

Phase 4: AI Builder AI プロンプトを作成 → エージェントにツールとして追加 → 公開

使い方:
  python .github/skills/ai-builder-prompt/scripts/deploy_ai_prompt.py
"""

import json
import os
import sys
from datetime import datetime, timezone

# スキルフォルダと共通認証モジュールを sys.path に追加
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "power-platform-standard", "scripts"))

from dotenv import load_dotenv
from auth_helper import (
    get_token,
    api_get,
    api_post,
    api_patch,
    retry_metadata,
    DATAVERSE_URL as _DV_URL,
)

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
DATAVERSE_URL = _DV_URL
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
BOT_ID = os.environ.get("BOT_ID", "")

# ── 定数 ──────────────────────────────────────────────────
GPT_PROMPT_TEMPLATE_ID = "edfdb190-3791-45d8-9a6c-8f90a37c278a"

PROMPT_NAME = "Summarize Document For Incident"
PROMPT_DESCRIPTION = "SharePoint ドキュメントの内容を要約し、カテゴリを判定してインシデント登録用の情報を生成する"

# カテゴリ一覧
CATEGORIES = [
    "ネットワーク障害",
    "ソフトウェア不具合",
    "ハードウェア故障",
    "アカウント/権限",
    "その他",
]
CATEGORIES_STR = "\n".join(f"- {c}" for c in CATEGORIES)

# ── プロンプト定義 ────────────────────────────────────────
PROMPT_TEXT_BEFORE = (
    "あなたはドキュメント分析の専門家です。以下のドキュメントを分析し、"
    "インシデント管理システムに登録するための情報を作成してください。\n\n"
    "ファイル名: "
)

PROMPT_TEXT_BETWEEN = (
    "\n\nドキュメント: "
)

PROMPT_TEXT_AFTER = (
    "\n\nカテゴリは以下から最も適切なものを1つ選んでください:\n"
    f"{CATEGORIES_STR}\n\n"
    "JSON形式で出力してください。"
)

# prompt 配列: literal と inputVariable を交互に配置
PROMPT_SEGMENTS = [
    {"type": "literal", "text": PROMPT_TEXT_BEFORE},
    {"type": "inputVariable", "id": "filename"},
    {"type": "literal", "text": PROMPT_TEXT_BETWEEN},
    {"type": "inputVariable", "id": "document"},
    {"type": "literal", "text": PROMPT_TEXT_AFTER},
]

# 入力変数定義
INPUT_DEFINITIONS = [
    {
        "id": "filename",
        "text": "filename",
        "type": "text",
        "quickTestValue": "ネットワーク障害報告_2026Q1.pdf",
    },
    {
        "id": "document",
        "text": "document",
        "type": "document",
    },
]

# 出力定義 (JSON)
OUTPUT_DEFINITION = {
    "formats": ["json"],
    "jsonSchema": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "category": {"type": "string"},
        },
    },
    "jsonExamples": [
        {
            "title": "Q1ネットワーク障害：本社ビル東棟でWi-Fi接続不安定",
            "summary": "2026年第1四半期に本社ビル東棟3〜5階でWi-Fi接続が断続的に不安定になる事象が発生。原因はAPファームウェアの不具合で、アップデート適用により解消。影響ユーザー約120名、業務停止時間は累計4時間。",
            "category": "ネットワーク障害",
        }
    ],
}

# モデルパラメータ
MODEL_TYPE = "gpt-41-mini"
TEMPERATURE = 0

# ── customconfiguration JSON ──────────────────────────────
CUSTOM_CONFIG = {
    "version": "GptDynamicPrompt-2",
    "prompt": PROMPT_SEGMENTS,
    "definitions": {
        "inputs": INPUT_DEFINITIONS,
        "formulas": [],
        "data": [],
        "output": OUTPUT_DEFINITION,
    },
    "modelParameters": {
        "modelType": MODEL_TYPE,
        "gptParameters": {
            "temperature": TEMPERATURE,
        },
    },
    "settings": {
        "recordRetrievalLimit": 30,
        "shouldPreserveRecordLinks": None,
        "runtime": None,
    },
    "code": "",
    "signature": "",
}

# ── メイン処理 ────────────────────────────────────────────

def main():
    print("=== AI Builder AI プロンプト デプロイ ===")
    print(f"  プロンプト名: {PROMPT_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  Dataverse URL: {DATAVERSE_URL}")
    print()

    # ── Step 0: べき等チェック（既存 AI Model 検索）──────
    print("[Step 0] 既存 AI Model を検索...")
    existing = api_get(
        f"msdyn_aimodels?$filter=msdyn_name eq '{PROMPT_NAME}'"
        "&$select=msdyn_aimodelid,msdyn_name,_msdyn_activerunconfigurationid_value,statecode"
    )

    model_id = None
    if existing.get("value"):
        model = existing["value"][0]
        model_id = model["msdyn_aimodelid"]
        print(f"  既存 AI Model 発見: {model_id}")
        # 既存を無効化して削除し再作成する
        try:
            api_patch(f"msdyn_aimodels({model_id})", {
                "msdyn_name": PROMPT_NAME,
                "statecode": 0,
                "statuscode": 0,
            })
            print("  → Draft に戻しました")
        except Exception as e:
            print(f"  → Draft 戻しエラー（続行）: {e}")

        # 関連する configurations を削除
        configs = api_get(
            f"msdyn_aiconfigurations?$filter=_msdyn_aimodelid_value eq '{model_id}'"
            "&$select=msdyn_aiconfigurationid,msdyn_type"
        )
        for cfg in reversed(configs.get("value", [])):
            cid = cfg["msdyn_aiconfigurationid"]
            try:
                from auth_helper import api_delete
                api_delete(f"msdyn_aiconfigurations({cid})")
                print(f"  → Config 削除: {cid}")
            except Exception as e:
                print(f"  → Config 削除エラー（続行）: {e}")

        # Model 削除
        try:
            from auth_helper import api_delete
            api_delete(f"msdyn_aimodels({model_id})")
            print(f"  → Model 削除: {model_id}")
            model_id = None
        except Exception as e:
            print(f"  → Model 削除エラー（続行）: {e}")

    # ── Step 1: AI Model 作成 ─────────────────────────────
    print("\n[Step 1] AI Model 作成...")
    model_body = {
        "msdyn_name": PROMPT_NAME,
        "msdyn_TemplateId@odata.bind": f"/msdyn_aitemplates({GPT_PROMPT_TEMPLATE_ID})",
        "msdyn_sharewithorganizationoncreate": False,
    }
    model_id = api_post("msdyn_aimodels", model_body, solution=SOLUTION_NAME)
    print(f"  AI Model created: {model_id}")

    # ── Step 2: Training Configuration 作成（最小ボディ）──
    print("\n[Step 2] Training Configuration 作成...")
    now_str = datetime.now(timezone.utc).strftime("%m/%d/%Y %I:%M:%S %p")
    training_body = {
        "msdyn_AIModelId@odata.bind": f"/msdyn_aimodels({model_id})",
        "msdyn_type": 190690000,
        "msdyn_name": f"{model_id}_Training_{now_str}",
    }
    training_config_id = api_post("msdyn_aiconfigurations", training_body, solution=SOLUTION_NAME)
    print(f"  Training config created: {training_config_id}")

    # ── Step 2.5: AIModelPublish で Training Config を正しい状態に遷移 ──
    print("\n[Step 2.5] AIModelPublish で Training 状態を遷移...")
    custom_config_str = json.dumps(CUSTOM_CONFIG, ensure_ascii=False)
    # AIModelPublish は Training Config を state=2/status=6 にする
    # RunConfigurationId はダミー（後で新しい Run Config を作成する）
    import requests as _requests
    _token = get_token()
    _headers = {
        "Authorization": f"Bearer {_token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }
    resp = _requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/AIModelPublish",
        headers=_headers,
        json={
            "TemplateId": GPT_PROMPT_TEMPLATE_ID,
            "ModelId": model_id,
            "RunConfigurationId": training_config_id,  # ダミー
            "ModelName": PROMPT_NAME,
            "CustomConfiguration": custom_config_str,
            "RunConfiguration": custom_config_str,
        },
    )
    if resp.status_code < 400:
        print("  AIModelPublish OK (Training state transitioned)")
    else:
        print(f"  AIModelPublish warning: {resp.status_code} - {resp.text[:200]}")

    # AIModelPublish が作成した state=2/6 の Training Config を特定
    import time
    time.sleep(2)
    configs = api_get(
        f"msdyn_aiconfigurations?$filter=_msdyn_aimodelid_value eq '{model_id}' "
        f"and msdyn_type eq 190690000 and statecode eq 2"
        "&$select=msdyn_aiconfigurationid&$top=1&$orderby=createdon desc"
    )
    if configs.get("value"):
        published_training_id = configs["value"][0]["msdyn_aiconfigurationid"]
        print(f"  Published Training Config: {published_training_id}")
    else:
        published_training_id = training_config_id
        print(f"  Using original Training Config: {published_training_id}")

    # ── Step 3: Run Configuration 作成 ────────────────────
    print("\n[Step 3] Run Configuration 作成...")
    run_body = {
        "msdyn_AIModelId@odata.bind": f"/msdyn_aimodels({model_id})",
        "msdyn_type": 190690001,
        "msdyn_name": f"{model_id}_Run_{now_str}",
        "msdyn_customconfiguration": custom_config_str,
        "msdyn_TrainedModelAIConfigurationPareId@odata.bind": f"/msdyn_aiconfigurations({published_training_id})",
    }
    run_config_id = api_post("msdyn_aiconfigurations", run_body, solution=SOLUTION_NAME)
    print(f"  Run config created: {run_config_id}")

    # ── Step 4: PublishAIConfiguration でモデルをアクティブ化 ──
    print("\n[Step 4] PublishAIConfiguration でアクティブ化...")
    pub_url = f"{DATAVERSE_URL}/api/data/v9.2/msdyn_aiconfigurations({run_config_id})/Microsoft.Dynamics.CRM.PublishAIConfiguration"
    resp2 = _requests.post(pub_url, headers=_headers, json={"version": "1.0"})
    if resp2.status_code < 400:
        print("  PublishAIConfiguration OK")
    else:
        print(f"  PublishAIConfiguration error: {resp2.status_code} - {resp2.text[:300]}")

    # 状態確認
    time.sleep(3)
    model_state = api_get(
        f"msdyn_aimodels({model_id})?$select=statecode,statuscode,_msdyn_activerunconfigurationid_value"
    )
    print(f"  Model: state={model_state['statecode']}, status={model_state['statuscode']}, "
          f"activeRun={model_state['_msdyn_activerunconfigurationid_value']}")
    if model_state["statecode"] != 1:
        print("  ⚠ モデルがアクティブになっていません。AI Builder UI で手動公開してください。")
    else:
        print("  ✓ モデルがアクティブになりました！")

    # ── Step 5: botcomponent 作成（エージェントへの追加）──
    if BOT_ID:
        print(f"\n[Step 5] botcomponent 作成（Bot: {BOT_ID}）...")

        # Bot の schemaname を取得
        bot_data = api_get(f"bots({BOT_ID})?$select=schemaname")
        bot_schema = bot_data.get("schemaname", "")
        print(f"  Bot schemaname: {bot_schema}")

        action_name = PROMPT_NAME.replace(" ", "")
        comp_schemaname = f"{bot_schema}.action.{action_name}"

        # 既存 botcomponent を検索（べき等）
        existing_comp = api_get(
            f"botcomponents?$filter=schemaname eq '{comp_schemaname}'"
            "&$select=botcomponentid"
        )
        if existing_comp.get("value"):
            comp_id = existing_comp["value"][0]["botcomponentid"]
            print(f"  既存 botcomponent 発見: {comp_id} → 削除して再作成")
            try:
                from auth_helper import api_delete
                api_delete(f"botcomponents({comp_id})")
            except Exception as e:
                print(f"  → 削除エラー（続行）: {e}")

        # inputs YAML を構築
        inputs_yaml_lines = []
        for inp in INPUT_DEFINITIONS:
            inputs_yaml_lines.append("  - kind: AutomaticTaskInput")
            inputs_yaml_lines.append(f"    propertyName: {inp['id']}")
            inputs_yaml_lines.append(f"    name: {inp['id']}")
            inputs_yaml_lines.append("    shouldPromptUser: true")
            inputs_yaml_lines.append("")
        inputs_yaml = "\n".join(inputs_yaml_lines)

        # botcomponent YAML（PVA ダブル改行フォーマット）
        comp_data = (
            "kind: TaskDialog\n\n"
            f"inputs:\n{inputs_yaml}\n\n"
            f"modelDisplayName: {PROMPT_NAME}\n\n"
            f"modelDescription: {PROMPT_DESCRIPTION}\n\n"
            "action:\n"
            "  kind: InvokeAIBuilderModelTaskAction\n"
            f"  aIModelId: {model_id}\n\n"
            "outputMode: All\n\n"
        )

        comp_body = {
            "name": PROMPT_NAME,
            "schemaname": comp_schemaname,
            "componenttype": 9,
            "_parentbotid_value": BOT_ID,
            "data": comp_data,
            "description": PROMPT_DESCRIPTION,
        }
        comp_id = api_post("botcomponents", comp_body, solution=SOLUTION_NAME)
        print(f"  Bot component created: {comp_id}")

        # ── Step 6: エージェント再公開 ───────────────────
        print("\n[Step 6] エージェント再公開...")
        api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  Agent republished")

        # ── Step 6.5: 説明の設定 ─────────────────────────
        print("\n[Step 6.5] botcomponent の description を設定...")
        if comp_id:
            api_patch(f"botcomponents({comp_id})", {
                "description": PROMPT_DESCRIPTION,
            })
            print("  Description updated")
    else:
        print("\n[Step 5] BOT_ID 未設定 → エージェント追加をスキップ")

    # ── Step 7: ソリューション含有検証 ────────────────────
    print("\n[Step 7] ソリューション含有検証...")
    for comp_id_to_add, comp_type, label in [
        (training_config_id, 401, "Training Config"),
        (run_config_id, 401, "Run Config"),
    ]:
        if comp_id_to_add:
            try:
                api_post("AddSolutionComponent", {
                    "ComponentId": comp_id_to_add,
                    "ComponentType": comp_type,
                    "SolutionUniqueName": SOLUTION_NAME,
                    "AddRequiredComponents": False,
                    "IncludedComponentSettingsValues": None,
                })
                print(f"  {label}: ソリューション内確認OK")
            except Exception as e:
                error_str = str(e)
                if "already" in error_str.lower():
                    print(f"  {label}: already in solution")
                else:
                    print(f"  {label}: 検証エラー（続行）: {e}")

    print("\n=== AI Builder AI プロンプト デプロイ完了 ===")
    print(f"  Model ID: {model_id}")
    print(f"  Run Config ID: {run_config_id}")
    return model_id


if __name__ == "__main__":
    main()
