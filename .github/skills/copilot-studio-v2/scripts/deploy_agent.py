"""
Copilot Studio v2 (cliagent) エージェントを API だけでフル自動デプロイするオーケストレーター。
================================================================================
以下を順に実行する（各ステップは個別スクリプトとしても実行可能）:
  1) create_agent.py   … cliagent Bot を API 作成 + プロビジョニング待ち（agent_botid.txt を出力）
  2) set_icon.py       … アイコン登録（240 / Teams color 192 / outline 32）
  3) attach_skill.py   … フラット Python スキルを添付（type=9 + type=14）
  4) add_mcp_server.py … MCP サーバーを追加（MCP_CONNECTORS の各コネクタ）
  5) publish_agent.py  … PvaPublish で公開

各ステップは agent_botid.txt（cwd）でエージェントを受け渡すため、同一作業ディレクトリで実行する。

.env パラメータ（詳細は references/.env.example）:
  AGENT_NAME / AGENT_SCHEMA / AGENT_MODEL_SERIES / AGENT_INSTRUCTIONS
  SKILL_DIR / SKILL_NAME / SKILL_DESCRIPTION
  ICON_TEXT / ICON_BG_COLOR / ICON_ACCENT_COLOR
  MCP_CONNECTORS   追加する MCP を "connector|表示名" 形式でカンマ区切り。例:
                   shared_commondataserviceforapps|Microsoft Dataverse MCP サーバー,
                   shared_workiqonedrive|Work IQ OneDrive (Preview)
                   （空なら MCP 追加をスキップ）

実行: python deploy_agent.py
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
PY = sys.executable


def run(script: str, *args: str) -> None:
    cmd = [PY, str(HERE / script), *args]
    print(f"\n{'=' * 64}\n▶ {script} {' '.join(args)}\n{'=' * 64}")
    r = subprocess.run(cmd, env=os.environ.copy())
    if r.returncode != 0:
        print(f"❌ {script} が失敗しました（exit={r.returncode}）", file=sys.stderr)
        sys.exit(r.returncode)


def main() -> None:
    run("create_agent.py")
    run("set_icon.py")

    skill_dir = os.getenv("SKILL_DIR", "skill")
    if (Path.cwd() / skill_dir).is_dir():
        run("attach_skill.py")
    else:
        print(f"\n⏭ スキルディレクトリ '{skill_dir}' が無いため attach_skill をスキップ")

    mcp_spec = os.getenv("MCP_CONNECTORS", "").strip()
    for entry in [e for e in mcp_spec.split(",") if e.strip()]:
        parts = entry.split("|", 1)
        connector = parts[0].strip()
        display = parts[1].strip() if len(parts) > 1 else connector
        run("add_mcp_server.py", "--connector", connector, "--display", display)

    run("publish_agent.py")

    print("\n" + "=" * 64)
    print("✅ デプロイ完了。確認: pac copilot list（Published / Active / Provisioned）")
    print("   ※ MCP を含む場合は、Copilot Studio UI で MCP サーバーの「確認(Confirm)」を")
    print("     一度実施してから利用してください（references/mcp-servers.md）。")


if __name__ == "__main__":
    main()
