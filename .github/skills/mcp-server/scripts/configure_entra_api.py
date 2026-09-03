"""MCP Server 用の Entra アプリ登録に API スコープを公開し、クライアントを事前承認する。

auth_helper のキャッシュ認証で Microsoft Graph を呼ぶため Azure CLI ログインは不要。

使い方:
    python .github/skills/mcp-server/scripts/configure_entra_api.py
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import graph_get, graph_patch  # noqa: E402

# auth_helper / Azure CLI / Azure PowerShell が使う Microsoft 発行のパブリッククライアント
DEFAULT_PREAUTH_CLIENT_IDS = [
    "04b07795-8ddb-461a-bbee-02f9e1bf7b46",  # Microsoft Azure CLI
    "1950a258-227b-4e31-a9cf-717495945fc2",  # Microsoft Azure PowerShell
]


def _new_scope(scope_value: str) -> dict:
    label = "MCP サーバーへのアクセス"
    description = "MCP サーバーのツールを呼び出す権限"
    return {
        "id": str(uuid.uuid4()),
        "value": scope_value,
        "type": "User",
        "isEnabled": True,
        "adminConsentDisplayName": label,
        "adminConsentDescription": description,
        "userConsentDisplayName": label,
        "userConsentDescription": description,
    }


def main() -> int:
    app_id = os.getenv("MCP_API_APP_ID")
    if not app_id:
        print("MCP_API_APP_ID を .env に設定してください")
        return 1
    scope_value = os.getenv("MCP_API_SCOPE_VALUE", "MCP.Access")
    preauth = [c.strip() for c in os.getenv("MCP_PREAUTH_CLIENT_IDS", "").split(",") if c.strip()]
    preauth = preauth or DEFAULT_PREAUTH_CLIENT_IDS

    app = graph_get(f"/applications(appId='{app_id}')")
    object_id = app["id"]
    api = app.get("api") or {}
    scopes = api.get("oauth2PermissionScopes") or []

    scope = next((s for s in scopes if s["value"] == scope_value), None)
    if scope is None:
        scope = _new_scope(scope_value)
        scopes.append(scope)
        print(f"スコープ {scope_value} を追加します")
    else:
        print(f"スコープ {scope_value} は既に存在します")

    # スコープ登録と事前承認を同一 PATCH で送ると新規スコープ ID が未登録扱いになるため分割する
    graph_patch(
        f"/applications/{object_id}",
        {
            "identifierUris": app.get("identifierUris") or [f"api://{app_id}"],
            "api": {**api, "oauth2PermissionScopes": scopes},
        },
    )
    graph_patch(
        f"/applications/{object_id}",
        {
            "api": {
                "preAuthorizedApplications": [
                    {"appId": cid, "delegatedPermissionIds": [scope["id"]]} for cid in preauth
                ]
            }
        },
    )
    print(f"アプリ登録を更新しました（スコープ公開 + クライアント {len(preauth)} 件の事前承認）")
    print(f"audience: api://{app_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
