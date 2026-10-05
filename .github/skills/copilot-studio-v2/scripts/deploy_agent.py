"""
Copilot Studio v2 (cliagent) エージェントの基礎構成をデプロイするオーケストレーター。
================================================================================
以下を順に実行する（各ステップは個別スクリプトとしても実行可能）:
  1) create_agent.py     … cliagent Bot を API 作成 + プロビジョニング待ち（agent_botid.txt を出力）
                             初期メッセージ・推奨プロンプトもここで同時に設定される
  2) set_icon.py         … アイコン登録（240 / Teams color 192 / outline 32）
  3) set_app_details.py  … Edit details(説明文・開発元・リンク・Teams 設定・M365 有効化)を設定
                           新規エージェントで 404（7513）なら、公開後に再試行して再公開する
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

実行: python deploy_agent.py [--defer-publish] [--env-file <エージェントの設定ファイル>]
  --env-file を付けると、そのファイルの KEY=VALUE を読み、ファイルのあるフォルダで実行する
  （テンプレートから生成したエージェント フォルダの agent.env を想定）。
  SKILL_DIR が複数スキルの親フォルダなら、直下の各スキルを添付する（説明は各 SKILL.md の frontmatter）。
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from agent_env import attach_env, load_env_file, skill_dirs  # noqa: E402

PY = sys.executable


def _truthy(val: str) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


def run(script: str, *args: str, required: bool = True, env: dict[str, str] | None = None) -> bool:
    cmd = [PY, str(HERE / script), *args]
    print(f"\n{'=' * 64}\n▶ {script} {' '.join(args)}\n{'=' * 64}")
    r = subprocess.run(cmd, env=env or os.environ.copy())
    if r.returncode != 0:
        if not required:
            print(f"⚠️ {script} が失敗しました（exit={r.returncode}）。続行します。後で単体で再実行してください。", file=sys.stderr)
            return False
        print(f"❌ {script} が失敗しました（exit={r.returncode}）", file=sys.stderr)
        sys.exit(r.returncode)
    return True


def attach_skills() -> None:
    skill_dir = Path(os.getenv("SKILL_DIR", "skill"))
    skills = skill_dirs(skill_dir)
    if not skills:
        print(f"\n⏭ スキルディレクトリ '{skill_dir}' に SKILL.md が無いため attach_skill をスキップ")
        return
    for skill in skills:
        # 親フォルダから見つけた子スキルは、名前と説明を各フォルダから決める
        run("attach_skill.py", env=attach_env(skill, multi=skill != skill_dir))


def retry_app_details(app_args: list[str], attempts: int = 4, wait_seconds: float = 30) -> bool:
    """公開後に Edit details を再試行する。

    新規エージェントは公開して Teams チャネルが張られるまで 404（7513）を返す。
    公開直後は 1 回目が失敗し、30 秒後の 2 回目で通った実例がある（2026-10-05）。
    """
    for attempt in range(attempts):
        if attempt:
            print(f"⏳ Teams チャネルの準備待ち（{attempt}/{attempts - 1}）。{wait_seconds:.0f} 秒後に再試行します")
            time.sleep(wait_seconds)
        if run("set_app_details.py", *app_args, required=False):
            return True
    return False


def main() -> None:
    argv = load_env_file(sys.argv[1:])
    defer_publish = "--defer-publish" in argv
    run("create_agent.py")
    run("set_icon.py")

    app_args = ["--require-confirm"] if _truthy(os.getenv("APP_DETAILS_REQUIRE_CONFIRM", "")) else []
    # Edit details は作成直後だと Teams チャネル未作成で 404（7513）になりやすい。動作に必須ではないので止めない
    details_ok = run("set_app_details.py", *app_args, required=bool(app_args))

    attach_skills()

    if not defer_publish:
        run("publish_agent.py")
        # 公開で Teams チャネルが張られた後に Edit details を保存し直し、もう一度公開して反映する
        if not details_ok and retry_app_details(app_args):
            details_ok = True
            run("publish_agent.py")

    print("\n" + "=" * 64)
    if not details_ok:
        print("⚠️ Edit details は未設定です。pac copilot list で Provisioned を確認後、"
              "必要なら UI で Teams + Microsoft 365 チャネルを有効にして set_app_details.py を再実行してください。")
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
