"""Entra OAuth クライアントアプリを Microsoft Graph API 経由で作成する（汎用）。

auth_helper.py の認証キャッシュを利用するため、az CLI のデバイスコード認証が不要。
Cowork プラグイン用の OAuth 2.0 認可コードフロー クライアントを作成し、
Dynamics CRM の委任権限 mcp.tools を付与、クライアントシークレットを .env に保存する。

前提: auth_helper.py（standard/scripts）、python-dotenv、requests。

使い方:
  python setup_entra_oauth_graph.py
  python setup_entra_oauth_graph.py --display-name "MyApp-Cowork-OAuth"
  python setup_entra_oauth_graph.py --display-name "MyApp-Cowork-OAuth" --secret-years 1

設定（引数 > .env > 既定）:
  TENANT_ID                  テナント ID（.env から取得）
  COWORK_OAUTH_CLIENT_ID     作成後に書き込まれる Client ID
  COWORK_OAUTH_CLIENT_SECRET 作成後に書き込まれるクライアントシークレット

  テナントがユーザーの自己同意（user consent）を制限している場合、Dynamics CRM の
  委任スコープ mcp.tools はユーザー個々の同意画面でブロックされ、Cowork 初回利用時の
  OAuth 同意がサイレントに失敗する（エラーが出ずコネクタが動かないだけに見える）。
  このスクリプトはアプリ登録後に **テナント管理者の事前同意（admin consent）** の状態を
  確認し、未完了なら admin consent URL を提示する（→ SKILL.md Step 3 / troubleshooting #22）。

教訓:
  元々は az CLI (setup_entra_oauth.ps1) で Entra アプリを作成していたが、
  auth_helper.py で既にキャッシュ済みの認証情報があるのに毎回 az login の
  デバイスコード認証を求められる問題があった。
  auth_helper.py の get_token(scope="https://graph.microsoft.com/.default") で
  Microsoft Graph API を直接呼ぶことで、追加の認証なしで Entra アプリ操作が可能になった。
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# auth_helper を standard/scripts から解決
HERE = Path(__file__).resolve().parent
for candidate in [
    HERE / ".." / ".." / "standard" / "scripts",           # skills 配下の場合
    HERE / ".." / ".." / ".." / ".github" / "skills" / "standard" / "scripts",  # プロジェクトルートの場合
]:
    resolved = candidate.resolve()
    if (resolved / "auth_helper.py").is_file():
        sys.path.insert(0, str(resolved))
        break

from auth_helper import get_token  # noqa: E402

try:
    from dotenv import load_dotenv, set_key
except ImportError:
    sys.exit("python-dotenv が必要です: pip install python-dotenv")

import requests  # noqa: E402

# Dynamics CRM (Dataverse) の固定 ID
DYNAMICS_CRM_APP_ID = "00000007-0000-0000-c000-000000000000"
MCP_TOOLS_PERMISSION_ID = "a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Teams OAuth リダイレクト URI（固定値）
REDIRECT_URIS = [
    "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect",
    "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect",
]


def resolve_env() -> Path:
    """プロジェクトルートの .env を探す。"""
    d = HERE
    while d != d.parent:
        candidate = d / ".env"
        if candidate.is_file():
            return candidate
        d = d.parent
    sys.exit(".env が見つかりません。プロジェクトルートに .env を作成してください。")


def graph_headers() -> dict[str, str]:
    token = get_token(scope="https://graph.microsoft.com/.default")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def graph_post(path: str, body: dict) -> dict:
    r = requests.post(f"{GRAPH_BASE}{path}", headers=graph_headers(), json=body)
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text}", file=sys.stderr)
    r.raise_for_status()
    return r.json()


def graph_get(path: str) -> dict:
    r = requests.get(f"{GRAPH_BASE}{path}", headers=graph_headers())
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text}", file=sys.stderr)
    r.raise_for_status()
    return r.json()


def ensure_service_principal(app_id: str) -> str | None:
    """自アプリのサービスプリンシパルを取得（無ければ作成）し、その id を返す。

    テナント管理者の事前同意（admin consent）状態を後から検証するために必要。
    作成に失敗しても（権限不足等）致命的エラーにはせず None を返す
    （admin consent URL を踏めばテナント側で自動的に作成されるため）。
    """
    found = graph_get(f"/servicePrincipals?$filter=appId eq '{app_id}'&$select=id")
    values = found.get("value", [])
    if values:
        return values[0]["id"]
    try:
        created = graph_post("/servicePrincipals", {"appId": app_id})
        return created.get("id")
    except requests.HTTPError:
        return None


def check_admin_consent(sp_id: str) -> bool | None:
    """mcp.tools の委任スコープにテナント全体の事前同意が既にあるかを確認する。

    戻り値: True=同意済み / False=未同意 / None=権限不足等で確認不能（要手動確認）。
    """
    if not sp_id:
        return None
    try:
        dynamics_sp = graph_get(
            f"/servicePrincipals?$filter=appId eq '{DYNAMICS_CRM_APP_ID}'&$select=id"
        )
        dyn_values = dynamics_sp.get("value", [])
        if not dyn_values:
            return None
        resource_id = dyn_values[0]["id"]
        grants = graph_get(f"/servicePrincipals/{sp_id}/oauth2PermissionGrants")
        for g in grants.get("value", []):
            if g.get("resourceId") == resource_id and "mcp.tools" in (g.get("scope") or "").split():
                return True
        return False
    except requests.HTTPError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Entra OAuth クライアントを Graph API で作成（auth_helper 利用）")
    ap.add_argument("--display-name", default="Cowork-DataverseMCP-OAuth",
                    help="アプリの表示名（既定: Cowork-DataverseMCP-OAuth）")
    ap.add_argument("--secret-years", type=int, default=2,
                    help="シークレットの有効年数（既定: 2）")
    ap.add_argument("--env-path", help=".env のパス（既定: プロジェクトルートから自動検出）")
    args = ap.parse_args()

    env_path = Path(args.env_path) if args.env_path else resolve_env()
    load_dotenv(env_path)

    # ---- Step 1: アプリ登録 ----
    print(f"== 1. アプリ登録: {args.display_name} ==")

    app_body = {
        "displayName": args.display_name,
        "signInAudience": "AzureADMyOrg",
        "web": {"redirectUris": REDIRECT_URIS},
        "requiredResourceAccess": [
            {
                "resourceAppId": DYNAMICS_CRM_APP_ID,
                "resourceAccess": [
                    {"id": MCP_TOOLS_PERMISSION_ID, "type": "Scope"}
                ],
            }
        ],
    }

    result = graph_post("/applications", app_body)
    app_object_id = result["id"]
    app_id = result["appId"]
    print(f"   appId={app_id}")
    print(f"   objectId={app_object_id}")

    # ---- Step 2: クライアントシークレット作成 ----
    print(f"== 2. クライアントシークレット作成（{args.secret_years} 年） ==")
    time.sleep(2)  # Entra 側の伝播待ち

    end_dt = datetime.now(timezone.utc) + timedelta(days=365 * args.secret_years)
    secret_body = {
        "passwordCredential": {
            "displayName": "cowork-oauth",
            "endDateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
    }
    secret_result = graph_post(f"/applications/{app_object_id}/addPassword", secret_body)
    client_secret = secret_result["secretText"]
    print("   シークレット作成完了（値は .env に保存）")

    # ---- Step 3: .env に書き込み ----
    print(f"== 3. .env に書き込み ({env_path}) ==")
    # quote_mode 既定値 "always" だと値がクォート付きで書かれ、dotenv を介さず素朴に
    # 正規表現/split('=') で読む後続ツール（PowerShell 等）で referenceId 等が壊れる（→ troubleshooting #16, #24）。
    set_key(str(env_path), "COWORK_OAUTH_CLIENT_ID", app_id, quote_mode="never")
    set_key(str(env_path), "COWORK_OAUTH_CLIENT_SECRET", client_secret, quote_mode="never")

    # ---- Step 4: サービスプリンシパルを作成（admin consent 状態確認の前提） ----
    print("== 4. サービスプリンシパルを確認/作成 ==")
    time.sleep(2)  # アプリ作成のレプリケーション待ち
    sp_id = ensure_service_principal(app_id)
    if sp_id:
        print(f"   servicePrincipal id={sp_id}")
    else:
        print("   WARN: サービスプリンシパルの作成/確認に失敗（権限不足の可能性。admin consent URL を踏めば自動作成される）")

    # ---- Step 5: テナント管理者の事前同意（admin consent）状態確認 ----
    print("== 5. テナント管理者の事前同意（admin consent）確認 ==")
    tenant_id = os.environ.get("TENANT_ID", "")
    consent_url = f"https://login.microsoftonline.com/{tenant_id or '<TENANT_ID>'}/adminconsent?client_id={app_id}"
    consented = check_admin_consent(sp_id) if sp_id else None
    if consented is True:
        print("   ✅ 既にテナント全体への事前同意が付与済みです（mcp.tools）。")
    else:
        status = "❌ 未同意" if consented is False else "❓ 確認不能（権限不足）"
        print(f"   {status}: テナント管理者（Global Admin 等）が下記 URL にアクセスして事前同意してください：")
        print(f"   {consent_url}")
        print("   （ユーザー自己同意がテナントで禁止されていると、この事前同意がない限り Cowork 初回利用時の同意がサイレントに失敗します）")

    print()
    print("✅ 完了:")
    print(f"   COWORK_OAUTH_CLIENT_ID={app_id}")
    print("   COWORK_OAUTH_CLIENT_SECRET=（.env に保存。表示は省略）")
    print()
    print("次のステップ:")
    print("  1. 上記 admin consent が ❌/❓ の場合、テナント管理者に URL を共有して同意を得る")
    print("  2. python .github/skills/cowork/scripts/register_mcp_client.py")
    print("  3. Teams 開発者ポータルで OAuth client registration を作成")
    print("  4. python .github/skills/cowork/scripts/diagnose_cowork_connector.py で総合確認")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
