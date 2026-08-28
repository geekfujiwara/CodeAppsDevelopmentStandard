"""sharepoint スキル共通ヘルパー（auth_helper 経由の Graph セッション取得・サイト/リスト解決）。

各スクリプトから import して使う。単体では実行しない。
"""

from __future__ import annotations

import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard/scripts"))

from auth_helper import get_token  # noqa: E402

GRAPH_SCOPE = "https://graph.microsoft.com/.default"
GRAPH_API = "https://graph.microsoft.com/v1.0"

# Microsoft Graph PowerShell の well-known パブリッククライアント ID。
# 新規の Entra アプリ登録をせずに SharePoint 書き込み系スコープの同意を得るために既定で使う。
GRAPH_POWERSHELL_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"


def get_graph_session(client_id: str | None = GRAPH_POWERSHELL_CLIENT_ID) -> requests.Session:
    """Graph 用の認証済みセッションを返す（client_id 指定時は auth_helper のキャッシュも client_id 別に分離される）。"""
    token = get_token(scope=GRAPH_SCOPE, client_id=client_id)
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return session


def parse_site_url(site_url: str) -> tuple[str, str]:
    """SharePoint サイト URL を Graph の (hostname, site-path) に分解する。"""
    without_scheme = site_url.split("://", 1)[-1]
    hostname, _, path = without_scheme.partition("/")
    return hostname, "/" + path.rstrip("/")


def resolve_site_id(session: requests.Session, site_url: str) -> str:
    hostname, site_path = parse_site_url(site_url)
    resp = session.get(f"{GRAPH_API}/sites/{hostname}:{site_path}")
    resp.raise_for_status()
    return resp.json()["id"]


def resolve_list_id(session: requests.Session, site_id: str, list_name: str) -> str | None:
    resp = session.get(f"{GRAPH_API}/sites/{site_id}/lists?$select=id,displayName")
    resp.raise_for_status()
    for item in resp.json().get("value", []):
        if item.get("displayName") == list_name:
            return item["id"]
    return None
