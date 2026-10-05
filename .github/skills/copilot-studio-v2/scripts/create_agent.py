"""
Copilot Studio v2（cliagent 新アーキテクチャ）エージェントを Dataverse Web API で作成する。

UI 手動作成は不要。template="cliagent-1.0.0" で POST /bots すると API 作成できる。
作成後はプロビジョニング状態をポーリングする（pac copilot list の表示が正）。

.env パラメータ:
  DATAVERSE_URL        Dataverse 環境 URL（必須）
  TENANT_ID            テナント ID（必須・auth_helper が使用）
  AGENT_NAME           エージェント名（既定: my-new-agent）
  AGENT_SCHEMA         スキーマ名 {prefix}_{slug}（既定: AGENT_NAME を正規化）
  AGENT_MODEL_SERIES   モデルシリーズ（既定: claude-opus-5。references/model-series.md 参照）
  AGENT_INSTRUCTIONS   指示文（既定: プレースホルダ）
  AGENT_INSTRUCTIONS_FILE  指示文のファイル（指定時は AGENT_INSTRUCTIONS より優先。update_agent.py と共通）
  AGENT_PROMPTS_FILE   初期メッセージ・推奨プロンプトの JSON（任意。set_prompts.py 参照）
  AGENT_GREETING / AGENT_PROMPTS   同上（ファイルを使わない場合）
  SOLUTION_NAME        ソリューション一意名（任意。指定時 MSCRM.SolutionUniqueName ヘッダを付与し、作成後に所属を読み戻す）

実行: python create_agent.py
出力: 作成した botid を標準出力 + agent_botid.txt に保存
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
# standard スキルの auth_helper を import
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402
from set_prompts import load_desired  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"

AGENT_NAME = os.getenv("AGENT_NAME", "my-new-agent")
AGENT_SCHEMA = os.getenv("AGENT_SCHEMA") or (
    "geek_" + re.sub(r"[^a-z0-9]+", "", AGENT_NAME.lower())
)
MODEL_SERIES = os.getenv("AGENT_MODEL_SERIES", "claude-opus-5")
# 旧命名。POST は通るが UI で「モデルは廃止されました」になる
DEPRECATED_SERIES = ("Sonnet46", "Sonnet5", "Opus5", "GPT4o")
_INSTRUCTIONS_FILE = os.getenv("AGENT_INSTRUCTIONS_FILE", "").strip()
if _INSTRUCTIONS_FILE and not Path(_INSTRUCTIONS_FILE).is_file():
    sys.exit(f"AGENT_INSTRUCTIONS_FILE が見つかりません: {_INSTRUCTIONS_FILE}")
INSTRUCTIONS = (Path(_INSTRUCTIONS_FILE).read_text(encoding="utf-8-sig").strip() if _INSTRUCTIONS_FILE else "") or os.getenv(
    "AGENT_INSTRUCTIONS",
    "ここにエージェントの指示文を記載します。役割・口調・利用するスキルの優先順位を明確に書いてください。"
    "ファイルを出力する際は、毎回異なるファイル名にしてください"
    "（同じファイル名で出力すると UI 上でダウンロードできないため、日時や連番を付与する）。",
)
SOLUTION_NAME = os.getenv("SOLUTION_NAME", "").strip()
TEMPLATE = "cliagent-1.0.0"


def ensure_in_solution(bot_id: str) -> None:
    """作成した bot がソリューションに入ったかを読み戻し、無ければ AddSolutionComponent で追加する。"""
    sess = get_session()
    sol = api_get(f"solutions?$select=solutionid&$filter=uniquename eq '{SOLUTION_NAME}'").get("value", [])
    if not sol:
        print(f"❌ ソリューション {SOLUTION_NAME} が見つかりません（SOLUTION_NAME は一意名）", file=sys.stderr)
        sys.exit(1)
    sid = sol[0]["solutionid"]
    flt = f"_solutionid_value eq {sid} and objectid eq {bot_id}"
    if api_get(f"solutioncomponents?$select=objectid&$filter={flt}").get("value"):
        print(f"   ソリューション: {SOLUTION_NAME} に所属（読み戻し確認）")
        return
    defs = api_get("solutioncomponentdefinitions?$select=solutioncomponenttype"
                   "&$filter=primaryentityname eq 'bot'").get("value", [])
    if len(defs) != 1:
        print("❌ bot のソリューション コンポーネント種別を特定できません", file=sys.stderr)
        sys.exit(1)
    r = sess.post(f"{API}/AddSolutionComponent", json={
        "ComponentId": bot_id, "ComponentType": defs[0]["solutioncomponenttype"],
        "SolutionUniqueName": SOLUTION_NAME, "AddRequiredComponents": True, "DoNotIncludeSubcomponents": False,
    })
    if r.status_code not in (200, 204) or not api_get(f"solutioncomponents?$select=objectid&$filter={flt}").get("value"):
        print(f"❌ ソリューション {SOLUTION_NAME} へ追加できません: {r.status_code} {r.text[:300]}", file=sys.stderr)
        sys.exit(1)
    print(f"   ソリューション: {SOLUTION_NAME} に追加しました（作成時のヘッダーでは入らなかったため）")


def build_configuration() -> dict:
    """cliagent の BotConfiguration JSON を組み立てる。"""
    agent_settings = {
        "$kind": "AgentSettings",
        "model": {"$kind": "ModelConfig", "series": MODEL_SERIES},
        "instructions": {
            "$kind": "Instructions",
            "segments": [{"$kind": "StaticSegment", "value": INSTRUCTIONS}],
        },
        "enableMemory": True,
    }
    greeting, prompts = load_desired(None)
    if greeting:
        agent_settings["greetingText"] = greeting
    if prompts:
        agent_settings["conversationStarters"] = prompts
    return {
        "$kind": "BotConfiguration",
        "channels": [
            {"$kind": "ChannelDefinition", "id": "MsTeams", "channelId": "MsTeams"}
        ],
        "recognizer": {"$kind": "CLICopilotRecognizer"},
        "agentSettings": agent_settings,
    }


def main() -> None:
    if MODEL_SERIES in DEPRECATED_SERIES:
        print(
            f"❌ AGENT_MODEL_SERIES='{MODEL_SERIES}' は旧命名です。UI で「モデルは廃止されました」となります。\n"
            "   ベンダーのモデル ID 形式（例: claude-opus-5）を指定してください。"
            "references/model-series.md 参照。",
            file=sys.stderr,
        )
        sys.exit(1)

    sess = get_session()
    headers = {"Prefer": "return=representation"}
    if SOLUTION_NAME:
        # MSCRM.SolutionName は無視され、2xx のまま既定ソリューションに作られる（ソリューションに入らない）
        headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME

    body = {
        "name": AGENT_NAME,
        "schemaname": AGENT_SCHEMA,
        "language": 1033,
        "authenticationmode": 2,
        "authenticationtrigger": 1,
        "accesscontrolpolicy": 2,
        "template": TEMPLATE,
        "configuration": json.dumps(build_configuration(), ensure_ascii=False),
    }

    print(f"作成: name={AGENT_NAME} schema={AGENT_SCHEMA} model={MODEL_SERIES} template={TEMPLATE}")
    r = sess.post(f"{API}/bots", json=body, headers=headers)
    if r.status_code not in (200, 201):
        print("作成失敗:", r.status_code, r.text[:1500], file=sys.stderr)
        sys.exit(1)
    bot_id = r.json()["botid"]
    Path("agent_botid.txt").write_text(bot_id, encoding="utf-8")
    print(f"\n✅ Bot 作成: {bot_id} (agent_botid.txt に保存)")

    saved = json.loads(r.json()["configuration"])["agentSettings"]
    print(f"   モデル系列: {saved['model']['series']}（UI の Model 表示が「廃止されたモデル」でないか確認すること）")
    print(f"   初期メッセージ: {saved.get('greetingText') or '(未設定)'}")
    print(f"   推奨プロンプト: {len(saved.get('conversationStarters') or [])} 件")
    if SOLUTION_NAME:
        ensure_in_solution(bot_id)

    # プロビジョニング状態をポーリング
    for i in range(20):
        b = api_get(f"bots({bot_id})?$select=synchronizationstatus,statecode,statuscode")
        ss = b.get("synchronizationstatus")
        state = "?"
        if ss:
            try:
                state = (
                    json.loads(ss)
                    .get("currentSynchronizationState", {})
                    .get("provisioningStatus", "?")
                )
            except Exception:
                state = ss[:60]
        print(f"[{i}] provisioningStatus={state} statecode={b.get('statecode')}")
        if state and state.lower() in ("provisioned", "succeeded", "ready"):
            print("✅ プロビジョニング完了")
            break
        time.sleep(6)
    else:
        print("⏳ ポーリング終了（バックグラウンドで継続の可能性）。pac copilot list で確認してください。")

    print("\n次のステップ: python attach_skill.py で フラット Python スキルを添付")


if __name__ == "__main__":
    main()
