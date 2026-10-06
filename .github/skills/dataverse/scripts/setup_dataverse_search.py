"""Dataverse 検索（関連性検索）の対象テーブルを設定・確認する（べき等）。

テーブルを検索インデックスに入れる（EntityMetadata.SyncToExternalSearchIndex を PUT）。検索される列は
簡易検索ビュー（savedquery querytype=4）の検索列で決まり、カスタム テーブルの既定は主列（名前）だけ。

簡易検索ビューの fetchxml を Web API で PATCH すると、内容を変えなくても 400（0x80040216）になる環境があるため、
このスクリプトはビューを変更しない（troubleshooting #29）。番号・住所などはアプリ側で OData の contains を併用する。

    python setup_dataverse_search.py --table <prefix>_project --table systemuser          # 設定して反映
    python setup_dataverse_search.py --table <prefix>_project --check                     # 状態の確認だけ
    python setup_dataverse_search.py --table <prefix>_project --query <語>                 # 検索の動作確認

インデックスへの反映は非同期（数分〜十数分）。--query で 0 件のときは時間をおいて再確認する。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from auth_helper import DATAVERSE_URL, api_get, api_post, api_request, get_session, retry_metadata  # noqa: E402


def entity_path(logical: str) -> str:
    return f"EntityDefinitions(LogicalName='{logical}')"


def parse_search_response(body: dict) -> list[dict]:
    """searchquery の応答（response が JSON 文字列）から行を取り出す。エラーは例外にする"""
    raw = body.get("response")
    payload = json.loads(raw) if isinstance(raw, str) else (raw or {})
    if payload.get("Error"):
        raise RuntimeError(f"検索エラー: {payload['Error']}")
    if payload.get("ErrorList"):
        raise RuntimeError(f"検索エラー: {payload['ErrorList']}")
    return [{"id": row.get("Id"), "entity": row.get("EntityName"), "attributes": row.get("Attributes") or {}} for row in payload.get("Value") or []]


def ensure_indexed(logical: str, wait_seconds: int = 120) -> bool:
    """検索の対象にする。既に対象なら何もしない。PUT 後は読み戻しに反映されるまで待つ"""
    meta = api_get(entity_path(logical))
    if meta.get("SyncToExternalSearchIndex"):
        return False
    if not (meta.get("CanEnableSyncToExternalSearchIndex") or {}).get("Value"):
        raise SystemExit(f"{logical} は Dataverse 検索の対象にできません")
    meta.pop("@odata.context", None)
    meta["SyncToExternalSearchIndex"] = True
    retry_metadata(lambda: api_request(entity_path(logical), meta, method="PUT"), f"search index {logical}")
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        if api_get(f"{entity_path(logical)}?$select=SyncToExternalSearchIndex").get("SyncToExternalSearchIndex"):
            return True
        time.sleep(10)
    raise SystemExit(f"{logical} を検索の対象にできませんでした（{wait_seconds} 秒待っても読み戻しに反映されない）")


def query(term: str, table: str, top: int = 10) -> list[dict]:
    response = get_session().post(f"{DATAVERSE_URL}/api/data/v9.2/searchquery",
                                  json={"search": term, "entities": json.dumps([{"name": table}]), "top": top})
    response.raise_for_status()
    return parse_search_response(response.json())


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--table", action="append", required=True, help="論理名（複数指定可）")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--query")
    args = parser.parse_args()
    if args.query:
        for table in args.table:
            rows = query(args.query, table)
            print(f"{table}: {len(rows)} 件")
            for row in rows:
                print(" ", row["id"], json.dumps(row["attributes"], ensure_ascii=False)[:160])
        return
    changed = False
    for table in args.table:
        if args.check:
            state = api_get(f"{entity_path(table)}?$select=SyncToExternalSearchIndex").get("SyncToExternalSearchIndex")
            print(f"{table}: 検索対象={state}")
            continue
        indexed = ensure_indexed(table)
        changed |= indexed
        print(f"{table}: 検索対象に追加={indexed}")
    if changed:
        api_post("PublishAllXml", {})
        print("反映しました（インデックスの更新は数分かかります）")


if __name__ == "__main__":
    main()
