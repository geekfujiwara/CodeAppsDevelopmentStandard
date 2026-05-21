"""
AI Builder AI プロンプト デプロイスクリプト — サンプル実装

Usage:
  python .github/skills/ai-builder/scripts/deploy_ai_prompt.py

デプロイ手順:
  1. AI Model 作成（GPT Dynamic Prompt テンプレート）
  2. AIModelPublish → 1ステップで完全アクティブ化
  3. botcomponent 作成（エージェントへのツール追加）
  4. エージェント再公開
  5. ソリューション含有検証

教訓（2026-04-15 検証済み）:
  - AIModelPublish (msdyn_ プレフィックスなし) が1ステップで Model を完全アクティブ化する
  - 手動 Run Config 作成・PublishAIConfiguration は不要
  - RunConfigurationId に model_id を渡すと、その ID で Run Config が自動作成される
  - msdyn_TemplateId@odata.bind 形式を使用（_value 形式は一部環境で拒否）
  - Config 作成に statecode/statuscode は指定不可（一部環境で拒否）
"""

import json
import os
import re
import sys
import time

import requests

# スキルフォルダと共通認証モジュールを sys.path に追加
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))

from dotenv import load_dotenv

load_dotenv()

from auth_helper import (
    api_delete,
    api_get,
    api_patch,
    api_post,
    get_token,
    DATAVERSE_URL,
)

# ── 環境変数 ──────────────────────────────────────────────
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
BOT_ID_OR_URL = os.environ.get("AI_PROMPT_BOT_ID") or os.environ.get("BOT_ID", "")

# Bot ID 解決
m = re.search(r"bots/([0-9a-f-]{36})", BOT_ID_OR_URL)
BOT_ID = m.group(1) if m else BOT_ID_OR_URL

# ── 定数 ──────────────────────────────────────────────────
GPT_TEMPLATE_ID = "edfdb190-3791-45d8-9a6c-8f90a37c278a"

# ── AI Prompt 定義（★ プロジェクトに合わせて書き換える）───
PROMPT_NAME = "Summarize Document For Incident"
PROMPT_DESCRIPTION = "SharePoint ドキュメントの内容を要約し、カテゴリを判定してインシデント登録用の情報を生成する"

PROMPT_SEGMENTS = [
    {"type": "literal", "text": (
        "あなたはドキュメント分析の専門家です。以下のドキュメントを分析し、"
        "インシデント管理システムに登録するための情報を作成してください。\n\n"
        "ファイル名: "
    )},
    {"type": "inputVariable", "id": "filename"},
    {"type": "literal", "text": "\n\nドキュメント: "},
    {"type": "inputVariable", "id": "document"},
    {"type": "literal", "text": (
        "\n\nカテゴリは以下から最も適切なものを1つ選んでください:\n"
        "- ネットワーク障害\n- ソフトウェア不具合\n- ハードウェア故障\n"
        "- アカウント/権限\n- その他\n\nJSON形式で出力してください。"
    )},
]

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
    "jsonExamples": [{
        "title": "Q1ネットワーク障害：本社ビル東棟でWi-Fi接続不安定",
        "summary": "2026年第1四半期に本社ビル東棟3〜5階でWi-Fi接続が断続的に不安定。",
        "category": "ネットワーク障害",
    }],
}

MODEL_TYPE = "gpt-41-mini"
TEMPERATURE = 0

# ── customconfiguration JSON 構築 ─────────────────────────
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
        "gptParameters": {"temperature": TEMPERATURE},
    },
    "settings": {
        "recordRetrievalLimit": 30,
        "shouldPreserveRecordLinks": None,
        "runtime": None,
    },
    "code": "",
    "signature": "",
}


# ══════════════════════════════════════════════════════════════
# デプロイ関数
# ══════════════════════════════════════════════════════════════

def deploy_ai_model() -> str:
    """AI Model をべき等でデプロイし Active にする。"""
    print("\n[Phase 1] AI Builder Model デプロイ")
    print("-" * 50)

    # べき等チェック
    print("[1/3] AI Model 検索...")
    existing = api_get(
        f"msdyn_aimodels?$filter=msdyn_name eq '{PROMPT_NAME}'"
        "&$select=msdyn_aimodelid,statecode,_msdyn_activerunconfigurationid_value"
    )

    if existing.get("value"):
        model = existing["value"][0]
        model_id = model["msdyn_aimodelid"]

        if model["statecode"] == 1 and model.get("_msdyn_activerunconfigurationid_value"):
            # 既に Active → プロンプト更新のみ
            run_config_id = model["_msdyn_activerunconfigurationid_value"]
            print(f"  既存 Active Model: {model_id}")
            print("  → プロンプト更新...")
            api_patch(f"msdyn_aiconfigurations({run_config_id})", {
                "msdyn_customconfiguration": json.dumps(CUSTOM_CONFIG, ensure_ascii=False),
            })
            print("  ✓ プロンプト更新完了")
            return model_id

        # Draft → 削除して再作成
        print(f"  Draft Model 発見: {model_id} → 削除して再作成")
        configs = api_get(
            f"msdyn_aiconfigurations?$filter=_msdyn_aimodelid_value eq '{model_id}'"
            "&$select=msdyn_aiconfigurationid"
        )
        for c in configs.get("value", []):
            try:
                api_delete(f"msdyn_aiconfigurations({c['msdyn_aiconfigurationid']})")
            except Exception:
                pass  # Published Training (state=2) は 405 → 無視
        time.sleep(2)
        try:
            api_delete(f"msdyn_aimodels({model_id})")
        except Exception:
            pass
        time.sleep(3)

    # 新規作成
    print("\n[2/3] AI Model 作成...")
    model_body = {
        "msdyn_name": PROMPT_NAME,
        "msdyn_TemplateId@odata.bind": f"/msdyn_aitemplates({GPT_TEMPLATE_ID})",
        "msdyn_sharewithorganizationoncreate": False,
    }
    model_id = api_post("msdyn_aimodels", model_body, solution=SOLUTION_NAME)
    print(f"  ✓ Model: {model_id}")
    time.sleep(3)

    # AIModelPublish — 1ステップで完全アクティブ化
    print("\n[3/3] AIModelPublish (1ステップ Active 化)...")
    custom_config_str = json.dumps(CUSTOM_CONFIG, ensure_ascii=False)
    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json; charset=utf-8",
    }
    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/AIModelPublish",
        headers=headers,
        json={
            "TemplateId": GPT_TEMPLATE_ID,
            "ModelId": model_id,
            "RunConfigurationId": model_id,
            "ModelName": PROMPT_NAME,
            "CustomConfiguration": custom_config_str,
            "RunConfiguration": custom_config_str,
        },
    )
    if r.status_code >= 400:
        raise RuntimeError(f"AIModelPublish 失敗: {r.status_code} - {r.text[:300]}")
    print("  ✓ AIModelPublish 成功")
    time.sleep(5)

    # 検証
    model_state = api_get(
        f"msdyn_aimodels({model_id})?$select=statecode,_msdyn_activerunconfigurationid_value"
    )
    if model_state["statecode"] != 1:
        raise RuntimeError(f"Model がアクティブになっていません: state={model_state['statecode']}")
    print(f"  ✓ Model Active! (activeRun={model_state['_msdyn_activerunconfigurationid_value']})")
    return model_id


def deploy_bot_component(model_id: str):
    """botcomponent を作成してエージェントにツールとして追加する。"""
    if not BOT_ID:
        print("\n[Phase 2] BOT_ID 未設定 → エージェント追加スキップ")
        return

    print("\n[Phase 2] botcomponent 作成 + エージェント公開")
    print("-" * 50)

    # Bot の schemaname を取得
    bot_data = api_get(f"bots({BOT_ID})?$select=schemaname")
    bot_schema = bot_data.get("schemaname", "")
    action_name = PROMPT_NAME.replace(" ", "")
    comp_schemaname = f"{bot_schema}.action.{action_name}"
    print(f"  schemaname: {comp_schemaname}")

    # 既存コンポーネントを検索（べき等）
    existing_comp = api_get(
        f"botcomponents?$filter=schemaname eq '{comp_schemaname}'"
        "&$select=botcomponentid"
    )

    # inputs YAML を構築（PVA ダブル改行フォーマット）
    inputs_yaml_lines = []
    for inp in INPUT_DEFINITIONS:
        inputs_yaml_lines.append("  - kind: AutomaticTaskInput")
        inputs_yaml_lines.append(f"    propertyName: {inp['id']}")
        inputs_yaml_lines.append(f"    name: {inp['id']}")
        inputs_yaml_lines.append("    shouldPromptUser: true")
        inputs_yaml_lines.append("")
    inputs_yaml = "\n".join(inputs_yaml_lines)

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

    if existing_comp.get("value"):
        comp_id = existing_comp["value"][0]["botcomponentid"]
        api_patch(f"botcomponents({comp_id})", {"data": comp_data, "description": PROMPT_DESCRIPTION})
        print(f"  ✓ botcomponent 更新: {comp_id}")
    else:
        comp_body = {
            "name": PROMPT_NAME,
            "schemaname": comp_schemaname,
            "componenttype": 9,
            "_parentbotid_value": BOT_ID,
            "data": comp_data,
            "description": PROMPT_DESCRIPTION,
        }
        comp_id = api_post("botcomponents", comp_body, solution=SOLUTION_NAME)
        print(f"  ✓ botcomponent 作成: {comp_id}")

    # エージェント再公開
    print("  エージェント公開中...")
    api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
    print("  ✓ エージェント公開完了")


def verify_solution():
    """ソリューション含有を検証・補完する。"""
    print("\n[Phase 3] ソリューション含有検証")
    print("-" * 50)

    model = api_get(
        f"msdyn_aimodels?$filter=msdyn_name eq '{PROMPT_NAME}'"
        "&$select=msdyn_aimodelid"
    )
    if not model.get("value"):
        print("  ⚠ Model が見つかりません")
        return

    model_id = model["value"][0]["msdyn_aimodelid"]
    configs = api_get(
        f"msdyn_aiconfigurations?$filter=_msdyn_aimodelid_value eq '{model_id}'"
        "&$select=msdyn_aiconfigurationid"
    )

    for c in configs.get("value", []):
        cid = c["msdyn_aiconfigurationid"]
        try:
            api_post("AddSolutionComponent", {
                "ComponentId": cid,
                "ComponentType": 401,
                "SolutionUniqueName": SOLUTION_NAME,
                "AddRequiredComponents": False,
                "IncludedComponentSettingsValues": None,
            })
            print(f"  ✓ Config {cid}: ソリューション内")
        except Exception as e:
            if "already" in str(e).lower():
                print(f"  ✓ Config {cid}: already in solution")
            else:
                print(f"  ⚠ Config {cid}: {e}")


# ══════════════════════════════════════════════════════════════
# メイン
# ══════════════════════════════════════════════════════════════

def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  AI Builder AI プロンプト デプロイ                      ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"  プロンプト: {PROMPT_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  Dataverse: {DATAVERSE_URL}")

    model_id = deploy_ai_model()
    deploy_bot_component(model_id)
    verify_solution()

    print("\n" + "═" * 60)
    print(f"  ✅ デプロイ完了!")
    print(f"  Model: {PROMPT_NAME} ({model_id})")
    if BOT_ID:
        print(f"  Agent: {BOT_ID}")
    print("═" * 60)


if __name__ == "__main__":
    main()
