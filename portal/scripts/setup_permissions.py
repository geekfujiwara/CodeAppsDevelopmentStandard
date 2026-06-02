"""Power Pages: geek_incident テーブルの Web API 有効化 + テーブル権限作成 + Web ロール紐づけ。

実行内容:
1. テーブル論理名/EntitySet 確認
2. Site Settings: Webapi/geek_incident/enabled=true, fields=*
3. Table Permission (powerpagecomponent type=18) を Global Read+Create で作成
4. Authenticated Users (type=11) へ powerpagecomponent_powerpagecomponent N:N 紐づけ
5. サイト再起動

Usage:
    py portal/scripts/setup_permissions.py
"""
from __future__ import annotations

import json
import logging
import os
import sys

# auth_helper.py パス
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
sys.path.insert(0, os.path.join(_ROOT, ".github", "skills", "standard", "scripts"))

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(_ROOT, ".env"))

import auth_helper

logging.disable(logging.INFO)

DATAVERSE_URL = os.getenv("DATAVERSE_URL", "").rstrip("/")
ENV_ID = os.getenv("ENV_ID", "")
SITE_NAME = "IncidentPortal"
TABLE_LOGICAL = "geek_incident"


def h():
    return {
        "Authorization": f"Bearer {auth_helper.get_token()}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def api(path):
    return f"{DATAVERSE_URL}/api/data/v9.2/{path}"


def log(msg):
    print(msg, flush=True)


def main():
    # --- 0. テーブル確認 ---
    r = requests.get(
        api(f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')"
            "?$select=LogicalName,EntitySetName"),
        headers=h(),
    )
    if r.status_code != 200:
        log(f"❌ テーブル定義取得失敗: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    edef = r.json()
    entity_set = edef["EntitySetName"]
    log(f"✓ Table: {TABLE_LOGICAL}, EntitySet: {entity_set}")

    # --- 1. mspp_website ID（Site Settings 用 adx_website） ---
    r = requests.get(
        api(f"adx_websites?$filter=adx_name eq '{SITE_NAME}'&$select=adx_websiteid,adx_name"),
        headers=h(),
    )
    sites = r.json().get("value", []) if r.status_code == 200 else []
    if not sites:
        r = requests.get(api("adx_websites?$select=adx_websiteid,adx_name"), headers=h())
        sites = [s for s in r.json().get("value", [])
                 if SITE_NAME.lower() in s.get("adx_name", "").lower()]
    if not sites:
        log("❌ adx_website が見つかりません")
        sys.exit(1)
    adx_website_id = sites[0]["adx_websiteid"]
    log(f"✓ adx_website: {sites[0]['adx_name']} ({adx_website_id})")

    # --- 2. Site Settings: Webapi 有効化 ---
    log("\n[Site Settings] Webapi 有効化")
    for suffix, value in [("/enabled", "true"), ("/fields", "*")]:
        name = f"Webapi/{TABLE_LOGICAL}{suffix}"
        # 既存確認
        r = requests.get(
            api(f"adx_sitesettings?$filter=adx_name eq '{name}' and "
                f"_adx_websiteid_value eq {adx_website_id}&$select=adx_sitesettingid,adx_value"),
            headers=h(),
        )
        existing = r.json().get("value", []) if r.status_code == 200 else []
        if existing:
            sid = existing[0]["adx_sitesettingid"]
            rp = requests.patch(api(f"adx_sitesettings({sid})"),
                                headers=h(), json={"adx_value": value})
            log(f"    {name} = {value}  (update {rp.status_code})")
        else:
            body = {
                "adx_name": name,
                "adx_value": value,
                "adx_websiteid@odata.bind": f"/adx_websites({adx_website_id})",
            }
            rc = requests.post(api("adx_sitesettings"), headers=h(), json=body)
            log(f"    {name} = {value}  (create {rc.status_code})")

    # --- 3. powerpagesite ID（Table Permission 用） ---
    r = requests.get(
        api(f"powerpagesites?$filter=name eq '{SITE_NAME}'&$select=powerpagesiteid,name"),
        headers=h(),
    )
    pps = r.json().get("value", []) if r.status_code == 200 else []
    if not pps:
        r = requests.get(api("powerpagesites?$select=powerpagesiteid,name"), headers=h())
        pps = [s for s in r.json().get("value", [])
               if SITE_NAME.lower() in s.get("name", "").lower()]
    if not pps:
        log("❌ powerpagesites が見つかりません")
        sys.exit(1)
    site_id = pps[0]["powerpagesiteid"]
    log(f"\n✓ powerpagesite: {pps[0]['name']} ({site_id})")

    # site language
    r = requests.get(
        api(f"powerpagesitelanguages?$filter=_powerpagesiteid_value eq {site_id}"
            "&$select=powerpagesitelanguageid"),
        headers=h(),
    )
    langs = r.json().get("value", []) if r.status_code == 200 else []
    lang_id = langs[0]["powerpagesitelanguageid"] if langs else None
    log(f"✓ site language: {lang_id}")

    # --- 4. Table Permission (type=18) 作成 ---
    log("\n[Table Permission] type=18 Global Read+Create")
    perm_name = f"{TABLE_LOGICAL} - Global Read Create"
    r = requests.get(
        api(f"powerpagecomponents?$filter=powerpagecomponenttype eq 18 and "
            f"_powerpagesiteid_value eq {site_id} and name eq '{perm_name}'"
            "&$select=powerpagecomponentid"),
        headers=h(),
    )
    existing = r.json().get("value", []) if r.status_code == 200 else []
    content = json.dumps({
        "mspp_entityname": TABLE_LOGICAL,
        "mspp_scope": "756150000",   # Global
        "mspp_read": "true",
        "mspp_write": "false",
        "mspp_create": "true",
        "mspp_delete": "false",
        "mspp_append": "true",
        "mspp_appendto": "true",
    })
    if existing:
        perm_id = existing[0]["powerpagecomponentid"]
        requests.patch(api(f"powerpagecomponents({perm_id})"),
                       headers=h(), json={"content": content})
        log(f"    更新: {perm_name} ({perm_id})")
    else:
        body = {
            "powerpagecomponenttype": 18,
            "name": perm_name,
            "content": content,
            "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
        }
        if lang_id:
            body["powerpagesitelanguageid@odata.bind"] = f"/powerpagesitelanguages({lang_id})"
        rc = requests.post(api("powerpagecomponents"), headers=h(), json=body)
        if rc.status_code not in (200, 201, 204):
            log(f"    ❌ 作成失敗: {rc.status_code} {rc.text[:300]}")
            sys.exit(1)
        # 204 はボディ無し → OData-EntityId ヘッダーから ID 抽出
        if rc.status_code == 204:
            import re
            loc = rc.headers.get("OData-EntityId", "")
            m = re.search(r"powerpagecomponents\(([0-9a-fA-F-]+)\)", loc)
            perm_id = m.group(1) if m else None
        else:
            perm_id = rc.json().get("powerpagecomponentid")
        log(f"    作成: {perm_name} ({perm_id})")

    # --- 5. Authenticated Users (type=11) 紐づけ ---
    log("\n[Web Role Link] Authenticated Users")
    r = requests.get(
        api(f"powerpagecomponents?$filter=powerpagecomponenttype eq 11 and "
            f"_powerpagesiteid_value eq {site_id}&$select=powerpagecomponentid,name"),
        headers=h(),
    )
    roles = r.json().get("value", []) if r.status_code == 200 else []
    auth_role = next((x for x in roles if "authenticated" in x.get("name", "").lower()), None)
    if not auth_role:
        log("❌ Authenticated Users ロールが見つかりません")
        sys.exit(1)
    role_id = auth_role["powerpagecomponentid"]
    log(f"✓ role: {auth_role['name']} ({role_id})")

    # 既存リンク確認
    lr = requests.get(
        api(f"powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent"
            "?$select=powerpagecomponentid"),
        headers=h(),
    )
    linked = [x["powerpagecomponentid"] for x in lr.json().get("value", [])] if lr.status_code == 200 else []
    if role_id in linked:
        log("    既に紐づけ済み")
    else:
        rr = requests.post(
            api(f"powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"),
            headers=h(),
            json={"@odata.id": api(f"powerpagecomponents({role_id})")},
        )
        log(f"    紐づけ: {rr.status_code}")

    # --- 6. サイト再起動 ---
    log("\n[Restart] サイト再起動")
    pp_token = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
    pp_h = {"Authorization": f"Bearer {pp_token}"}
    lr = requests.get(
        f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01",
        headers=pp_h,
    )
    api_sid = None
    if lr.status_code == 200:
        for s in lr.json().get("value", []):
            if s.get("name") == SITE_NAME or SITE_NAME.lower() in s.get("name", "").lower():
                api_sid = s.get("id") or s.get("websiteId")
                break
    if api_sid:
        rr = requests.post(
            f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites/"
            f"{api_sid}/restart?api-version=2024-10-01",
            headers=pp_h,
        )
        log(f"    restart: {rr.status_code}")
    else:
        log("    ⚠️ API 側 website ID が取得できず再起動スキップ")

    log("\n✅ 完了: テーブル権限 + Site Settings + Web ロール紐づけ")


if __name__ == "__main__":
    main()
