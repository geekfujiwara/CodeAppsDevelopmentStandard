"""Power Pages 設計前レビュー — ローカルファイル静的チェック.

ポータルプロジェクトのソースコードを静的に解析し、設計前レビュー項目の
合格/不合格を判定する。Dataverse 接続は不要。

Usage:
    cd portal
    python ../.github/skills/power-pages/scripts/review_pre_design.py
"""

import json
import os
import re
import sys
from pathlib import Path

# Windows cp932 対策: stdout を UTF-8 に強制
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

PORTAL_ROOT = Path(os.environ.get("PORTAL_ROOT", ".")).resolve()
SRC_DIR = PORTAL_ROOT / "src"
DIST_DIR = PORTAL_ROOT / "dist-site"

# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------

PASS = "\033[92m✅\033[0m"
FAIL = "\033[91m❌\033[0m"
WARN = "\033[93m⚠️\033[0m"

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


def find_files(directory: Path, pattern: str) -> list[Path]:
    """glob でファイル一覧を返す."""
    return list(directory.rglob(pattern))


def read_text(path: Path) -> str:
    """UTF-8 でファイルを読む."""
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, UnicodeDecodeError):
        return ""


# ---------------------------------------------------------------------------
# チェック項目
# ---------------------------------------------------------------------------

def check_vite_config():
    """[5] Vite 設定の確認."""
    print("\n[1] Vite / ビルド構成")

    vite_path = PORTAL_ROOT / "vite.config.ts"
    content = read_text(vite_path)

    if not content:
        check("5", "vite.config.ts が存在する", False)
        return

    check("5.2", 'base: "./" が設定されている', 'base: "./"' in content or "base: './' " in content)
    check("5.2", "inlineDynamicImports: true が設定されている", "inlineDynamicImports: true" in content or "inlineDynamicImports:true" in content)


def check_powerpages_config():
    """[5.3] powerpages.config.json."""
    config_path = PORTAL_ROOT / "powerpages.config.json"
    content = read_text(config_path)

    if not content:
        check("5.3", "powerpages.config.json が存在する", False)
        return

    check("5.3", "powerpages.config.json が存在する", True)
    try:
        cfg = json.loads(content)
        compiled_path = cfg.get("compiledPath", "")
        check("5.3", f"compiledPath='{compiled_path}' と dist-site/ が一致", compiled_path == "dist-site")
    except json.JSONDecodeError:
        check("5.3", "powerpages.config.json が有効な JSON", False)


def check_router():
    """[5.1] HashRouter の使用確認."""
    print("\n[2] ルーター")

    tsx_files = find_files(SRC_DIR, "*.tsx") + find_files(SRC_DIR, "*.ts")
    has_hash_router = False
    has_browser_router = False

    for f in tsx_files:
        content = read_text(f)
        if "HashRouter" in content:
            has_hash_router = True
        if "BrowserRouter" in content:
            has_browser_router = True

    check("5.1", "HashRouter を使用している", has_hash_router)
    if has_browser_router:
        check("5.1", "BrowserRouter を使用していない（History API は 404）", False)


def check_api_patterns():
    """[3] API 設計パターンの確認."""
    print("\n[3] API 設計パターン (api.ts)")

    api_path = SRC_DIR / "lib" / "api.ts"
    content = read_text(api_path)

    if not content:
        check("3.1", "src/lib/api.ts が存在する", False)
        return

    check("3.1", "共有クライアント api.ts が存在する", True)
    check("3.3", 'credentials: "same-origin" を使用', '"same-origin"' in content)
    check("3.3", 'credentials: "include" を使用していない（NG）',
          '"include"' not in content or "// include" in content, warn_only=True)
    check("3.4", 'redirect: "manual" を使用', '"manual"' in content)
    check("3.2", "__RequestVerificationToken 取得ロジックがある",
          "__RequestVerificationToken" in content or "RequestVerificationToken" in content)


def check_contact_lookup_standard():
    """[1.1, 3.5] Power Pages 報告者パターンの確認.
    Power Pages では createdby はアプリケーションユーザーになるため、
    報告者の追跡は Contact テーブルへの Lookup で行う。
    checkAuth() でログインユーザー情報を取得し入力不要にする設計。
    """
    print("\n[4] 報告者 Contact Lookup 標準 (教訓 19)")

    tsx_files = find_files(SRC_DIR, "*.tsx") + find_files(SRC_DIR, "*.ts")

    # Contact への @odata.bind パターン（正しいパターン）
    contact_bind_pattern = re.compile(r'(inquirer|reporter|contact).*@odata\.bind.*contacts', re.IGNORECASE)
    # checkAuth / useAuthUser でログインユーザー取得（正しいパターン）
    check_auth_pattern = re.compile(r'checkAuth|useAuthUser', re.IGNORECASE)

    uses_contact_lookup = False
    uses_auth_for_reporter = False

    for f in tsx_files:
        content = read_text(f)
        if contact_bind_pattern.search(content):
            uses_contact_lookup = True
        if check_auth_pattern.search(content):
            uses_auth_for_reporter = True

    check("1.1", "報告者追跡に Contact Lookup (@odata.bind → contacts) を使用している",
          uses_contact_lookup)
    check("3.5", "ログインユーザー情報を checkAuth()/useAuthUser() で自動取得している",
          uses_auth_for_reporter)


def check_auth_design():
    """[2] 認証設計の確認."""
    print("\n[5] 認証設計")

    tsx_files = find_files(SRC_DIR, "*.tsx") + find_files(SRC_DIR, "*.ts")

    queries_contacts_api = False
    uses_portal_user = False

    for f in tsx_files:
        content = read_text(f)
        # /_api/contacts を認証判定に使っているか
        if re.search(r'/_api/contacts\??.*\$select.*contactid', content):
            queries_contacts_api = True
        if "Portal.User" in content or "Dynamic365.Portal.User" in content:
            uses_portal_user = True

    check("2.2", "認証判定で /_api/contacts をクエリしていない", not queries_contacts_api)
    check("2.1", "Portal.User を認証判定に使用している", uses_portal_user)


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  Power Pages 設計前レビュー (ローカル静的チェック) ║")
    print("╚══════════════════════════════════════════════════╝")

    check_vite_config()
    check_powerpages_config()
    check_router()
    check_api_patterns()
    check_contact_lookup_standard()
    check_auth_design()

    # サマリー
    pass_count = sum(1 for r in results if r[0] == "PASS")
    fail_count = sum(1 for r in results if r[0] == "FAIL")
    warn_count = sum(1 for r in results if r[0] == "WARN")

    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"結果: {pass_count} PASS, {fail_count} FAIL, {warn_count} WARN")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    if fail_count > 0:
        print(f"\n{FAIL} {fail_count} 件の不合格項目があります。設計を見直してください。")
        sys.exit(1)
    elif warn_count > 0:
        print(f"\n{WARN} 警告がありますが続行可能です。")
        sys.exit(0)
    else:
        print(f"\n{PASS} 全項目合格。実装に進めます。")
        sys.exit(0)


if __name__ == "__main__":
    main()
