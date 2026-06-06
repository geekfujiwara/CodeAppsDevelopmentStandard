"""
Power Pages Web API テーブル権限設定スクリプト

指定テーブルに対して:
1. Site Settings (Webapi/{table}/enabled, fields) を adx_sitesettings に作成
2. powerpagecomponent (type=18) でテーブル権限を作成
3. Web Role (type=11) を取得または作成
4. テーブル権限に Web ロールを (a) content JSON の adx_entitypermission_webrole
   （YAML/git シリアライズ形）と (b) 自己参照 N:N association（ランタイム正本）の
   両方で紐付ける

重要（実機 m365status で確定）: ランタイム正本は N:N
`powerpagecomponent_powerpagecomponent` への $ref POST で作成する association。
content JSON 配列だけでは association が空のまま残り 403
(90040120 EntityPermissionReadIsMissing) になる。両方を作成すること。

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
    # mspp_scope (API で確認済み): 756150000=Global / 756150001=Contact /
    #   756150002=Account / 756150003=Parent / 756150004=Self
    # contact 自身（ログインユーザーの取引先担当者）の編集には Self(756150004) を使う。
    # 注意: fields 許可リストにアプリが SELECT する全列を列挙すること。
    #   許可リスト外の列を要求すると Web API は 403 を返す（例: fullname の付け忘れ）。
    ("contact", 756150004, True, True, False, False, "firstname,lastname,emailaddress1,telephone1,fullname"),
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
    site_id: str, role_id: str, website_id: str, headers: dict,
) -> str:
    """テーブル権限 (powerpagecomponent type=18) を作成し、Web ロールを
    (1) content JSON の adx_entitypermission_webrole（YAML/git シリアライズ形）
    (2) 自己参照 N:N `powerpagecomponent_powerpagecomponent` アソシエーション
    の両方で紐付ける。

    重要（実機 m365status で確定）: ランタイム正本は N:N association。
    content JSON 配列だけでは association が空のまま残り 403
    (90040120 EntityPermissionReadIsMissing) になるため、$ref POST で
    association を作成することが必須。
    """
    scope_names = {756150000: "Global", 756150001: "Contact", 756150002: "Account", 756150003: "Parent", 756150004: "Self"}
    perm_name = f"{table} - {scope_names.get(scope, 'Custom')}"

    # 検証済みの content スキーマ（adx_* キー＋websiteid＋adx_entitypermission_webrole）
    content = {
        "entitylogicalname": table,
        "entityname": perm_name,
        "scope": scope,
        "read": read, "write": write, "create": create, "delete": delete,
        "append": True, "appendto": True,
        "websiteid": website_id,
        "adx_entitypermission_webrole": [role_id],
    }

    # 既存チェック
    filter_q = (
        f"powerpagecomponenttype eq 18 "
        f"and _powerpagesiteid_value eq '{site_id}' "
        f"and contains(name, '{table}')"
    )
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents?$filter={filter_q}&$select=powerpagecomponentid,content",
        headers=headers,
    )
    r.raise_for_status()
    existing = r.json()["value"]
    if existing:
        perm_id = existing[0]["powerpagecomponentid"]
        # 既存 content の adx_entitypermission_webrole に role を冪等に追加（正本を更新）
        try:
            cur = json.loads(existing[0].get("content") or "{}")
        except json.JSONDecodeError:
            cur = {}
        roles = cur.get("adx_entitypermission_webrole") or []
        if role_id not in roles:
            roles.append(role_id)
        cur["adx_entitypermission_webrole"] = roles
        cur["websiteid"] = website_id
        requests.patch(
            f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({perm_id})",
            headers=headers, json={"content": json.dumps(cur)},
        ).raise_for_status()
        print(f"    Table Permission: content の Web ロール紐付けを更新 ({perm_id})")
        ensure_association(perm_id, role_id, headers)
        return perm_id

    body = {
        "powerpagecomponenttype": 18,
        "name": perm_name,
        "content": json.dumps(content),
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents",
        headers=headers, json=body,
    )
    r.raise_for_status()
    ppc_id = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"    Table Permission CREATED: {perm_name} ({ppc_id})")
    ensure_association(ppc_id, role_id, headers)
    return ppc_id


def ensure_association(perm_id: str, role_id: str, headers: dict):
    """権限(type=18)→Web ロール(type=11) の N:N association を冪等作成。
    これがランタイム正本。content JSON 配列だけでは 403 になる。"""
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({perm_id})"
        f"?$select=powerpagecomponentid"
        f"&$expand=powerpagecomponent_powerpagecomponent($select=powerpagecomponentid)",
        headers=headers,
    )
    r.raise_for_status()
    assoc = {a["powerpagecomponentid"]
             for a in r.json().get("powerpagecomponent_powerpagecomponent", [])}
    if role_id in assoc:
        print("    ASSOC OK: N:N association は既に存在")
        return
    requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({perm_id})"
        f"/powerpagecomponent_powerpagecomponent/$ref",
        headers=headers,
        json={"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({role_id})"},
    ).raise_for_status()
    print("    ASSOC CREATED: N:N association を作成（ランタイム正本）")


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

        # テーブル権限 (powerpagecomponent) — content JSON に Web ロールを紐付け（正本）
        create_table_permission(table, scope, read, write, create, delete, site_id, role_id, adx_website_id, headers)
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
