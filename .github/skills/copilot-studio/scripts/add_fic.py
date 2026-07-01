"""Copilot Studio が発行した Federated Identity Credential(FIC) を
認証用アプリ登録に Graph 経由で登録する。

Copilot Studio の 設定 > セキュリティ > 認証 を「手動で認証」（Microsoft Entra ID
V2 with federated credentials）で保存すると、issuer と subject(value) が表示される。
その 2 値を引数で渡して認証用アプリに FIC を登録する（シークレットレス）。

使い方:
    python .github/skills/copilot-studio/scripts/add_fic.py "<issuer>" "<subject/value>"

audiences は Entra のトークン交換用固定値 api://AzureADTokenExchange。
.env 必須: WEBCHAT_AUTH_APP_ID（setup_webchat_auth.py が書き込む）
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(_ROOT / ".github" / "skills" / "standard" / "scripts"))
import requests  # noqa: E402
from auth_helper import get_token  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(_ROOT / ".env")

GRAPH = "https://graph.microsoft.com/v1.0"
AUTH_APP_ID = os.getenv("WEBCHAT_AUTH_APP_ID", "")
FIC_NAME = os.getenv("WEBCHAT_FIC_NAME", "CopilotStudioManualAuth")


def _headers() -> dict:
    token = get_token("https://graph.microsoft.com/.default")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: python add_fic.py <issuer> <subject>", file=sys.stderr)
        sys.exit(1)
    if not AUTH_APP_ID:
        print("WEBCHAT_AUTH_APP_ID が .env に未設定です。", file=sys.stderr)
        sys.exit(1)
    issuer, subject = sys.argv[1], sys.argv[2]
    headers = _headers()

    # objectId を appId から解決
    q = requests.get(
        f"{GRAPH}/applications?$filter=appId eq '{AUTH_APP_ID}'&$select=id", headers=headers, timeout=30
    )
    q.raise_for_status()
    vals = q.json().get("value", [])
    if not vals:
        print(f"認証用アプリが見つかりません: {AUTH_APP_ID}", file=sys.stderr)
        sys.exit(1)
    obj_id = vals[0]["id"]

    # 既存 FIC を確認（同 issuer+subject があれば冪等スキップ）
    lst = requests.get(f"{GRAPH}/applications/{obj_id}/federatedIdentityCredentials", headers=headers, timeout=30)
    lst.raise_for_status()
    for fic in lst.json().get("value", []):
        if fic.get("subject") == subject and fic.get("issuer") == issuer:
            print(f"FIC は既存: {fic.get('name')}", file=sys.stderr)
            return

    body = {
        "name": FIC_NAME,
        "issuer": issuer,
        "subject": subject,
        "audiences": ["api://AzureADTokenExchange"],
        "description": "Copilot Studio manual auth (FIC)",
    }
    r = requests.post(f"{GRAPH}/applications/{obj_id}/federatedIdentityCredentials", headers=headers, json=body, timeout=30)
    if r.status_code >= 400:
        print(f"FIC 作成失敗 {r.status_code}: {r.text}", file=sys.stderr)
        r.raise_for_status()
    print("✅ フェデレーション資格情報を登録しました。", file=sys.stderr)


if __name__ == "__main__":
    main()
