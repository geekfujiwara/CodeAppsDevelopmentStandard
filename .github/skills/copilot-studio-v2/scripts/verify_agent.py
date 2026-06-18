"""
cliagent エージェントの構造を検証する。
  - 配下の botcomponents（type=9 スキル / type=14 同梱ファイル）を列挙
  - type=14 の filedata を実体ダウンロードしてサイズを確認（読み取り可能か）

.env / 引数:
  AGENT_BOTID   対象 Bot の botid（未指定なら agent_botid.txt を読む）

実行: python verify_agent.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"
BOT_ID = os.getenv("AGENT_BOTID") or (
    Path("agent_botid.txt").read_text(encoding="utf-8").strip()
    if Path("agent_botid.txt").exists()
    else ""
)


def main() -> None:
    if not BOT_ID:
        print("AGENT_BOTID 未設定。agent_botid.txt も無し。", file=sys.stderr)
        sys.exit(1)
    sess = get_session()
    r = sess.get(
        f"{API}/botcomponents?$select=botcomponentid,name,componenttype,schemaname,"
        f"_parentbotcomponentid_value,filedata_name&$filter=_parentbotid_value eq {BOT_ID}"
    )
    comps = r.json().get("value", [])
    print(f"botcomponents: {len(comps)} 件\n")
    for c in comps:
        parent = str(c.get("_parentbotcomponentid_value") or "-")[:8]
        fn = c.get("filedata_name") or ""
        print(f"  type={c['componenttype']:>3}  {c['name']:<30} parent={parent:<8} file={fn}")

    print("\n--- filedata 読み取り検証 ---")
    ok = True
    for c in comps:
        if c["componenttype"] == 14:
            dl = sess.get(f"{API}/botcomponents({c['botcomponentid']})/filedata/$value")
            status = dl.status_code
            size = len(dl.content)
            print(f"  {c['name']:<24} status={status} size={size} bytes")
            if status != 200 or size == 0:
                ok = False
    print("\n" + ("✅ 検証 OK" if ok else "⚠️ 一部 filedata が読めません"))


if __name__ == "__main__":
    main()
