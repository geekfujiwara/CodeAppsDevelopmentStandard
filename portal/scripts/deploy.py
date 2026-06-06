"""Power Pages Code Site: Build → Upload → Restart

Usage:
    py portal/scripts/deploy.py [--skip-build] [--skip-restart] [--restart-only]
"""
import logging, os, sys, subprocess, time
logging.disable(logging.INFO)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTAL_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(PORTAL_DIR)

sys.path.insert(0, os.path.join(ROOT_DIR, '.github', 'skills', 'standard', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT_DIR, '.env'))
import auth_helper, requests

ENV_ID = os.environ["ENV_ID"]
SITE_NAME = os.environ.get("PAGES_SITE_NAME", "IncidentPortal")
SUBDOMAIN = os.environ.get("PAGES_SUBDOMAIN", "")

skip_build = '--skip-build' in sys.argv or '--restart-only' in sys.argv
skip_restart = '--skip-restart' in sys.argv
restart_only = '--restart-only' in sys.argv


def ask_subdomain():
    """PP_SUBDOMAIN が未設定の場合、PP API からサイト一覧を取得してユーザーに選択させる。"""
    global SUBDOMAIN
    if SUBDOMAIN:
        return
    print("\n[Pre] PAGES_SUBDOMAIN が .env に未設定です。サイトを検索します...")
    t = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
    h = {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2022-03-01-preview", headers=h)
    sites = r.json().get("value", [])
    if not sites:
        print("  環境にサイトが見つかりません。PAGES_SUBDOMAIN を .env に手動設定してください。")
        sys.exit(1)
    print("  検出されたサイト:")
    for i, s in enumerate(sites):
        print(f"    [{i+1}] {s.get('name', '(名前なし)')} — {s.get('subdomain', '?')}.powerappsportals.com")
    while True:
        choice = input(f"  デプロイ先を選択 (1-{len(sites)}): ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(sites):
            selected = sites[int(choice) - 1]
            SUBDOMAIN = selected.get("subdomain", "")
            print(f"  → {SUBDOMAIN} を使用します")
            # .env に保存
            env_path = os.path.join(ROOT_DIR, ".env")
            with open(env_path, "r", encoding="utf-8") as f:
                content = f.read()
            if "PAGES_SUBDOMAIN=" in content:
                import re
                content = re.sub(r"PAGES_SUBDOMAIN=.*", f"PAGES_SUBDOMAIN={SUBDOMAIN}", content)
            else:
                content += f"\nPAGES_SUBDOMAIN={SUBDOMAIN}\n"
            if "PAGES_SITE_NAME=" not in content:
                content += f"PAGES_SITE_NAME={selected.get('name', SITE_NAME)}\n"
            with open(env_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  .env に PAGES_SUBDOMAIN={SUBDOMAIN} を保存しました")
            return
        print("  無効な入力です。もう一度入力してください。")


def run(cmd, cwd=None):
    print(f"  > {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(f"  FAILED (exit {result.returncode})")
        if result.stderr:
            print(f"  {result.stderr[-300:]}")
        return False
    return True


def main():
    ask_subdomain()

    print("=" * 50)
    print(f"Power Pages Code Site Deploy: {SITE_NAME}")
    print(f"  Subdomain: {SUBDOMAIN}")
    print("=" * 50)

    # Step 1: Build
    if skip_build:
        print("\n[1/3] Build (skipped)")
    else:
        print("\n[1/3] Build")
        if not run("npm run build", cwd=PORTAL_DIR):
            sys.exit(1)
        print("  OK")

    # Step 2: Upload
    if restart_only:
        print("\n[2/3] Upload (skipped — restart-only)")
    else:
        print("\n[2/3] Upload")
        if not run(f'pac pages upload-code-site --rootPath "{PORTAL_DIR}"', cwd=ROOT_DIR):
            sys.exit(1)
        print("  OK")

    # Step 3: Restart
    if skip_restart:
        print("\n[3/3] Restart (skipped)")
    else:
        print("\n[3/3] Restart")
        t = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
        h = {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}
        base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
        r = requests.get(f"{base}?api-version=2022-03-01-preview", headers=h)
        site_found = False
        for s in r.json().get("value", []):
            match = (SUBDOMAIN and s.get("subdomain") == SUBDOMAIN) or \
                    (not SUBDOMAIN and s.get("name", "").startswith(SITE_NAME))
            if match:
                status = s.get("status", "")
                if status and status != "StateConfigured":
                    print(f"  WARNING: Site status is '{status}' (not active)")
                    print(f"  Run 'py portal/scripts/activate_site.py' first.")
                    sys.exit(1)
                sid = s["id"]
                rr = requests.post(f"{base}/{sid}/restart?api-version=2022-03-01-preview", headers=h)
                print(f"  Restart: {rr.status_code}")
                print(f"  URL: {s.get('websiteUrl')}")
                site_found = True
                break
        if not site_found:
            print("  Site not found in PP API")
            print("  Run 'py portal/scripts/activate_site.py' to activate the site.")
        print("  OK")

    print("\n" + "=" * 50)
    if SUBDOMAIN:
        print(f"DONE. URL: https://{SUBDOMAIN}.powerappsportals.com")
    else:
        print(f"DONE. Site: {SITE_NAME}")
    print("(Allow 60-90 seconds for changes to propagate)")
    print("=" * 50)


if __name__ == "__main__":
    main()
