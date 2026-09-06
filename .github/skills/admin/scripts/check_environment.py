"""開発着手前の Power Platform 環境チェック（読み取り専用）。

対象環境が「開発してよい状態か」をまとめて確認する。
既定環境ではないか / マネージド環境か / Dataverse が使えるか / Code Apps が使えるか /
Dataverse MCP が有効か / 監査が有効か / 必要なセキュリティ ロールがあるか /
管理 API を呼べるか（管理者ロール相当か）/ 適用される DLP ポリシーは何か、を判定する。

```powershell
python .github/skills/admin/scripts/check_environment.py `
  --environment-id $env:ENV_ID `
  --require-managed --require-code-apps
```

終了コード: 0 = 問題なし / 1 = 開発前に解消が必要な問題を検出。
"""

from __future__ import annotations

import argparse
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

import auth_helper  # noqa: E402
from dlp_helper import BAP_BASE, BAP_SCOPE, _request, applied_policies  # noqa: E402

CODE_APP_TYPE = 4  # canvasapp.canvasapptype = 4 は Code App
ADMIN_ROLES = ("System Administrator", "システム管理者")
CUSTOMIZER_ROLES = ("System Customizer", "システム カスタマイザー")

_results: list[tuple[str, str, str]] = []


def record(level: str, item: str, detail: str) -> None:
    _results.append((level, item, detail))


def environment_detail(environment_id: str) -> dict:
    path = (
        "/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/"
        f"{environment_id}?api-version=2021-04-01"
    )
    return _request("GET", BAP_BASE + path, BAP_SCOPE)


def check_environment(env: dict) -> str | None:
    """環境の基本プロパティを確認し、Dataverse の instanceUrl を返す。"""
    props = env.get("properties", {})
    name = props.get("displayName", "(不明)")
    sku = props.get("environmentSku", "(不明)")
    record("INFO", "環境", f"{name} / SKU={sku} / region={props.get('azureRegion', '-')}")

    if props.get("isDefault") or sku == "Default":
        record("NG", "既定環境", "既定（Default）環境です。開発には専用環境を作成してください")
    else:
        record("OK", "既定環境", "既定環境ではありません")

    runtime = (props.get("states", {}).get("runtime", {}) or {}).get("id")
    if runtime and runtime != "Enabled":
        record("NG", "環境の状態", f"runtime={runtime}")
    else:
        record("OK", "環境の状態", "Enabled")

    level = (props.get("governanceConfiguration", {}) or {}).get("protectionLevel", "Basic")
    extended = (props.get("governanceConfiguration", {}).get("settings", {}) or {}).get(
        "extendedSettings", {}
    )
    if level == "Standard":
        record(
            "OK",
            "マネージド環境",
            f"有効（共有制限={extended.get('limitSharingMode', '-')} / "
            f"ソリューション チェッカー={extended.get('solutionCheckerMode', '-')}）",
        )
    else:
        record("WARN", "マネージド環境", f"無効（protectionLevel={level}）")

    linked = props.get("linkedEnvironmentMetadata", {}) or {}
    instance_url = (linked.get("instanceUrl") or "").rstrip("/")
    if not instance_url:
        record("NG", "Dataverse", "Dataverse がリンクされていません")
        return None
    state = linked.get("instanceState", "-")
    if state != "Ready":
        record("NG", "Dataverse", f"{instance_url}（state={state}）")
        return None
    record("OK", "Dataverse", f"{instance_url}（v{linked.get('version', '-')}）")
    return instance_url


def check_dataverse(instance_url: str) -> None:
    configured = (auth_helper.DATAVERSE_URL or "").rstrip("/")
    if configured.lower() != instance_url.lower():
        record(
            "WARN",
            "Dataverse 接続先",
            f".env の DATAVERSE_URL（{configured or '未設定'}）が環境の {instance_url} と一致しません。"
            "Dataverse 側のチェックをスキップします",
        )
        return

    org = auth_helper.api_get("organizations?$select=name,isauditenabled,orgdborgsettings&$top=1")["value"][0]
    record("OK" if org.get("isauditenabled") else "WARN", "監査", "有効" if org.get("isauditenabled") else "無効")

    settings = _org_settings(org.get("orgdborgsettings") or "")
    mcp = settings.get("IsMCPEnabled", "").lower()
    if mcp == "true":
        record("OK", "Dataverse MCP", "有効（IsMCPEnabled=true）")
    else:
        record("WARN", "Dataverse MCP", f"無効または未設定（IsMCPEnabled={settings.get('IsMCPEnabled', '-')}）")

    clients = auth_helper.api_get("allowedmcpclients?$select=name,isenabled&$top=200")["value"]
    enabled = [c for c in clients if c.get("isenabled")]
    record(
        "OK" if enabled else "WARN",
        "MCP クライアント許可",
        f"{len(enabled)} 件が有効（allowedmcpclients）" if enabled else "有効なクライアントがありません",
    )

    code_apps = auth_helper.api_get(
        f"canvasapps?$select=displayname&$filter=canvasapptype eq {CODE_APP_TYPE}&$top=50"
    )["value"]
    if code_apps:
        record("OK", "Code Apps", f"利用可能（この環境に {len(code_apps)} 件のコード アプリ）")
    else:
        record(
            "WARN",
            "Code Apps",
            "この環境にコード アプリがありません。管理センターの『コード アプリを許可する』を確認してください",
        )

    _check_roles()


def _org_settings(xml_text: str) -> dict[str, str]:
    if not xml_text.strip():
        return {}
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return {}
    return {child.tag: (child.text or "") for child in root}


def _check_roles() -> None:
    who = auth_helper.api_get("WhoAmI()")
    user_id = who["UserId"]
    roles = {
        r["name"]
        for r in auth_helper.api_get(
            f"systemusers({user_id})/systemuserroles_association?$select=name"
        )["value"]
    }
    teams = auth_helper.api_get(f"systemusers({user_id})/teammembership_association?$select=name&$top=50")["value"]
    for team in teams:
        team_id = team.get("teamid")
        if not team_id:
            continue
        roles |= {
            r["name"]
            for r in auth_helper.api_get(f"teams({team_id})/teamroles_association?$select=name")["value"]
        }

    if roles & set(ADMIN_ROLES):
        record("OK", "セキュリティ ロール", "System Administrator を保持しています")
    elif roles & set(CUSTOMIZER_ROLES):
        record(
            "WARN",
            "セキュリティ ロール",
            "System Customizer のみです。テーブル作成やソリューション操作で権限不足になる場合があります",
        )
    else:
        record("NG", "セキュリティ ロール", f"管理系ロールがありません（保持: {', '.join(sorted(roles)) or 'なし'}）")


def check_admin_access(environment_id: str) -> None:
    try:
        policies = applied_policies(environment_id)
    except Exception as exc:  # noqa: BLE001
        record("WARN", "管理 API アクセス", f"DLP ポリシーを取得できません（{exc}）")
        return
    record("OK", "管理 API アクセス", "テナントの DLP ポリシーを参照できます（管理者ロール相当）")
    if policies:
        names = ", ".join(p.get("displayName", p.get("name", "?")) for p in policies)
        record("INFO", "適用される DLP", f"{len(policies)} 件: {names}")
    else:
        record("INFO", "適用される DLP", "この環境に適用されるポリシーはありません")


def main() -> int:
    parser = argparse.ArgumentParser(description="開発着手前の Power Platform 環境チェック")
    parser.add_argument("--environment-id", default=os.getenv("ENV_ID") or os.getenv("POWER_PLATFORM_ENVIRONMENT_ID"))
    parser.add_argument("--require-managed", action="store_true", help="マネージド環境でなければ NG にする")
    parser.add_argument("--require-code-apps", action="store_true", help="Code Apps が確認できなければ NG にする")
    parser.add_argument("--require-mcp", action="store_true", help="Dataverse MCP が無効なら NG にする")
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id か .env の ENV_ID が必要です")

    env = environment_detail(args.environment_id)
    instance_url = check_environment(env)
    if instance_url:
        check_dataverse(instance_url)
    check_admin_access(args.environment_id)

    promote = set()
    if args.require_managed:
        promote.add("マネージド環境")
    if args.require_code_apps:
        promote.add("Code Apps")
    if args.require_mcp:
        promote.add("Dataverse MCP")

    ng = 0
    print()
    for level, item, detail in _results:
        if level == "WARN" and item in promote:
            level = "NG"
        if level == "NG":
            ng += 1
        print(f"[{level:4}] {item}: {detail}")

    print()
    if ng:
        print(f"NG: {ng} 件の問題があります。解消してから実装に着手してください。")
        return 1
    print("OK: 環境チェックに問題はありません。続けて DLP 事前チェック（check_dlp.py）を実行してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
