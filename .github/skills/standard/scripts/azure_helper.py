"""Azure ARM / Graph 操作の共通ヘルパー。

``auth_helper`` のキャッシュ済み認証を使うため **Azure CLI へのログインは不要**。
初回のみデバイスコード認証が走り、以降はサイレントで非対話に完走する。

```python
from azure_helper import arm_get, arm_post, get_app_settings, get_sql_access_token

settings = get_app_settings(sub_id, "rg-example", "func-example")
token = get_sql_access_token()
```

`az` コマンドは使わない（テナント列挙でハングする・セッション失効で手順が止まるため）。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from auth_helper import get_token  # noqa: E402

ARM_BASE = "https://management.azure.com"
ARM_SCOPE = "https://management.azure.com/.default"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
SQL_SCOPE = "https://database.windows.net/.default"

DEFAULT_ARM_API_VERSION = os.getenv("ARM_API_VERSION", "2023-12-01")
_TIMEOUT = 180


def _headers(scope: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {get_token(scope=scope)}", "Content-Type": "application/json"}


def _check(res: requests.Response, what: str) -> Any:
    if res.status_code >= 400:
        raise RuntimeError(f"{what} が失敗しました: {res.status_code} {res.text}")
    return res.json() if res.content else None


def _arm_url(path: str, api_version: str) -> str:
    sep = "&" if "?" in path else "?"
    return f"{ARM_BASE}{path}{sep}api-version={api_version}"


def arm_get(path: str, api_version: str = DEFAULT_ARM_API_VERSION) -> Any:
    """ARM の GET。``path`` は ``/subscriptions/...`` 形式。"""
    return _check(requests.get(_arm_url(path, api_version), headers=_headers(ARM_SCOPE), timeout=_TIMEOUT), f"GET {path}")


def arm_post(path: str, body: dict | None = None, api_version: str = DEFAULT_ARM_API_VERSION) -> Any:
    """ARM の POST。"""
    res = requests.post(_arm_url(path, api_version), headers=_headers(ARM_SCOPE), json=body or {}, timeout=_TIMEOUT)
    return _check(res, f"POST {path}")


def arm_put(path: str, body: dict, api_version: str = DEFAULT_ARM_API_VERSION) -> Any:
    """ARM の PUT。"""
    res = requests.put(_arm_url(path, api_version), headers=_headers(ARM_SCOPE), json=body, timeout=_TIMEOUT)
    return _check(res, f"PUT {path}")


def arm_patch(path: str, body: dict, api_version: str = DEFAULT_ARM_API_VERSION) -> Any:
    """ARM の PATCH。"""
    res = requests.patch(_arm_url(path, api_version), headers=_headers(ARM_SCOPE), json=body, timeout=_TIMEOUT)
    return _check(res, f"PATCH {path}")


def graph_get(path: str) -> Any:
    """Microsoft Graph の GET。``path`` は ``/applications`` 形式。"""
    return _check(requests.get(f"{GRAPH_BASE}{path}", headers=_headers(GRAPH_SCOPE), timeout=_TIMEOUT), f"GET {path}")


def graph_patch(path: str, body: dict) -> Any:
    """Microsoft Graph の PATCH。"""
    res = requests.patch(f"{GRAPH_BASE}{path}", headers=_headers(GRAPH_SCOPE), json=body, timeout=_TIMEOUT)
    return _check(res, f"PATCH {path}")


def get_sql_access_token() -> str:
    """Azure SQL（Entra ID 認証）用のアクセストークンを返す。"""
    return get_token(scope=SQL_SCOPE)


def get_api_access_token(audience: str) -> str:
    """自前 API（MCP Server 等）用のアクセストークンを返す。

    ``AADSTS650057`` になる場合はアプリ登録側でスコープ公開とクライアント事前承認が未設定。
    """
    return get_token(scope=f"{audience.rstrip('/')}/.default")


def get_app_settings(subscription_id: str, resource_group: str, site_name: str) -> dict[str, str]:
    """App Service / Function App のアプリ設定を取得する。"""
    path = (
        f"/subscriptions/{subscription_id}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Web/sites/{site_name}/config/appsettings/list"
    )
    return (arm_post(path) or {}).get("properties", {})
