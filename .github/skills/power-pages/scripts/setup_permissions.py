"""
Power Pages Web API テーブル権限設定スクリプト

指定テーブルに対して:
1. Site Settings (Webapi/{table}/enabled, fields) を adx_sitesettings に作成
2. powerpagecomponent (type=18) でテーブル権限を作成
3. Web Role (type=11) を取得または作成
4. テーブル権限 ↔ Web Role の N:N リンクを作成

前提: .env に DATAVERSE_URL, ENV_ID が設定済み。
"""
import os
import sys
import json
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from auth_helper import get_token

# === 環境変数 ===
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
ENV_ID = os.environ["ENV_ID"]
SUBDOMAIN = os.environ.get("PP_SUBDOMAIN", "")

# === 設定 ===
# テーブル名と権限レベルのリスト
TABLES = [
    # (logical_name, scope, read, write, create, delete, fields)
    # scope: 756150000=Global, 756150001=Self(Contact), 756150002=Parent, 756150003=Account
    ("contact", 756150001, True, True, False, False, "firstname,lastname,emailaddress1,telephone1,fullname"),
    # 以下に必要なテーブルを追加:
    # ("geek_incident", 756150000, True, True, True, False, "*"),
]


def get_headers(scope: str = None):
    token = get_token(scope=scope) if scope else get_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_powerpagesite_id() -> str:
    """powerpagesites から最新のサイト ID を取得"""
    headers = get_headers()
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagesites?$top=1&$orderby=createdon desc&$select=powerpagesiteid,name",
        headers=headers,
    )
    r.raise_for_status()
    sites = r.json()["value"]
    if not sites:
        print("ERROR: powerpagesites にレコードが見つかりません")
        sys.exit(1)
    print(f"  powerpagesite: {sites[0]['name']} ({sites[0]['powerpagesiteid']})")
    return sites[0]["powerpagesiteid"]


def get_adx_website_id() -> str:
    """adx_websites から最新の Website ID を取得"""
    headers = get_headers()
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/adx_websites?$top=1&$orderby=createdon desc&$select=adx_websiteid,adx_name",
        headers=headers,
    )
    r.raise_for_status()
    sites = r.json()["value"]
    if not sites:
        print("ERROR: adx_websites にレコードが見つかりません")
        sys.exit(1)
    return sites[0]["adx_websiteid"]


def upsert_site_setting(name: str, value: str, adx_website_id: str, headers: dict):
    """adx_sitesettings に upsert"""
    filter_q = f"adx_name eq '{name}' and _adx_websiteid_value eq '{adx_website_id}'"
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/adx_sitesettings?$filter={filter_q}",
        headers=headers,
    )
    r.raise_for_status()
    existing = r.json()["value"]

    body = {
        "adx_name": name,
        "adx_value": value,
        "adx_websiteid@odata.bind": f"/adx_websites({adx_website_id})",
    }

    if existing:
        requests.patch(
            f"{DATAVERSE_URL}/api/data/v9.2/adx_sitesettings({existing[0]['adx_sitesettingid']})",
            headers=headers, json=body,
        ).raise_for_status()
        print(f"    UPDATED: {name} = {value}")
    else:
        requests.post(
            f"{DATAVERSE_URL}/api/data/v9.2/adx_sitesettings",
            headers=headers, json=body,
        ).raise_for_status()
        print(f"    CREATED: {name} = {value}")


def get_or_create_webrole_ppc(site_id: str, headers: dict) -> str:
    """Authenticated Users Web Role (powerpagecomponent type=11) を取得 or 作成"""
    # 既存チェック
    filter_q = (
        f"powerpagecomponenttype eq 11 "
        f"and _powerpagesiteid_value eq '{site_id}' "
        f"and contains(name, 'Authenticated')"
    )
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents?$filter={filter_q}",
        headers=headers,
    )
    r.raise_for_status()
    existing = r.json()["value"]
    if existing:
        print(f"    Web Role (PPC): {existing[0]['name']} ({existing[0]['powerpagecomponentid']})")
        return existing[0]["powerpagecomponentid"]

    # 作成
    body = {
        "powerpagecomponenttype": 11,
        "name": "Authenticated Users",
        "content": json.dumps({
            "mspp_anonymoususersrole": "false",
            "mspp_authenticatedusersrole": "true",
        }),
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents",
        headers=headers, json=body,
    )
    r.raise_for_status()
    ppc_id = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"    Web Role (PPC) CREATED: {ppc_id}")
    return ppc_id


def create_table_permission(
    table: str, scope: int, read: bool, write: bool, create: bool, delete: bool,
    site_id: str, headers: dict,
) -> str:
    """テーブル権限 (powerpagecomponent type=18) を作成"""
    # 既存チェック
    filter_q = (
        f"powerpagecomponenttype eq 18 "
        f"and _powerpagesiteid_value eq '{site_id}' "
        f"and contains(name, '{table}')"
    )
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents?$filter={filter_q}",
        headers=headers,
    )
    r.raise_for_status()
    existing = r.json()["value"]
    if existing:
        print(f"    Table Permission: already exists ({existing[0]['powerpagecomponentid']})")
        return existing[0]["powerpagecomponentid"]

    scope_names = {756150000: "Global", 756150001: "Self", 756150002: "Parent", 756150003: "Account"}
    perm_name = f"{table} - {scope_names.get(scope, 'Custom')}"

    body = {
        "powerpagecomponenttype": 18,
        "name": perm_name,
        "content": json.dumps({
            "mspp_entityname": table,
            "mspp_scope": str(scope),
            "mspp_read": str(read).lower(),
            "mspp_write": str(write).lower(),
            "mspp_create": str(create).lower(),
            "mspp_delete": str(delete).lower(),
        }),
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents",
        headers=headers, json=body,
    )
    r.raise_for_status()
    ppc_id = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"    Table Permission CREATED: {perm_name} ({ppc_id})")
    return ppc_id


def link_permission_to_webrole(perm_id: str, role_id: str, headers: dict):
    """テーブル権限 ↔ Web Role の自己参照 N:N リンクを作成"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
    body = {"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({role_id})"}
    r = requests.post(url, headers=headers, json=body)
    if r.status_code == 204:
        print(f"    LINKED: permission → webrole")
    elif r.status_code == 409:
        print(f"    LINKED: already exists (skip)")
    else:
        r.raise_for_status()


def restart_site():
    """PP API でポータルを再起動"""
    if not SUBDOMAIN:
        print("  SKIP restart: PP_SUBDOMAIN が未設定")
        return
    headers = get_headers(scope="https://api.powerplatform.com/.default")
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
    r.raise_for_status()
    for site in r.json()["value"]:
        if site.get("subdomain", "") == SUBDOMAIN:
            requests.post(f"{base}/{site['id']}/restart?api-version=2024-10-01", headers=headers).raise_for_status()
            print(f"  RESTARTED: {SUBDOMAIN}.powerappsportals.com")
            return
    print(f"  WARNING: subdomain '{SUBDOMAIN}' が見つかりません")


def main():
    print("=== Power Pages Web API テーブル権限設定 ===")
    print()

    headers = get_headers()

    # 1. サイト ID 取得
    print("[1/5] サイト ID を取得...")
    site_id = get_powerpagesite_id()
    adx_website_id = get_adx_website_id()
    print()

    # 2. Web Role 取得 or 作成
    print("[2/5] Web Role (Authenticated Users) を確認...")
    role_id = get_or_create_webrole_ppc(site_id, headers)
    print()

    # 3. テーブルごとに設定
    for table, scope, read, write, create, delete, fields in TABLES:
        print(f"[3/5] テーブル権限設定: {table}")

        # Site Settings
        upsert_site_setting(f"Webapi/{table}/enabled", "true", adx_website_id, headers)
        upsert_site_setting(f"Webapi/{table}/fields", fields, adx_website_id, headers)

        # テーブル権限 (powerpagecomponent)
        perm_id = create_table_permission(table, scope, read, write, create, delete, site_id, headers)

        # N:N リンク
        link_permission_to_webrole(perm_id, role_id, headers)
        print()

    # 4. ポータル再起動
    print("[4/5] ポータルを再起動...")
    restart_site()
    print()

    print("[5/5] 完了!")
    print("/_api/{table} にアクセスして動作確認してください。")
    print("(再起動後 60-90秒でアクセス可能)")


if __name__ == "__main__":
    main()
