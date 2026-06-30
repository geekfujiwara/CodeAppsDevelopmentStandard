"""既存 Copilot Studio エージェントの現状分析スクリプト — テーマ非依存テンプレート。

既存エージェントの改善（build-reference.md「既存エージェント改善パターン」）の前段で、
現状を機械的に把握するために使う。Instructions の有無・GPT コンポーネント・
conversationStarters・カスタムトピック一覧・configuration を一覧表示する。

前提:
  - .env に DATAVERSE_URL と BOT_ID（Copilot Studio の URL でも GUID でも可）を設定
  - 共通認証は standard/scripts/auth_helper.py（DeviceCodeCredential）を利用

使い方:
  python .github/skills/copilot-studio/scripts/analyze_bot.py
  python .github/skills/copilot-studio/scripts/analyze_bot.py <bot-id-or-url>   # 引数優先
"""

import json
import os
import re
import sys

import requests

# スキルフォルダと共通認証モジュールを sys.path に追加
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))

from auth_helper import get_token, DATAVERSE_URL as _DV_URL  # noqa: E402

DATAVERSE_URL = _DV_URL
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "")


def get_headers() -> dict:
    return {
        "Authorization": f"Bearer {get_token()}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }


def api_get(path: str, params: dict | None = None) -> dict:
    r = requests.get(f"{DATAVERSE_URL}/api/data/v9.2/{path}", headers=get_headers(), params=params)
    r.raise_for_status()
    return r.json()


def extract_bot_id(value: str) -> str | None:
    """BOT_ID（URL でも GUID でも可）から Bot ID を抽出する。"""
    m = re.search(r"/bots/([0-9a-f-]{36})", value)
    if m:
        return m.group(1)
    if re.fullmatch(r"[0-9a-f-]{36}", value.strip()):
        return value.strip()
    return None


def analyze(bot_id: str) -> None:
    bot = api_get(
        f"bots({bot_id})?$select=name,schemaname,configuration,authenticationtrigger"
    )
    print("=== Bot ===")
    print(f"  name       : {bot.get('name')}")
    print(f"  schemaname : {bot.get('schemaname')}")
    cfg = bot.get("configuration")
    print(f"  configuration: {'あり' if cfg else 'なし'}")

    comps = api_get(
        "botcomponents",
        params={
            "$filter": f"_parentbotid_value eq '{bot_id}'",
            "$select": "name,schemaname,componenttype,description,data",
        },
    ).get("value", [])

    print(f"\n=== botcomponents（{len(comps)} 件）===")
    for c in comps:
        ctype = c.get("componenttype")
        name = c.get("schemaname") or c.get("name")
        has_data = "data あり" if c.get("data") else "data なし"
        print(f"  [type={ctype}] {name} — {has_data}")
        if c.get("description"):
            print(f"      description: {c['description'][:80]}")

    # GPT コンポーネント（Instructions / conversationStarters）の有無を要約
    gpt = [c for c in comps if c.get("data") and "Instructions" in (c.get("data") or "")]
    print(f"\n=== 要約 ===")
    print(f"  Instructions を含むコンポーネント: {len(gpt)} 件")
    print(f"  カスタムトピック等の総コンポーネント: {len(comps)} 件")
    print("\n改善時は build-reference.md「既存エージェント改善パターン」の手順に従う。")


def main() -> int:
    raw = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BOT_ID", "")
    if not raw:
        print("BOT_ID が未設定です（.env または引数で指定してください）", file=sys.stderr)
        return 2
    bot_id = extract_bot_id(raw)
    if not bot_id:
        print(f"BOT_ID から Bot GUID を抽出できません: {raw}", file=sys.stderr)
        return 2
    if not DATAVERSE_URL:
        print("DATAVERSE_URL が未設定です（.env を確認してください）", file=sys.stderr)
        return 2
    analyze(bot_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
