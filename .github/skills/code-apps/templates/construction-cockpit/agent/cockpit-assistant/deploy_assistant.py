"""「現場コックピット アシスタント」（Copilot Studio v2）を作成・更新して公開する。

copilot-studio-v2 スキルのスクリプトを、このフォルダを作業ディレクトリにして順に呼ぶ。
エージェント ID はこのフォルダの agent_botid.txt に保存する（リポジトリ直下の KY エージェントとは別）。

    python agent/cockpit-assistant/deploy_assistant.py              # 作成（初回）または更新 → スキル添付 → 公開
    python agent/cockpit-assistant/deploy_assistant.py --no-publish # 公開しない

初回作成: create_agent → set_icon → スキル 3 本 → publish → set_app_details（Teams チャネル有効化後）→ publish
更新:     set_instructions → set_prompts → スキル 3 本（同名だけ入れ替え。MCP ツールは残る）→ publish → set_app_details → publish
Dataverse の MCP ツールは、copilot-studio-v2 の references/mcp-servers.md の手順でブラウザから追加する。
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCRIPTS = ROOT / ".github" / "skills" / "copilot-studio-v2" / "scripts"
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import api_get  # noqa: E402

SKILLS = {
    "progress-3d-report": "工程の進捗報告（施工単位で報告→進捗率に換算→監督確認へ提出）と 3D 出来形の確認。Use when: 進捗報告, 何階まで, 出来形, 3D",
    "field-records": "KY・ヒヤリハット・ナレッジ・日報・重機稼働のまとめ登録。Use when: KY を登録, ヒヤリハット, 日報を提出, ナレッジ登録",
    "review-maintenance": "監督の承認・修正承認・差戻しと記録のメンテナンス・ナレッジ化。Use when: 承認, 差戻し, 確認待ち, 記録の修正",
}

ENV = {
    "AGENT_NAME": "現場コックピット アシスタント",
    "AGENT_SCHEMA": "${PUBLISHER_PREFIX}_cockpitassistant",
    "AGENT_INSTRUCTIONS": (HERE / "instructions.txt").read_text(encoding="utf-8"),
    "AGENT_INSTRUCTIONS_FILE": str(HERE / "instructions.txt"),
    "AGENT_PROMPTS_FILE": str(HERE / "prompts.json"),
    "PUBLISHER_PREFIX": "${PUBLISHER_PREFIX}",
    "ICON_TEXT": "現",
    "ICON_BG_COLOR": "#0E7490",
    "ICON_ACCENT_COLOR": "#FACC15",
    "APP_SHORT_DESCRIPTION": "工程進捗の報告、KY・ヒヤリハット・日報の登録、監督の承認を会話で行う",
    "APP_LONG_DESCRIPTION": (
        "現場コックピット（Power Apps）と同じ Dataverse の記録を、Teams / Microsoft 365 Copilot の会話から登録・確認・承認します。"
        "CAD モデルの施工単位（階・区画）で「3 階の床まで完了」と報告すると進捗率に換算して監督確認へ提出し、監督が承認すると"
        "アプリの 3D に出来形として反映されます。KY・ヒヤリハット・ナレッジ・日報・重機稼働は 1 回の会話でまとめて登録できます。"
    ),
}


def run(script: str, *args: str, check: bool = True) -> bool:
    print(f"\n▶ {script} {' '.join(args)}", flush=True)
    result = subprocess.run([sys.executable, str(SCRIPTS / script), *args], cwd=HERE, env={**os.environ, **ENV})
    if result.returncode != 0 and check:
        raise SystemExit(f"❌ {script} が失敗しました（exit={result.returncode}）")
    return result.returncode == 0


def set_app_details() -> bool:
    """Edit details は Teams チャネルが有効になってから保存できる（作成直後・初回公開前は 404 / 7513）。待って再試行する"""
    for attempt in range(6):
        if run("set_app_details.py", check=False):
            return True
        print(f"⏳ Teams チャネルの準備待ち（{attempt + 1}/6）。30 秒後に再試行します", flush=True)
        time.sleep(30)
    print("⚠️ Edit details を保存できませんでした。Copilot Studio で Teams チャネルを有効にしてから再実行してください。")
    return False


def main() -> None:
    publish = "--no-publish" not in sys.argv[1:]
    for name in SKILLS:
        if not (HERE / "skills" / name / "SKILL.md").is_file():
            raise SystemExit(f"skills/{name}/SKILL.md がありません")
    bot_file = HERE / "agent_botid.txt"
    created = not bot_file.is_file()
    if created:
        run("create_agent.py")
        ENV["AGENT_BOTID"] = bot_file.read_text(encoding="utf-8").strip()
        run("set_icon.py")
    else:
        ENV["AGENT_BOTID"] = bot_file.read_text(encoding="utf-8").strip()
        run("set_instructions.py", "--file", str(HERE / "instructions.txt"))
        run("set_prompts.py", "--file", str(HERE / "prompts.json"))
    for name, description in SKILLS.items():
        ENV.update({"SKILL_DIR": str(HERE / "skills" / name), "SKILL_NAME": name, "SKILL_DESCRIPTION": description})
        run("attach_skill.py", str(HERE / "skills" / name))

    # 読み戻し: スキル 3 本が添付され、ツール（MCP）があれば一緒に一覧する
    bot = ENV["AGENT_BOTID"]
    components = api_get(f"botcomponents?$select=name,componenttype,data&$filter=_parentbotid_value eq {bot} and componenttype eq 9")["value"]
    names = {item["name"] for item in components}
    missing = [name for name in SKILLS if name not in names]
    if missing:
        raise SystemExit(f"❌ 添付されていないスキル: {', '.join(missing)}")
    tools = [item["name"] for item in components if "McpTool" in (item.get("data") or "") or "ConnectorTool" in (item.get("data") or "")]
    print(f"\n✅ スキル {len(SKILLS)} 本を確認。ツール: {', '.join(tools) if tools else '（未追加: Dataverse MCP をブラウザで追加してください）'}")
    if not publish:
        return
    run("publish_agent.py")
    # 公開で Teams チャネルが有効になった後に Edit details を保存し、もう一度公開して反映する
    if "--skip-details" not in sys.argv[1:] and set_app_details():
        run("publish_agent.py")


if __name__ == "__main__":
    main()
