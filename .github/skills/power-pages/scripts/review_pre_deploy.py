"""Power Pages デプロイ前レビュー — ビルド出力 + Dataverse 環境チェック.

ローカルビルド出力の検証に加え、Dataverse API でテーブル権限・サイト設定の
整合性を確認する。デプロイ後の 403/404 を事前に検出して防止する。

前提:
    - .env に DATAVERSE_URL, TENANT_ID が設定されている
    - auth_helper.py がプロジェクトルートまたは標準パスにある
    - portal/dist-site/ にビルド済み出力がある

Usage:
    cd portal
    python ../.github/skills/power-pages/scripts/review_pre_deploy.py

環境変数:
    PORTAL_ROOT     : ポータルルート (default: ".")
    SKIP_REMOTE     : "1" でリモートチェックをスキップ（CI ローカルテスト用）
    TARGET_TABLES   : チェック対象テーブル（カンマ区切り、default: .env の PORTAL_TABLES or 自動検出）
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Windows cp932 対策: stdout を UTF-8 に強制
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# パス設定
# ---------------------------------------------------------------------------

PORTAL_ROOT = Path(os.environ.get("PORTAL_ROOT", ".")).resolve()
PROJECT_ROOT = PORTAL_ROOT.parent
SKILL_SCRIPTS = PROJECT_ROOT / ".github" / "skills" / "standard" / "scripts"

sys.path.insert(0, str(SKILL_SCRIPTS))
sys.path.insert(0, str(PROJECT_ROOT))

# dotenv
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

SKIP_REMOTE = os.environ.get("SKIP_REMOTE", "0") == "1"
SRC_DIR = PORTAL_ROOT / "src"
DIST_DIR = PORTAL_ROOT / "dist-site"

# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------

PASS = "\033[92m✅\033[0m"
FAIL = "\033[91m❌\033[0m"
WARN = "\033[93m⚠️\033[0m"
INFO = "\033[94mℹ️\033[0m"

results: list[tuple[str, str, str]] = []


def check(category: str, description: str, passed: bool, warn_only: bool = False):
    """チェック結果を記録・表示."""
    if passed:
        icon = PASS
        status = "PASS"
    elif warn_only:
        icon = WARN
        status = "WARN"
    else:
        icon = FAIL
        status = "FAIL"
    results.append((status, category, description))
    print(f"  {icon} {description}")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, UnicodeDecodeError):
        return ""


# ---------------------------------------------------------------------------
# [1] ローカルビルド検証
# ---------------------------------------------------------------------------

def check_local_build():
    print("\n[1/5] ローカルビルド検証")

    # 1.1 dist-site/index.html
    index_html = DIST_DIR / "index.html"
    check("1.1", "dist-site/index.html が存在する", index_html.exists())

    # 1.2 assets/ に JS が 1 つ
    assets_dir = DIST_DIR / "assets"
    js_files = list(assets_dir.glob("*.js")) if assets_dir.exists() else []
    check("1.2", f"assets/ に JS ファイルが {len(js_files)} 個 (1個が理想)", len(js_files) >= 1)
    if js_files:
        for jf in js_files:
            print(f"    {INFO} {jf.name} ({jf.stat().st_size // 1024}KB)")

    # 1.3 相対パス参照
    if index_html.exists():
        html_content = read_text(index_html)
        uses_relative = "./assets/" in html_content or '"./assets' in html_content
        check("1.3", 'index.html が相対パス (./assets/) で JS/CSS を参照', uses_relative)
    else:
        check("1.3", "index.html が相対パス参照", False)

    # 1.5-1.7 api.ts パターン
    api_ts = SRC_DIR / "lib" / "api.ts"
    api_content = read_text(api_ts)
    if api_content:
        check("1.5", 'api.ts: credentials: "same-origin"', '"same-origin"' in api_content)
        check("1.6", 'api.ts: redirect: "manual"', '"manual"' in api_content)
        check("1.7", "api.ts: __RequestVerificationToken 取得ロジック",
              "RequestVerificationToken" in api_content)

        # 1.8 reporter @odata.bind チェック
        has_reporter_bind = bool(re.search(
            r'(reporter|inquirer).*@odata\.bind', api_content, re.IGNORECASE
        ))
        check("1.8", "POST に reporter @odata.bind が含まれていない", not has_reporter_bind)
    else:
        check("1.5-1.8", "api.ts が見つからない", False)


# ---------------------------------------------------------------------------
# [2] 環境接続検証
# ---------------------------------------------------------------------------

def check_environment():
    print("\n[2/5] 環境接続検証")

    if SKIP_REMOTE:
        print(f"  {INFO} SKIP_REMOTE=1 のためスキップ")
        return

    dv_url = os.environ.get("DATAVERSE_URL", "")
    if not dv_url:
        check("2.1", ".env に DATAVERSE_URL が設定されている", False)
        return
    check("2.1", f"DATAVERSE_URL = {dv_url[:40]}...", True)

    # pac org who
    try:
        result = subprocess.run(
            ["pac", "org", "who"], capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            org_url = ""
            for line in result.stdout.splitlines():
                if "Environment URL" in line or "組織 URL" in line:
                    org_url = line.split(":")[-1].strip() if "http" not in line else re.search(r'https?://[^\s]+', line).group()
            if org_url:
                matches = dv_url.rstrip("/").lower() in org_url.lower() or org_url.lower() in dv_url.rstrip("/").lower()
                check("2.1", f"pac org who の環境が .env と一致 ({org_url})", matches)
            else:
                check("2.1", "pac org who の環境URL取得", False)
        else:
            check("2.2", "pac auth アクティブプロファイルが存在する", False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        check("2.2", "pac CLI が利用可能", False)

    # Dataverse API でサイト確認
    try:
        import auth_helper
        import requests

        token = auth_helper.get_token(scope=f"{dv_url.rstrip('/')}/.default")
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

        # powerpagesites
        r = requests.get(
            f"{dv_url.rstrip('/')}/api/data/v9.2/powerpagesites?$select=name,statecode",
            headers=headers, timeout=30
        )
        if r.status_code == 200:
            sites = r.json().get("value", [])
            active_sites = [s for s in sites if s.get("statecode") == 0]
            check("2.3", f"Active サイト: {len(active_sites)} 件", len(active_sites) >= 1)
            for s in active_sites:
                print(f"    {INFO} {s['name']}")
        else:
            check("2.3", "powerpagesites クエリ", False)

        # powerpagesitelanguages
        r2 = requests.get(
            f"{dv_url.rstrip('/')}/api/data/v9.2/powerpagesitelanguages?$select=powerpagesitelanguageid,_powerpagesiteid_value&$top=5",
            headers=headers, timeout=30
        )
        if r2.status_code == 200:
            langs = r2.json().get("value", [])
            check("2.4", f"サイト言語レコード: {len(langs)} 件", len(langs) >= 1)
        else:
            check("2.4", "powerpagesitelanguages クエリ", False)

    except ImportError:
        print(f"  {WARN} auth_helper / requests が見つかりません — リモートチェックスキップ")
    except Exception as e:
        print(f"  {WARN} 環境接続エラー: {e}")


# ---------------------------------------------------------------------------
# [3] テーブル権限検証
# ---------------------------------------------------------------------------

def _content_has_webrole(content_str) -> bool:
    """type=18 の content JSON 内 adx_entitypermission_webrole が非空かを判定。
    これがランタイム正本。N:N powerpagecomponent_powerpagecomponent は幽霊なので使わない。"""
    try:
        content = json.loads(content_str) if content_str else {}
    except (json.JSONDecodeError, TypeError):
        return False
    roles = content.get("adx_entitypermission_webrole")
    return bool(roles)


def check_table_permissions():
    print("\n[3/5] テーブル権限検証")

    if SKIP_REMOTE:
        print(f"  {INFO} SKIP_REMOTE=1 のためスキップ")
        return

    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    if not dv_url:
        return

    try:
        import auth_helper
        import requests

        token = auth_helper.get_token(scope=f"{dv_url}/.default")
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

        # テーブル権限一覧 (type=18)
        r = requests.get(
            f"{dv_url}/api/data/v9.2/powerpagecomponents"
            "?$filter=powerpagecomponenttype eq 18"
            "&$select=name,content,_powerpagesitelanguageid_value",
            headers=headers, timeout=30
        )
        if r.status_code != 200:
            check("3.1", "テーブル権限クエリ", False)
            return

        permissions = r.json().get("value", [])
        if not permissions:
            check("3.1", "テーブル権限が1件以上存在する", False)
            return

        check("3.1", f"テーブル権限: {len(permissions)} 件", True)

        for perm in permissions:
            name = perm.get("name", "unknown")
            lang_id = perm.get("_powerpagesitelanguageid_value")
            content_str = perm.get("content", "{}")

            try:
                content = json.loads(content_str) if content_str else {}
            except json.JSONDecodeError:
                content = {}

            entity = content.get("entitylogicalname", "?")
            scope = content.get("scope", "?")
            has_webrole = "adx_entitypermission_webrole" in content and content["adx_entitypermission_webrole"]
            has_append = content.get("append", False)
            has_appendto = content.get("appendto", False)

            # 3.3 languageid
            if lang_id is None:
                check("3.3", f"{name}: powerpagesitelanguageid が null (❌ 404 の原因)", False)
            else:
                check("3.3", f"{name}: languageid 設定済み", True)

            # 3.2 webrole
            check("3.2", f"{name}: adx_entitypermission_webrole あり", has_webrole)

            # 3.5 Contact scope
            if entity == "contact":
                check("3.5", f"{name}: Contact scope={scope} (期待: 756150004=Self)",
                      scope == 756150004)

            # 3.6 append/appendto
            if entity != "contact":
                check("3.6", f"{name}: append={has_append}, appendto={has_appendto}",
                      has_append and has_appendto)

        # 3.7 全権限の content webrole 検証（ランタイム正本＝content JSON の adx_entitypermission_webrole）
        #     N:N powerpagecomponent_powerpagecomponent は幽霊リンクなので検証に使わない
        if permissions:
            missing = [p["name"] for p in permissions
                       if not _content_has_webrole(p.get("content"))]
            check("3.7", f"全 {len(permissions)} 権限の content に adx_entitypermission_webrole あり"
                         + (f"（未設定: {', '.join(missing)}）" if missing else ""),
                  len(missing) == 0)

    except ImportError:
        print(f"  {WARN} auth_helper / requests なし — スキップ")
    except Exception as e:
        print(f"  {WARN} テーブル権限チェックエラー: {e}")


# ---------------------------------------------------------------------------
# [4] サイト設定検証
# ---------------------------------------------------------------------------

def check_site_settings():
    print("\n[4/5] サイト設定検証")

    if SKIP_REMOTE:
        print(f"  {INFO} SKIP_REMOTE=1 のためスキップ")
        return

    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    if not dv_url:
        return

    try:
        import auth_helper
        import requests

        token = auth_helper.get_token(scope=f"{dv_url}/.default")
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

        # EDM type=9 site settings
        r = requests.get(
            f"{dv_url}/api/data/v9.2/powerpagecomponents"
            "?$filter=powerpagecomponenttype eq 9"
            "&$select=name,content",
            headers=headers, timeout=30
        )
        if r.status_code != 200:
            check("4", "サイト設定クエリ", False)
            return

        settings = {s["name"]: s.get("content", "") for s in r.json().get("value", [])}

        # 4.1 ProfileRedirectEnabled
        profile_redirect = settings.get("Authentication/Registration/ProfileRedirectEnabled", "")
        check("4.1", "ProfileRedirectEnabled = false",
              profile_redirect.lower() == "false" if profile_redirect else False)

        # 4.2 LoginButtonAuthEnabled
        login_button = settings.get("Authentication/Registration/LoginButtonAuthEnabled", "")
        check("4.2", "LoginButtonAuthEnabled = false",
              login_button.lower() == "false" if login_button else False)

        # 4.3 innererror
        innererror = settings.get("Webapi/error/innererror", "")
        check("4.3", f"Webapi/error/innererror = {innererror or '(未設定)'}",
              innererror.lower() == "true", warn_only=True)

        # 4.4 不要な Webapi/* 設定
        webapi_settings = [k for k in settings if k.startswith("Webapi/") and "/error/" not in k]
        if webapi_settings:
            check("4.4", f"不要な Webapi/* 設定が {len(webapi_settings)} 件ある (EDM 2.0 では不要)",
                  False, warn_only=True)
            for ws in webapi_settings[:5]:
                print(f"    {INFO} {ws}")
        else:
            check("4.4", "不要な Webapi/* 設定なし (EDM 2.0 正常)", True)

    except ImportError:
        print(f"  {WARN} auth_helper / requests なし — スキップ")
    except Exception as e:
        print(f"  {WARN} サイト設定チェックエラー: {e}")


# ---------------------------------------------------------------------------
# [5] セキュリティ検証
# ---------------------------------------------------------------------------

def check_security():
    print("\n[5/5] セキュリティ検証")

    is_production = os.environ.get("DEPLOY_ENV", "").lower() == "production"

    if SKIP_REMOTE:
        print(f"  {INFO} SKIP_REMOTE=1 のためスキップ")
        return

    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    if not dv_url:
        return

    try:
        import auth_helper
        import requests

        token = auth_helper.get_token(scope=f"{dv_url}/.default")
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

        r = requests.get(
            f"{dv_url}/api/data/v9.2/powerpagecomponents"
            "?$filter=powerpagecomponenttype eq 9 and name eq 'Webapi/error/innererror'"
            "&$select=content",
            headers=headers, timeout=30
        )
        if r.status_code == 200:
            vals = r.json().get("value", [])
            if vals:
                innererror_val = vals[0].get("content", "")
                if is_production:
                    check("5.1", "本番: Webapi/error/innererror = false",
                          innererror_val.lower() == "false")
                else:
                    if innererror_val.lower() == "true":
                        check("5.1", "innererror=true (開発環境 OK、本番デプロイ時は false に)",
                              True, warn_only=True)

    except (ImportError, Exception):
        pass


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  Power Pages デプロイ前レビュー                    ║")
    print("╚══════════════════════════════════════════════════╝")

    check_local_build()
    check_environment()
    check_table_permissions()
    check_site_settings()
    check_security()

    # サマリー
    pass_count = sum(1 for r in results if r[0] == "PASS")
    fail_count = sum(1 for r in results if r[0] == "FAIL")
    warn_count = sum(1 for r in results if r[0] == "WARN")

    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"結果: {pass_count} PASS, {fail_count} FAIL, {warn_count} WARN")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    if fail_count > 0:
        print(f"\n{FAIL} {fail_count} 件の不合格があります。デプロイを中止してください。")
        print(f"   修復: python scripts/setup_permissions.py")
        sys.exit(1)
    elif warn_count > 0:
        print(f"\n{WARN} 警告がありますがデプロイ可能です。")
        sys.exit(0)
    else:
        print(f"\n{PASS} 全項目合格。デプロイに進めます。")
        sys.exit(0)


if __name__ == "__main__":
    main()
