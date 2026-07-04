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
    set_key(str(env_path), "COWORK_OAUTH_CLIENT_ID", app_id)
    set_key(str(env_path), "COWORK_OAUTH_CLIENT_SECRET", client_secret)

    print()
    print("✅ 完了:")
    print(f"   COWORK_OAUTH_CLIENT_ID={app_id}")
    print("   COWORK_OAUTH_CLIENT_SECRET=（.env に保存。表示は省略）")
    print()
    print("次のステップ:")
    print("  1. python .github/skills/cowork/scripts/register_mcp_client.py")
    print("  2. Teams 開発者ポータルで OAuth client registration を作成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
