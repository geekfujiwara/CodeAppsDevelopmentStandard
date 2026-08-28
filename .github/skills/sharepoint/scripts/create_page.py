"""SharePoint サイトにページ（sitePage）を作成する（Graph API・AAD アプリ登録不要）。

使い方:
  python create_page.py --site-url <URL> --page-name skill-catalog.aspx --title "スキルカタログ" --html "<p>本文</p>"
  python create_page.py --site-url <URL> --page-name ... --title ... --publish   # 作成後に公開まで行う
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _graph_common import GRAPH_API, get_graph_session, resolve_site_id  # noqa: E402

# サンプルの Text web part（Graph がサポートする web part の1つ）。
_TEXT_WEBPART_ID = "6f9230af-2a98-4952-b205-9ede4f9ef548"


def main() -> int:
    ap = argparse.ArgumentParser(description="SharePoint サイトにページを作成する")
    ap.add_argument("--site-url", help="SharePoint サイト URL（既定: .env SHAREPOINT_SITE_URL）")
    ap.add_argument("--page-name", required=True, help="ページファイル名（例: skill-catalog.aspx）")
    ap.add_argument("--title", required=True)
    ap.add_argument("--html", default="<p>本文</p>", help="1カラム・1テキスト web part のページ本文（HTML）")
    ap.add_argument("--publish", action="store_true", help="作成後に公開する")
    ap.add_argument("--client-id", default=None, help="既定クライアント（Azure CLI 互換）を使う場合は空文字を指定")
    args = ap.parse_args()

    site_url = args.site_url or os.environ.get("SHAREPOINT_SITE_URL", "")
    if not site_url:
        sys.exit("--site-url または .env の SHAREPOINT_SITE_URL を指定してください。")

    session = get_graph_session() if args.client_id is None else get_graph_session(args.client_id or None)
    site_id = resolve_site_id(session, site_url)

    body = {
        "@odata.type": "#microsoft.graph.sitePage",
        "name": args.page_name,
        "title": args.title,
        "pageLayout": "article",
        "canvasLayout": {
            "horizontalSections": [
                {
                    "id": "1",
                    "layout": "oneColumn",
                    "columns": [
                        {"id": "1", "width": 12, "webparts": [{"id": _TEXT_WEBPART_ID, "innerHtml": args.html}]}
                    ],
                }
            ]
        },
    }
    resp = session.post(f"{GRAPH_API}/sites/{site_id}/pages", json=body)
    if not resp.ok:
        print("エラー本文:", resp.text)
    resp.raise_for_status()
    page = resp.json()
    print(f"作成しました: {page.get('webUrl')} (id={page['id']})")

    if args.publish:
        pub_resp = session.post(f"{GRAPH_API}/sites/{site_id}/pages/{page['id']}/microsoft.graph.sitePage/publish")
        if pub_resp.status_code not in (200, 204):
            print("公開エラー本文:", pub_resp.text)
        pub_resp.raise_for_status()
        print("公開しました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
