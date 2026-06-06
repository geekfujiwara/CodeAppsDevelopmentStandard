"""Power Pages: Contact テーブルの Web API 有効化 + テーブル権限設定

EDM 2.0 Code Site 対応版:
- adx_sitesettings: Webapi/contact/enabled, Webapi/contact/fields
- powerpagecomponent type=18: テーブル権限 (Self scope)
  ※ powerpagesitelanguageid の設定が必須！（未設定だとランタイムが権限を認識しない）
- powerpagecomponent_powerpagecomponent N:N: テーブル権限→Web ロール紐付け
- Webapi/error/innererror: デバッグ用詳細エラー有効化

重要ポイント:
- powerpagecomponent type=18 には powerpagesitelanguageid を必ず設定する
- content JSON は {"entitylogicalname", "scope" (int), "read" (bool)} 形式
- adx_sitesettings は adx_websites にバインドする

Usage:
    py portal/scripts/setup_contact_webapi.py
"""
import json, os, re, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTAL_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(PORTAL_DIR)

sys.path.insert(0, os.path.join(ROOT_DIR, '.github', 'skills', 'standard', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT_DIR, '.env'))
import auth_helper, requests

DV = os.environ["DATAVERSE_URL"].rstrip("/")
ENV_ID = os.environ["ENV_ID"]
SITE_NAME = os.environ.get("PAGES_SITE_NAME", "IncidentPortal")
SUBDOMAIN = os.environ.get("PAGES_SUBDOMAIN", "")

# contact テーブル設定
TABLE_LOGICAL = "contact"
PERM_NAME = "contact - Self Read Write"
SCOPE_SELF = 756150004  # Self scope (756150001 は Contact scope で別物)
FIELDS = "*"  # system table は * 推奨


def h():
    return {
        "Authorization": f"Bearer {auth_helper.get_token()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def api(path):
    return f"{DV}/api/data/v9.2/{path}"


def log(msg):
    print(msg, flush=True)


def main():
    log("=" * 60)
    log("Contact テーブル Web API 有効化 (EDM 2.0)")
    log("=" * 60)

    # --- 1. サイト情報取得 ---
    log("\n[1/6] サイト情報取得")
    r = requests.get(api(f"powerpagesites?$filter=contains(name,'{SITE_NAME}')&$select=powerpagesiteid,name"), headers=h())
    r.raise_for_status()
    sites = r.json()["value"]
    if not sites:
        log(f"ERROR: {SITE_NAME} が powerpagesites に見つかりません")
        sys.exit(1)
    site_id = sites[0]["powerpagesiteid"]
    log(f"  powerpagesite: {sites[0]['name']} ({site_id})")

    # adx_website
    if not SUBDOMAIN:
        log("ERROR: PAGES_SUBDOMAIN が .env に未設定です")
        sys.exit(1)
    r = requests.get(api(f"adx_websites?$filter=contains(adx_primarydomainname,'{SUBDOMAIN}')&$select=adx_websiteid,adx_name"), headers=h())
    r.raise_for_status()
    ws = r.json()["value"]
    if not ws:
        log("ERROR: adx_website not found")
        sys.exit(1)
    website_id = ws[0]["adx_websiteid"]
    log(f"  adx_website: {ws[0]['adx_name']} ({website_id})")

    # site language (CRITICAL: must be set on powerpagecomponent type=18)
    r = requests.get(api(f"powerpagesitelanguages?$filter=_powerpagesiteid_value eq {site_id}&$select=powerpagesitelanguageid"), headers=h())
    r.raise_for_status()
    langs = r.json()["value"]
    if not langs:
        log("ERROR: powerpagesitelanguage not found - required for table permissions")
        sys.exit(1)
    lang_id = langs[0]["powerpagesitelanguageid"]
    log(f"  language: {lang_id}")

    # --- 2. Site Settings ---
    log("\n[2/6] Site Settings (Web API 有効化)")
    for suffix, value in [("/enabled", "true"), ("/fields", FIELDS)]:
        name = f"Webapi/{TABLE_LOGICAL}{suffix}"
        r = requests.get(
            api(f"adx_sitesettings?$filter=adx_name eq '{name}' and _adx_websiteid_value eq '{website_id}'&$select=adx_sitesettingid,adx_value"),
            headers=h(),
        )
        existing = r.json().get("value", [])
        if existing:
            if existing[0].get("adx_value") == value:
                log(f"  [SKIP] {name} = {value}")
            else:
                requests.patch(api(f"adx_sitesettings({existing[0]['adx_sitesettingid']})"), headers=h(), json={"adx_value": value})
                log(f"  [UPDATE] {name} = {value}")
        else:
            body = {"adx_name": name, "adx_value": value, "adx_websiteid@odata.bind": f"/adx_websites({website_id})"}
            requests.post(api("adx_sitesettings"), headers=h(), json=body)
            log(f"  [CREATE] {name} = {value}")

    # innererror for debugging
    name = "Webapi/error/innererror"
    r = requests.get(api(f"adx_sitesettings?$filter=adx_name eq '{name}' and _adx_websiteid_value eq '{website_id}'&$select=adx_sitesettingid"), headers=h())
    if not r.json().get("value"):
        requests.post(api("adx_sitesettings"), headers=h(), json={"adx_name": name, "adx_value": "true", "adx_websiteid@odata.bind": f"/adx_websites({website_id})"})
        log(f"  [CREATE] {name} = true")
    else:
        log(f"  [SKIP] {name}")

    # --- 3. powerpagecomponent type=18 (テーブル権限) ---
    log("\n[3/6] Table Permission (powerpagecomponent type=18, Self scope)")
    content = json.dumps({
        "entitylogicalname": TABLE_LOGICAL,
        "entityname": PERM_NAME,
        "scope": SCOPE_SELF,
        "read": True,
        "write": True,
        "create": False,
        "delete": False,
        "append": False,
        "appendto": False,
    })

    # 既存確認 (contact のものを探す)
    r = requests.get(
        api(f"powerpagecomponents?$filter=powerpagecomponenttype eq 18 and _powerpagesiteid_value eq {site_id}&$select=powerpagecomponentid,name,content"),
        headers=h(),
    )
    existing_perm = None
    for p in r.json().get("value", []):
        c = p.get("content", "")
        if '"contact"' in c and ("entitylogicalname" in c or "mspp_entityname" in c):
            existing_perm = p
            break

    if existing_perm:
        perm_id = existing_perm["powerpagecomponentid"]
        patch_body = {
            "content": content,
            "name": PERM_NAME,
            "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",
        }
        r = requests.patch(api(f"powerpagecomponents({perm_id})"), headers=h(), json=patch_body)
        log(f"  [UPDATE] {PERM_NAME} ({perm_id}) - {r.status_code}")
    else:
        body = {
            "powerpagecomponenttype": 18,
            "name": PERM_NAME,
            "content": content,
            "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
            "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",
        }
        r = requests.post(api("powerpagecomponents"), headers=h(), json=body)
        if r.status_code == 204:
            loc = r.headers.get("OData-EntityId", "")
            m = re.search(r"powerpagecomponents\(([0-9a-fA-F-]+)\)", loc)
            perm_id = m.group(1) if m else None
        else:
            perm_id = r.json().get("powerpagecomponentid") if r.status_code in (200, 201) else None
        log(f"  [CREATE] {PERM_NAME} ({perm_id}) - {r.status_code}")
        if r.status_code not in (200, 201, 204):
            log(f"  ERROR: {r.text[:300]}")
            sys.exit(1)

    # --- 4. Authenticated Users (type=11) 取得 ---
    log("\n[4/6] Authenticated Users (powerpagecomponent type=11)")
    r = requests.get(
        api(f"powerpagecomponents?$filter=powerpagecomponenttype eq 11 and _powerpagesiteid_value eq {site_id}&$select=powerpagecomponentid,name"),
        headers=h(),
    )
    roles = r.json().get("value", [])
    auth_role = next((x for x in roles if "authenticated" in x.get("name", "").lower()), None)
    if not auth_role:
        log("  ERROR: Authenticated Users ロールが見つかりません")
        sys.exit(1)
    role_id = auth_role["powerpagecomponentid"]
    log(f"  Role: {auth_role['name']} ({role_id})")

    # --- 5. N:N リンク ---
    log("\n[5/6] テーブル権限 → Web ロール N:N リンク")
    lr = requests.get(api(f"powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent?$select=powerpagecomponentid"), headers=h())
    linked = [x["powerpagecomponentid"] for x in lr.json().get("value", [])] if lr.status_code == 200 else []

    if role_id in linked:
        log(f"  [SKIP] Already linked to {auth_role['name']}")
    else:
        rr = requests.post(
            api(f"powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"),
            headers=h(),
            json={"@odata.id": api(f"powerpagecomponents({role_id})")},
        )
        log(f"  [LINK] {rr.status_code}")

    # --- 6. サイト再起動 ---
    log("\n[6/6] サイト再起動")
    try:
        from pathlib import Path
        restart_script = Path(ROOT_DIR) / ".github" / "skills" / "standard" / "scripts" / "_restart.py"
        if restart_script.exists():
            import subprocess
            subprocess.run([sys.executable, str(restart_script)], cwd=str(restart_script.parent), check=True)
        else:
            log("  [SKIP] _restart.py not found, restart manually")
    except Exception as e:
        log(f"  [WARN] restart failed: {e}")

    log("\n" + "=" * 60)
    log("DONE. 60-90秒後にプロフィールページをテストしてください。")
    log("=" * 60)


if __name__ == "__main__":
    main()
