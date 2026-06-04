"""Power Pages Code Site: Activate (Provision) via PP API

Activates an inactive Power Pages site by calling the Power Platform
websites API. Equivalent to microsoft/power-platform-skills activate-site.js.

Usage:
    py portal/scripts/activate_site.py [--subdomain <name>]

Reads from .env:
    ENV_ID              - Power Platform environment ID
    PAGES_SITE_NAME     - Site name (from powerpages.config.json)
    PAGES_SUBDOMAIN     - Subdomain for the site URL (or pass --subdomain)

References:
    - API version: 2022-03-01-preview (NOT 2024-10-01)
    - Template: DefaultPortalTemplate
    - microsoft/power-platform-skills/plugins/power-pages/skills/activate-site/
"""
import json, logging, os, sys, time

logging.disable(logging.INFO)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTAL_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(PORTAL_DIR)

sys.path.insert(0, os.path.join(ROOT_DIR, ".github", "skills", "standard", "scripts"))
from dotenv import load_dotenv

load_dotenv(os.path.join(ROOT_DIR, ".env"))
import auth_helper, requests

# ---------- Constants ----------
API_VERSION = "2022-03-01-preview"
POLL_INTERVAL_SEC = 10
MAX_POLL_ATTEMPTS = 30  # 30 x 10s = 5 minutes

# ---------- Env / args ----------
ENV_ID = os.environ["ENV_ID"]
SITE_NAME = os.environ.get("PAGES_SITE_NAME", "IncidentPortal")

# --subdomain from CLI overrides .env
SUBDOMAIN = ""
for i, arg in enumerate(sys.argv):
    if arg == "--subdomain" and i + 1 < len(sys.argv):
        SUBDOMAIN = sys.argv[i + 1]
if not SUBDOMAIN:
    SUBDOMAIN = os.environ.get("PAGES_SUBDOMAIN", "")


def get_organization_id() -> str:
    """Retrieve Dataverse organization ID."""
    t = auth_helper.get_token()
    dv = os.environ["DATAVERSE_URL"].rstrip("/")
    r = requests.get(
        f"{dv}/api/data/v9.2/organizations?$select=organizationid",
        headers={"Authorization": f"Bearer {t}", "Accept": "application/json"},
    )
    r.raise_for_status()
    orgs = r.json().get("value", [])
    if not orgs:
        print("ERROR: Could not retrieve organization ID")
        sys.exit(1)
    return orgs[0]["organizationid"]


def get_website_record_id() -> str | None:
    """Find the Dataverse website record ID from powerpagesites table."""
    t = auth_helper.get_token()
    dv = os.environ["DATAVERSE_URL"].rstrip("/")
    r = requests.get(
        f"{dv}/api/data/v9.2/powerpagesites?$select=powerpagesiteid,name",
        headers={"Authorization": f"Bearer {t}", "Accept": "application/json"},
    )
    r.raise_for_status()
    for site in r.json().get("value", []):
        if site.get("name", "").lower() == SITE_NAME.lower():
            return site["powerpagesiteid"]
    return None


def check_already_activated() -> dict | None:
    """Check if site is already activated in PP API."""
    t = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
    h = {"Authorization": f"Bearer {t}", "Accept": "application/json"}
    url = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version={API_VERSION}"
    r = requests.get(url, headers=h)
    if r.status_code != 200:
        return None
    for site in r.json().get("value", []):
        name_match = site.get("name", "").lower() == SITE_NAME.lower()
        sub_match = SUBDOMAIN and site.get("subdomain", "").lower() == SUBDOMAIN.lower()
        if name_match or sub_match:
            return site
    return None


def activate(org_id: str, website_record_id: str | None) -> dict:
    """POST to PP API to provision the site. Returns the poll result."""
    t = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
    h = {
        "Authorization": f"Bearer {t}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    url = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version={API_VERSION}"

    body = {
        "name": SITE_NAME,
        "subdomain": SUBDOMAIN,
        "templateName": "DefaultPortalTemplate",
        "dataverseOrganizationId": org_id,
        "selectedBaseLanguage": 1033,
    }
    if website_record_id:
        body["websiteRecordId"] = website_record_id

    print(f"  POST {url}")
    print(f"  Body: {json.dumps(body, indent=2)}")

    r = requests.post(url, headers=h, json=body)
    print(f"  Status: {r.status_code}")

    if r.status_code != 202:
        try:
            err = r.json()
            msg = err.get("error", {}).get("message", r.text[:500])
        except Exception:
            msg = r.text[:500]
        return {"status": "Failed", "statusCode": r.status_code, "error": msg}

    # Extract Operation-Location header
    op_loc = r.headers.get("Operation-Location", "")
    if not op_loc:
        return {"status": "Failed", "error": "202 but no Operation-Location header"}

    # Ensure api-version is in the poll URL
    if "api-version" not in op_loc:
        sep = "&" if "?" in op_loc else "?"
        op_loc += f"{sep}api-version={API_VERSION}"

    print(f"  Polling: {op_loc}")
    site_url = f"https://{SUBDOMAIN}.powerappsportals.com"

    for attempt in range(1, MAX_POLL_ATTEMPTS + 1):
        time.sleep(POLL_INTERVAL_SEC)

        # Refresh token periodically
        if attempt % 6 == 0:
            t = auth_helper.get_token(scope="https://api.powerplatform.com/.default")

        try:
            pr = requests.get(
                op_loc,
                headers={"Authorization": f"Bearer {t}", "Accept": "application/json"},
            )
            ps = pr.json()
        except Exception:
            print(f"  [{attempt}] poll error")
            continue

        status = ps.get("operationStatus", ps.get("status", "?"))
        print(f"  [{attempt}] {status}")

        if status == "OperationComplete":
            return {
                "status": "Succeeded",
                "siteUrl": ps.get("websiteUrl", site_url),
                "siteName": SITE_NAME,
                "subdomain": SUBDOMAIN,
            }
        if status == "OperationFailed":
            err_msg = (
                ps.get("error", {}).get("message", "")
                or json.dumps(ps)[:500]
            )
            return {"status": "Failed", "error": f"Provisioning failed: {err_msg}"}

    return {
        "status": "Running",
        "message": "Provisioning still in progress after 5 minutes. Check admin center.",
        "siteUrl": site_url,
    }


def main():
    if not SUBDOMAIN:
        print("ERROR: PAGES_SUBDOMAIN not set. Set in .env or pass --subdomain <name>")
        sys.exit(1)

    print("=" * 60)
    print(f"Power Pages Code Site Activation")
    print(f"  Site Name:  {SITE_NAME}")
    print(f"  Subdomain:  {SUBDOMAIN}")
    print(f"  API:        {API_VERSION}")
    print("=" * 60)

    # Phase 1: Check if already activated
    print("\n[1/4] Checking activation status...")
    existing = check_already_activated()
    if existing and existing.get("status") not in ("StateDeletingApplication",):
        site_url = existing.get("websiteUrl", f"https://{SUBDOMAIN}.powerappsportals.com")
        print(f"  Site already activated: {site_url}")
        print(f"  Status: {existing.get('status')}")
        print("\n  Use deploy.py to redeploy and restart.")
        return

    # Phase 2: Gather parameters
    print("\n[2/4] Gathering parameters...")
    org_id = get_organization_id()
    print(f"  Organization ID: {org_id}")

    website_record_id = get_website_record_id()
    if website_record_id:
        print(f"  Website Record ID: {website_record_id}")
    else:
        print("  Website Record ID: (none — will create new)")

    # Phase 3: Confirm
    print(f"\n[3/4] Activation parameters:")
    print(f"  Site Name:          {SITE_NAME}")
    print(f"  Subdomain:          {SUBDOMAIN}.powerappsportals.com")
    print(f"  Organization ID:    {org_id}")
    print(f"  Environment ID:     {ENV_ID}")
    print(f"  Website Record ID:  {website_record_id or '(new)'}")
    print(f"  Template:           DefaultPortalTemplate")
    print(f"  Language:           1033 (English)")

    confirm = input("\n  Proceed with activation? (y/N): ").strip().lower()
    if confirm not in ("y", "yes"):
        print("  Cancelled.")
        return

    # Phase 4: Activate & Poll
    print("\n[4/4] Activating...")
    result = activate(org_id, website_record_id)

    # Phase 5: Summary
    print("\n" + "=" * 60)
    if result["status"] == "Succeeded":
        print("Activation SUCCEEDED!")
        print(f"  Site URL:  {result['siteUrl']}")
        print(f"  Site Name: {result['siteName']}")
        print()
        print("Next steps:")
        print("  1. Wait 60-90 seconds for DNS propagation")
        print("  2. Run: py portal/scripts/setup_contact_webapi.py")
        print("  3. Run: py portal/scripts/deploy.py --skip-build")
    elif result["status"] == "Running":
        print("Activation IN PROGRESS (timed out waiting)")
        print(f"  {result['message']}")
        print(f"  Expected URL: {result.get('siteUrl', '?')}")
    else:
        print("Activation FAILED")
        print(f"  Status Code: {result.get('statusCode', '?')}")
        print(f"  Error: {result.get('error', '?')}")
        if result.get("statusCode") == 400 and "subdomain" in str(result.get("error", "")).lower():
            print("\n  The subdomain may already be taken. Try a different one:")
            print(f"    py portal/scripts/activate_site.py --subdomain <new-name>")
    print("=" * 60)


if __name__ == "__main__":
    main()
