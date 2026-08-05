"""既存の cliagent エージェントの Instructions（システムプロンプト）を更新する。

configuration は 1 つの JSON 文字列カラムなので、GET → deep-merge → PATCH で更新する
（丸ごと上書きすると model / channels / memory 設定が消える）。
bots の PATCH は name カラムを同送しないと 0x80040265 で失敗する。

MCP ツールやスキルは botcomponents 側の別レコードなので、この更新では一切影響を受けない。

.env / 引数:
  AGENT_BOTID          対象 botid（省略時は cwd の agent_botid.txt）
  AGENT_INSTRUCTIONS   指示文（--file 未指定時に使用）

実行:
  python set_instructions.py --file agent/instructions.md
  python set_instructions.py                 # .env の AGENT_INSTRUCTIONS を適用
  python set_instructions.py --show          # 現在値の確認のみ
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402
from verify_config import assert_intact  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"


def resolve_bot_id() -> str:
    bot_id = os.getenv("AGENT_BOTID", "").strip()
    if bot_id:
        return bot_id
    path = Path("agent_botid.txt")
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    sys.exit("AGENT_BOTID が未設定で agent_botid.txt もありません。")


def current_text(config: dict) -> str:
    segments = config.get("agentSettings", {}).get("instructions", {}).get("segments", [])
    return "".join(s.get("value", "") for s in segments)


def main() -> None:
    args = sys.argv[1:]
    show_only = "--show" in args
    source: Path | None = None
    if "--file" in args:
        source = Path(args[args.index("--file") + 1])

    bot_id = resolve_bot_id()
    bot = api_get(f"bots({bot_id})?$select=name,configuration")
    config = json.loads(bot["configuration"])
    before = current_text(config)
    print(f"対象: {bot['name']} ({bot_id})")
    print(f"現在の Instructions: {len(before)} 文字")

    if show_only:
        print("-" * 60)
        print(before)
        return

    if source:
        if not source.exists():
            sys.exit(f"指示文ファイルが見つかりません: {source}")
        text = source.read_text(encoding="utf-8")
    else:
        text = os.getenv("AGENT_INSTRUCTIONS", "")
    if not text.strip():
        sys.exit("--file か AGENT_INSTRUCTIONS で指示文を指定してください。")
    if text == before:
        print("変更なし。")
        return

    settings = config.setdefault("agentSettings", {})
    settings["instructions"] = {
        "$kind": "Instructions",
        "segments": [{"$kind": "StaticSegment", "value": text}],
    }
    assert_intact(json.loads(bot["configuration"]), config, changing="instructions")
    body = {"name": bot["name"], "configuration": json.dumps(config, ensure_ascii=False)}
    r = get_session().patch(f"{API}/bots({bot_id})", json=body)
    if r.status_code not in (200, 204):
        print("更新失敗:", r.status_code, r.text[:1000], file=sys.stderr)
        sys.exit(1)

    after = json.loads(api_get(f"bots({bot_id})?$select=configuration")["configuration"])
    print(f"✅ Instructions を更新: {len(before)} → {len(current_text(after))} 文字")
    print(f"   モデル系列は維持: {after['agentSettings']['model']['series']}")
    print("   反映には再公開が必要です: python publish_agent.py")


if __name__ == "__main__":
    main()
