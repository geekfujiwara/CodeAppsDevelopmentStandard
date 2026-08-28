"""Microsoft 365 グループ経由で連携 SharePoint チームサイトを作成する（Graph API・AAD アプリ登録不要）。

★ 重要な制約（references/troubleshooting.md も参照）:
Microsoft Graph v1.0 には「任意の新規 SharePoint サイト（コミュニケーションサイト等）を直接作成する」
汎用 API が無い。本スクリプトは Microsoft 365 グループ（Unified グループ）を作成し、その副作用として
自動プロビジョニングされる「グループ連携チームサイト」を取得する方式を取る。
グループに紐付かないコミュニケーションサイトの作成、サイトのプロパティ更新、サイト（サイトコレクション）の
削除は Graph v1.0 では直接サポートされておらず、SharePoint 管理センター / PnP PowerShell 等が必要。

使い方:
  python create_site.py --display-name "Skill Catalog" --mail-nickname skillcatalogpoc            # 確認のみ
  python create_site.py --display-name "Skill Catalog" --mail-nickname skillcatalogpoc --apply     # 実際に作成
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _graph_common import GRAPH_API, get_graph_session  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="M365 グループ経由で連携チームサイトを作成する")
    ap.add_argument("--display-name", required=True)
    ap.add_argument("--mail-nickname", required=True, help="グループのエイリアス（英数字。スペース不可）")
    ap.add_argument("--description", default="")
    ap.add_argument("--visibility", choices=["Private", "Public"], default="Private")
    ap.add_argument("--apply", action="store_true", help="実際に作成する（既定: 確認のみ）")
    ap.add_argument("--client-id", default=None, help="既定クライアント（Azure CLI 互換）を使う場合は空文字を指定")
    ap.add_argument("--wait-seconds", type=int, default=60, help="サイトプロビジョニング待機の最大秒数")
    args = ap.parse_args()

    session = get_graph_session() if args.client_id is None else get_graph_session(args.client_id or None)

    print(f"[1/2] グループ作成予定: displayName={args.display_name}, mailNickname={args.mail_nickname}")
    if not args.apply:
        print("--apply を付けずに再実行するとここで停止します（確認のみモード）。")
        return 0

    body = {
        "displayName": args.display_name,
        "mailNickname": args.mail_nickname,
        "description": args.description,
        "mailEnabled": True,
        "securityEnabled": False,
        "groupTypes": ["Unified"],
        "visibility": args.visibility,
    }
    resp = session.post(f"{GRAPH_API}/groups", json=body)
    if not resp.ok:
        print("エラー本文:", resp.text)
    resp.raise_for_status()
    group = resp.json()
    group_id = group["id"]
    print(f"   グループを作成しました（id={group_id}）")

    print("[2/2] 連携サイトのプロビジョニングを待機")
    deadline = time.time() + args.wait_seconds
    site = None
    while time.time() < deadline:
        site_resp = session.get(f"{GRAPH_API}/groups/{group_id}/sites/root")
        if site_resp.status_code == 200:
            site = site_resp.json()
            break
        time.sleep(5)

    if site:
        print(f"   サイトが利用可能になりました: {site.get('webUrl')}")
    else:
        print(
            f"   {args.wait_seconds} 秒待っても取得できませんでした。時間を置いてから"
            f" GET /groups/{group_id}/sites/root で再確認してください。"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
