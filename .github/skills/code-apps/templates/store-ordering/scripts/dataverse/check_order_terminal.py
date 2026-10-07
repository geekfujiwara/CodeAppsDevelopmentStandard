"""店舗発注端末（apps/order-terminal）の Dataverse アクセスを実データで検証する。

アプリの store-api.ts と同じエンティティセット・列・フィルターで取得し、
発注の登録 → 取消（状態の更新）→ 削除までを Web API で再現する（後片付け込み）。
  python scripts/dataverse/check_order_terminal.py（npm run dv:check-terminal）
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

HERE = Path(__file__).resolve()
ROOT = HERE.parents[2]  # アプリのルート（dataverse/schema.json・.env がある）
_STANDARD = next((q / ".github" / "skills" / "standard" / "scripts" for q in HERE.parents if (q / ".github" / "skills" / "standard" / "scripts" / "auth_helper.py").exists()), None)
if _STANDARD is None:
    raise SystemExit("auth_helper.py が見つかりません（.github/skills/standard/scripts を上位のフォルダに置いてください）")
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(_STANDARD))
from auth_helper import api_delete, api_get, api_patch, api_post  # noqa: E402

P = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not P:
    raise SystemExit(".env に PUBLISHER_PREFIX がありません")
T = f"{P}_tk"


def cols(*names: str) -> str:
    return ",".join(f"{P}_{n}" for n in names)


# store-api.ts と同じ（変更したら両方そろえる）
QUERIES = {
    "settings": (cols("businessdate", "demotime", "storename", "storearea", "scenario", "scenariotitle") + f",{P}_tksettingid", None),
    "items": (cols("sku", "name", "category", "price", "itemtype", "ordercutoff", "leadtimedays", "minlot"), None),
    "inventories": (cols("sku", "stock", "soldtoday", "expectedrest", "balance", "status", "eveningorder"), None),
    "trends": (cols("sku", "avg7", "weekratio", "waste14", "wasterate14", "wastestreak", "stockoutdays14", "soldouthour", "lost14", "peakhours", "rainavg", "dryavg", "eventavg"), None),
    "dailies": (cols("sku", "date", "weekday", "weather", "tempmax", "salesqty", "wasteqty", "soldouthour", "deliverymorning", "deliveryevening"), f"{P}_date ge {{from14}}"),
    "weathers": (cols("date", "condition", "tempmax", "tempmin", "precipprob", "kind", "tempdiff", "prevcondition"), f"{P}_date ge {{from7}}"),
    "events": (cols("name", "date", "starttime", "endtime", "venue", "scale", "distancem"), f"{P}_date ge {{from30}}"),
    "orders": (cols("name", "deliverydate", "deliveryslot", "lines", "itemcount", "totalqty", "totalamount", "reason", "status", "source") + f",{P}_tkorderid,createdon", None),
}


def get_all(entity_set: str, select: str, flt: str | None) -> list[dict]:
    path = f"{entity_set}?$select={select}" + (f"&$filter={quote(flt)}" if flt else "")
    rows: list[dict] = []
    while path:
        res = api_get(path)
        rows += res.get("value", [])
        nxt = res.get("@odata.nextLink")
        path = nxt.split("/api/data/v9.2/", 1)[1] if nxt else ""
    return rows


def shift(day: str, n: int) -> str:
    from datetime import date, timedelta

    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


def main() -> int:
    ng = 0
    setting = get_all(f"{T}settings", QUERIES["settings"][0], None)
    today = str(setting[0][f"{P}_businessdate"])[:10]
    ctx = {"from14": shift(today, -14), "from7": shift(today, -7), "from30": shift(today, -30)}
    for name, (select, flt) in QUERIES.items():
        rows = get_all(f"{T}{name}", select, flt.format(**ctx) if flt else None)
        ok = len(rows) > 0 or name == "orders"
        ng += not ok
        print(f"[{'OK' if ok else 'NG'}] {T}{name}: {len(rows)} 行" + (f"（{flt.format(**ctx)}）" if flt else ""))

    inv = get_all(f"{T}inventories", cols("sku", "eveningorder"), None)
    bad = [r for r in inv if not str(r.get(f"{P}_eveningorder") or "").startswith(("可", "不可"))]
    ng += bool(bad)
    print(f"[{'OK' if not bad else 'NG'}] 夕方便の可否が「可／不可」で始まる（例外 {len(bad)} 件）")

    no = f"PO-{today.replace('-', '')}-夕方便-99"
    body = {
        f"{P}_name": no,
        f"{P}_deliverydate": today,
        f"{P}_deliveryslot": "夕方便",
        f"{P}_lines": "001 鮭おにぎり ×4\n002 ツナマヨおにぎり ×2",
        f"{P}_itemcount": 2,
        f"{P}_totalqty": 6,
        f"{P}_totalamount": 940,
        f"{P}_reason": "端末アクセス検証（自動削除）",
        f"{P}_status": "受付済",
        f"{P}_source": "店舗端末",
    }
    rid = api_post(f"{T}orders", body)
    if not rid:
        print("[NG] 発注の登録で ID が返らない")
        return 1
    try:
        got = api_get(f"{T}orders({rid})?$select={cols('name', 'deliverydate', 'status')}")
        ok = got[f"{P}_name"] == no and str(got[f"{P}_deliverydate"])[:10] == today and got[f"{P}_status"] == "受付済"
        ng += not ok
        print(f"[{'OK' if ok else 'NG'}] 発注の登録と読み戻し（納品日 {got[f'{P}_deliverydate']}）")
        api_patch(f"{T}orders({rid})", {f"{P}_status": "取消"})
        st = api_get(f"{T}orders({rid})?$select={P}_status")[f"{P}_status"]
        ng += st != "取消"
        print(f"[{'OK' if st == '取消' else 'NG'}] 取消（状態の更新）: {st}")
    finally:
        api_delete(f"{T}orders({rid})")
        print("[OK] 検証用の発注を削除")
    print("結果:", "OK" if not ng else f"NG {ng} 件")
    return 1 if ng else 0


if __name__ == "__main__":
    raise SystemExit(main())
