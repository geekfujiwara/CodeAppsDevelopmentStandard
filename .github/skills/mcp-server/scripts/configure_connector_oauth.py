"""Power Platform カスタムコネクタから MCP Server を呼ぶための OAuth 設定を Entra アプリに追加する。

カスタムコネクタは認可コードフローで動くため、API アプリ登録に以下が必要になる。

1. リダイレクト URI ``https://global.consent.azure-apim.net/redirect``（コネクタ共通の固定値）
2. クライアントシークレット
3. 自分自身のスコープへの ``requiredResourceAccess``（同意を成立させるため）

シークレットは **標準出力に出さず**、``--secret-out`` のファイルにだけ書き出す。
ファイルは必ず .gitignore の対象に置くこと。

使い方:
    python .github/skills/mcp-server/scripts/configure_connector_oauth.py --audience api://<app-id> --secret-out .secrets/connector.json
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import graph_get, graph_patch, graph_post  # noqa: E402

CONNECTOR_REDIRECT_URI = "https://global.consent.azure-apim.net/redirect"


def find_application(audience: str) -> dict:
    apps = graph_get(f"/applications?$filter=identifierUris/any(u:u eq '{audience}')")["value"]
    if not apps:
        raise SystemExit(f"identifierUris に {audience} を持つアプリ登録が見つかりません")
    return apps[0]


def ensure_redirect_uri(app: dict) -> None:
    uris = app.get("web", {}).get("redirectUris", [])
    if CONNECTOR_REDIRECT_URI in uris:
        print("[skip] リダイレクト URI は登録済み")
        return
    graph_patch(f"/applications/{app['id']}", {"web": {"redirectUris": [*uris, CONNECTOR_REDIRECT_URI]}})
    print(f"[app] リダイレクト URI を追加: {CONNECTOR_REDIRECT_URI}")


def ensure_self_permission(app: dict, scope_name: str) -> str:
    scopes = app.get("api", {}).get("oauth2PermissionScopes", [])
    scope = next((s for s in scopes if s["value"] == scope_name), None)
    if not scope:
        raise SystemExit(f"スコープ {scope_name} が公開されていません。configure_entra_api.py を先に実行してください")

    required = app.get("requiredResourceAccess", [])
    entry = next((r for r in required if r["resourceAppId"] == app["appId"]), None)
    if entry and any(a["id"] == scope["id"] for a in entry.get("resourceAccess", [])):
        print("[skip] 自分自身のスコープへの委任アクセスは設定済み")
        return scope["id"]

    access = {"id": scope["id"], "type": "Scope"}
    if entry:
        entry["resourceAccess"].append(access)
    else:
        required.append({"resourceAppId": app["appId"], "resourceAccess": [access]})
    graph_patch(f"/applications/{app['id']}", {"requiredResourceAccess": required})
    print(f"[app] 自分自身のスコープ {scope_name} への委任アクセスを追加")
    return scope["id"]


def create_secret(app: dict, display_name: str) -> dict:
    return graph_post(
        f"/applications/{app['id']}/addPassword",
        {"passwordCredential": {"displayName": display_name}},
    )


def write_secret_file(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if os.name != "nt":
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audience", default=os.getenv("MCP_API_AUDIENCE"), help="api://<app-id>")
    parser.add_argument("--scope", default=os.getenv("MCP_API_SCOPE_VALUE", "MCP.Access"))
    parser.add_argument("--secret-out", default=".secrets/connector-oauth.json")
    parser.add_argument("--secret-name", default="power-platform-custom-connector")
    args = parser.parse_args()

    if not args.audience:
        raise SystemExit("--audience または MCP_API_AUDIENCE を指定してください")

    app = find_application(args.audience)
    ensure_redirect_uri(app)
    ensure_self_permission(app, args.scope)
    secret = create_secret(app, args.secret_name)

    out = Path(args.secret_out)
    write_secret_file(
        out,
        {
            "clientId": app["appId"],
            "clientSecret": secret["secretText"],
            "secretExpiresOn": secret["endDateTime"],
            "resourceUri": args.audience,
            "scope": f"{args.audience}/{args.scope}",
            "redirectUri": CONNECTOR_REDIRECT_URI,
        },
    )
    print(f"[secret] {out} に書き出しました（値は表示しません）")
    print(f"[info] clientId={app['appId']} / scope={args.audience}/{args.scope}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
