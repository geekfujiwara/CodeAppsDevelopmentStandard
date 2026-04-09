"""
Power Platform Dataverse デプロイスクリプト用 共通認証ヘルパーモジュール

テーブル作成・フロー・Copilot Studio 等の Python デプロイスクリプトは
このモジュールを使って認証する。
※ Power Apps を利用するエンドユーザーの認証は Power Apps SDK が処理するため、
  本モジュールの対象外。

認証の仕組み（2 層キャッシュ）:
  1. AuthenticationRecord (.auth_record.json)
     - アカウント情報（テナント・ユーザー等）を保存
     - これだけではトークンは保存されない
  2. TokenCachePersistenceOptions (MSAL 永続トークンキャッシュ)
     - リフレッシュトークン・アクセストークンをOS資格情報ストアに永続化
     - AuthenticationRecord と組み合わせることでサイレントリフレッシュが可能

動作:
  - 初回: DeviceCodeCredential でデバイスコード認証
         → AuthenticationRecord をファイルに保存
         → MSAL トークンキャッシュにリフレッシュトークンを永続化
  - 2回目以降: AuthenticationRecord をロード
         → MSAL キャッシュからリフレッシュトークンを取得
         → サイレントリフレッシュ（デバイスコード不要）

使い方:
  from auth_helper import get_token, get_session, retry_metadata

  # Dataverse Web API 用トークン
  token = get_token()

  # Flow API 用トークン
  token = get_token(scope="https://service.flow.microsoft.com/.default")

  # requests.Session（Bearer ヘッダー付き）
  session = get_session()
  resp = session.get(f"{DATAVERSE_URL}/api/data/v9.2/accounts")

  # メタデータ操作のリトライ
  retry_metadata(lambda: api_post("EntityDefinitions", body), "テーブル作成")
"""

from __future__ import annotations

from collections.abc import Callable
import json
import os
import sys
import time
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
    """DeviceCodeCredential を構築する（2 層キャッシュ付き）。

    1. TokenCachePersistenceOptions — MSAL 永続トークンキャッシュ
       リフレッシュトークン・アクセストークンを OS 資格情報ストアに保存。
       AuthenticationRecord だけではトークンは保存されないため、
       この設定が無いと毎回デバイスコード認証が必要になる。
    2. AuthenticationRecord — アカウント情報キャッシュ
       テナント・ユーザー情報を保存し、MSAL キャッシュから正しい
       トークンエントリを検索するキーとして機能する。
    """
    cache_options = TokenCachePersistenceOptions(
        name="power_platform_token_cache",
        # allow_unencrypted_storage=True は Linux 等で libsecret が未インストールの
        # 開発環境向けフォールバック。本番 CI/CD では Managed Identity 等を使用する。
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


# ---------- メタデータ操作リトライ ----------


def _extract_error_detail(exc: Exception) -> str:
    """例外からエラー詳細文字列を抽出する。

    requests.HTTPError の場合はレスポンスボディに Dataverse のエラーコード
    （0x80040237, 0x80044363 等）が含まれるため、str(e) ではなく
    response.text から取得する必要がある。
    """
    parts = [str(exc)]
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        try:
            parts.append(exc.response.text)
        except Exception:  # noqa: BLE001 — response.text の読み取り失敗は無視
            pass
    return "\n".join(parts)


def retry_metadata(
    fn: Callable[[], object],
    description: str,
    max_attempts: int = 5,
) -> object | None:
    """メタデータ操作をリトライする。ロック競合時は累進的に待機。

    Dataverse のメタデータ操作（テーブル作成、列追加、リレーションシップ等）は
    排他ロックにより同時実行すると失敗する。このヘルパーは以下のエラーを検出して
    自動リトライまたはスキップする。

    | エラーコード / パターン         | 対処     | 説明                                 |
    |-------------------------------|---------|--------------------------------------|
    | ``already exists``            | スキップ | 既に存在する（べき等パターン）            |
    | ``0x80040237``                | スキップ | メタデータ排他ロック競合（already exists系）|
    | ``0x80044363``                | スキップ | ソリューション内に同名コンポーネント重複    |
    | ``another ... running``       | リトライ | 別のメタデータ操作が実行中                |

    Args:
        fn: 実行する callable（引数なし）。
        description: ログ用の操作説明文字列。
        max_attempts: 最大リトライ回数（デフォルト 5）。

    Returns:
        fn() の戻り値。エラーをスキップした場合は None。
    """
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:
            detail = _extract_error_detail(exc)
            detail_lower = detail.lower()

            # --- 既に存在する場合はスキップ ---
            if (
                "already exists" in detail_lower
                or "0x80040237" in detail
                or "0x80044363" in detail
            ):
                print(f"  {description}: already exists, skipping")
                return None

            # --- メタデータロック競合 → リトライ ---
            if "another" in detail_lower and "running" in detail_lower:
                wait = 10 * (attempt + 1)
                print(
                    f"  {description}: lock contention, waiting {wait}s "
                    f"(attempt {attempt + 1}/{max_attempts})..."
                )
                time.sleep(wait)
                continue

            # --- 想定外のエラー → 再送出 ---
            raise

    print(f"  {description}: max retries ({max_attempts}) exceeded")
    return None


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
