"""Copilot Studio のコネクタ固有 Redirect URI を Entra アプリへ追加する。

既存の Web redirect URI は保持し、Client secret は作成・更新しない。
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import graph_get, graph_patch  # noqa: E402

REDIRECT_HOST = "global.consent.azure-apim.net"
REDIRECT_PATH_PREFIX = "/redirect/"
CONNECTOR_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-]*$")


def validate_redirect_uri(value: str) -> None:
    parsed = urlparse(value)
    connector_id = parsed.path.removeprefix(REDIRECT_PATH_PREFIX)
    if (
        parsed.scheme != "https"
        or parsed.netloc.lower() != REDIRECT_HOST
        or not parsed.path.startswith(REDIRECT_PATH_PREFIX)
        or not CONNECTOR_ID_PATTERN.fullmatch(connector_id)
        or ".." in connector_id
        or parsed.query
        or parsed.fragment
    ):
        raise SystemExit(
            "--redirect-uri には Copilot Studio が表示した "
            f"https://{REDIRECT_HOST}{REDIRECT_PATH_PREFIX}<connector-id> をそのまま指定してください"
        )


def find_application(audience: str) -> dict:
    apps = graph_get(f"/applications?$filter=identifierUris/any(u:u eq '{audience}')")['value']
    if len(apps) != 1:
        raise SystemExit(f"identifierUris={audience} のアプリ登録が一意に見つかりません: {len(apps)} 件")
    return apps[0]


def add_redirect_uri(audience: str, redirect_uri: str) -> bool:
    app = find_application(audience)
    web = app.get("web") or {}
    redirect_uris = web.get("redirectUris") or []
    if redirect_uri in redirect_uris:
        return False

    graph_patch(
        f"/applications/{app['id']}",
        {"web": {**web, "redirectUris": [*redirect_uris, redirect_uri]}},
    )
    verified = graph_get(f"/applications/{app['id']}?$select=web")
    if redirect_uri not in ((verified.get("web") or {}).get("redirectUris") or []):
        raise SystemExit("Redirect URI の追加後検証に失敗しました")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="コネクタ固有 Redirect URI を Entra アプリへ追加する")
    parser.add_argument("--audience", default=os.getenv("MCP_API_AUDIENCE"), help="api://<app-id>")
    parser.add_argument("--redirect-uri", required=True, help="callback URL または AADSTS50011 に表示された URI")
    args = parser.parse_args()

    if not args.audience:
        raise SystemExit("--audience または MCP_API_AUDIENCE を指定してください")
    validate_redirect_uri(args.redirect_uri)
    changed = add_redirect_uri(args.audience, args.redirect_uri)
    status = "added" if changed else "already registered"
    print(f"[redirect] {status}: {args.redirect_uri}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())