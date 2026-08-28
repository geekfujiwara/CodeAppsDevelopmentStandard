"""SharePoint サイトにドキュメントライブラリ（リスト）と列を作成する（Graph API・AAD アプリ登録不要）。

使い方:
  python create_list.py --site-url <SharePointサイトURL> --list-name <リスト名> --columns <columns.jsonへのパス>
  python create_list.py --site-url ... --list-name ... --columns ... --apply   # 実際に作成

設定（引数 > .env）:
  SHAREPOINT_SITE_URL  対象 SharePoint サイト URL
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _graph_common import GRAPH_API, get_graph_session, resolve_site_id  # noqa: E402

# SharePoint の非表示システム列と displayName が衝突しやすい名前（作成時に自動リネームされ、
# 冪等性チェックが効かず重複作成される）。詳細は references/troubleshooting.md 参照。
RESERVED_DISPLAY_NAME_COLLISIONS = {"Description", "Version", "Title", "Name", "Type"}


def main() -> int:
    ap = argparse.ArgumentParser(description="SharePoint にドキュメントライブラリと列を作成する（AAD アプリ登録不要）")
    ap.add_argument("--site-url", help="SharePoint サイト URL（既定: .env SHAREPOINT_SITE_URL）")
    ap.add_argument("--list-name", required=True, help="作成するリスト（ライブラリ）の displayName")
    ap.add_argument("--columns", help="列定義 JSON ファイルへのパス（columnDefinition の配列）。省略時は列無しで作成")
    ap.add_argument("--template", default="documentLibrary", help="リストテンプレート（既定: documentLibrary。汎用リストは genericList）")
    ap.add_argument("--apply", action="store_true", help="実際に作成する（既定: 確認のみ）")
    ap.add_argument(
        "--client-id",
        default=None,
        help="Graph トークン取得に使うクライアント ID（既定: _graph_common の GRAPH_POWERSHELL_CLIENT_ID）。"
        " 既定クライアント（Azure CLI 互換）を使いたい場合は空文字を指定する",
    )
    args = ap.parse_args()

    site_url = args.site_url or os.environ.get("SHAREPOINT_SITE_URL", "")
    if not site_url:
        sys.exit("--site-url または .env の SHAREPOINT_SITE_URL を指定してください。")

    columns: list[dict] = json.loads(Path(args.columns).read_text(encoding="utf-8")) if args.columns else []
    for col in columns:
        if col.get("name") in RESERVED_DISPLAY_NAME_COLLISIONS:
            print(
                f"⚠️  列名 '{col['name']}' は SharePoint の非表示システム列と衝突する可能性があります。"
                " references/troubleshooting.md を参照し、別名を検討してください。",
                file=sys.stderr,
            )

    session = get_graph_session() if args.client_id is None else get_graph_session(args.client_id or None)
    site_id = resolve_site_id(session, site_url)
    print(f"サイト id = {site_id}")

    print("[1/2] 既存リストを確認")
    resp = session.get(f"{GRAPH_API}/sites/{site_id}/lists?$select=id,name,displayName")
    resp.raise_for_status()
    existing = resp.json().get("value", [])
    match = next((item for item in existing if item.get("displayName") == args.list_name), None)

    if match:
        print(f"   既存: '{args.list_name}' は既に存在します（id={match['id']}）。作成をスキップします。")
        list_id = match["id"]
    else:
        print(f"   '{args.list_name}' は未作成です。")
        if not args.apply:
            print("   --apply を付けずに再実行するとここで停止します（確認のみモード）。")
            return 0
        create_resp = session.post(
            f"{GRAPH_API}/sites/{site_id}/lists",
            json={"displayName": args.list_name, "list": {"template": args.template}},
        )
        if not create_resp.ok:
            print("   エラー本文:", create_resp.text)
        create_resp.raise_for_status()
        list_id = create_resp.json()["id"]
        print(f"   作成しました（id={list_id}）")

    if not columns:
        return 0

    print("[2/2] 列を作成")
    resp = session.get(f"{GRAPH_API}/sites/{site_id}/lists/{list_id}/columns?$select=name")
    resp.raise_for_status()
    existing_columns = {c["name"] for c in resp.json().get("value", [])}

    for column in columns:
        if column["name"] in existing_columns:
            print(f"   スキップ（既存）: {column['name']}")
            continue
        if not args.apply:
            print(f"   作成予定: {column['name']}")
            continue
        col_resp = session.post(f"{GRAPH_API}/sites/{site_id}/lists/{list_id}/columns", json=column)
        if not col_resp.ok:
            print(f"   エラー本文: {col_resp.text}")
        col_resp.raise_for_status()
        print(f"   作成しました: {column['name']}")

    if not args.apply:
        print("\n確認のみモードで終了しました。--apply を付けて再実行すると実際に作成します。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
