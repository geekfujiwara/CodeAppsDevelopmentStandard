"""外部 WebChat サイトの手動認証（Microsoft Entra ID + SSO）用アプリ登録を
Microsoft Graph 経由で冪等に構成する。

az login を使わず標準スキルの auth_helper.py の認証済みトークンで実行する。
ベストプラクティス:
  - シークレットレス（FIC）想定のため、クライアントシークレットは作成しない
  - 単一テナント（AzureADMyOrg）
  - SSO（トークン交換）に必要な 2 つのアプリ登録を分離

構成内容:
  1. 認証用アプリ登録（エージェント用）
     - Web リダイレクト: https://token.botframework.com/.auth/web/redirect
     - Access/ID トークン発行 ON
     - API 権限: Graph 委任 openid/profile + Dataverse user_impersonation
     - Expose an API: カスタムスコープ access_as_user（api://{authAppId}/access_as_user）
  2. キャンバス用アプリ登録（サイト SSO 用）
     - SPA リダイレクト: サイト URL（.env WEBSITE_URL）
     - Access/ID トークン発行 ON、requestedAccessTokenVersion=2
     - 認証用アプリの access_as_user スコープを要求
  3. 認証用アプリの preAuthorizedApplications にキャンバス appId を追加
  4. サービスプリンシパル作成 + oauth2PermissionGrant（管理者同意）
     - 認証SP → Graph(openid profile) / Dataverse(user_impersonation)
     - キャンバスSP → 認証SP(access_as_user)

.env へ書き込む:
  WEBCHAT_AUTH_APP_ID, WEBCHAT_CANVAS_APP_ID, WEBCHAT_AUTH_SCOPE_URI

.env 必須:
  TENANT_ID, DATAVERSE_URL, WEBSITE_URL
.env 任意:
  WEBCHAT_AUTH_APP_NAME（既定 WebChat-Auth）, WEBCHAT_CANVAS_APP_NAME（既定 WebChat-Canvas）
"""
from __future__ import annotations

import os
import re
import sys
import time
import uuid
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(_ROOT / ".github" / "skills" / "standard" / "scripts"))
import requests  # noqa: E402
from auth_helper import get_token  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(_ROOT / ".env")

GRAPH = "https://graph.microsoft.com/v1.0"
ENV_PATH = _ROOT / ".env"

TENANT_ID = os.getenv("TENANT_ID", "")
DATAVERSE_URL = os.getenv("DATAVERSE_URL", "").rstrip("/")
WEBSITE_URL = os.getenv("WEBSITE_URL", "").strip()

AUTH_APP_NAME = os.getenv("WEBCHAT_AUTH_APP_NAME", "WebChat-Auth")
CANVAS_APP_NAME = os.getenv("WEBCHAT_CANVAS_APP_NAME", "WebChat-Canvas")
SCOPE_NAME = "access_as_user"

BOT_REDIRECT = "https://token.botframework.com/.auth/web/redirect"

# 既知のリソース ID / スコープ ID（テナント非依存の固定値）
GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000"
GRAPH_OPENID = "37f7f235-527c-4136-accd-4a02d197296e"   # openid (delegated)
GRAPH_PROFILE = "14dad69e-099b-42c9-810b-d002981feec1"  # profile (delegated)
DYNAMICS_APP_ID = "00000007-0000-0000-c000-000000000000"
DYNAMICS_USER_IMPERSONATION = "78ce3f0f-a1ce-49c2-8cde-64b5c0896db4"


def _headers() -> dict:
    token = get_token("https://graph.microsoft.com/.default")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _log(msg: str) -> None:
    print(msg, file=sys.stderr)


def _write_env(key: str, value: str) -> None:
    text = ENV_PATH.read_text(encoding="utf-8")
    pattern = rf"^{re.escape(key)}=.*$"
    if re.search(pattern, text, flags=re.MULTILINE):
        text = re.sub(pattern, f"{key}={value}", text, flags=re.MULTILINE)
    else:
        text = text.rstrip("\n") + f"\n{key}={value}\n"
    ENV_PATH.write_text(text, encoding="utf-8")


def _get_app_by_name(headers: dict, name: str) -> dict | None:
    r = requests.get(
        f"{GRAPH}/applications?$filter=displayName eq '{name}'"
        "&$select=id,appId,identifierUris,api,requiredResourceAccess",
        headers=headers, timeout=30,
    )
    r.raise_for_status()
    vals = r.json().get("value", [])
    return vals[0] if vals else None


def _patch_app(headers: dict, obj_id: str, body: dict) -> None:
    r = requests.patch(f"{GRAPH}/applications/{obj_id}", headers=headers, json=body, timeout=30)
    if r.status_code >= 400:
        _log(f"PATCH 失敗 {r.status_code}: {r.text}")
    r.raise_for_status()


def _ensure_sp(headers: dict, app_id: str) -> str:
    """appId のサービスプリンシパルを取得（無ければ作成）し objectId を返す。"""
    r = requests.get(
        f"{GRAPH}/servicePrincipals?$filter=appId eq '{app_id}'&$select=id",
        headers=headers, timeout=30,
    )
    r.raise_for_status()
    vals = r.json().get("value", [])
    if vals:
        return vals[0]["id"]
    c = requests.post(
        f"{GRAPH}/servicePrincipals", headers=headers, json={"appId": app_id}, timeout=30,
    )
    if c.status_code >= 400:
        _log(f"SP 作成失敗 {c.status_code}: {c.text}")
    c.raise_for_status()
    return c.json()["id"]


def _ensure_grant(headers: dict, client_sp: str, resource_sp: str, scope: str) -> None:
    """oauth2PermissionGrant（AllPrincipals=テナント全体の管理者同意）を冪等に作成/更新。"""
    r = requests.get(
        f"{GRAPH}/oauth2PermissionGrants?$filter=clientId eq '{client_sp}' and resourceId eq '{resource_sp}'",
        headers=headers, timeout=30,
    )
    r.raise_for_status()
    existing = r.json().get("value", [])
    if existing:
        grant_id = existing[0]["id"]
        current = set((existing[0].get("scope") or "").split())
        merged = current | set(scope.split())
        if merged != current:
            u = requests.patch(
                f"{GRAPH}/oauth2PermissionGrants/{grant_id}",
                headers=headers, json={"scope": " ".join(sorted(merged))}, timeout=30,
            )
            u.raise_for_status()
            _log(f"  権限付与を更新: {' '.join(sorted(merged))}")
        else:
            _log(f"  権限付与は既存: {scope}")
        return
    body = {
        "clientId": client_sp,
        "consentType": "AllPrincipals",
        "resourceId": resource_sp,
        "scope": scope,
    }
    c = requests.post(f"{GRAPH}/oauth2PermissionGrants", headers=headers, json=body, timeout=30)
    if c.status_code >= 400:
        _log(f"権限付与作成失敗 {c.status_code}: {c.text}")
    c.raise_for_status()
    _log(f"  権限付与を作成: {scope}")


def main() -> None:
    if not WEBSITE_URL:
        _log("WEBSITE_URL が .env に未設定です。")
        sys.exit(1)
    headers = _headers()

    # ---- 1. 認証用アプリ登録 ----
    auth = _get_app_by_name(headers, AUTH_APP_NAME)
    if auth:
        auth_obj = auth["id"]
        auth_app_id = auth["appId"]
        _log(f"認証用アプリを再利用: appId={auth_app_id}")
    else:
        body = {
            "displayName": AUTH_APP_NAME,
            "signInAudience": "AzureADMyOrg",
            "web": {
                "redirectUris": [BOT_REDIRECT],
                "implicitGrantSettings": {
                    "enableAccessTokenIssuance": True,
                    "enableIdTokenIssuance": True,
                },
            },
            "requiredResourceAccess": [
                {
                    "resourceAppId": GRAPH_APP_ID,
                    "resourceAccess": [
                        {"id": GRAPH_OPENID, "type": "Scope"},
                        {"id": GRAPH_PROFILE, "type": "Scope"},
                    ],
                },
                {
                    "resourceAppId": DYNAMICS_APP_ID,
                    "resourceAccess": [
                        {"id": DYNAMICS_USER_IMPERSONATION, "type": "Scope"},
                    ],
                },
            ],
        }
        r = requests.post(f"{GRAPH}/applications", headers=headers, json=body, timeout=30)
        if r.status_code >= 400:
            _log(f"認証用アプリ作成失敗 {r.status_code}: {r.text}")
        r.raise_for_status()
        auth = r.json()
        auth_obj = auth["id"]
        auth_app_id = auth["appId"]
        _log(f"認証用アプリ作成: appId={auth_app_id}")

    # Expose an API: カスタムスコープ（既存があれば ID を再利用）
    existing_scopes = (auth.get("api") or {}).get("oauth2PermissionScopes") or []
    scope_obj = next((s for s in existing_scopes if s.get("value") == SCOPE_NAME), None)
    if scope_obj:
        scope_id = scope_obj["id"]
    else:
        scope_id = str(uuid.uuid4())
    identifier_uri = f"api://{auth_app_id}"
    scope_uri = f"{identifier_uri}/{SCOPE_NAME}"

    # ---- 2. キャンバス用アプリ登録 ----
    canvas = _get_app_by_name(headers, CANVAS_APP_NAME)
    if canvas:
        canvas_obj = canvas["id"]
        canvas_app_id = canvas["appId"]
        _log(f"キャンバス用アプリを再利用: appId={canvas_app_id}")
    else:
        body = {
            "displayName": CANVAS_APP_NAME,
            "signInAudience": "AzureADMyOrg",
            "spa": {"redirectUris": [WEBSITE_URL]},
            "web": {
                "implicitGrantSettings": {
                    "enableAccessTokenIssuance": True,
                    "enableIdTokenIssuance": True,
                },
            },
            "api": {"requestedAccessTokenVersion": 2},
        }
        r = requests.post(f"{GRAPH}/applications", headers=headers, json=body, timeout=30)
        if r.status_code >= 400:
            _log(f"キャンバス用アプリ作成失敗 {r.status_code}: {r.text}")
        r.raise_for_status()
        canvas = r.json()
        canvas_obj = canvas["id"]
        canvas_app_id = canvas["appId"]
        _log(f"キャンバス用アプリ作成: appId={canvas_app_id}")

    # ---- 3a. 認証用アプリ: identifierUri + カスタムスコープを先に登録 ----
    # 注意: preAuthorizedApplications はスコープ ID 確定後でないと 400
    #       ("Permission Id ... cannot be found") になるため 2 段階 PATCH にする。
    scope_body = {
        "identifierUris": [identifier_uri],
        "api": {
            "oauth2PermissionScopes": [
                {
                    "id": scope_id,
                    "adminConsentDisplayName": "Access the agent as the user",
                    "adminConsentDescription": "Allows the app to sign the user in.",
                    "userConsentDisplayName": "Access the agent as you",
                    "userConsentDescription": "Allows the app to sign you in.",
                    "value": SCOPE_NAME,
                    "type": "User",
                    "isEnabled": True,
                }
            ],
        },
    }
    _patch_app(headers, auth_obj, scope_body)
    _log(f"認証用アプリのスコープ設定: {scope_uri}")

    # ---- 3b. スコープ登録後に preAuthorizedApplications(キャンバス) を追加 ----
    preauth_body = {
        "api": {
            "preAuthorizedApplications": [
                {"appId": canvas_app_id, "delegatedPermissionIds": [scope_id]}
            ],
        },
    }
    _patch_app(headers, auth_obj, preauth_body)
    _log("キャンバスアプリを事前承認済みクライアントに追加")

    # ---- 4. キャンバス: 認証用スコープを requiredResourceAccess に追加 ----
    canvas_rra_body = {
        "spa": {"redirectUris": [WEBSITE_URL]},
        "web": {
            "implicitGrantSettings": {
                "enableAccessTokenIssuance": True,
                "enableIdTokenIssuance": True,
            },
        },
        "api": {"requestedAccessTokenVersion": 2},
        "requiredResourceAccess": [
            {
                "resourceAppId": auth_app_id,
                "resourceAccess": [{"id": scope_id, "type": "Scope"}],
            }
        ],
    }
    _patch_app(headers, canvas_obj, canvas_rra_body)
    _log("キャンバス用アプリの API 要求を設定")

    # ---- 5. サービスプリンシパル + 管理者同意 ----
    _log("サービスプリンシパルを準備...")
    auth_sp = _ensure_sp(headers, auth_app_id)
    canvas_sp = _ensure_sp(headers, canvas_app_id)
    graph_sp = _ensure_sp(headers, GRAPH_APP_ID)
    dyn_sp = _ensure_sp(headers, DYNAMICS_APP_ID)
    time.sleep(5)  # SP 伝播待ち

    _log("管理者同意（oauth2PermissionGrant）を付与...")
    _ensure_grant(headers, auth_sp, graph_sp, "openid profile")
    _ensure_grant(headers, auth_sp, dyn_sp, "user_impersonation")
    _ensure_grant(headers, canvas_sp, auth_sp, SCOPE_NAME)

    # ---- .env へ書き込み ----
    _write_env("WEBCHAT_AUTH_APP_ID", auth_app_id)
    _write_env("WEBCHAT_CANVAS_APP_ID", canvas_app_id)
    _write_env("WEBCHAT_AUTH_SCOPE_URI", scope_uri)

    _log("")
    _log("✅ アプリ登録の構成が完了しました。")
    _log(f"   WEBCHAT_AUTH_APP_ID   = {auth_app_id}")
    _log(f"   WEBCHAT_CANVAS_APP_ID = {canvas_app_id}")
    _log(f"   WEBCHAT_AUTH_SCOPE_URI= {scope_uri}")
    _log("")
    _log("次の手動ステップ（Copilot Studio）:")
    _log("  設定 > セキュリティ > 認証 > 手動で認証")
    _log("   - サービスプロバイダー: Microsoft Entra ID V2 with federated credentials")
    _log(f"   - Client ID: {auth_app_id}")
    _log(f"   - Scopes: profile openid {DATAVERSE_URL}/user_impersonation")
    _log(f"   - Token exchange URL: {scope_uri}")
    _log("   - 保存後に表示される Federated credential issuer/value を")
    _log("     add_fic.py で認証用アプリのフェデレーション資格情報に登録")
    _log("   - 「ユーザーをサインインさせる必要がある」ON にして公開")


if __name__ == "__main__":
    main()
