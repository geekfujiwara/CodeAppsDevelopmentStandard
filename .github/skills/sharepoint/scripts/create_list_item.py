"""SharePoint リストに項目（行）を1件登録する（Graph API・AAD アプリ登録不要）。

使い方:
  python create_list_item.py --site-url <URL> --list-name <リスト名> --fields '{"Title":"Widget"}'
  python create_list_item.py --site-url <URL> --list-name <リスト名> --fields path/to/fields.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _graph_common import GRAPH_API, get_graph_session, resolve_list_id, resolve_site_id  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="SharePoint リストに項目を1件登録する")
    ap.add_argument("--site-url", help="SharePoint サイト URL（既定: .env SHAREPOINT_SITE_URL）")
    ap.add_argument("--list-name", required=True, help="登録先リストの displayName")
    ap.add_argument("--fields", required=True, help="登録する列と値の JSON 文字列、または JSON ファイルへのパス")
    ap.add_argument("--client-id", default=None, help="既定クライアント（Azure CLI 互換）を使う場合は空文字を指定")
    args = ap.parse_args()

    site_url = args.site_url or os.environ.get("SHAREPOINT_SITE_URL", "")
    if not site_url:
        sys.exit("--site-url または .env の SHAREPOINT_SITE_URL を指定してください。")

    fields_path = Path(args.fields)
    fields = json.loads(fields_path.read_text(encoding="utf-8")) if fields_path.is_file() else json.loads(args.fields)

    session = get_graph_session() if args.client_id is None else get_graph_session(args.client_id or None)
    site_id = resolve_site_id(session, site_url)
    list_id = resolve_list_id(session, site_id, args.list_name)
    if not list_id:
        sys.exit(f"リスト '{args.list_name}' が見つかりません。先に create_list.py で作成してください。")

    resp = session.post(f"{GRAPH_API}/sites/{site_id}/lists/{list_id}/items", json={"fields": fields})
    if not resp.ok:
        print("エラー本文:", resp.text)
    resp.raise_for_status()
    item = resp.json()
    print(f"作成しました: item id={item['id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
