"""Power Pages Code Site: Build → Upload → Restart

Usage:
    py portal/scripts/deploy.py [--skip-build] [--skip-restart]
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
SITE_NAME = "IncidentPortal"
SUBDOMAIN = "incidentportal01"

skip_build = '--skip-build' in sys.argv
skip_restart = '--skip-restart' in sys.argv


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
    print("=" * 50)
    print(f"Power Pages Code Site Deploy: {SITE_NAME}")
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
        r = requests.get(f"{base}?api-version=2024-10-01", headers=h)
        for s in r.json().get("value", []):
            if s.get("subdomain") == SUBDOMAIN:
                sid = s["id"]
                rr = requests.post(f"{base}/{sid}/restart?api-version=2024-10-01", headers=h)
                print(f"  Restart: {rr.status_code}")
                print(f"  URL: {s.get('websiteUrl')}")
                break
        else:
            print("  Site not found in PP API")
        print("  OK")

    print("\n" + "=" * 50)
    print(f"DONE. URL: https://{SUBDOMAIN}.powerappsportals.com")
    print("(Allow 60-90 seconds for changes to propagate)")
    print("=" * 50)


if __name__ == "__main__":
    main()
