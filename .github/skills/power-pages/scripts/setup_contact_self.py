"""
Power Pages contact テーブル Self 権限セットアップ（/profile 機能の前提）

ログインユーザー自身の取引先担当者（contact）を編集する `/profile` 画面のために、
以下を content JSON 正本方式で冪等に作成する（EDM 2.0 / Code Site 対応）:

1. contact テーブル権限 (powerpagecomponent type=18, scope=Self=756150004)
   read/write=true, create/delete=false, Authenticated Users を content と
   **N:N association** の両方で紐付け
2. Webapi/contact/enabled  (powerpagecomponent type=9) = true
3. Webapi/contact/fields    (powerpagecomponent type=9) = 使用する全列

重要な教訓（実機 m365status で確定）:
- mspp_scope (API 確認済み): 756150000=Global / 756150001=Contact /
  756150002=Account / 756150003=Parent / **756150004=Self**
- Web ロール紐付けのランタイム正本は自己参照 N:N
  `powerpagecomponent_powerpagecomponent` **アソシエーション**。
  content JSON の adx_entitypermission_webrole だけでは association が空のまま
  残り 403 (90040120 EntityPermissionReadIsMissing) になる。$ref POST で
  association を作成して初めてランタイムが認識する。
- Web API は fields 許可リスト外の列を要求すると **403**
  (90040101 AttributePermissionIsMissing) を返す。$select なし取得は
  全列 (`*`) 要求と同等なので、fields は `*` が最も安全。
- 設定変更後はサイト再起動が必要（PP_SUBDOMAIN 設定時に自動実行）。

前提: .env に DATAVERSE_URL, ENV_ID。再起動には PP_SUBDOMAIN。
"""
import os
import sys
import json
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from auth_helper import get_token

DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
ENV_ID = os.environ.get("ENV_ID", "")
SUBDOMAIN = os.environ.get("PP_SUBDOMAIN", "")

API = f"{DATAVERSE_URL}/api/data/v9.2"

SELF_SCOPE = 756150004  # mspp_scope: セルフ
# /profile の checkAuth + 編集で使う全列。fields 許可リスト外は 403 になるため
# `*`（全列許可）が最も安全。$select なし取得は `*` 要求と同等。
CONTACT_FIELDS = os.environ.get("CONTACT_WEBAPI_FIELDS", "*")


def get_headers(scope: str = None):
    token = get_token(scope=scope) if scope else get_token()
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def get_site_id(headers: dict) -> str:
    r = requests.get(
        f"{API}/powerpagesites?$top=1&$orderby=createdon desc&$select=powerpagesiteid,name",
        headers=headers,
    )
    r.raise_for_status()
    sites = r.json()["value"]
    if not sites:
        print("ERROR: powerpagesites にレコードが見つかりません")
        sys.exit(1)
    print(f"  site: {sites[0]['name']} ({sites[0]['powerpagesiteid']})")
    return sites[0]["powerpagesiteid"]


def get_auth_webrole_id(site_id: str, headers: dict) -> str:
    r = requests.get(
        f"{API}/powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq 11&$select=powerpagecomponentid,name&$top=200",
        headers=headers,
    )
    r.raise_for_status()
    for c in r.json().get("value", []):
        if "authenticated" in (c.get("name") or "").lower():
            print(f"  webrole: {c.get('name')} ({c['powerpagecomponentid']})")
            return c["powerpagecomponentid"]
    print("ERROR: Authenticated Users Web ロールが見つかりません")
    sys.exit(1)


def find_component(site_id: str, ctype: int, exact_name: str, headers: dict):
    r = requests.get(
        f"{API}/powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq {ctype}&$select=powerpagecomponentid,name,content&$top=500",
        headers=headers,
    )
    r.raise_for_status()
    for c in r.json().get("value", []):
        if (c.get("name") or "") == exact_name:
            return c
    return None


def create_component(site_id: str, ctype: int, name: str, content: dict, headers: dict) -> str:
    body = {
        "powerpagecomponenttype": ctype,
        "name": name,
        "content": json.dumps(content),
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    }
    r = requests.post(f"{API}/powerpagecomponents", headers=headers, json=body)
    r.raise_for_status()
    cid = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    print(f"  CREATED type={ctype}: {name} ({cid})")
    return cid


def setup_contact_permission(site_id: str, role_id: str, headers: dict):
    """contact Self テーブル権限 (type=18) を content JSON と N:N association の
    両方で作成/更新する。ランタイム正本は association。"""
    name = "Contact - Self"
    existing = find_component(site_id, 18, name, headers)
    content = {
        "filecontent": None,
        "append": False, "appendto": False, "create": False, "delete": False,
        "entitylogicalname": "contact", "entityname": name,
        "parententitypermission": None, "read": True, "scope": SELF_SCOPE,
        "websiteid": site_id, "write": True,
        "adx_entitypermission_webrole": [role_id],
        "parentrelationship": None, "contactrelationship": None,
        "accountrelationship": None, "childTablePermissions": [],
        "permissionfetchxml": None,
    }
    if existing:
        perm_id = existing["powerpagecomponentid"]
        cur = json.loads(existing.get("content") or "{}")
        roles = cur.get("adx_entitypermission_webrole") or []
        if role_id not in roles:
            roles.append(role_id)
        cur["adx_entitypermission_webrole"] = roles
        cur["websiteid"] = site_id
        requests.patch(
            f"{API}/powerpagecomponents({perm_id})",
            headers=headers, json={"content": json.dumps(cur)},
        ).raise_for_status()
        print(f"  UPDATED: {name} の content Web ロール紐付けを確認/補正")
    else:
        perm_id = create_component(site_id, 18, name, content, headers)

    # ランタイム正本: N:N association を冪等作成（content だけでは 403）
    ensure_association(perm_id, role_id, headers)


def ensure_association(perm_id: str, role_id: str, headers: dict):
    """権限(type=18)→Web ロール(type=11) の N:N association を冪等作成。
    これがランタイム正本。content JSON 配列だけでは 403 になる。"""
    r = requests.get(
        f"{API}/powerpagecomponents({perm_id})"
        f"?$select=powerpagecomponentid"
        f"&$expand=powerpagecomponent_powerpagecomponent($select=powerpagecomponentid)",
        headers=headers,
    )
    r.raise_for_status()
    assoc = {a["powerpagecomponentid"]
             for a in r.json().get("powerpagecomponent_powerpagecomponent", [])}
    if role_id in assoc:
        print("  ASSOC OK: N:N association は既に存在")
        return
    requests.post(
        f"{API}/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref",
        headers=headers,
        json={"@odata.id": f"{API}/powerpagecomponents({role_id})"},
    ).raise_for_status()
    print("  ASSOC CREATED: N:N association を作成（ランタイム正本）")


def setup_webapi_setting(site_id: str, key: str, value: str, headers: dict):
    """Webapi/contact/* サイト設定 (type=9) を content JSON 方式で作成/更新"""
    existing = find_component(site_id, 9, key, headers)
    content = {"value": value, "websiteid": site_id}
    if existing:
        requests.patch(
            f"{API}/powerpagecomponents({existing['powerpagecomponentid']})",
            headers=headers, json={"content": json.dumps(content)},
        ).raise_for_status()
        print(f"  UPDATED: {key} = {value}")
    else:
        create_component(site_id, 9, key, content, headers)


def restart_site():
    if not SUBDOMAIN or not ENV_ID:
        print("  SKIP restart: PP_SUBDOMAIN / ENV_ID 未設定")
        return
    headers = get_headers(scope="https://api.powerplatform.com/.default")
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
    r.raise_for_status()
    for site in r.json()["value"]:
        if site.get("subdomain", "") == SUBDOMAIN:
            requests.post(
                f"{base}/{site['id']}/restart?api-version=2024-10-01", headers=headers
            ).raise_for_status()
            print(f"  RESTARTED: {SUBDOMAIN}")
            return
    print(f"  WARNING: subdomain '{SUBDOMAIN}' が見つかりません")


def main():
    print("=== contact Self 権限セットアップ（/profile の前提） ===\n")
    headers = get_headers()

    print("[1/5] サイト ID を取得...")
    site_id = get_site_id(headers)
    print()

    print("[2/5] Authenticated Users Web ロールを取得...")
    role_id = get_auth_webrole_id(site_id, headers)
    print()

    print("[3/5] contact Self テーブル権限を作成/更新...")
    setup_contact_permission(site_id, role_id, headers)
    print()

    print("[4/5] Webapi/contact サイト設定を作成/更新...")
    setup_webapi_setting(site_id, "Webapi/contact/enabled", "true", headers)
    setup_webapi_setting(site_id, "Webapi/contact/fields", CONTACT_FIELDS, headers)
    print()

    print("[5/5] ポータルを再起動...")
    restart_site()
    print("\n完了! 再起動後 60-90秒で /profile が利用可能。")


if __name__ == "__main__":
    main()
