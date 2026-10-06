"""Dataverse 検索（関連性検索）の対象テーブルと検索列を設定する（べき等）。

アプリの工事・ユーザーのドロップダウン検索は Dataverse 検索（searchquery / コネクタの GetRelevantRows）を使う。
テーブルを検索インデックスに入れる（EntityMetadata.SyncToExternalSearchIndex）。検索される列は簡易検索ビュー
（savedquery querytype=4）の検索列で決まる。カスタム テーブルの既定は主列（名前）だけ。
簡易検索ビューの fetchxml を Web API で PATCH すると、内容を変えなくても 400（0x80040216）になる環境があるため、
このスクリプトはビューを変更しない。工事番号・発注者・住所はアプリ側で OData の部分一致を併用して補う。

    python scripts/setup_dataverse_search.py           # 設定して反映（PublishAllXml）
    python scripts/setup_dataverse_search.py --check   # 状態の確認だけ
    python scripts/setup_dataverse_search.py --query 港南 --table ${PUBLISHER_PREFIX}_project   # 検索の動作確認

インデックスへの反映は非同期（数分〜十数分）。--query で 0 件のときは時間をおいて再確認する。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import DATAVERSE_URL, api_get, api_post, api_request, get_session, retry_metadata  # noqa: E402

# テーブル → 簡易検索で探す列（主列は既定で含まれる）
SEARCH_COLUMNS: dict[str, list[str]] = {
    "${PUBLISHER_PREFIX}_project": ["${PUBLISHER_PREFIX}_name", "${PUBLISHER_PREFIX}_projectno", "${PUBLISHER_PREFIX}_client", "${PUBLISHER_PREFIX}_address", "${PUBLISHER_PREFIX}_sitemanager"],
    "${PUBLISHER_PREFIX}_task": ["${PUBLISHER_PREFIX}_name", "${PUBLISHER_PREFIX}_zone"],
    "${PUBLISHER_PREFIX}_dailyreport": ["${PUBLISHER_PREFIX}_name", "${PUBLISHER_PREFIX}_workdetail"],
    "systemuser": ["fullname", "internalemailaddress", "domainname"],
}


def entity_path(logical: str) -> str:
    return f"EntityDefinitions(LogicalName='{logical}')"


def ensure_indexed(logical: str) -> bool:
    meta = api_get(entity_path(logical))
    if meta.get("SyncToExternalSearchIndex"):
        return False
    if not (meta.get("CanEnableSyncToExternalSearchIndex") or {}).get("Value"):
        raise SystemExit(f"{logical} は Dataverse 検索の対象にできません")
    meta.pop("@odata.context", None)
    meta["SyncToExternalSearchIndex"] = True
    retry_metadata(lambda: api_request(entity_path(logical), meta, method="PUT"), f"search index {logical}")
    if not api_get(f"{entity_path(logical)}?$select=SyncToExternalSearchIndex").get("SyncToExternalSearchIndex"):
        raise SystemExit(f"{logical} を検索の対象にできませんでした")
    return True


def query(term: str, table: str) -> list[dict]:
    session = get_session()
    entities = [{"name": table, "selectColumns": SEARCH_COLUMNS[table]}]
    response = session.post(f"{DATAVERSE_URL}/api/data/v9.2/searchquery", json={"search": term, "entities": json.dumps(entities), "top": 10})
    response.raise_for_status()
    body = json.loads(response.json()["response"])
    if body.get("Error"):
        raise SystemExit(f"検索エラー: {body['Error']}")
    return body.get("Value") or []


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--query")
    parser.add_argument("--table", default="${PUBLISHER_PREFIX}_project", choices=sorted(SEARCH_COLUMNS))
    args = parser.parse_args()
    if args.query:
        rows = query(args.query, args.table)
        print(f"{len(rows)} 件")
        for row in rows:
            print(" ", row.get("Id"), json.dumps(row.get("Attributes"), ensure_ascii=False)[:160])
        return
    changed = False
    for logical, columns in SEARCH_COLUMNS.items():
        state = api_get(f"{entity_path(logical)}?$select=SyncToExternalSearchIndex").get("SyncToExternalSearchIndex")
        if args.check:
            print(f"{logical}: 検索対象={state}")
            continue
        indexed = ensure_indexed(logical)
        changed |= indexed
        print(f"{logical}: 検索対象に追加={indexed}")
    if changed and not args.check:
        api_post("PublishAllXml", {})
        print("反映しました（インデックスの更新は数分かかります）")


if __name__ == "__main__":
    main()
