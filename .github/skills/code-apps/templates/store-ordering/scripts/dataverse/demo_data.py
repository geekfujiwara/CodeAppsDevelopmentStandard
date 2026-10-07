"""店舗発注デモのデータを Dataverse に入れる・シナリオを切り替える・リセットする。

    python -u scripts/dataverse/demo_data.py load   [--scenario demo-1030-rain]  # 全件（べき等）
    python -u scripts/dataverse/demo_data.py switch --scenario demo-sunny-hot     # 天気予報・今日のイベント・在庫・デモ設定を書き換え
    python -u scripts/dataverse/demo_data.py reset  [--scenario demo-1030-rain]  # 発注を全件削除してシナリオを書き換え
    python -u scripts/dataverse/demo_data.py clock  --time 10:30                  # デモの「今の時刻」だけ変える（引数なしで台本の時刻）
    python -u scripts/dataverse/demo_data.py state                                # 今のシナリオ・時刻・発注件数
    python -u scripts/dataverse/demo_data.py verify                               # 件数と台本の数字を確かめる

データは `node demo-data/export.ts` が作る demo-data/export/<scenario>.json（無ければ自動で作る）。
行 ID は uuid5 で決めるので、何度実行しても同じ行を上書きする（重複しない）。
認証は standard スキルの auth_helper（キャッシュ済みの委任認証）。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
except AttributeError:
    pass

HERE = Path(__file__).resolve()
ROOT = HERE.parents[2]  # アプリのルート（dataverse/schema.json・.env がある）
_STANDARD = next((q / ".github" / "skills" / "standard" / "scripts" for q in HERE.parents if (q / ".github" / "skills" / "standard" / "scripts" / "auth_helper.py").exists()), None)
if _STANDARD is None:
    raise SystemExit("auth_helper.py が見つかりません（.github/skills/standard/scripts を上位のフォルダに置いてください）")
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(_STANDARD))
from auth_helper import DATAVERSE_URL, api_get, api_patch, get_session  # noqa: E402

PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not PREFIX:
    raise SystemExit(".env の PUBLISHER_PREFIX が空です。")
SCHEMA = json.loads((ROOT / "dataverse" / "schema.json").read_text(encoding="utf-8"))
TABLES = {t["logical"]: t for t in SCHEMA["tables"]}
LOOKUP_FROM = {lk["from_table"]: lk for lk in SCHEMA["lookups"]}
# 行 ID（uuid5）の名前空間。一度投入した環境では変えない（変えると別の ID になり、行が重複する）。
# .env の DEMO_ID_NAMESPACE で指定できる（既定はテンプレート固有の値をその場で計算する）
NAMESPACE = uuid.UUID(os.environ.get("DEMO_ID_NAMESPACE", "").strip() or str(uuid.uuid5(uuid.NAMESPACE_URL, "urn:code-apps:store-ordering:demo-data")))
BATCH_SIZE = 100
API = f"{DATAVERSE_URL.rstrip('/')}/api/data/v9.2"
DEFAULT_SCENARIO = "demo-1030-rain"


def p(name: str) -> str:
    return f"{PREFIX}_{name}"


def row_id(key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"tencho:{key}"))


_entity_sets: dict[str, str] = {}
_navprops: dict[str, str] = {}


def entity_set(table: str) -> str:
    if table not in _entity_sets:
        meta = api_get(f"EntityDefinitions(LogicalName='{p(table)}')?$select=EntitySetName")
        _entity_sets[table] = meta["EntitySetName"]
    return _entity_sets[table]


def navprop(table: str) -> str:
    """商品 Lookup のナビゲーション プロパティ名（推測せず API から取る）"""
    if table not in _navprops:
        lk = LOOKUP_FROM[table]
        rels = api_get(
            f"EntityDefinitions(LogicalName='{p(table)}')/ManyToOneRelationships"
            f"?$filter=ReferencingAttribute eq '{p(lk['column_logical'])}'"
            f"&$select=ReferencingEntityNavigationPropertyName"
        )["value"]
        if not rels:
            raise RuntimeError(f"{p(table)} の Lookup {p(lk['column_logical'])} が見つかりません（setup_dataverse.py を先に実行）")
        _navprops[table] = rels[0]["ReferencingEntityNavigationPropertyName"]
    return _navprops[table]


def to_body(table: str, row: dict) -> dict:
    body: dict = {p("name"): row["name"]}
    for col in TABLES[table]["columns"]:
        name = col["logical"]
        if name not in row:
            continue
        value = row[name]
        if value is not None and col["type"] == "Integer":
            value = int(value)
        elif value is not None and col["type"] == "Decimal":
            value = float(value)
        body[p(name)] = value
    if row.get("item") and table in LOOKUP_FROM:
        body[f"{navprop(table)}@odata.bind"] = f"/{entity_set('tkitem')}({row_id('item:' + row['item'])})"
    return body


def send_batch(requests_: list[tuple[str, str, dict | None]]) -> int:
    """(method, relative_url, body) を $batch でまとめて送る。失敗した件数を返す。"""
    if not requests_:
        return 0
    boundary = f"batch_{uuid.uuid4().hex}"
    parts = []
    for method, url, body in requests_:
        part = [
            f"--{boundary}",
            "Content-Type: application/http",
            "Content-Transfer-Encoding: binary",
            "",
            f"{method} {API}/{url} HTTP/1.1",
        ]
        if body is not None:
            part += ["Content-Type: application/json; charset=utf-8", "", json.dumps(body, ensure_ascii=False)]
        else:
            part += [""]
        parts.append("\r\n".join(part))
    payload = "\r\n".join(parts) + f"\r\n--{boundary}--\r\n"
    session = get_session()
    session.headers.pop("Content-Type", None)
    resp = session.post(
        f"{API}/$batch",
        data=payload.encode("utf-8"),
        headers={"Content-Type": f"multipart/mixed; boundary={boundary}", "Prefer": "odata.continue-on-error"},
        timeout=300,
    )
    resp.raise_for_status()
    statuses = [line for line in resp.text.splitlines() if line.startswith("HTTP/1.1 ")]
    failed = [s for s in statuses if not s.split(" ")[1].startswith("2")]
    if failed:
        errors = [line for line in resp.text.splitlines() if '"message"' in line][:3]
        print(f"    ⚠ {len(failed)} 件失敗: {failed[:3]} {errors}")
    return len(failed)


def upsert(table: str, rows: list[dict], label: str) -> None:
    es = entity_set(table)
    total_failed = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        total_failed += send_batch([("PATCH", f"{es}({row_id(r['key'])})", to_body(table, r)) for r in chunk])
        if len(rows) > BATCH_SIZE:
            print(f"    {label}: {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")
    if total_failed:
        raise RuntimeError(f"{label}: {total_failed} 件の書き込みに失敗しました")
    print(f"  ✅ {label}: {len(rows)} 件")


def list_ids(table: str, flt: str = "") -> list[str]:
    es = entity_set(table)
    pk = f"{p(table)}id"
    url = f"{es}?$select={pk}" + (f"&$filter={flt}" if flt else "")
    ids: list[str] = []
    while url:
        data = api_get(url)
        ids += [r[pk] for r in data.get("value", [])]
        nxt = data.get("@odata.nextLink")
        url = nxt.split("/api/data/v9.2/", 1)[1] if nxt else ""
    return ids


def delete_all(table: str, flt: str, label: str) -> int:
    es = entity_set(table)
    ids = list_ids(table, flt)
    for i in range(0, len(ids), BATCH_SIZE):
        send_batch([("DELETE", f"{es}({x})", None) for x in ids[i : i + BATCH_SIZE]])
    print(f"  🗑 {label}: {len(ids)} 件削除")
    return len(ids)


def load_bundle(scenario: str) -> dict:
    path = ROOT / "demo-data" / "export" / f"{scenario}.json"
    if not path.exists():
        print(f"  demo-data/export/{scenario}.json が無いので作ります（node demo-data/export.ts）")
        subprocess.run(["node", "demo-data/export.ts", "--scenario", scenario], cwd=ROOT, check=True, shell=os.name == "nt")
    return json.loads(path.read_text(encoding="utf-8"))


def write_scenario(bundle: dict) -> None:
    s = bundle["scenarioRows"]
    today = bundle["scenario"]["businessDate"]
    upsert("tkweather", s["weather"], "天気（今日からの予報）")
    keep = {row_id(r["key"]) for r in s["events"]}
    stale = [x for x in list_ids("tkevent", f"{p('date')} ge {today}") if x not in keep]
    if stale:
        send_batch([("DELETE", f"{entity_set('tkevent')}({x})", None) for x in stale])
        print(f"  🗑 今日以降の別シナリオのイベント: {len(stale)} 件削除")
    if s["events"]:
        upsert("tkevent", s["events"], "周辺イベント（今日以降）")
    upsert("tkinventory", s["inventory"], "在庫")
    upsert("tksetting", s["setting"], "デモ設定")


def cmd_load(args) -> None:
    bundle = load_bundle(args.scenario)
    h = bundle["history"]
    print(f"[load] {DATAVERSE_URL} / 接頭辞 {PREFIX} / シナリオ {args.scenario}")
    upsert("tkitem", h["items"], "商品")
    upsert("tktrend", h["trends"], "単品の傾向")
    upsert("tkweather", h["weather"], "天気（実績）")
    upsert("tkevent", h["events"], "周辺イベント（過去）")
    upsert("tkdaily", h["daily"], "単品日次実績")
    write_scenario(bundle)
    print("[OK] 投入しました。続けて verify で確かめてください。")


def cmd_switch(args) -> None:
    bundle = load_bundle(args.scenario)
    print(f"[switch] シナリオを {args.scenario} にします")
    write_scenario(bundle)
    if args.time:
        set_time(args.time)
    cmd_state(args)


def cmd_reset(args) -> None:
    print("[reset] デモで登録した発注を削除し、シナリオを書き直します")
    delete_all("tkorder", "", "発注")
    args.scenario = args.scenario or current_setting().get(p("scenario")) or DEFAULT_SCENARIO
    cmd_switch(args)


def current_setting() -> dict:
    rows = api_get(f"{entity_set('tksetting')}({row_id('setting:current')})")
    return rows


def set_time(t: str) -> None:
    api_patch(f"{entity_set('tksetting')}({row_id('setting:current')})", {p("demotime"): t})
    print(f"  🕘 デモの時刻を {t} にしました")


def cmd_clock(args) -> None:
    t = args.time
    if not t:
        scenario = current_setting().get(p("scenario")) or DEFAULT_SCENARIO
        t = load_bundle(scenario)["scenario"]["demoTime"]
    set_time(t)


def cmd_state(_args) -> None:
    s = current_setting()
    orders = list_ids("tkorder")
    print(f"  シナリオ: {s.get(p('scenario'))}（{s.get(p('scenariotitle'))}）")
    print(f"  今日: {str(s.get(p('businessdate')))[:10]} {s.get(p('demotime'))} / 発注: {len(orders)} 件")


def count(table: str) -> int:
    return len(list_ids(table))


def cmd_verify(_args) -> None:
    setting = current_setting()
    scenario = setting.get(p("scenario")) or DEFAULT_SCENARIO
    bundle = load_bundle(scenario)
    h, s = bundle["history"], bundle["scenarioRows"]
    expected = {
        "tkitem": len(h["items"]),
        "tktrend": len(h["trends"]),
        "tkdaily": len(h["daily"]),
        "tkweather": len(h["weather"]) + len(s["weather"]),
        "tkevent": len(h["events"]) + len(s["events"]),
        "tkinventory": len(s["inventory"]),
        "tksetting": 1,
    }
    ok = True
    for table, n in expected.items():
        got = count(table)
        mark = "✅" if got == n else "❌"
        ok &= got == n
        print(f"  {mark} {TABLES[table]['display']}（{p(table)}）: {got} 件（期待 {n}）")

    checks = []
    d02 = api_get(f"{entity_set('tktrend')}({row_id('trend:D02')})")
    checks.append(("マンゴー杏仁の廃棄が続いている日数", d02[p("wastestreak")], 14))
    b01 = api_get(f"{entity_set('tktrend')}({row_id('trend:B01')})")
    checks.append(("特製から揚げ弁当の直近14日の欠品日数", b01[p("stockoutdays14")], 12))
    today = bundle["scenario"]["businessDate"]
    w = api_get(f"{entity_set('tkweather')}({row_id('weather:' + today)})")
    exp_w = next(r for r in s["weather"] if r["date"] == today)
    checks.append(("今日の天気", w[p("condition")], exp_w["condition"]))
    checks.append(("今日の最高気温", float(w[p("tempmax")]), float(exp_w["tempmax"])))
    u01 = api_get(f"{entity_set('tkinventory')}({row_id('inventory:U01')})")
    exp_u = next(r for r in s["inventory"] if r["sku"] == "U01")
    checks.append(("傘の在庫", u01[p("stock")], exp_u["stock"]))
    for label, got, exp in checks:
        mark = "✅" if got == exp else "❌"
        ok &= got == exp
        print(f"  {mark} {label}: {got}（期待 {exp}）")
    if not ok:
        raise SystemExit("[NG] Dataverse の内容が想定と違います")
    print(f"[OK] シナリオ {scenario} の内容を確認しました")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("load", "switch", "reset"):
        sp = sub.add_parser(name)
        sp.add_argument("--scenario", default=DEFAULT_SCENARIO if name != "reset" else None)
        sp.add_argument("--time")
    sub.add_parser("clock").add_argument("--time")
    sub.add_parser("state")
    sub.add_parser("verify")
    args = ap.parse_args()
    {"load": cmd_load, "switch": cmd_switch, "reset": cmd_reset, "clock": cmd_clock, "state": cmd_state, "verify": cmd_verify}[args.cmd](args)


if __name__ == "__main__":
    main()
