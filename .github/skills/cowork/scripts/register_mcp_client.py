"""Dataverse の許可 MCP クライアント（allowedmcpclients）を登録・有効化・確認する。

Cowork プラグインを OAuth 2.0 認可コードフローで動かす場合、Dataverse に提示される
トークンの appid は **カスタムの Entra アプリ**になる。そのため、その Client ID を
`allowedmcpclients` テーブルに登録して有効化しないと、認証は通ってもデータ取得で失敗する。

このスクリプトは汎用で、どのテナント／環境でも動く。値は引数または環境変数(.env)から取る。
認証は standard スキルの auth_helper（DeviceCodeCredential + 永続キャッシュ）を再利用する。

前提:
  - リポジトリルートの .env に DATAVERSE_URL / TENANT_ID（auth_helper が参照）。
  - app id は引数 --app-id か、環境変数 COWORK_OAUTH_CLIENT_ID から取得。
  - name 未指定時は uniquename を <PUBLISHER_PREFIX>_coworkdataversemcp として生成。

使い方:
  # 一覧表示
  python register_mcp_client.py --list

  # 登録（未登録なら作成、既存なら有効化）。app id は .env の COWORK_OAUTH_CLIENT_ID を使用
  python register_mcp_client.py

  # app id を明示して登録
  python register_mcp_client.py --app-id <CLIENT_ID> --name "Cowork Dataverse MCP"

  # 無効化
  python register_mcp_client.py --app-id <CLIENT_ID> --disable

  # 特定 app id の状態確認のみ（変更なし）
  python register_mcp_client.py --app-id <CLIENT_ID> --check
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

# standard スキルの auth_helper を再利用する（リポジトリ内の相対パスを解決）
_THIS = Path(__file__).resolve()
_STANDARD_SCRIPTS = None
for parent in _THIS.parents:
    cand = parent / ".github" / "skills" / "standard" / "scripts"
    if cand.is_dir():
        _STANDARD_SCRIPTS = cand
        break
if _STANDARD_SCRIPTS is None:
    sys.exit("auth_helper が見つかりません（.github/skills/standard/scripts）。リポジトリ内で実行してください。")
sys.path.insert(0, str(_STANDARD_SCRIPTS))

from auth_helper import get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2/allowedmcpclients"
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(text: str) -> str:
    return _SLUG_RE.sub("", text.lower())


def fetch_clients(session) -> list[dict]:
    url = f"{API}?$select=allowedmcpclientid,name,uniquename,applicationid,isenabled"
    r = session.get(url)
    r.raise_for_status()
    return r.json().get("value", [])


def find_by_appid(clients: list[dict], app_id: str) -> dict | None:
    app_id = (app_id or "").lower()
    return next((c for c in clients if (c.get("applicationid") or "").lower() == app_id), None)


def print_clients(clients: list[dict]) -> None:
    print(f"登録済み MCP クライアント: {len(clients)} 件")
    for c in clients:
        mark = "✅" if c.get("isenabled") else "❌"
        print(f"  {mark} {c.get('name')} (uniquename={c.get('uniquename')}, "
              f"appid={c.get('applicationid')}, enabled={c.get('isenabled')})")


def set_enabled(session, record_id: str, enabled: bool) -> None:
    r = session.patch(
        f"{API}({record_id})",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"isenabled": enabled}),
    )
    r.raise_for_status()


def create_client(session, app_id: str, name: str, uniquename: str, enabled: bool) -> None:
    body = {"name": name, "uniquename": uniquename, "applicationid": app_id, "isenabled": enabled}
    r = session.post(API, headers={"Content-Type": "application/json"}, data=json.dumps(body))
    r.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser(description="Dataverse allowedmcpclients の登録/有効化/確認")
    parser.add_argument("--app-id", default=os.getenv("COWORK_OAUTH_CLIENT_ID", ""),
                        help="登録する Entra アプリの Client ID（既定: .env の COWORK_OAUTH_CLIENT_ID）")
    parser.add_argument("--name", default="Cowork Dataverse MCP",
                        help="表示名（既定: 'Cowork Dataverse MCP'）")
    parser.add_argument("--uniquename", default="",
                        help="一意名（既定: <PUBLISHER_PREFIX>_<name のスラッグ>）")
    parser.add_argument("--list", action="store_true", help="登録済みクライアント一覧を表示して終了")
    parser.add_argument("--check", action="store_true", help="状態確認のみ（変更しない）")
    parser.add_argument("--disable", action="store_true", help="対象を無効化する")
    args = parser.parse_args()

    session = get_session()
    clients = fetch_clients(session)

    if args.list:
        print_clients(clients)
        return 0

    if not args.app_id:
        print("❌ Client ID が未指定です。--app-id か .env の COWORK_OAUTH_CLIENT_ID を設定してください。",
              file=sys.stderr)
        return 2

    existing = find_by_appid(clients, args.app_id)

    if args.check:
        if existing is None:
            print(f"❌ 未登録: appid={args.app_id}")
            return 1
        mark = "✅" if existing.get("isenabled") else "❌"
        print(f"{mark} {existing.get('name')} appid={args.app_id} enabled={existing.get('isenabled')}")
        return 0 if existing.get("isenabled") else 1

    target_enabled = not args.disable

    if existing is not None:
        if existing.get("isenabled") == target_enabled:
            print(f"ℹ️ 変更なし: {existing.get('name')} は既に enabled={target_enabled} です。")
            return 0
        set_enabled(session, existing["allowedmcpclientid"], target_enabled)
        print(f"✅ 更新しました: {existing.get('name')} enabled={target_enabled}")
        return 0

    if args.disable:
        print(f"ℹ️ 対象が未登録のため無効化は不要です: appid={args.app_id}")
        return 0

    prefix = os.getenv("PUBLISHER_PREFIX", "new")
    uniquename = args.uniquename or f"{prefix}_{_slug(args.name)}"
    create_client(session, args.app_id, args.name, uniquename, enabled=True)
    print(f"✅ 登録しました: name='{args.name}' uniquename='{uniquename}' "
          f"appid={args.app_id} enabled=True")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
