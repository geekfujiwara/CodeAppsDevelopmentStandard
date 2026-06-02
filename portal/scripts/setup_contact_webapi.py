"""Power Pages: Contact テーブルの Web API 有効化 + テーブル権限設定

- Site Settings: Webapi/contact/enabled, Webapi/contact/fields
- Table Permission: Contact Self (Read/Write) 
- Web Role 紐付け: Authenticated Users

Usage:
    py portal/scripts/setup_contact_webapi.py
"""
import json, logging, os, sys
logging.disable(logging.INFO)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTAL_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(PORTAL_DIR)

sys.path.insert(0, os.path.join(ROOT_DIR, '.github', 'skills', 'standard', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT_DIR, '.env'))
import auth_helper, requests

DV = os.environ["DATAVERSE_URL"].rstrip("/")
ENV_ID = os.environ["ENV_ID"]
SITE_NAME = "IncidentPortal02"
SUBDOMAIN = "incidentportal02"


def get_headers():
    token = auth_helper.get_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def get_site_id():
    """powerpagesites から IncidentPortal02 の ID を取得"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/powerpagesites?$select=powerpagesiteid,name&$filter=contains(name,'IncidentPortal02')",
        headers=h,
    )
    r.raise_for_status()
    sites = r.json().get("value", [])
    if not sites:
        print("ERROR: IncidentPortal02 が powerpagesites に見つかりません")
        sys.exit(1)
    site_id = sites[0]["powerpagesiteid"]
    print(f"  Site ID: {site_id}")
    return site_id


def get_or_create_website():
    """adx_websites から website ID を取得。なければ作成"""
    h = get_headers()
    # incidentportal02 ドメインで検索
    r = requests.get(
        f"{DV}/api/data/v9.2/adx_websites?$select=adx_websiteid,adx_name,adx_primarydomainname",
        headers=h,
    )
    r.raise_for_status()
    for site in r.json().get("value", []):
        if SUBDOMAIN in (site.get("adx_primarydomainname") or ""):
            ws_id = site["adx_websiteid"]
            print(f"  Website ID (adx): {ws_id} ({site['adx_name']})")
            return ws_id

    # 存在しないので作成
    print(f"  adx_website が存在しません。作成します...")
    body = {
        "adx_name": f"{SITE_NAME} - {SUBDOMAIN}",
        "adx_primarydomainname": f"{SUBDOMAIN}.powerappsportals.com",
        "adx_website_language": 1033,
    }
    r2 = requests.post(f"{DV}/api/data/v9.2/adx_websites", headers=h, json=body)
    r2.raise_for_status()
    # ID を取得
    entity_id = r2.headers.get("OData-EntityId", "")
    ws_id = entity_id.split("(")[-1].rstrip(")")
    print(f"  [CREATE] adx_website: {ws_id}")
    return ws_id


def create_site_setting(name, value, website_id):
    """adx_sitesettings にレコードを作成（既存なら更新）"""
    h = get_headers()
    # 既存チェック
    r = requests.get(
        f"{DV}/api/data/v9.2/adx_sitesettings?$select=adx_sitesettingid,adx_value"
        f"&$filter=adx_name eq '{name}' and _adx_websiteid_value eq '{website_id}'",
        headers=h,
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        # 更新
        sid = existing[0]["adx_sitesettingid"]
        if existing[0].get("adx_value") == value:
            print(f"  [SKIP] {name} = {value} (既に設定済み)")
            return
        r2 = requests.patch(
            f"{DV}/api/data/v9.2/adx_sitesettings({sid})",
            headers=h,
            json={"adx_value": value},
        )
        r2.raise_for_status()
        print(f"  [UPDATE] {name} = {value}")
    else:
        # 作成
        body = {
            "adx_name": name,
            "adx_value": value,
            "adx_websiteid@odata.bind": f"/adx_websites({website_id})",
        }
        r2 = requests.post(f"{DV}/api/data/v9.2/adx_sitesettings", headers=h, json=body)
        r2.raise_for_status()
        print(f"  [CREATE] {name} = {value}")


def get_or_create_table_permission(site_id):
    """Contact Self テーブル権限を powerpagecomponent で作成"""
    h = get_headers()
    perm_name = "Contact - Self Read/Write"

    # 既存チェック
    r = requests.get(
        f"{DV}/api/data/v9.2/powerpagecomponents?$select=powerpagecomponentid,name"
        f"&$filter=name eq '{perm_name}' and _powerpagesiteid_value eq '{site_id}' and powerpagecomponenttype eq 18",
        headers=h,
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        perm_id = existing[0]["powerpagecomponentid"]
        print(f"  [SKIP] テーブル権限 '{perm_name}' 既に存在: {perm_id}")
        return perm_id

    # 作成
    content = json.dumps({
        "mspp_entityname": "contact",
        "mspp_scope": "756150001",  # Contact (Self)
        "mspp_read": "true",
        "mspp_write": "true",
        "mspp_create": "false",
        "mspp_delete": "false",
    })

    body = {
        "powerpagecomponenttype": 18,
        "name": perm_name,
        "content": content,
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r2 = requests.post(f"{DV}/api/data/v9.2/powerpagecomponents", headers=h, json=body)
    r2.raise_for_status()
    perm_id = r2.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  [CREATE] テーブル権限 '{perm_name}': {perm_id}")
    return perm_id


def get_or_create_authenticated_webrole(site_id):
    """Authenticated Users Web ロール (type=11) を取得。なければ作成"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/powerpagecomponents?$select=powerpagecomponentid,name"
        f"&$filter=_powerpagesiteid_value eq '{site_id}' and powerpagecomponenttype eq 11",
        headers=h,
    )
    r.raise_for_status()
    roles = r.json().get("value", [])
    
    for role in roles:
        if "authenticated" in role["name"].lower():
            role_id = role["powerpagecomponentid"]
            print(f"  [SKIP] Authenticated Users Web Role 既存: {role_id}")
            return role_id
    
    if roles:
        role_id = roles[0]["powerpagecomponentid"]
        print(f"  既存ロール使用: {roles[0]['name']} ({role_id})")
        return role_id
    
    # Web ロールが存在しないので作成
    print("  Web ロールが存在しません。作成します...")
    import json as _json
    content = _json.dumps({
        "mspp_anonymoususersrole": "false",
        "mspp_authenticatedusersrole": "true",
    })
    body = {
        "powerpagecomponenttype": 11,
        "name": "Authenticated Users",
        "content": content,
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r2 = requests.post(f"{DV}/api/data/v9.2/powerpagecomponents", headers=h, json=body)
    r2.raise_for_status()
    role_id = r2.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  [CREATE] Authenticated Users Web Role: {role_id}")
    return role_id


def associate_permission_to_role(perm_id, role_id):
    """テーブル権限を Web ロールに紐付け（自己参照 N:N）"""
    h = get_headers()
    url = f"{DV}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
    body = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({role_id})"}

    r = requests.post(url, headers=h, json=body)
    if r.status_code == 204:
        print(f"  [LINK] テーブル権限 → Web ロール 紐付け完了")
    elif r.status_code == 409 or "already exists" in r.text.lower():
        print(f"  [SKIP] テーブル権限 → Web ロール 既に紐付け済み")
    else:
        print(f"  [WARN] 紐付け: {r.status_code} - {r.text[:200]}")


def main():
    print("=" * 50)
    print("Contact テーブル Web API 有効化")
    print("=" * 50)

    # 1. サイト情報取得
    print("\n[1/5] サイト情報取得")
    site_id = get_site_id()
    website_id = get_or_create_website()

    # 2. Site Settings
    print("\n[2/5] Site Settings (Web API 有効化)")
    create_site_setting("Webapi/contact/enabled", "true", website_id)
    create_site_setting("Webapi/contact/fields", "firstname,lastname,emailaddress1,telephone1,fullname", website_id)

    # 3. テーブル権限
    print("\n[3/5] テーブル権限 (Contact Self)")
    perm_id = get_or_create_table_permission(site_id)

    # 4. Web ロール取得/作成
    print("\n[4/5] Web ロール取得/作成")
    role_id = get_or_create_authenticated_webrole(site_id)

    # 5. 紐付け
    if perm_id and role_id:
        print("\n[5/5] テーブル権限 → Web ロール 紐付け")
        associate_permission_to_role(perm_id, role_id)
    else:
        print("\n[5/5] SKIP (perm_id or role_id が取得できませんでした)")

    # リスタート
    print("\n[+] サイトリスタート")
    pp_token = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
    pp_h = {"Authorization": f"Bearer {pp_token}", "Content-Type": "application/json"}
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2024-10-01", headers=pp_h)
    for s in r.json().get("value", []):
        if s.get("subdomain") == SUBDOMAIN:
            rr = requests.post(f"{base}/{s['id']}/restart?api-version=2024-10-01", headers=pp_h)
            print(f"  Restart: {rr.status_code}")
            break
    else:
        print("  Site not found for restart")

    print("\n" + "=" * 50)
    print("DONE. 60-90秒後にプロフィールページが動作します。")
    print("=" * 50)


if __name__ == "__main__":
    main()
