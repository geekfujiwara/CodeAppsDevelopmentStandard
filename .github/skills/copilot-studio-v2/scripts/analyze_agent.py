"""
既存の cliagent エージェントの構成を解析してダンプする。
  - Bot 本体メタデータ（template / schemaname / 主要列）
  - configuration（BotConfiguration JSON）を整形表示
  - 配下の botcomponents 一覧（type 別）と各 data / description

.env / 引数:
  AGENT_BOTID   解析対象 Bot の botid（必須。引数でも可）

実行: python analyze_agent.py <botid>
出力: 標準出力 + agent_analysis.txt
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"
BOT_ID = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("AGENT_BOTID", "")).strip()

TYPE_LABEL = {9: "InlineAgentSkill/McpTool", 14: "FileAttachment", 15: "GptComponent(classic)"}


def section(title: str) -> str:
    bar = "=" * 70
    return f"\n{bar}\n  {title}\n{bar}\n"


def main() -> None:
    if not BOT_ID:
        print("AGENT_BOTID（または引数）が必要です。", file=sys.stderr)
        sys.exit(1)

    out: list[str] = []
    sess = get_session()

    # 1) Bot 本体（全列取得 → 主要列を抽出。新アーキは未対応列があるため $select しない）
    bot = sess.get(f"{API}/bots({BOT_ID})").json()
    keys = ["name", "schemaname", "template", "language", "statecode", "statuscode",
            "authenticationmode", "authenticationtrigger", "accesscontrolpolicy",
            "synchronizationstatus"]
    out.append(section("Bot 本体メタデータ"))
    out.append(json.dumps({k: bot.get(k) for k in keys}, ensure_ascii=False, indent=2))

    # 2) configuration
    out.append(section("Bot configuration (BotConfiguration JSON)"))
    try:
        cfg = json.loads(bot.get("configuration") or "{}")
        out.append(json.dumps(cfg, ensure_ascii=False, indent=2))
    except Exception as e:  # noqa: BLE001
        out.append(f"(configuration parse error: {e})\n{bot.get('configuration')}")

    # 3) botcomponents
    comps = api_get(
        f"botcomponents?$select=botcomponentid,name,componenttype,schemaname,description,data,"
        f"_parentbotcomponentid_value&$filter=_parentbotid_value eq {BOT_ID}"
    ).get("value", [])
    out.append(section(f"botcomponents 総数: {len(comps)}"))
    for c in comps:
        label = TYPE_LABEL.get(c["componenttype"], f"type{c['componenttype']}")
        out.append(f"  - [{c['componenttype']}:{label}] {c['name']} (schema={c['schemaname']})")

    for c in comps:
        out.append(section(f"Component [{c['componenttype']}] {c['name']}"))
        out.append(json.dumps({
            "schemaname": c["schemaname"],
            "description": c.get("description"),
            "parent_component": c.get("_parentbotcomponentid_value"),
            "data": c.get("data"),
        }, ensure_ascii=False, indent=2))

    text = "\n".join(out)
    Path("agent_analysis.txt").write_text(text, encoding="utf-8")
    print(text)
    print("\n(→ agent_analysis.txt に保存)")


if __name__ == "__main__":
    main()
