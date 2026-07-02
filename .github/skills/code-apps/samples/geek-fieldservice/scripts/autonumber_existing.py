"""
既存レコードに自動採番を適用する。
- コール: CL-YYYYMMDD-NNN (receiveddate ベース)
- 作業オーダー: WO-YYYYMMDD-NNN (scheduleddate ベース)
- 修理事例: MR-YYYYMMDD-NNN (completeddate ベース)
- 日報: DR-YYYYMMDD-NNN (reportdate ベース)
"""
import os, sys, re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(_ROOT, ".github", "skills", "standard", "scripts"))
from dotenv import load_dotenv
load_dotenv(os.path.join(_ROOT, ".env"))
from auth_helper import api_get, api_patch, DATAVERSE_URL

PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not DATAVERSE_URL or not PREFIX:
    print("ERROR: DATAVERSE_URL / PUBLISHER_PREFIX required", file=sys.stderr)
    sys.exit(1)

# パターン定義: (テーブル複数形, IDフィールド, 名前フィールド, 日付フィールド, プレフィックス)
TARGETS = [
    (f"{PREFIX}_calls", f"{PREFIX}_callid", f"{PREFIX}_name", f"{PREFIX}_receiveddate", "CL"),
    (f"{PREFIX}_workorders", f"{PREFIX}_workorderid", f"{PREFIX}_name", f"{PREFIX}_scheduleddate", "WO"),
    (f"{PREFIX}_maintenancereports", f"{PREFIX}_maintenancereportid", f"{PREFIX}_name", f"{PREFIX}_completeddate", "MR"),
    (f"{PREFIX}_dailyreports", f"{PREFIX}_dailyreportid", f"{PREFIX}_name", f"{PREFIX}_reportdate", "DR"),
]


def get_all_records(table: str, fields: list[str]) -> list[dict]:
    """全レコードを取得（ページネーション対応）。"""
    select = ",".join(fields)
    path = f"{table}?$select={select}&$orderby=createdon asc"
    records = []
    while path:
        data = api_get(path)
        records.extend(data.get("value", []))
        next_link = data.get("@odata.nextLink")
        if next_link:
            path = next_link.replace(f"{DATAVERSE_URL}/api/data/v9.2/", "")
        else:
            path = None
    return records


def is_already_numbered(name: str, prefix: str) -> bool:
    """既に採番済み（XX-YYYYMMDD-NNN 形式）かチェック。"""
    pattern = rf"^{prefix}-\d{{8}}-\d{{3}}$"
    return bool(re.match(pattern, name))


def run():
    for table, id_field, name_field, date_field, num_prefix in TARGETS:
        print(f"\n{'='*50}")
        print(f"テーブル: {table} (プレフィックス: {num_prefix})")
        print(f"{'='*50}")

        records = get_all_records(table, [id_field, name_field, date_field, "createdon"])

        # 日付別にグループ化
        date_groups: dict[str, list[dict]] = defaultdict(list)
        skip_count = 0
        for r in records:
            name = r.get(name_field) or ""
            if is_already_numbered(name, num_prefix):
                skip_count += 1
                continue
            # 日付フィールドがあればそれを使う、なければ createdon
            raw_date = r.get(date_field) or r.get("createdon") or ""
            if raw_date:
                try:
                    dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                    date_key = dt.strftime("%Y%m%d")
                except (ValueError, TypeError):
                    date_key = datetime.now().strftime("%Y%m%d")
            else:
                date_key = datetime.now().strftime("%Y%m%d")
            date_groups[date_key].append(r)

        if skip_count:
            print(f"  スキップ（採番済み）: {skip_count} 件")

        if not date_groups:
            print("  更新対象なし")
            continue

        # 既存の採番済みレコードから各日付の最大番号を取得
        existing_max: dict[str, int] = defaultdict(int)
        for r in records:
            name = r.get(name_field) or ""
            if is_already_numbered(name, num_prefix):
                parts = name.split("-")
                date_key = parts[1]
                num = int(parts[2])
                existing_max[date_key] = max(existing_max[date_key], num)

        # 採番して更新
        updated = 0
        for date_key in sorted(date_groups.keys()):
            items = date_groups[date_key]
            counter = existing_max.get(date_key, 0)
            for r in items:
                counter += 1
                new_name = f"{num_prefix}-{date_key}-{str(counter).zfill(3)}"
                record_id = r[id_field]
                old_name = r.get(name_field) or "(空)"
                print(f"  {old_name} -> {new_name}")
                api_patch(f"{table}({record_id})", {name_field: new_name})
                updated += 1

        print(f"  更新完了: {updated} 件")

    print("\n✅ 全テーブルの自動採番が完了しました")


if __name__ == "__main__":
    run()
