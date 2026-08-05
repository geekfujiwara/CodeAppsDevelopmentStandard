"""既存の cliagent エージェントを**作り直さずに**更新する。

deploy_agent.py は create_agent.py から始まるため、実行するたびに新しい Bot が作られる。
運用中のエージェント（UI で手動追加した MCP ツール・接続参照を持つ）を更新するときは
こちらを使う。

  1) set_instructions.py … Instructions を差し替え（configuration を deep-merge PATCH）
  2) set_model.py        … モデル系列を差し替え（AGENT_MODEL_SERIES 指定時のみ）
  3) set_prompts.py      … 初期メッセージ・推奨プロンプトを差し替え（指定時のみ）
  4) attach_skill.py     … 同名スキルだけを入れ替え（type=9/14）
  5) publish_agent.py    … 再公開

手動追加したツール（MCP）は botcomponents の別レコードで、上記のいずれも触らない。
実行前後で MCP ツールの一覧を取得して差分を表示し、消えていないことを検証する。

.env / 引数:
  AGENT_BOTID            対象 botid（省略時は cwd の agent_botid.txt）
  AGENT_INSTRUCTIONS_FILE / AGENT_INSTRUCTIONS   指示文（未指定なら Instructions は変更しない）
  AGENT_MODEL_SERIES     モデル系列（未指定なら変更しない）
  AGENT_PROMPTS_FILE / AGENT_GREETING / AGENT_PROMPTS   初期メッセージ・推奨プロンプト（未指定なら変更しない）
  SKILL_DIR              スキルディレクトリ（存在しなければスキップ）

実行:
  python update_agent.py                 # 全ステップ
  python update_agent.py --skip-skill     # スキルは触らない
  python update_agent.py --no-publish     # 公開しない（確認だけ）
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
_STD = HERE.parents[1] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import api_get  # noqa: E402

PY = sys.executable


def resolve_bot_id() -> str:
    bot_id = os.getenv("AGENT_BOTID", "").strip()
    if bot_id:
        return bot_id
    path = Path("agent_botid.txt")
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    sys.exit("AGENT_BOTID が未設定で agent_botid.txt もありません。")


def snapshot_tools(bot_id: str) -> dict[str, str]:
    """手動追加されたツール（MCP など）の schemaname → 接続参照 を採取する。"""
    rows = api_get(
        "botcomponents?$select=name,schemaname,data"
        f"&$filter=_parentbotid_value eq {bot_id} and componenttype eq 9"
    )["value"]
    tools: dict[str, str] = {}
    for row in rows:
        data = row.get("data") or ""
        if "kind: McpTool" not in data:
            continue
        ref = next(
            (line.split(":", 1)[1].strip() for line in data.splitlines()
             if line.startswith("connectionReference:")),
            "(接続参照なし)",
        )
        tools[row["schemaname"]] = f"{row['name']} / {ref}"
    return tools


def run(script: str, *args: str) -> None:
    print(f"\n{'=' * 64}\n▶ {script} {' '.join(args)}\n{'=' * 64}")
    r = subprocess.run([PY, str(HERE / script), *args], env=os.environ.copy())
    if r.returncode != 0:
        sys.exit(f"❌ {script} が失敗しました（exit={r.returncode}）")


def main() -> None:
    args = sys.argv[1:]
    bot_id = resolve_bot_id()
    os.environ["AGENT_BOTID"] = bot_id

    before = snapshot_tools(bot_id)
    print(f"更新対象: {bot_id}")
    print(f"更新前のツール（MCP）: {len(before)} 件")
    for schema, label in before.items():
        print(f"  - {label}")

    instructions_file = os.getenv("AGENT_INSTRUCTIONS_FILE", "").strip()
    if instructions_file:
        run("set_instructions.py", "--file", instructions_file)
    elif os.getenv("AGENT_INSTRUCTIONS", "").strip():
        run("set_instructions.py")
    else:
        print("\n⏭ Instructions 未指定のため変更しない")

    if os.getenv("AGENT_MODEL_SERIES", "").strip():
        run("set_model.py")

    prompts_file = os.getenv("AGENT_PROMPTS_FILE", "").strip()
    if prompts_file:
        run("set_prompts.py", "--file", prompts_file)
    elif os.getenv("AGENT_GREETING", "").strip() or os.getenv("AGENT_PROMPTS", "").strip():
        run("set_prompts.py")
    else:
        print("\n⏭ 初期メッセージ・推奨プロンプト未指定のため変更しない")

    skill_dir = os.getenv("SKILL_DIR", "skill")
    if "--skip-skill" in args:
        print("\n⏭ --skip-skill 指定のためスキル更新をスキップ")
    elif (Path.cwd() / skill_dir).is_dir():
        run("attach_skill.py")
    else:
        print(f"\n⏭ スキルディレクトリ '{skill_dir}' が無いためスキル更新をスキップ")

    after = snapshot_tools(bot_id)
    print(f"\n{'=' * 64}\nツール（MCP）の保全確認\n{'=' * 64}")
    print(f"更新前: {len(before)} 件 / 更新後: {len(after)} 件")
    lost = sorted(set(before) - set(after))
    added = sorted(set(after) - set(before))
    changed = sorted(s for s in set(before) & set(after) if before[s] != after[s])
    for schema in lost:
        print(f"  ❌ 消失: {before[schema]}")
    for schema in added:
        print(f"  ➕ 追加: {after[schema]}")
    for schema in changed:
        print(f"  ⚠️ 変化: {before[schema]} → {after[schema]}")
    if not (lost or changed):
        print("  ✅ 既存のツールと接続参照はすべて維持されています")
    if lost:
        sys.exit("❌ ツールが消失しました。公開せず調査してください。")

    if "--no-publish" in args:
        print("\n⏭ --no-publish 指定のため公開しない")
        return
    run("publish_agent.py")
    print("\n✅ 更新完了。UI の Preview で MCP ツールが動作することを確認してください。")


if __name__ == "__main__":
    main()
