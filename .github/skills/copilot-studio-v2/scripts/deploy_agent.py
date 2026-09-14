"""
Copilot Studio v2 (cliagent) エージェントの基礎構成をデプロイするオーケストレーター。
================================================================================
以下を順に実行する（各ステップは個別スクリプトとしても実行可能）:
  1) create_agent.py     … cliagent Bot を API 作成 + プロビジョニング待ち（agent_botid.txt を出力）
                             初期メッセージ・推奨プロンプトもここで同時に設定される
  2) set_icon.py         … アイコン登録（240 / Teams color 192 / outline 32）
  3) set_app_details.py  … Edit details(説明文・開発元・リンク・Teams 設定・M365 有効化)を設定
  4) attach_skill.py     … フラット Python スキルを添付（type=9 + type=14）
  5) publish_agent.py    … PvaPublish で公開

各ステップは agent_botid.txt（cwd）でエージェントを受け渡すため、同一作業ディレクトリで実行する。

初回からツールを持たせる場合は --defer-publish を指定し、ログイン済み統合ブラウザで
initial tool manifest を apply/read-back してから publish_agent.py を実行する。

.env パラメータ（詳細は references/.env.example）:
  AGENT_NAME / AGENT_SCHEMA / AGENT_MODEL_SERIES / AGENT_INSTRUCTIONS
  AGENT_PROMPTS_FILE / AGENT_GREETING / AGENT_PROMPTS
  SKILL_DIR / SKILL_NAME / SKILL_DESCRIPTION
  ICON_TEXT / ICON_BG_COLOR / ICON_ACCENT_COLOR
  APP_SHORT_DESCRIPTION / APP_LONG_DESCRIPTION / APP_DISCLAIMER / APP_DEVELOPER_NAME
  APP_WEBSITE_URL / APP_TERMS_URL / APP_PRIVACY_URL / APP_MPN_ID / APP_STORE_DISCOVERABLE
  APP_TEAMS_SCOPES / APP_SUPPORTS_CALLING / APP_TEAMS_RA_ID
  APP_SSO_CLIENT_ID / APP_SSO_RESOURCE_URI / APP_M365_ENABLED
  PVA_GATEWAY_BASE / BAP_ENVIRONMENT_ID   省略可（BAP API から自動取得）
  APP_DETAILS_REQUIRE_CONFIRM   true なら自動補完が発生した時点で停止（公開前に確認）

実行: python deploy_agent.py [--defer-publish]
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


def _truthy(val: str) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


def run(script: str, *args: str) -> None:
    cmd = [PY, str(HERE / script), *args]
    print(f"\n{'=' * 64}\n▶ {script} {' '.join(args)}\n{'=' * 64}")
    r = subprocess.run(cmd, env=os.environ.copy())
    if r.returncode != 0:
        print(f"❌ {script} が失敗しました（exit={r.returncode}）", file=sys.stderr)
        sys.exit(r.returncode)


def main() -> None:
    defer_publish = "--defer-publish" in sys.argv[1:]
    run("create_agent.py")
    run("set_icon.py")

    app_args = ["--require-confirm"] if _truthy(os.getenv("APP_DETAILS_REQUIRE_CONFIRM", "")) else []
    run("set_app_details.py", *app_args)

    skill_dir = os.getenv("SKILL_DIR", "skill")
    if (Path.cwd() / skill_dir).is_dir():
        run("attach_skill.py")
    else:
        print(f"\n⏭ スキルディレクトリ '{skill_dir}' が無いため attach_skill をスキップ")

    if not defer_publish:
        run("publish_agent.py")

    print("\n" + "=" * 64)
    if defer_publish:
        print("✅ 基礎構築完了。初回ツール投入後に publish_agent.py を実行してください。")
        print("   1. 各 Save を captureToolSave で捕捉し、mcp_tool_plan.py で plan/hash を作成")
        print("   2. create_initial_tools_manifest.py で承認済み plan/hash を集約")
        print("   3. 統合ブラウザの同一 page で runInitialToolProvisioning を実行")
        print("   4. publish_agent.py で最終公開")
        print("   詳細: references/mcp-servers.md")
    else:
        print("✅ デプロイ完了。確認: pac copilot list（Published / Active / Provisioned）")


if __name__ == "__main__":
    main()
