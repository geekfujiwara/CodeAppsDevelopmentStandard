"""Power Platform カスタムコネクタから MCP Server を呼ぶための OAuth 設定を Entra アプリに追加する。

カスタムコネクタは認可コードフローで動くため、API アプリ登録に以下が必要になる。

1. リダイレクト URI ``https://global.consent.azure-apim.net/redirect``（OpenAPI インポート方式の共通値）
2. クライアントシークレット
3. 自分自身のスコープへの ``requiredResourceAccess``（同意を成立させるため）

オンボーディングウィザードが生成するパス付き Redirect URI は、コネクタ作成後に
``add_connector_redirect_uri.py`` で追加する。

シークレットは **標準出力に出さず**、``--secret-out`` のファイルにだけ書き出す。
ファイルは必ず .gitignore の対象に置くこと。既存ファイルは既定で上書きせず、
意図的な更新時だけ ``--rotate-secret`` を指定する。

使い方:
    python .github/skills/mcp-server/scripts/configure_connector_oauth.py --audience api://<app-id> --secret-out .secrets/connector.json
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import graph_get, graph_patch, graph_post  # noqa: E402

CONNECTOR_REDIRECT_URI = "https://global.consent.azure-apim.net/redirect"


def preflight_secret_output(path: Path, rotate_secret: bool) -> str | None:
    ignored = subprocess.run(
        ["git", "check-ignore", "--no-index", "-q", "--", str(path)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if ignored.returncode != 0:
        raise SystemExit(f"--secret-out が Git ignore されていません: {path}")
    old_key_id = None
    if path.exists():
        if not path.is_file():
            raise SystemExit(f"--secret-out はファイルを指定してください: {path}")
        if not rotate_secret:
            raise SystemExit(
                f"OAuth 設定ファイルは既に存在します: {path}\n"
                "既存の Client secret を使うか、意図的に更新する場合だけ --rotate-secret を指定してください"
            )
        try:
            with path.open("r+b"):
                pass
            old_key_id = json.loads(path.read_text(encoding="utf-8")).get("keyId")
        except (OSError, json.JSONDecodeError) as exc:
            raise SystemExit(f"既存の OAuth 設定ファイルを安全に置換できません: {path}: {exc}") from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent):
            pass
    except OSError as exc:
        raise SystemExit(f"--secret-out の親フォルダへ書き込めません: {path.parent}: {exc}") from exc
    return old_key_id


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
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    try:
        if os.name != "nt":
            temporary.chmod(stat.S_IRUSR | stat.S_IWUSR)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    if os.name != "nt":
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def remove_secret(app: dict, key_id: str) -> None:
    graph_post(f"/applications/{app['id']}/removePassword", {"keyId": key_id})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audience", default=os.getenv("MCP_API_AUDIENCE"), help="api://<app-id>")
    parser.add_argument("--scope", default=os.getenv("MCP_API_SCOPE_VALUE", "MCP.Access"))
    parser.add_argument("--secret-out", default=".secrets/connector-oauth.json")
    parser.add_argument("--secret-name", default="power-platform-custom-connector")
    parser.add_argument("--rotate-secret", action="store_true", help="既存ファイルを置換して新しい secret を発行する")
    args = parser.parse_args()

    if not args.audience:
        raise SystemExit("--audience または MCP_API_AUDIENCE を指定してください")

    out = Path(args.secret_out)
    old_key_id = preflight_secret_output(out, args.rotate_secret)
    if args.rotate_secret and out.exists() and not old_key_id:
        print("[warning] 既存ファイルに keyId がないため、以前の credential は Entra で手動削除してください")
    app = find_application(args.audience)
    ensure_redirect_uri(app)
    ensure_self_permission(app, args.scope)
    secret = create_secret(app, args.secret_name)

    try:
        write_secret_file(
            out,
            {
                "clientId": app["appId"],
                "clientSecret": secret["secretText"],
                "keyId": secret["keyId"],
                "secretExpiresOn": secret["endDateTime"],
                "resourceUri": args.audience,
                "scope": f"{args.audience}/{args.scope}",
                "redirectUri": CONNECTOR_REDIRECT_URI,
            },
        )
    except OSError as exc:
        try:
            remove_secret(app, secret["keyId"])
        except Exception as rollback_exc:
            raise SystemExit(
                "Client secret の保存とロールバックに失敗しました。Entra で新しい credential を削除してください: "
                f"{rollback_exc}"
            ) from exc
        raise SystemExit(f"Client secret を保存できなかったため、発行した credential を削除しました: {exc}") from exc
    if old_key_id and old_key_id != secret["keyId"]:
        remove_secret(app, old_key_id)
        print("[secret] 以前の credential を削除しました")
    print(f"[secret] {out} に書き出しました（値は表示しません）")
    print(f"[info] clientId={app['appId']} / scope={args.audience}/{args.scope}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
