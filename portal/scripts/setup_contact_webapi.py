"""Power Pages: Contact テーブルの Web API 有効化 + テーブル権限設定

修正版: レガシー mspp_entitypermission/mspp_webrole + powerpagecomponent N:N 両方を設定。
Power Pages ランタイムは両方のテーブルを参照するため、両方必要。

重要ポイント:
- mspp_websiteid は powerpagesites テーブルを参照する（adx_websites ではない）
- powerpagecomponent_powerpagecomponent N:N でテーブル権限→Web ロールを紐付ける
- mspp_entitypermission_webrole N:N もレガシー互換のため設定する

Usage:
    py portal/scripts/setup_contact_webapi.py
"""
import json, os, sys

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
    """powerpagesites から Site ID を取得"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/powerpagesites"
        f"?$select=powerpagesiteid,name"
        f"&$filter=contains(name,'{SITE_NAME}')",
        headers=h,
    )
    r.raise_for_status()
    sites = r.json().get("value", [])
    if not sites:
        print(f"ERROR: {SITE_NAME} が powerpagesites に見つかりません")
        sys.exit(1)
    site_id = sites[0]["powerpagesiteid"]
    print(f"  Site ID: {site_id}")
    return site_id


def get_or_create_website(site_id):
    """adx_websites から website ID を取得。なければ作成"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/adx_websites?$select=adx_websiteid,adx_name,adx_primarydomainname",
        headers=h,
    )
    r.raise_for_status()
    for site in r.json().get("value", []):
        if SUBDOMAIN in (site.get("adx_primarydomainname") or ""):
            ws_id = site["adx_websiteid"]
            print(f"  Website ID (adx): {ws_id}")
            return ws_id

    print(f"  adx_website が存在しません。作成します...")
    body = {
        "adx_name": f"{SITE_NAME} - {SUBDOMAIN}",
        "adx_primarydomainname": f"{SUBDOMAIN}.powerappsportals.com",
        "adx_website_language": 1033,
    }
    r2 = requests.post(f"{DV}/api/data/v9.2/adx_websites", headers=h, json=body)
    r2.raise_for_status()
    ws_id = r2.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  [CREATE] adx_website: {ws_id}")
    return ws_id


def create_site_setting(name, value, website_id):
    """adx_sitesettings にレコードを作成（既存なら更新）"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/adx_sitesettings?$select=adx_sitesettingid,adx_value"
        f"&$filter=adx_name eq '{name}' and _adx_websiteid_value eq '{website_id}'",
        headers=h,
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        sid = existing[0]["adx_sitesettingid"]
        if existing[0].get("adx_value") == value:
            print(f"  [SKIP] {name} = {value}")
            return
        r2 = requests.patch(
            f"{DV}/api/data/v9.2/adx_sitesettings({sid})",
            headers=h,
            json={"adx_value": value},
        )
        r2.raise_for_status()
        print(f"  [UPDATE] {name} = {value}")
    else:
        body = {
            "adx_name": name,
            "adx_value": value,
            "adx_websiteid@odata.bind": f"/adx_websites({website_id})",
        }
        r2 = requests.post(f"{DV}/api/data/v9.2/adx_sitesettings", headers=h, json=body)
        r2.raise_for_status()
        print(f"  [CREATE] {name} = {value}")


def get_or_create_webrole(site_id):
    """mspp_webrole (Authenticated Users) を取得/作成。
    重要: mspp_websiteid は powerpagesites を参照する"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/mspp_webroles"
        f"?$select=mspp_webroleid,mspp_name,mspp_authenticatedusersrole"
        f"&$filter=_mspp_websiteid_value eq '{site_id}'",
        headers=h,
    )
    r.raise_for_status()
    roles = r.json().get("value", [])

    for role in roles:
        if role.get("mspp_authenticatedusersrole"):
            print(f"  [SKIP] {role['mspp_name']}: {role['mspp_webroleid']}")
            return role["mspp_webroleid"]

    body = {
        "mspp_name": "Authenticated Users",
        "mspp_authenticatedusersrole": True,
        "mspp_anonymoususersrole": False,
        "mspp_websiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r2 = requests.post(f"{DV}/api/data/v9.2/mspp_webroles", headers=h, json=body)
    r2.raise_for_status()
    role_id = r2.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  [CREATE] mspp_webrole: {role_id}")
    return role_id


def get_or_create_entity_permission(site_id):
    """mspp_entitypermission (Contact Self) を取得/作成"""
    h = get_headers()
    r = requests.get(
        f"{DV}/api/data/v9.2/mspp_entitypermissions"
        f"?$select=mspp_entitypermissionid,mspp_entitylogicalname"
        f"&$filter=mspp_entitylogicalname eq 'contact' and _mspp_websiteid_value eq '{site_id}'",
        headers=h,
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        perm_id = existing[0]["mspp_entitypermissionid"]
        print(f"  [SKIP] entity permission: {perm_id}")
        return perm_id

    body = {
        "mspp_entitylogicalname": "contact",
        "mspp_entityname": "Contact - Self",
        "mspp_scope": 756150001,  # Self (Contact)
        "mspp_read": True,
        "mspp_write": True,
        "mspp_create": False,
        "mspp_delete": False,
        "mspp_websiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r2 = requests.post(f"{DV}/api/data/v9.2/mspp_entitypermissions", headers=h, json=body)
    r2.raise_for_status()
    perm_id = r2.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  [CREATE] mspp_entitypermission: {perm_id}")
    return perm_id


def link_permission_to_role(perm_id, role_id):
    """テーブル権限→Web ロール紐付け (mspp N:N + powerpagecomponent N:N)"""
    h = get_headers()

    # 1. Legacy mspp N:N
    url = f"{DV}/api/data/v9.2/mspp_entitypermissions({perm_id})/mspp_entitypermission_webrole/$ref"
    body = {"@odata.id": f"{DV}/api/data/v9.2/mspp_webroles({role_id})"}
    r = requests.post(url, headers=h, json=body)
    if r.status_code == 204:
        print(f"  [LINK] mspp_entitypermission_webrole 完了")
    elif r.status_code == 409 or "already exists" in r.text.lower():
        print(f"  [SKIP] mspp N:N 既に紐付け済み")
    else:
        print(f"  [WARN] mspp N:N: {r.status_code} - {r.text[:200]}")

    # 2. powerpagecomponent N:N (perm → role, 同じ ID で同期される)
    url2 = f"{DV}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
    body2 = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({role_id})"}
    r2 = requests.post(url2, headers=h, json=body2)
    if r2.status_code == 204:
        print(f"  [LINK] powerpagecomponent N:N 完了")
    elif r2.status_code == 409 or "already exists" in r2.text.lower():
        print(f"  [SKIP] powerpagecomponent N:N 既に紐付け済み")
    else:
        print(f"  [INFO] powerpagecomponent N:N: {r2.status_code}")

    # 3. 既存 Authenticated Users (powerpagecomponent) にもリンク
    r3 = requests.get(
        f"{DV}/api/data/v9.2/powerpagecomponents"
        f"?$select=powerpagecomponentid,name,content"
        f"&$filter=powerpagecomponenttype eq 11",
        headers=h,
    )
    for role in r3.json().get("value", []):
        rid = role["powerpagecomponentid"]
        if rid == role_id:
            continue
        content = role.get("content", "")
        if "authenticatedusersrole" in content and '"authenticatedusersrole": true' in content.lower().replace(" ", ""):
            body3 = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({rid})"}
            r4 = requests.post(url2, headers=h, json=body3)
            if r4.status_code in (204, 409):
                print(f"  [LINK] -> {role.get('name', 'unknown')} ({rid[:8]}...)")


def main():
    print("=" * 60)
    print("Contact テーブル Web API 有効化")
    print("=" * 60)

    # 1. サイト情報取得
    print("\n[1/5] サイト情報取得")
    site_id = get_site_id()
    website_id = get_or_create_website(site_id)

    # 2. Site Settings
    print("\n[2/5] Site Settings (Web API 有効化)")
    create_site_setting("Webapi/contact/enabled", "true", website_id)
    create_site_setting("Webapi/contact/fields", "firstname,lastname,emailaddress1,telephone1,fullname", website_id)

    # 3. mspp_webrole
    print("\n[3/5] mspp_webrole (Authenticated Users)")
    role_id = get_or_create_webrole(site_id)

    # 4. mspp_entitypermission
    print("\n[4/5] mspp_entitypermission (Contact Self)")
    perm_id = get_or_create_entity_permission(site_id)

    # 5. 紐付け
    print("\n[5/5] テーブル権限 → Web ロール 紐付け")
    link_permission_to_role(perm_id, role_id)

    print("\n" + "=" * 60)
    print("DONE. pac pages upload-code-site --rootPath . でキャッシュ更新してください。")
    print("=" * 60)


if __name__ == "__main__":
    main()
