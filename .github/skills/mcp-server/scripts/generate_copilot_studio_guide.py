"""Copilot Studio MCP オンボーディングウィザード用のローカル入力ガイドを生成する。

Client secret を含むため、出力先が Git ignore されていなければ生成を拒否する。
MCP Server ごとに別の出力ファイルを指定すること。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
from pathlib import Path
from urllib.parse import urlparse

SERVER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9.\-]{1,64}$")
REFRESH_SCOPE = "offline_access"


def require(value: str | None, label: str) -> str:
    if not value or not value.strip():
        raise SystemExit(f"{label} を指定してください")
    return value.strip()


def validate_server_name(value: str) -> None:
    if not SERVER_NAME_PATTERN.fullmatch(value):
        raise SystemExit(
            "--server-name は 1～64 文字の英字・数字・ハイフン・ドットだけを使用してください。"
            "日本語や空白は Power Platform の内部コネクタ名で 400 エラーになります"
        )


def validate_server_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise SystemExit("--server-url はクエリとフラグメントを含まない完全な HTTPS URL を指定してください")


def ensure_ignored(path: Path) -> None:
    result = subprocess.run(
        ["git", "check-ignore", "--no-index", "-q", "--", str(path)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        raise SystemExit(
            f"出力先が Git ignore されていません: {path}\n"
            "Client secret の漏えいを防ぐため、先に .gitignore へ追加してください"
        )


def load_secret(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"OAuth 設定ファイルが見つかりません: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    for key in ("clientId", "clientSecret", "resourceUri", "scope"):
        require(payload.get(key), key)
    return payload


def validate_redirect_uri(value: str) -> None:
    parsed = urlparse(value)
    path_prefix = "/redirect/"
    connector_id = parsed.path.removeprefix(path_prefix)
    if (
        parsed.scheme != "https"
        or parsed.netloc.lower() != "global.consent.azure-apim.net"
        or not parsed.path.startswith(path_prefix)
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.\-]*", connector_id)
        or ".." in connector_id
        or parsed.query
        or parsed.fragment
    ):
        raise SystemExit("--redirect-uri には Copilot Studio が表示したパス付き callback URL を指定してください")


def connector_scopes(api_scope: str) -> str:
    scopes = api_scope.split()
    if REFRESH_SCOPE not in scopes:
        scopes.append(REFRESH_SCOPE)
    return " ".join(scopes)


def environment_links(environment_id: str) -> tuple[str, str]:
    base = f"https://make.powerapps.com/environments/{environment_id}"
    studio = f"https://copilotstudio.microsoft.com/environments/{environment_id}/bots"
    return f"{base}/connections", studio


def connection_create_url(environment_id: str, connector_id: str) -> str:
    connector = connector_id.removeprefix("/providers/Microsoft.PowerApps/apis/")
    return (
        f"https://make.preview.powerapps.com/environments/{environment_id}"
        f"/connections/available/{connector}"
    )


def connection_details_url(environment_id: str, connector_id: str, connection_id: str) -> str:
    connector = connector_id.removeprefix("/providers/Microsoft.PowerApps/apis/")
    return (
        f"https://make.preview.powerapps.com/environments/{environment_id}"
        f"/connections/{connector}/{connection_id}/details"
    )


def copilot_studio_user_connections_url(
    tenant_id: str,
    environment_id: str,
    bot_schema_name: str,
    conversation_id: str,
) -> str:
    return (
        f"https://copilotstudio.microsoft.com/c2/tenants/{tenant_id}"
        f"/environments/{environment_id}/bots/{bot_schema_name}/channels/pva-studio"
        f"/conversations/{conversation_id}/user-connections"
    )


def build_markdown(
    *,
    server_name: str,
    server_description: str,
    server_url: str,
    display_name: str,
    tenant_id: str,
    audience: str,
    full_scope: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str | None,
    environment_id: str | None = None,
    connector_id: str | None = None,
    connection_id: str | None = None,
    copilot_studio_bot_schema: str | None = None,
    copilot_studio_conversation_id: str | None = None,
) -> str:
    authorization_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    redirect_section = (
        f"""### Redirect URI (Entra ID)

```text
{redirect_uri}
```
"""
        if redirect_uri
        else """### Redirect URI (Entra ID)

コネクタ作成後に表示される callback URL、または `AADSTS50011` に表示された Redirect URI を
Entra アプリ登録の **認証 > Web > リダイレクト URI** に追加する。
"""
    )
    links_section = ""
    if environment_id:
        connections_url, _ = environment_links(environment_id)
        create_link = ""
        connection_link = ""
        studio_link = ""
        if connector_id:
            create_url = connection_create_url(environment_id, connector_id)
            create_link = f"- Power Apps このコネクタから新規作成: {create_url}\n"
            if connection_id:
                details_url = connection_details_url(environment_id, connector_id, connection_id)
                connection_link = f"- Power Apps 作成済み接続の詳細: {details_url}\n"
        if copilot_studio_bot_schema and copilot_studio_conversation_id:
            studio_url = copilot_studio_user_connections_url(
                tenant_id,
                environment_id,
                copilot_studio_bot_schema,
                copilot_studio_conversation_id,
            )
            studio_link = f"- Microsoft Copilot Studio 接続管理: {studio_url}\n"
        links_section = f"""## 接続作成リンク

{create_link}{connection_link}{studio_link}- Power Apps 接続一覧: {connections_url}

接続作成、組織アカウントでのサインインと同意、Copilot Studio での接続選択は利用者本人が行う。

"""
    return f"""# {display_name}

{links_section}## コネクタ接続時に利用可能

### Display name (optional)

```text
{display_name}
```

{redirect_section}
## Add MCP server

### Server name

```text
{server_name}
```

### Server description

```text
{server_description}
```

### Server URL

```text
{server_url}
```

### Authentication

```text
OAuth 2.0
```

### Configuration type

```text
Manual
```

### Client ID

```text
{client_id}
```

### Client secret

```text
{client_secret}
```

### Authorization URL

```text
{authorization_url}
```

### Token URL

```text
{token_url}
```

### Refresh token URL

```text
{token_url}
```

### Scopes

```text
{connector_scopes(full_scope)}
```
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Copilot Studio MCP 接続ガイドを安全に生成する")
    parser.add_argument("--server-name", default=os.getenv("MCP_CONNECTOR_SERVER_NAME"))
    parser.add_argument(
        "--server-description",
        "--description",
        dest="server_description",
        default=os.getenv("MCP_CONNECTOR_SERVER_DESCRIPTION"),
    )
    parser.add_argument(
        "--server-url",
        "--url",
        dest="server_url",
        default=os.getenv("MCP_CONNECTOR_SERVER_URL"),
    )
    parser.add_argument("--display-name", default=os.getenv("MCP_CONNECTOR_DISPLAY_NAME"))
    parser.add_argument("--tenant-id", default=os.getenv("ENTRA_TENANT_ID"))
    parser.add_argument("--environment-id", default=os.getenv("POWER_PLATFORM_ENVIRONMENT_ID"))
    parser.add_argument("--connector-id", default=os.getenv("MCP_CONNECTOR_ID"))
    parser.add_argument("--connection-id", default=os.getenv("MCP_CONNECTION_ID"))
    parser.add_argument("--copilot-studio-bot-schema", default=os.getenv("COPILOT_STUDIO_BOT_SCHEMA"))
    parser.add_argument("--copilot-studio-conversation-id", default=os.getenv("COPILOT_STUDIO_CONVERSATION_ID"))
    parser.add_argument("--audience", default=os.getenv("MCP_API_AUDIENCE"))
    parser.add_argument("--scope", default=os.getenv("MCP_API_SCOPE_VALUE"))
    parser.add_argument(
        "--secret-file",
        default=os.getenv("CONNECTOR_SECRET_OUT", ".secrets/connector-oauth.json"),
    )
    parser.add_argument("--redirect-uri", help="コネクタ作成後に判明した callback URL")
    parser.add_argument("--output", default=os.getenv("MCP_CONNECTOR_GUIDE_OUT"))
    args = parser.parse_args()

    if args.connection_id and not args.connector_id:
        raise SystemExit("--connection-id を指定する場合は --connector-id も必要です")
    if (args.connector_id or args.connection_id) and not args.environment_id:
        raise SystemExit("接続URLの生成には --environment-id が必要です")
    studio_values = (args.copilot_studio_bot_schema, args.copilot_studio_conversation_id)
    if any(studio_values) and not all(studio_values):
        raise SystemExit("Copilot Studio URLにはbot schemaとconversation IDの両方が必要です")
    if any(studio_values) and not args.environment_id:
        raise SystemExit("Copilot Studio URLの生成には --environment-id が必要です")

    server_name = require(args.server_name, "--server-name")
    server_description = require(args.server_description, "--server-description")
    server_url = require(args.server_url, "--server-url")
    tenant_id = require(args.tenant_id, "--tenant-id")
    audience = require(args.audience, "--audience")
    output = Path(require(args.output, "--output"))
    display_name = args.display_name.strip() if args.display_name and args.display_name.strip() else server_name

    validate_server_name(server_name)
    validate_server_url(server_url)
    if args.redirect_uri:
        validate_redirect_uri(args.redirect_uri)
    ensure_ignored(output)
    oauth = load_secret(Path(args.secret_file))
    if oauth["resourceUri"].rstrip("/") != audience.rstrip("/"):
        raise SystemExit("OAuth 設定ファイルの resourceUri と --audience が一致しません")
    stored_scope = oauth["scope"]
    if args.scope:
        expected_scope = f"{audience.rstrip('/')}/{args.scope}"
        if stored_scope != expected_scope:
            raise SystemExit("OAuth 設定ファイルの scope と --scope が一致しません")
    else:
        expected_scope = stored_scope

    markdown = build_markdown(
        server_name=server_name,
        server_description=server_description,
        server_url=server_url,
        display_name=display_name,
        tenant_id=tenant_id,
        audience=audience,
        full_scope=expected_scope,
        client_id=oauth["clientId"],
        client_secret=oauth["clientSecret"],
        redirect_uri=args.redirect_uri,
        environment_id=args.environment_id.strip() if args.environment_id else None,
        connector_id=args.connector_id.strip() if args.connector_id else None,
        connection_id=args.connection_id.strip() if args.connection_id else None,
        copilot_studio_bot_schema=args.copilot_studio_bot_schema.strip() if args.copilot_studio_bot_schema else None,
        copilot_studio_conversation_id=(
            args.copilot_studio_conversation_id.strip() if args.copilot_studio_conversation_id else None
        ),
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markdown, encoding="utf-8")
    if os.name != "nt":
        output.chmod(stat.S_IRUSR | stat.S_IWUSR)
    print(f"[guide] {output} を生成しました（Client secret は表示しません）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())