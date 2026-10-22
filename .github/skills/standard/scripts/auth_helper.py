"""
Power Platform Dataverse デプロイスクリプト用 共通認証ヘルパーモジュール

テーブル作成・フロー・Copilot Studio 等の Python デプロイスクリプトは
このモジュールを使って認証する。
※ Power Apps を利用するエンドユーザーの認証は Power Apps SDK が処理するため、
  本モジュールの対象外。

認証方法（優先順）:
  1. PAC CLI プロファイル（.env に PAC_AUTH_PROFILE が設定されている場合）
     - pac auth select → pac auth token でトークンを取得
     - インタラクティブセットアップで pac auth create 済みの場合に自動利用
     - インタラクティブ認証済みプロファイルを再利用
  2. InteractiveBrowserCredential（PAC CLI が未設定または失敗した場合）
     - 2 層キャッシュ（AuthenticationRecord + MSAL 永続キャッシュ）
     - 初回のみローカルブラウザでサインインし、以後はサイレントリフレッシュ

PAC CLI 認証の仕組み:
  - PAC_AUTH_PROFILE に pac auth create で作成したプロファイル名を設定
  - get_token() 呼び出し時に pac auth select → pac auth token を実行
  - JWT の exp クレームから有効期限を取得してインメモリキャッシュで管理
  - pac CLI が見つからない・失敗した場合は InteractiveBrowserCredential へフォールバック
  - ★ 注意: pac CLI のディストリビューション/バージョンによっては `pac auth token`
    サブコマンド自体が存在しない（例: npm 版 power-platform-cli 2.9.3 系）。
    その場合は毎回 InteractiveBrowserCredential へフォールバックする
    （エラーにはならないが高速化の恩恵は受けられない）。

インタラクティブ認証の仕組み（2 層キャッシュ・マシン全体・テナント別に共有）:
  1. AuthenticationRecord (~/.power-platform-cli/auth_record_{TENANT_ID}.json)
     - アカウント情報（テナント・ユーザー等）を保存
     - プロジェクトフォルダに依存しない固定パス（ホームディレクトリ配下）に保存するため、
       同一マシン上の別プロジェクトからも再利用される
     - ★ テナントごとにファイルを分離している（重要）:
       複数テナントを行き来する開発（例: 検証用テナントと本番顧客テナント）では、
       単一の共有ファイルだと後から認証したテナントで上書きされ、
       別テナントに戻った際に認証キャッシュを誤用する
       問題が発生する。TENANT_ID をファイル名に含めることでこれを防いでいる。
     - これだけではトークンは保存されない
  2. TokenCachePersistenceOptions (MSAL 永続トークンキャッシュ)
     - リフレッシュトークン・アクセストークンをOS資格情報ストアに永続化（同一マシンで共有）
     - AuthenticationRecord と組み合わせることでサイレントリフレッシュが可能

動作:
  - 初期セットアップ: get_token(allow_interactive=True) でキャッシュを優先し、必要時だけサインイン
         → AuthenticationRecord をテナント別パスに保存
         → MSAL トークンキャッシュにリフレッシュトークンを永続化
  - 2回目以降（別プロジェクトでも、同じテナントなら）: AuthenticationRecord をロード
         → MSAL キャッシュからリフレッシュトークンを取得
         → サイレントリフレッシュ
  - get_token() はキャッシュ優先。保存済み PP_AUTH_ALLOW_INTERACTIVE=true の許可がある場合、
    追加認証要求だけブラウザ認証で復旧する。SDK credential の自動対話は無効
  - CI では保存済み許可があってもブラウザを起動しない
  - 認証エラーを理由に永続キャッシュを無効化・削除しない

PAC CLI プロファイルからトークンを取得できない場合は、ローカルブラウザを使った
InteractiveBrowserCredential で認証する。デバイスコード認証への切り替えやフォールバックは行わない。

使い方:
  from auth_helper import get_credential, get_token, get_session, retry_metadata

  # Dataverse Web API 用トークン
  token = get_token()

  # Dataverse SDK 用 credential
  from PowerPlatform.Dataverse.client import DataverseClient
  client = DataverseClient(DATAVERSE_URL, get_credential())

  # Flow API 用トークン
  token = get_token(scope="https://service.flow.microsoft.com/.default")

  # requests.Session（******
  session = get_session()
  resp = session.get(f"{DATAVERSE_URL}/api/data/v9.2/accounts")

  # メタデータ操作のリトライ
  retry_metadata(lambda: api_post("EntityDefinitions", body), "テーブル作成")
"""

from __future__ import annotations

from collections.abc import Callable
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests
from azure.identity import (
    AuthenticationRequiredError,
    AuthenticationRecord,
    InteractiveBrowserCredential,
    TokenCachePersistenceOptions,
)
from dotenv import load_dotenv
sys.path.insert(0, str(Path(__file__).resolve().parent))
from auth_preferences import configure_python_browser, interactive_allowed

# ---------- 設定 ----------

load_dotenv()

TENANT_ID: str = os.getenv("TENANT_ID", "")
DATAVERSE_URL: str = os.getenv("DATAVERSE_URL", "").rstrip("/")
PAC_AUTH_PROFILE: str = os.getenv("PAC_AUTH_PROFILE", "")

# AuthenticationRecord の保存先（マシン全体で共有・プロジェクトをまたいで再利用する）
# ※ プロジェクトごとにディレクトリが変わると毎回ブラウザ認証が必要になるため、
#   ホームディレクトリ配下の固定パスに保存する（PP_AUTH_RECORD_PATH で上書き可能）。
#
# ★ テナント別にファイルを分ける（重要）:
#   複数テナント（例: 会社Aの環境・自分の検証環境）を同一マシンで行き来する場合、
#   単一の共有ファイルだと後から認証したテナントのレコードで上書きされてしまい、
#   別テナントに戻った際に認証キャッシュを誤用する
#   問題が発生する。TENANT_ID ごとにファイルを分離してこれを防ぐ。
_AUTH_RECORD_DIR = Path.home() / ".power-platform-cli"
_tenant_key = TENANT_ID or "default"
_DEFAULT_AUTH_RECORD_PATH = _AUTH_RECORD_DIR / f"auth_record_{_tenant_key}.json"
AUTH_RECORD_PATH: Path = Path(
    os.environ.get("PP_AUTH_RECORD_PATH", str(_DEFAULT_AUTH_RECORD_PATH))
).expanduser()

# 旧バージョン（テナント分離前の単一共有ファイル）との互換: テナント別ファイルが
# まだ無く、旧共有パスに「同じテナントの」レコードが残っている場合のみ移行する。
# （テナントが異なるレコードを誤って引き継ぐと今回と同じ問題を再発するため、
#   中身の tenantId を確認してから移行する。）
_LEGACY_SHARED_AUTH_RECORD_PATH = _AUTH_RECORD_DIR / "auth_record.json"
if not AUTH_RECORD_PATH.exists() and _LEGACY_SHARED_AUTH_RECORD_PATH.exists():
    try:
        _legacy_data = json.loads(_LEGACY_SHARED_AUTH_RECORD_PATH.read_text(encoding="utf-8"))
        if not TENANT_ID or _legacy_data.get("tenantId") == TENANT_ID:
            AUTH_RECORD_PATH.parent.mkdir(parents=True, exist_ok=True)
            AUTH_RECORD_PATH.write_text(
                _LEGACY_SHARED_AUTH_RECORD_PATH.read_text(encoding="utf-8"), encoding="utf-8"
            )
            print(
                f"[auth_helper] 旧共有認証キャッシュをテナント別パスへ移行しました: {AUTH_RECORD_PATH}",
                file=sys.stderr,
            )
    except (ValueError, OSError, json.JSONDecodeError):
        pass  # 移行失敗時は通常どおりブラウザ認証を実行

# さらに旧バージョン（プロジェクトルート直下）との互換: 上記でも見つからない場合。
_LEGACY_AUTH_RECORD_PATH = Path(__file__).resolve().parent / ".auth_record.json"
if not AUTH_RECORD_PATH.exists() and _LEGACY_AUTH_RECORD_PATH.exists():
    try:
        AUTH_RECORD_PATH.parent.mkdir(parents=True, exist_ok=True)
        AUTH_RECORD_PATH.write_text(
            _LEGACY_AUTH_RECORD_PATH.read_text(encoding="utf-8"), encoding="utf-8"
        )
        print(
            f"[auth_helper] 旧認証キャッシュをグローバルパスへ移行しました: {AUTH_RECORD_PATH}",
            file=sys.stderr,
        )
    except OSError:
        pass  # 移行失敗時は通常どおりブラウザ認証を実行

# Dataverse Web API のデフォルトスコープ
_DEFAULT_SCOPE = f"{DATAVERSE_URL}/.default" if DATAVERSE_URL else ""

# ---------- 内部キャッシュ ----------

# client_id （None = 既定の Azure CLI 互換クライアント）ごとに credential を分離する。
# 既定のクライアントは Graph の固定パーミッションセットしか持たないため、
# それに無いスコープ（例: AppCatalog.ReadWrite.All）が必要な場合のみ、
# 呼び出し側で別の well-known パブリッククライアント ID を指定できるようにする。
_credentials: dict[str, InteractiveBrowserCredential] = {}


def _auth_record_path_for(client_id: str | None) -> Path:
    """client_id 別の AuthenticationRecord パスを返す（既定 client_id は従来どおりのパス）。"""
    if not client_id:
        return AUTH_RECORD_PATH
    return AUTH_RECORD_PATH.with_name(f"{AUTH_RECORD_PATH.stem}_{client_id}{AUTH_RECORD_PATH.suffix}")


def _build_credential(client_id: str | None = None) -> InteractiveBrowserCredential:
    """InteractiveBrowserCredential を構築する（2 層キャッシュ付き）。

    1. TokenCachePersistenceOptions — MSAL 永続トークンキャッシュ
       リフレッシュトークン・アクセストークンを OS 資格情報ストアに保存。
       AuthenticationRecord だけではトークンは保存されないため、
       この設定が無いと毎回認証が必要になる。
    2. AuthenticationRecord — アカウント情報キャッシュ
       テナント・ユーザー情報を保存し、MSAL キャッシュから正しい
       トークンエントリを検索するキーとして機能する。

    client_id を省略すると azure-identity 既定の Azure CLI 互換クライアントを使う
    （従来どおりの挙動・従来どおりのキャッシュファイル）。別の well-known パブリック
    クライアント（例: Microsoft Graph PowerShell）が必要なスコープを要求する場合のみ
    client_id を明示的に渡す（キャッシュファイルも client_id 別に分離される）。

    ローカルブラウザとループバックリダイレクトを使い、デバイスコード認証は行わない。
    """
    # 既存の明示的な診断オプションは保持するが、通常運用では永続化を使う。
    use_persistent_cache = not os.environ.get("PP_NO_PERSISTENT_CACHE")

    kwargs: dict = {
        "tenant_id": TENANT_ID or None,
        "client_id": client_id or None,
        "disable_automatic_authentication": True,
        "login_hint": os.getenv("PP_AUTH_ACCOUNT") or None,
    }
    if use_persistent_cache:
        cache_options = TokenCachePersistenceOptions(
            name="power_platform_token_cache_v3",
            allow_unencrypted_storage=False,
        )
        kwargs["cache_persistence_options"] = cache_options
    else:
        print(
            "[auth_helper] 警告: PP_NO_PERSISTENT_CACHE により永続化が無効です。"
            " 次のプロセスへトークンを引き継ぐには、この診断用設定を解除してください。",
            file=sys.stderr,
        )

    auth_record_path = _auth_record_path_for(client_id)
    auth_record: AuthenticationRecord | None = None
    if auth_record_path.exists():
        try:
            serialized = auth_record_path.read_text(encoding="utf-8")
            auth_record = AuthenticationRecord.deserialize(serialized)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                f"認証レコードを読み込めません。既存キャッシュは保持しました: {auth_record_path}"
            ) from exc
        if TENANT_ID and auth_record.tenant_id.lower() != TENANT_ID.lower():
            raise ValueError("認証レコードのテナントが一致しません。キャッシュは変更しません。")
        if client_id and auth_record.client_id.lower() != client_id.lower():
            raise ValueError("認証レコードの client ID が一致しません。キャッシュは変更しません。")
        expected_account = os.getenv("PP_AUTH_ACCOUNT", "")
        if expected_account and auth_record.username.lower() != expected_account.lower():
            raise ValueError("認証レコードのアカウントが PP_AUTH_ACCOUNT と一致しません。キャッシュは変更しません。")
        print(
            f"[auth_helper] 共有認証レコードをロードしました: {auth_record_path}",
            file=sys.stderr,
        )

    # None の値を除外（未設定パラメータはライブラリの既定値を使う）
    kwargs = {k: v for k, v in kwargs.items() if v is not None}

    if auth_record is not None:
        kwargs["authentication_record"] = auth_record

    return _instantiate_credential(kwargs)


def _instantiate_credential(kwargs: dict) -> InteractiveBrowserCredential:
    """ローカルブラウザで認証する credential を生成する。"""
    return InteractiveBrowserCredential(**kwargs)


def _ensure_credential(client_id: str | None = None) -> InteractiveBrowserCredential:
    """client_id ごとのシングルトン credential を返す（既定は従来どおり単一の共有 credential）。"""
    key = client_id or ""
    if key not in _credentials:
        _credentials[key] = _build_credential(client_id)
    return _credentials[key]


def _save_auth_record(record: AuthenticationRecord, client_id: str | None = None) -> None:
    """AuthenticationRecord を永続化する（他プロジェクトからも再利用される）。"""
    path = _auth_record_path_for(client_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, prefix=path.name, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(record.serialize())
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    print(
        f"[auth_helper] 認証レコードを保存しました（マシン全体で共有）: {path}",
        file=sys.stderr,
    )



# ---------- PAC CLI 認証ヘルパー ----------


def _decode_jwt_exp(token: str) -> float | None:
    """JWT の exp クレームをUnix タイムスタンプ (float) として取得する（署名検証なし）。

    PAC CLI が返すトークンは標準 JWT のため、ペイロードから有効期限を取得できる。
    解析に失敗した場合は None を返す。
    """
    try:
        import base64

        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Base64url は padding なしのため補完する
        padding = (4 - len(payload_b64) % 4) % 4
        payload_b64 += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        exp = payload.get("exp")
        return float(exp) if exp is not None else None
    except Exception:  # noqa: BLE001
        return None


def _pac_get_token(scope: str) -> str | None:
    """PAC CLI プロファイルを使ってアクセストークンを取得する。

    PAC_AUTH_PROFILE が設定されており、pac CLI が PATH に存在する場合のみ機能する。
    失敗した場合は None を返し、呼び出し元が InteractiveBrowserCredential へフォールバックする。

    Args:
        scope: OAuth2 スコープ（例: ``https://org.dynamics.com/.default``）。

    Returns:
        アクセストークン文字列、または None。
    """
    if not PAC_AUTH_PROFILE:
        return None

    # /.default サフィックスを除いたリソース URL（pac auth token --resource の引数）
    resource = scope[: -len("/.default")] if scope.endswith("/.default") else scope

    try:
        # 指定プロファイルを選択（すでに選択済みでも副作用なし）
        subprocess.run(
            ["pac", "auth", "select", "--name", PAC_AUTH_PROFILE],
            capture_output=True,
            timeout=15,
        )
        # アクセストークンを取得
        result = subprocess.run(
            ["pac", "auth", "token", "--resource", resource],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            token = result.stdout.strip()
            if token:
                print(
                    f"[auth_helper] PAC CLI プロファイル '{PAC_AUTH_PROFILE}' からトークンを取得しました",
                    file=sys.stderr,
                )
                return token
        # pac auth token が失敗した場合は stderr を表示してフォールバック
        if result.stderr.strip():
            print(
                f"[auth_helper] pac auth token 失敗（共有認証キャッシュにフォールバック）: "
                f"{result.stderr.strip()}",
                file=sys.stderr,
            )
    except FileNotFoundError:
        print(
            "[auth_helper] pac コマンドが見つかりません（共有認証キャッシュにフォールバック）",
            file=sys.stderr,
        )
    except subprocess.TimeoutExpired:
        print(
            "[auth_helper] pac auth token タイムアウト（共有認証キャッシュにフォールバック）",
            file=sys.stderr,
        )

    return None


# ---------- 公開 API ----------

# 有効期限までは同じスコープ・client ID の取得結果を再利用する。
_inmemory_tokens: dict[tuple[str, str], tuple[str, float]] = {}  # (scope, client_id) -> (token_str, expires_on)


def get_token(
    scope: str | None = None,
    client_id: str | None = None,
    *,
    allow_interactive: bool = False,
) -> str:
    """
    指定スコープのアクセストークン文字列を返す。

    永続キャッシュから取得し、有効期限が近い場合はサイレント更新する。
    対話認証は明示許可または保存済みの継続許可があり、追加認証要求を受けた場合だけ行う。

    Args:
        scope: OAuth2 スコープ。省略時は ``{DATAVERSE_URL}/.default``。
        client_id: 既定（Azure CLI 互換クライアント）以外のクライアント ID を使いたい場合のみ指定する。
            例: Azure CLI の Graph 項目にないスコープ（`AppCatalog.ReadWrite.All` 等）が必要な場合は
            Microsoft Graph PowerShell の well-known ID `14d82eec-204b-4c2f-b7e8-296a70dab67e` を指定する。
            キャッシュ（AuthenticationRecord ・ credential）は client_id ごとに分離される。
        allow_interactive: 対話認証の明示許可。保存済み許可も利用するがCIでは無効。

    Returns:
        Bearer トークン文字列。
    """
    if scope is None:
        scope = _DEFAULT_SCOPE
    if not scope:
        raise ValueError(
            "スコープが未指定です。DATAVERSE_URL を .env に設定するか scope 引数を渡してください。"
        )

    cache_key = (scope, client_id or "")

    # インメモリキャッシュから返す（有効期限 60 秒前まで）
    if cache_key in _inmemory_tokens:
        token_str, expires_on = _inmemory_tokens[cache_key]
        if time.time() < expires_on - 60:
            return token_str

    # PAC CLI プロファイルが設定されている場合は先に試みる（既定 client_id の場合のみ）
    if PAC_AUTH_PROFILE and not client_id and not os.getenv("PP_AUTH_ACCOUNT"):
        pac_token = _pac_get_token(scope)
        if pac_token:
            expires_on = _decode_jwt_exp(pac_token) or (time.time() + 3000)
            _inmemory_tokens[cache_key] = (pac_token, expires_on)
            return pac_token

    credential = _ensure_credential(client_id)
    try:
        token = credential.get_token(scope)
    except AuthenticationRequiredError as exc:
        if not interactive_allowed(allow_interactive):
            print(
                "[auth_helper] サイレント更新に追加認証が必要です。キャッシュは保持しています。"
                " 保存済みの認証設定を確認するか、承認後に allow_interactive=True で再実行してください。"
                " device-code は使用しません。",
                file=sys.stderr,
            )
            raise
        authenticate(scope, client_id=client_id, claims=exc.claims)
        token = credential.get_token(scope)

    _inmemory_tokens[cache_key] = (token.token, token.expires_on)
    return token.token


def get_credential(client_id: str | None = None) -> InteractiveBrowserCredential:
    """SDK にも同じサイレント認証・永続キャッシュ付き credential を渡す。"""
    return _ensure_credential(client_id)


def authenticate(
    scope: str | None = None,
    client_id: str | None = None,
    *,
    claims: str | None = None,
) -> AuthenticationRecord:
    """
    明示的に対話認証を実行し、AuthenticationRecord を保存して返す。

    通常のセットアップは get_token(allow_interactive=True) でキャッシュを優先する。
    この関数は明示的にブラウザ認証を要求する場合だけ使う。

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

    credential = _ensure_credential(client_id)
    if not interactive_allowed(True):
        raise RuntimeError("CI では対話認証できません。既存キャッシュまたは CI 専用認証を使用してください。")
    configure_python_browser()
    record = credential.authenticate(scopes=[scope], claims=claims)
    expected_account = os.getenv("PP_AUTH_ACCOUNT", "")
    if expected_account and record.username.lower() != expected_account.lower():
        raise ValueError("サインインしたアカウントが PP_AUTH_ACCOUNT と一致しません。認証レコードは更新しません。")
    _save_auth_record(record, client_id)
    for key in list(_inmemory_tokens):
        if key[1] == (client_id or ""):
            del _inmemory_tokens[key]
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
        # Dataverse reads MSCRM.SolutionUniqueName. A wrong header name is silently ignored and the
        # component lands in the default solution instead, with a 2xx response either way.
        session.headers["MSCRM.SolutionUniqueName"] = solution
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

POWERAPPS_API = "https://api.powerapps.com"


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


def powerapps_api_call(
    method: str,
    path: str,
    params: dict | None = None,
    body: dict | None = None,
    timeout: int = 120,
) -> dict:
    """
    PowerApps API を呼び出す。

    自動的に ``https://service.powerapps.com/.default`` スコープで認証する。
    """
    token = get_token(scope="https://service.powerapps.com/.default")
    url = f"{POWERAPPS_API}{path}"
    if params is None:
        params = {}
    params.setdefault("api-version", "2016-11-01")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = requests.request(method, url, headers=headers, params=params, json=body, timeout=timeout)
    resp.raise_for_status()
    if resp.status_code == 204 or not resp.text:
        return {}
    return resp.json()


# ---------- Flow / PowerApps ユーティリティ ----------


def resolve_environment_id() -> str:
    """DATAVERSE_URL から環境 ID を逆引きする。"""
    data = flow_api_call(
        "GET",
        "/providers/Microsoft.ProcessSimple/environments",
    )
    dv_url = DATAVERSE_URL.rstrip("/")
    for env in data.get("value", []):
        instance_url = (
            env.get("properties", {})
            .get("linkedEnvironmentMetadata", {})
            .get("instanceUrl", "")
            or ""
        ).rstrip("/")
        if instance_url == dv_url:
            return env["name"]
    raise RuntimeError(f"環境が見つかりません: {dv_url}")


def find_connection(env_id: str, connector_name: str, display_name: str = "") -> str:
    """環境内で Connected な接続 ID を検索する。見つからなければ sys.exit(1)。"""
    import sys as _sys

    label = display_name or connector_name
    for attempt in range(3):
        try:
            data = powerapps_api_call(
                "GET",
                f"/providers/Microsoft.PowerApps/apis/{connector_name}/connections",
                params={"$filter": f"environment eq '{env_id}'"},
            )
        except requests.exceptions.Timeout:
            wait = 15 * (attempt + 1)
            print(f"  ⚠ {label}: timeout → waiting {wait}s and retrying...")
            time.sleep(wait)
            continue
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 504:
                wait = 15 * (attempt + 1)
                print(f"  ⚠ {label}: 504 → waiting {wait}s and retrying...")
                time.sleep(wait)
                continue
            raise

        for conn in data.get("value", []):
            statuses = conn.get("properties", {}).get("statuses", [])
            if any(s.get("status") == "Connected" for s in statuses):
                return conn["name"]
        break

    print(f"  ❌ {label} ({connector_name}): no Connected connection found")
    print(f"     → create one at https://make.powerautomate.com/connections")
    _sys.exit(1)


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

            # --- 一時的なネットワーク切断 → リトライ ---
            if isinstance(
                exc, (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
            ) or "remote end closed connection" in detail_lower:
                wait = 10 * (attempt + 1)
                print(
                    f"  {description}: network error, retrying in {wait}s "
                    f"(attempt {attempt + 1}/{max_attempts})..."
                )
                time.sleep(wait)
                continue

            # --- スロットリング（429 / 503）→ Retry-After を尊重してリトライ ---
            status_code = None
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                status_code = exc.response.status_code
            if status_code in (429, 503) or "429 client error" in detail_lower:
                retry_after = None
                if isinstance(exc, requests.HTTPError) and exc.response is not None:
                    retry_after = exc.response.headers.get("Retry-After")
                try:
                    wait = int(retry_after) if retry_after else 15 * (attempt + 1)
                except ValueError:
                    wait = 15 * (attempt + 1)
                print(
                    f"  {description}: throttled ({status_code}), waiting {wait}s "
                    f"(attempt {attempt + 1}/{max_attempts})..."
                )
                time.sleep(wait)
                continue

            # --- 想定外のエラー → 再送出 ---
            raise

    # リトライ上限に達した場合、「既に存在するのでスキップ」とは明確に区別し、
    # 呼び出し元の try/except が確実に検知できるよう例外を送出する（None を返して
    # サイレントに成功扱いにしてしまうと、実際には作成されていない列/Lookup が
    # 後続処理でも見過ごされたまま Step 4 の公開まで進んでしまう）。
    msg = f"{description}: max retries ({max_attempts}) exceeded"
    print(f"  {msg}")
    raise RuntimeError(msg)


# ---------- CLI エントリーポイント ----------

if __name__ == "__main__":
    print("=== Power Platform authentication test ===")
    if not DATAVERSE_URL:
        print("DATAVERSE_URL is not set in .env.", file=sys.stderr)
        sys.exit(1)

    get_token(allow_interactive=True)
    print("Authenticated using the shared cache (browser only when required).")
