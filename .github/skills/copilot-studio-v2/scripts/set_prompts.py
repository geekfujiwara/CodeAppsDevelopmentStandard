"""既存の cliagent エージェントの Greeting（初期メッセージ）と Suggested prompts（推奨プロンプト）を更新する。

保存先は Dataverse の bots.configuration（UI: 設定 ＞ Greeting & prompts）:

    agentSettings.greetingText          … 初期メッセージ（文字列）
    agentSettings.conversationStarters  … 推奨プロンプト
        [{ "$kind": "ConversationStarter", "title": "...", "text": "..." }]

configuration は 1 つの JSON 文字列カラムなので GET → deep-merge → PATCH で更新する
（丸ごと上書きすると model / instructions / memory が消える）。
bots の PATCH は name カラムを同送しないと 0x80040265 で失敗する。
MCP ツールやスキルは botcomponents 側の別レコードなので、この更新では影響を受けない。

入力の優先順位: --file > AGENT_PROMPTS_FILE > AGENT_GREETING / AGENT_PROMPTS

JSON ファイル形式（キーは別名も可: greetingText / conversationStarters / message / prompt）:
    {
      "greeting": "こんにちは。...",
      "prompts": [ { "title": "進捗を確認", "text": "..." } ]
    }

AGENT_PROMPTS 環境変数形式（タイトル|プロンプト を ;; で区切る）:
    AGENT_PROMPTS=進捗を確認|今月の進捗は？;;改善案|改善案を出して

.env / 引数:
  AGENT_BOTID          対象 botid（省略時は cwd の agent_botid.txt）
  AGENT_PROMPTS_FILE   上記 JSON ファイルのパス
  AGENT_GREETING       初期メッセージ
  AGENT_PROMPTS        推奨プロンプト（上記形式）

実行:
  python set_prompts.py --file agent/prompts.json
  python set_prompts.py              # .env の AGENT_PROMPTS_FILE / AGENT_GREETING / AGENT_PROMPTS
  python set_prompts.py --show       # 現在値の確認のみ
  python set_prompts.py --clear      # 初期メッセージ・推奨プロンプトを削除
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

STARTER_KIND = "ConversationStarter"


def resolve_bot_id() -> str:
    bot_id = os.getenv("AGENT_BOTID", "").strip()
    if bot_id:
        return bot_id
    path = Path("agent_botid.txt")
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    sys.exit("AGENT_BOTID が未設定で agent_botid.txt もありません。")


def _normalize_prompts(raw: object) -> list[dict]:
    prompts: list[dict] = []
    for item in raw or []:
        if isinstance(item, str):
            title, _, text = item.partition("|")
            item = {"title": title, "text": text}
        title = str(item.get("title", "")).strip()
        text = str(item.get("text") or item.get("message") or item.get("prompt") or "").strip()
        if not title or not text:
            continue
        prompts.append({"$kind": STARTER_KIND, "title": title, "text": text})
    return prompts


def load_desired(source: Path | None) -> tuple[str, list[dict]]:
    """初期メッセージと推奨プロンプトを --file / .env から読み込む。"""
    path = source or (Path(os.getenv("AGENT_PROMPTS_FILE", "").strip())
                      if os.getenv("AGENT_PROMPTS_FILE", "").strip() else None)
    if path:
        if not path.exists():
            sys.exit(f"プロンプト定義ファイルが見つかりません: {path}")
        data = json.loads(path.read_text(encoding="utf-8"))
        greeting = str(data.get("greeting") or data.get("greetingText") or "").strip()
        raw = data.get("prompts") or data.get("conversationStarters") or data.get("starters")
        return greeting, _normalize_prompts(raw)

    greeting = os.getenv("AGENT_GREETING", "").strip()
    raw_env = os.getenv("AGENT_PROMPTS", "").strip()
    return greeting, _normalize_prompts([p for p in raw_env.split(";;") if p.strip()])


def describe(settings: dict) -> None:
    greeting = settings.get("greetingText") or "(未設定)"
    starters = settings.get("conversationStarters") or []
    print(f"初期メッセージ: {greeting}")
    print(f"推奨プロンプト: {len(starters)} 件")
    for s in starters:
        print(f"  - {s.get('title')} : {s.get('text')}")


def main() -> None:
    args = sys.argv[1:]
    show_only = "--show" in args
    clear = "--clear" in args
    source = Path(args[args.index("--file") + 1]) if "--file" in args else None

    bot_id = resolve_bot_id()
    bot = api_get(f"bots({bot_id})?$select=name,configuration")
    config = json.loads(bot["configuration"])
    settings = config.setdefault("agentSettings", {})

    print(f"対象: {bot['name']} ({bot_id})")
    print("--- 現在値 ---")
    describe(settings)

    if show_only:
        return

    if clear:
        greeting, prompts = "", []
    else:
        greeting, prompts = load_desired(source)
        if not greeting and not prompts:
            sys.exit("--file / AGENT_PROMPTS_FILE / AGENT_GREETING / AGENT_PROMPTS のいずれかを指定してください。")

    if (settings.get("greetingText") or "") == greeting and (
        settings.get("conversationStarters") or []
    ) == prompts:
        print("変更なし。")
        return

    if greeting:
        settings["greetingText"] = greeting
    else:
        settings.pop("greetingText", None)
    if prompts:
        settings["conversationStarters"] = prompts
    else:
        settings.pop("conversationStarters", None)

    assert_intact(json.loads(bot["configuration"]), config, changing="prompts")
    body = {"name": bot["name"], "configuration": json.dumps(config, ensure_ascii=False)}
    r = get_session().patch(f"{API}/bots({bot_id})", json=body)
    if r.status_code not in (200, 204):
        print("更新失敗:", r.status_code, r.text[:1000], file=sys.stderr)
        sys.exit(1)

    after = json.loads(api_get(f"bots({bot_id})?$select=configuration")["configuration"])
    print("--- 更新後 ---")
    describe(after.get("agentSettings", {}))
    print(f"   モデル系列は維持: {after['agentSettings']['model']['series']}")
    print("   反映には再公開が必要です: python publish_agent.py")


if __name__ == "__main__":
    main()
