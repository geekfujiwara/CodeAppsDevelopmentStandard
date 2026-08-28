"""SharePoint のドキュメントライブラリにファイルをアップロードする（Graph API・AAD アプリ登録不要）。

250MB 以下のファイル向け（単純アップロード）。それ以上は分割アップロードセッションが必要で本スクリプト未対応。

使い方:
  python upload_file.py --site-url <URL> --local-path ./image.png --remote-path "SkillCatalog/image.png"
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _graph_common import GRAPH_API, get_graph_session, resolve_site_id  # noqa: E402

MAX_SIMPLE_UPLOAD_BYTES = 250 * 1024 * 1024


def main() -> int:
    ap = argparse.ArgumentParser(description="SharePoint ドキュメントライブラリにファイルをアップロードする")
    ap.add_argument("--site-url", help="SharePoint サイト URL（既定: .env SHAREPOINT_SITE_URL）")
    ap.add_argument("--local-path", required=True, help="アップロードするローカルファイルのパス")
    ap.add_argument(
        "--remote-path",
        required=True,
        help="既定ドキュメントライブラリ（drive root）からの相対パス（例: 'SkillCatalog/image.png'）",
    )
    ap.add_argument("--client-id", default=None, help="既定クライアント（Azure CLI 互換）を使う場合は空文字を指定")
    args = ap.parse_args()

    site_url = args.site_url or os.environ.get("SHAREPOINT_SITE_URL", "")
    if not site_url:
        sys.exit("--site-url または .env の SHAREPOINT_SITE_URL を指定してください。")

    local_path = Path(args.local_path)
    if not local_path.is_file():
        sys.exit(f"ローカルファイルが見つかりません: {local_path}")
    size = local_path.stat().st_size
    if size > MAX_SIMPLE_UPLOAD_BYTES:
        sys.exit(f"ファイルサイズが 250MB を超えています（{size} bytes）。分割アップロードは本スクリプト未対応。")

    session = get_graph_session() if args.client_id is None else get_graph_session(args.client_id or None)
    site_id = resolve_site_id(session, site_url)

    remote_path = args.remote_path.strip("/")
    data = local_path.read_bytes()
    resp = session.put(
        f"{GRAPH_API}/sites/{site_id}/drive/root:/{remote_path}:/content",
        data=data,
        headers={"Content-Type": "application/octet-stream"},
    )
    if not resp.ok:
        print("エラー本文:", resp.text)
    resp.raise_for_status()
    item = resp.json()
    print(f"アップロードしました: {item.get('webUrl')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
