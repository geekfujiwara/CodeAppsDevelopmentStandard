"""
Cowork プラグイン用の Entra OAuth クライアントアプリを Microsoft Graph 経由で作成する（汎用）。

az login（デバイスコード）を使わず、standard スキルの auth_helper.py の認証済みトークンで実行する。
デバイスコードプロンプトが不要になり、CI やエージェント実行でも詰まらない。

  1. アプリ登録（Teams 固定リダイレクト URI ×2）
  2. Dynamics CRM 委任権限 mcp.tools を requiredResourceAccess に付与
  3. クライアントシークレットを作成
  4. Client ID / Secret を .env に書き込む（COWORK_OAUTH_CLIENT_ID / COWORK_OAUTH_CLIENT_SECRET）

値は .env（DATAVERSE_URL / TENANT_ID）と環境変数から取得する。
シークレットは標準出力に表示しない（.env のみ／.gitignore 済み）。

使い方:
  python .github/skills/cowork/scripts/setup_entra_oauth_graph.py
  # 表示名を変える場合
  $env:COWORK_APP_NAME="Contoso-Cowork-OAuth"; python .../setup_entra_oauth_graph.py
"""
from __future__ import annotations

import datetime as _dt
import os
import re
import sys
from pathlib import Path


def _find_root() -> Path:
    """.env を持つプロジェクトルートを上方向に探索する。"""
    d = Path(__file__).resolve()
    for parent in [d, *d.parents]:
        if (parent / ".env").exists():
            return parent
    return Path.cwd()


ROOT = _find_root()
# auth_helper を import（standard スキル配下）
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
import requests  # noqa: E402
from auth_helper import get_token  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"
DISPLAY_NAME = os.getenv("COWORK_APP_NAME", "Cowork-DataverseMCP-OAuth")
DYNAMICS_APP_ID = "00000007-0000-0000-c000-000000000000"
MCP_TOOLS_SCOPE_ID = "a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a"
REDIRECT_URIS = [
    "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect",
    "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect",
]
ENV_PATH = ROOT / ".env"


def _headers() -> dict:
    token = get_token("https://graph.microsoft.com/.default")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _write_env(key: str, value: str) -> None:
    text = ENV_PATH.read_text(encoding="utf-8")
    pattern = rf"^{re.escape(key)}=.*$"
    if re.search(pattern, text, flags=re.MULTILINE):
        text = re.sub(pattern, f"{key}={value}", text, flags=re.MULTILINE)
    else:
        text = text.rstrip("\n") + f"\n{key}={value}\n"
    ENV_PATH.write_text(text, encoding="utf-8")


def main() -> int:
    headers = _headers()

    # 既存アプリを確認（同名の重複作成を避ける）
    q = requests.get(
        f"{GRAPH}/applications?$filter=displayName eq '{DISPLAY_NAME}'&$select=id,appId",
        headers=headers, timeout=30,
    )
    q.raise_for_status()
    existing = q.json().get("value", [])
    if existing:
        obj_id, app_id = existing[0]["id"], existing[0]["appId"]
        print(f"既存アプリを再利用: appId={app_id}", file=sys.stderr)
    else:
        body = {
            "displayName": DISPLAY_NAME,
            "signInAudience": "AzureADMyOrg",
            "web": {"redirectUris": REDIRECT_URIS},
            "requiredResourceAccess": [
                {
                    "resourceAppId": DYNAMICS_APP_ID,
                    "resourceAccess": [{"id": MCP_TOOLS_SCOPE_ID, "type": "Scope"}],
                }
            ],
        }
        r = requests.post(f"{GRAPH}/applications", headers=headers, json=body, timeout=30)
        r.raise_for_status()
        app = r.json()
        obj_id, app_id = app["id"], app["appId"]
        print(f"アプリ作成: appId={app_id}", file=sys.stderr)

    # クライアントシークレット作成（2年）
    end = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=730)).replace(microsecond=0).isoformat()
    r = requests.post(
        f"{GRAPH}/applications/{obj_id}/addPassword",
        headers=headers,
        json={"passwordCredential": {"displayName": "cowork-oauth", "endDateTime": end}},
        timeout=30,
    )
    r.raise_for_status()
    secret = r.json()["secretText"]

    _write_env("COWORK_OAUTH_CLIENT_ID", app_id)
    _write_env("COWORK_OAUTH_CLIENT_SECRET", secret)
    print(".env に COWORK_OAUTH_CLIENT_ID / COWORK_OAUTH_CLIENT_SECRET を書き込みました。", file=sys.stderr)
    print(f"   COWORK_OAUTH_CLIENT_ID={app_id}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
