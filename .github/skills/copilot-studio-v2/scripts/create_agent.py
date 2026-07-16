"""
Copilot Studio v2（cliagent 新アーキテクチャ）エージェントを Dataverse Web API で作成する。

UI 手動作成は不要。template="cliagent-1.0.0" で POST /bots すると API 作成できる。
作成後はプロビジョニング状態をポーリングする（pac copilot list の表示が正）。

.env パラメータ:
  DATAVERSE_URL        Dataverse 環境 URL（必須）
  TENANT_ID            テナント ID（必須・auth_helper が使用）
  AGENT_NAME           エージェント名（既定: my-new-agent）
  AGENT_SCHEMA         スキーマ名 {prefix}_{slug}（既定: AGENT_NAME を正規化）
  AGENT_MODEL_SERIES   モデルシリーズ（既定: Sonnet46）
  AGENT_INSTRUCTIONS   指示文（既定: プレースホルダ）
  SOLUTION_NAME        ソリューション名（任意。指定時 MSCRM.SolutionName ヘッダを付与）

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
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"

AGENT_NAME = os.getenv("AGENT_NAME", "my-new-agent")
AGENT_SCHEMA = os.getenv("AGENT_SCHEMA") or (
    "geek_" + re.sub(r"[^a-z0-9]+", "", AGENT_NAME.lower())
)
MODEL_SERIES = os.getenv("AGENT_MODEL_SERIES", "Sonnet46")
INSTRUCTIONS = os.getenv(
    "AGENT_INSTRUCTIONS",
    "ここにエージェントの指示文を記載します。役割・口調・利用するスキルの優先順位を明確に書いてください。"
    "ファイルを出力する際は、毎回異なるファイル名にしてください"
    "（同じファイル名で出力すると UI 上でダウンロードできないため、日時や連番を付与する）。",
)
SOLUTION_NAME = os.getenv("SOLUTION_NAME", "").strip()
TEMPLATE = "cliagent-1.0.0"


def build_configuration() -> dict:
    """cliagent の BotConfiguration JSON を組み立てる。"""
    return {
        "$kind": "BotConfiguration",
        "channels": [
            {"$kind": "ChannelDefinition", "id": "MsTeams", "channelId": "MsTeams"}
        ],
        "recognizer": {"$kind": "CLICopilotRecognizer"},
        "agentSettings": {
            "$kind": "AgentSettings",
            "model": {"$kind": "ModelConfig", "series": MODEL_SERIES},
            "instructions": {
                "$kind": "Instructions",
                "segments": [{"$kind": "StaticSegment", "value": INSTRUCTIONS}],
            },
            "enableMemory": True,
        },
    }


def main() -> None:
    sess = get_session()
    headers = {"Prefer": "return=representation"}
    if SOLUTION_NAME:
        headers["MSCRM.SolutionName"] = SOLUTION_NAME

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
