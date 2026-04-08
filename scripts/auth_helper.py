"""
Power Platform 共通認証ヘルパーモジュール

すべての Python デプロイスクリプト（テーブル作成、フロー、Copilot Studio 等）は
このモジュールを使って認証する。

方式:
  - 初回: DeviceCodeCredential でデバイスコード認証 → AuthenticationRecord をファイルに保存
  - 2回目以降: 保存済み AuthenticationRecord をロードしてサイレントリフレッシュ

使い方:
  from auth_helper import get_token, get_session

  # Dataverse Web API 用トークン
  token = get_token()

  # Flow API 用トークン
  token = get_token(scope="https://service.flow.microsoft.com/.default")

  # requests.Session（Bearer ヘッダー付き）
  session = get_session()
  resp = session.get(f"{DATAVERSE_URL}/api/data/v9.2/accounts")
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from azure.identity import (
    AuthenticationRecord,
    DeviceCodeCredential,
    TokenCachePersistenceOptions,
)
from dotenv import load_dotenv

# ---------- 設定 ----------

load_dotenv()

TENANT_ID: str = os.getenv("TENANT_ID", "")
CLIENT_ID: str = os.getenv("MCP_CLIENT_ID", "")
DATAVERSE_URL: str = os.getenv("DATAVERSE_URL", "").rstrip("/")

# AuthenticationRecord の保存先（プロジェクトルートの .auth_record.json）
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
AUTH_RECORD_PATH: Path = _PROJECT_ROOT / ".auth_record.json"

# Dataverse Web API のデフォルトスコープ
_DEFAULT_SCOPE = f"{DATAVERSE_URL}/.default" if DATAVERSE_URL else ""

# ---------- 内部キャッシュ ----------

_credential: DeviceCodeCredential | None = None


def _device_code_callback(verification_uri: str, user_code: str, expires_on: object) -> None:
    """デバイスコード認証のプロンプトを表示する。"""
    print(
        "\n========================================\n"
        "  デバイスコード認証\n"
        "========================================\n"
        f"  1. ブラウザで {verification_uri} を開く\n"
        f"  2. コード {user_code} を入力\n"
        "========================================\n",
        file=sys.stderr,
    )


def _build_credential() -> DeviceCodeCredential:
    """DeviceCodeCredential を構築する。キャッシュがあればサイレント、なければ対話認証。"""
    cache_options = TokenCachePersistenceOptions(
        name="power_platform_token_cache",
        allow_unencrypted_storage=True,
    )

    auth_record: AuthenticationRecord | None = None

    if AUTH_RECORD_PATH.exists():
        try:
            serialized = AUTH_RECORD_PATH.read_text(encoding="utf-8")
            auth_record = AuthenticationRecord.deserialize(serialized)
            print(
                f"[auth_helper] 認証キャッシュをロードしました: {AUTH_RECORD_PATH}",
                file=sys.stderr,
            )
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            print(
                f"[auth_helper] 認証キャッシュの読み込みに失敗（初回認証に切り替え）: {exc}",
                file=sys.stderr,
            )

    kwargs: dict = {
        "tenant_id": TENANT_ID or None,
        "client_id": CLIENT_ID or None,
        "cache_persistence_options": cache_options,
        "prompt_callback": _device_code_callback,
    }
    # None の値を除外（未設定パラメータはライブラリの既定値を使う）
    kwargs = {k: v for k, v in kwargs.items() if v is not None}

    if auth_record is not None:
        kwargs["authentication_record"] = auth_record

    return DeviceCodeCredential(**kwargs)


def _ensure_credential() -> DeviceCodeCredential:
    """モジュールレベルのシングルトン credential を返す。"""
    global _credential  # noqa: PLW0603
    if _credential is None:
        _credential = _build_credential()
    return _credential


def _save_auth_record(record: AuthenticationRecord) -> None:
    """AuthenticationRecord をファイルに永続化する。"""
    AUTH_RECORD_PATH.write_text(record.serialize(), encoding="utf-8")
    print(
        f"[auth_helper] 認証レコードを保存しました: {AUTH_RECORD_PATH}",
        file=sys.stderr,
    )


# ---------- 公開 API ----------


def get_token(scope: str | None = None) -> str:
    """
    指定スコープのアクセストークン文字列を返す。

    初回はデバイスコード認証が走り、AuthenticationRecord が保存される。
    2回目以降はキャッシュからサイレントに取得する。

    Args:
        scope: OAuth2 スコープ。省略時は ``{DATAVERSE_URL}/.default``。

    Returns:
        Bearer トークン文字列。
    """
    if scope is None:
        scope = _DEFAULT_SCOPE
    if not scope:
        raise ValueError(
            "スコープが未指定です。DATAVERSE_URL を .env に設定するか scope 引数を渡してください。"
        )

    credential = _ensure_credential()

    # キャッシュが存在しない場合は明示的に authenticate() を呼んで
    # AuthenticationRecord を永続化してからトークンを取得する
    if not AUTH_RECORD_PATH.exists():
        record = credential.authenticate(scopes=[scope])
        _save_auth_record(record)

    token = credential.get_token(scope)
    return token.token


def authenticate(scope: str | None = None) -> AuthenticationRecord:
    """
    明示的に対話認証を実行し、AuthenticationRecord を保存して返す。

    通常は get_token() を呼ぶだけで十分だが、
    スクリプトの冒頭で確実に認証を通したい場合にはこの関数を使う。

    Args:
        scope: OAuth2 スコープ。省略時は ``{DATAVERSE_URL}/.default``。

    Returns:
        AuthenticationRecord インスタンス。
    """
    if scope is None:
        scope = _DEFAULT_SCOPE
    if not scope:
        raise ValueError(
            "スコープが未指定です。DATAVERSE_URL を .env に設定するか scope 引数を渡してください。"
        )

    credential = _ensure_credential()
    record = credential.authenticate(scopes=[scope])
    _save_auth_record(record)
    return record


def get_session(scope: str | None = None) -> requests.Session:
    """
    Bearer トークンが設定された requests.Session を返す。

    Args:
        scope: OAuth2 スコープ。省略時は ``{DATAVERSE_URL}/.default``。

    Returns:
        Authorization ヘッダー付き requests.Session。
    """
    token = get_token(scope)
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
        }
    )
    return session


# ---------- Dataverse ヘルパー ----------


def api_get(path: str, scope: str | None = None) -> dict:
    """Dataverse Web API に GET リクエストを送る。"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/{path.lstrip('/')}"
    session = get_session(scope)
    resp = session.get(url)
    resp.raise_for_status()
    return resp.json()


def api_post(path: str, body: dict, scope: str | None = None, *, solution: str = "") -> str | None:
    """Dataverse Web API に POST リクエストを送る。作成されたレコードの ID を返す。"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/{path.lstrip('/')}"
    session = get_session(scope)
    if solution:
        session.headers["MSCRM.SolutionName"] = solution
    resp = session.post(url, json=body)
    resp.raise_for_status()
    odata_id = resp.headers.get("OData-EntityId", "")
    if "(" in odata_id and ")" in odata_id:
        return odata_id.split("(")[-1].rstrip(")")
    return None


def api_patch(path: str, body: dict, scope: str | None = None) -> None:
    """Dataverse Web API に PATCH リクエストを送る。"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/{path.lstrip('/')}"
    session = get_session(scope)
    resp = session.patch(url, json=body)
    resp.raise_for_status()


def api_delete(path: str, scope: str | None = None) -> None:
    """Dataverse Web API に DELETE リクエストを送る。"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/{path.lstrip('/')}"
    session = get_session(scope)
    resp = session.delete(url)
    resp.raise_for_status()


def api_request(path: str, body: dict, method: str = "PUT", scope: str | None = None) -> None:
    """Dataverse Web API に任意のメソッドでリクエストを送る（PUT ローカライズ等）。"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/{path.lstrip('/')}"
    session = get_session(scope)
    session.headers["MSCRM.MergeLabels"] = "true"
    resp = session.request(method, url, json=body)
    resp.raise_for_status()


# ---------- Flow API ヘルパー ----------


FLOW_API = "https://api.flow.microsoft.com"
FLOW_API_VERSION = "api-version=2016-11-01"


def flow_api_call(
    method: str,
    path: str,
    body: dict | None = None,
) -> dict:
    """
    Flow Management API を呼び出す。

    自動的に ``https://service.flow.microsoft.com/.default`` スコープで認証する。
    """
    token = get_token(scope="https://service.flow.microsoft.com/.default")
    url = f"{FLOW_API}{path}"
    separator = "&" if "?" in url else "?"
    url = f"{url}{separator}{FLOW_API_VERSION}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = requests.request(method, url, headers=headers, json=body)
    resp.raise_for_status()
    if resp.status_code == 204 or not resp.text:
        return {}
    return resp.json()


# ---------- CLI エントリーポイント ----------

if __name__ == "__main__":
    print("=== Power Platform 認証テスト ===")
    if not DATAVERSE_URL:
        print("DATAVERSE_URL が .env に設定されていません。", file=sys.stderr)
        sys.exit(1)

    record = authenticate()
    print(f"認証成功: {record.username}")
    print(f"テナント: {record.tenant_id}")
    print(f"認証レコード保存先: {AUTH_RECORD_PATH}")
