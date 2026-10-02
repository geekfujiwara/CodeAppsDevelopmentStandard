"""株主番号からの照会（名簿・過去の発言と質問）を、アプリ（src/lib/agm/shareholders.ts）と同じ問い合わせで実 Dataverse に対して確かめる。

使い方: python scripts/test/verify_shareholder_lookup.py 0123 1601 9999
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))


def load_env() -> None:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    load_env()
    from auth_helper import get_session  # noqa: PLC0415

    session = get_session()
    base = os.environ["DATAVERSE_URL"].rstrip("/") + "/api/data/v9.2/"
    headers = {"Prefer": 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'}
    for number in sys.argv[1:] or ["0123"]:
        t0 = time.perf_counter()
        holder = session.get(base + f"${PUBLISHER_PREFIX}_agmshareholders?$select=${PUBLISHER_PREFIX}_name,${PUBLISHER_PREFIX}_shareholdername,${PUBLISHER_PREFIX}_shares,${PUBLISHER_PREFIX}_note&$filter=${PUBLISHER_PREFIX}_name eq '{number}'", headers=headers, timeout=60).json()["value"]
        turns = session.get(base + f"${PUBLISHER_PREFIX}_agmturns?$select=${PUBLISHER_PREFIX}_agmturnid,${PUBLISHER_PREFIX}_startedat,_${PUBLISHER_PREFIX}_meetingid_value&$filter=${PUBLISHER_PREFIX}_shareholdernumber eq '{number}'&$orderby=${PUBLISHER_PREFIX}_startedat desc", headers=headers, timeout=60).json()["value"]
        questions = []
        if turns:
            flt = " or ".join(f"_${PUBLISHER_PREFIX}_turnid_value eq {t['${PUBLISHER_PREFIX}_agmturnid']}" for t in turns)
            questions = session.get(base + f"${PUBLISHER_PREFIX}_agmquestions?$select=${PUBLISHER_PREFIX}_seq,${PUBLISHER_PREFIX}_category,${PUBLISHER_PREFIX}_qacode,_${PUBLISHER_PREFIX}_turnid_value&$filter={flt}&$orderby=${PUBLISHER_PREFIX}_seq asc", headers=headers, timeout=60).json()["value"]
        ms = round((time.perf_counter() - t0) * 1000)
        print(json.dumps({
            "number": number,
            "found": bool(holder),
            "name": holder[0]["${PUBLISHER_PREFIX}_shareholdername"] if holder else None,
            "turns": [{"meeting": t.get("_${PUBLISHER_PREFIX}_meetingid_value@OData.Community.Display.V1.FormattedValue"), "startedAt": t["${PUBLISHER_PREFIX}_startedat"],
                       "questions": [f"{q['${PUBLISHER_PREFIX}_category']}:{q['${PUBLISHER_PREFIX}_qacode']}" for q in questions if q["_${PUBLISHER_PREFIX}_turnid_value"] == t["${PUBLISHER_PREFIX}_agmturnid"]]} for t in turns],
            "ms": ms,
        }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
