"""
共通認証ヘルパー — AuthenticationRecord + 永続トークンキャッシュ

初回のみデバイスコード認証を実行し、AuthenticationRecord をファイルに、
トークンを OS 資格情報ストアに保存。2回目以降はサイレントリフレッシュ。
"""

import os
from azure.identity import (
    DeviceCodeCredential,
    AuthenticationRecord,
    TokenCachePersistenceOptions,
)

AUTH_RECORD_PATH = os.path.join(os.path.dirname(__file__), "..", ".auth_record.json")
AUTH_RECORD_PATH = os.path.normpath(AUTH_RECORD_PATH)

# OS 資格情報ストアにトークンを永続キャッシュ
_cache_options = TokenCachePersistenceOptions(name="incident_manager")

_credential_cache: DeviceCodeCredential | None = None


def get_credential(tenant_id: str, client_id: str) -> DeviceCodeCredential:
    """
    DeviceCodeCredential を取得する。
    - .auth_record.json + OS トークンキャッシュがあればサイレント認証
    - なければ初回デバイスコード認証を実行しレコード保存
    """
    global _credential_cache
    if _credential_cache is not None:
        return _credential_cache

    kwargs = {
        "tenant_id": tenant_id,
        "client_id": client_id,
        "cache_persistence_options": _cache_options,
    }

    if os.path.exists(AUTH_RECORD_PATH):
        with open(AUTH_RECORD_PATH, "r", encoding="utf-8") as f:
            record = AuthenticationRecord.deserialize(f.read())
        kwargs["authentication_record"] = record
        cred = DeviceCodeCredential(**kwargs)
        print(f"  認証キャッシュを復元（サイレント認証）")
    else:
        cred = DeviceCodeCredential(**kwargs)
        # 初回: デバイスコード認証 → レコード保存
        record = cred.authenticate(scopes=["https://graph.microsoft.com/.default"])
        with open(AUTH_RECORD_PATH, "w", encoding="utf-8") as f:
            f.write(record.serialize())
        print(f"  認証レコードを保存しました ({AUTH_RECORD_PATH})")

    _credential_cache = cred
    return cred


def get_token(tenant_id: str, client_id: str, scope: str) -> str:
    """指定スコープのアクセストークン文字列を取得する。"""
    cred = get_credential(tenant_id, client_id)
    token = cred.get_token(scope)
    return token.token
