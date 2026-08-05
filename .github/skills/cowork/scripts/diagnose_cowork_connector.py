"""Cowork の Dataverse MCP コネクタが動作する状態か、Teams ポータル/M365 管理センターの
手作業（アップロード）に進む前に一括診断する。

Cowork プラグインは「アップロードは成功するがコネクタが動かない」という失敗の仕方をする
（エラーが表示されないことが多い）。原因は主に次の3層のどこかが欠けていることが多い。

  レイヤー1: Entra OAuth アプリ登録・シークレット・リダイレクト URI が正しいか
  レイヤー2: テナント管理者の事前同意（admin consent）が mcp.tools に付与されているか
             （欠けていると、ユーザー個々の同意画面がテナントの user consent 制限で
             ブロックされ、Cowork 初回利用時の同意がサイレントに失敗する）
  レイヤー3: Dataverse 環境の allowedmcpclients に登録・有効化されているか

このスクリプトは上記3層を API で確認し、失敗しているレイヤーごとに次の対処コマンドを提示する。
手動の Teams ポータル登録・zip 再ビルド・M365 管理センターへの再アップロードといった
時間のかかる工程に進む前に、まずこれで原因を切り分ける。

前提: auth_helper.py（standard/scripts）、python-dotenv、requests。
.env に TENANT_ID / DATAVERSE_URL / COWORK_OAUTH_CLIENT_ID が必要
（COWORK_OAUTH_CLIENT_SECRET はレイヤー1のシークレット有効期限チェックにのみ使用）。

使い方:
  python diagnose_cowork_connector.py
  python diagnose_cowork_connector.py --app-id <CLIENT_ID>

終了コード: 全レイヤー OK なら 0、1件以上 NG/確認不能なら 1。
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
for candidate in [
    HERE / ".." / ".." / "standard" / "scripts",
    HERE / ".." / ".." / ".." / ".github" / "skills" / "standard" / "scripts",
]:
    resolved = candidate.resolve()
    if (resolved / "auth_helper.py").is_file():
        sys.path.insert(0, str(resolved))
        break

from auth_helper import get_token, get_session, DATAVERSE_URL  # noqa: E402

try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("python-dotenv が必要です: pip install python-dotenv")

import requests  # noqa: E402

DYNAMICS_CRM_APP_ID = "00000007-0000-0000-c000-000000000000"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TEAMS_REDIRECT_URIS = {
    "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect",
    "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect",
}


def resolve_env() -> Path | None:
    d = HERE
    while d != d.parent:
        candidate = d / ".env"
        if candidate.is_file():
            return candidate
        d = d.parent
    return None


def graph_get(path: str) -> dict:
    token = get_token(scope="https://graph.microsoft.com/.default")
    r = requests.get(f"{GRAPH_BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def check_layer1_app(app_id: str) -> tuple[bool | None, str]:
    """レイヤー1: アプリ登録・リダイレクト URI・シークレット有効期限。"""
    try:
        found = graph_get(
            f"/applications?$filter=appId eq '{app_id}'"
            "&$select=displayName,web,passwordCredentials"
        )
    except requests.HTTPError as exc:
        return None, f"確認不能（Graph API 呼び出し失敗: {exc}）"

    values = found.get("value", [])
    if not values:
        return False, f"appId={app_id} のアプリ登録が見つかりません"

    app = values[0]
    redirect_uris = set((app.get("web") or {}).get("redirectUris") or [])
    missing_redirects = TEAMS_REDIRECT_URIS - redirect_uris
    if missing_redirects:
        return False, f"リダイレクト URI が不足: {missing_redirects}"

    creds = app.get("passwordCredentials") or []
    if not creds:
        return False, "クライアントシークレットが未作成"

    now = datetime.now(timezone.utc)
    expiries = []
    for c in creds:
        end = c.get("endDateTime")
        if end:
            expiries.append(datetime.fromisoformat(end.replace("Z", "+00:00")))
    if expiries and max(expiries) < now:
        return False, f"全てのクライアントシークレットが期限切れ（最新: {max(expiries)}）"

    return True, f"アプリ '{app.get('displayName')}' 登録済み・リダイレクト URI OK・シークレット有効"


def check_layer2_consent(app_id: str) -> tuple[bool | None, str]:
    """レイヤー2: テナント管理者の事前同意（admin consent）。"""
    try:
        sp_found = graph_get(f"/servicePrincipals?$filter=appId eq '{app_id}'&$select=id")
        sp_values = sp_found.get("value", [])
        if not sp_values:
            return False, "サービスプリンシパルが未作成（admin consent が一度も行われていない可能性）"
        sp_id = sp_values[0]["id"]

        dyn_found = graph_get(
            f"/servicePrincipals?$filter=appId eq '{DYNAMICS_CRM_APP_ID}'&$select=id"
        )
        dyn_values = dyn_found.get("value", [])
        if not dyn_values:
            return None, "Dynamics CRM サービスプリンシパルが見つかりません（環境異常）"
        resource_id = dyn_values[0]["id"]

        grants = graph_get(f"/servicePrincipals/{sp_id}/oauth2PermissionGrants")
        for g in grants.get("value", []):
            if g.get("resourceId") == resource_id and "mcp.tools" in (g.get("scope") or "").split():
                return True, f"mcp.tools への事前同意あり（consentType={g.get('consentType')}）"
        return False, "mcp.tools への事前同意（admin consent）が見つかりません"
    except requests.HTTPError as exc:
        return None, f"確認不能（Graph API 権限不足の可能性: {exc}）"


def check_layer3_allowlist(app_id: str) -> tuple[bool | None, str]:
    """レイヤー3: Dataverse 環境の allowedmcpclients 登録・有効化。"""
    try:
        session = get_session()
        url = (
            f"{DATAVERSE_URL}/api/data/v9.2/allowedmcpclients"
            f"?$filter=applicationid eq '{app_id}'&$select=name,isenabled"
        )
        r = session.get(url)
        r.raise_for_status()
        values = r.json().get("value", [])
        if not values:
            return False, "allowedmcpclients に未登録"
        client = values[0]
        if not client.get("isenabled"):
            return False, f"'{client.get('name')}' は登録済みだが無効化されています"
        return True, f"'{client.get('name')}' が登録・有効化済み"
    except requests.HTTPError as exc:
        return None, f"確認不能（Dataverse API 呼び出し失敗: {exc}）"


def main() -> int:
    ap = argparse.ArgumentParser(description="Cowork Dataverse MCP コネクタの3層診断")
    ap.add_argument("--app-id", default=os.getenv("COWORK_OAUTH_CLIENT_ID", ""),
                    help="診断対象の Entra Client ID（既定: .env の COWORK_OAUTH_CLIENT_ID）")
    args = ap.parse_args()

    env_path = resolve_env()
    if env_path:
        load_dotenv(env_path)
    app_id = args.app_id or os.getenv("COWORK_OAUTH_CLIENT_ID", "")
    if not app_id:
        sys.exit("--app-id か .env の COWORK_OAUTH_CLIENT_ID を指定してください。")

    print(f"診断対象アプリ: {app_id}")
    print(f"Dataverse 環境: {DATAVERSE_URL}\n")

    checks = [
        ("レイヤー1: Entra OAuth アプリ登録", check_layer1_app(app_id),
         "python .github/skills/cowork/scripts/setup_entra_oauth_graph.py"),
        ("レイヤー2: テナント管理者の事前同意（admin consent）", check_layer2_consent(app_id),
         "python .github/skills/cowork/scripts/setup_entra_oauth_graph.py の Step 5 の案内 URL を管理者に共有"),
        ("レイヤー3: 環境の allowedmcpclients 登録", check_layer3_allowlist(app_id),
         "python .github/skills/cowork/scripts/register_mcp_client.py"),
    ]

    overall_ok = True
    for label, (ok, detail), fix_cmd in checks:
        if ok is True:
            mark = "✅"
        elif ok is False:
            mark = "❌"
            overall_ok = False
        else:
            mark = "❓"
            overall_ok = False
        print(f"{mark} {label}")
        print(f"   {detail}")
        if ok is not True:
            print(f"   → 対処: {fix_cmd}")
        print()

    if overall_ok:
        print("✅ 3層すべて OK です。Teams 開発者ポータルでの OAuth client registration / manifest の")
        print("   referenceId・mcpToolDescription（ツール名の一致）を確認してください。")
        return 0

    print("❌ 上記の対処を行ってから再実行してください（Teams ポータル登録・zip 再アップロードより先に解消する）。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
