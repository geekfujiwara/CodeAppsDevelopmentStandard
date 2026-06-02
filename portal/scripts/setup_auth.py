"""Power Pages: Entra ID (Azure AD) ビルトイン認証を API で有効化する。

実施内容:
1. Site Settings で AzureADLoginEnabled=true 等を設定
2. Web テンプレートに Liquid ユーザー注入を追加
3. サイト再起動

Usage:
    py portal/scripts/setup_auth.py
"""
from __future__ import annotations
import glob
import json
import logging
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
sys.path.insert(0, os.path.join(_ROOT, ".github", "skills", "standard", "scripts"))

import requests
from dotenv import load_dotenv
load_dotenv(os.path.join(_ROOT, ".env"))
import auth_helper

logging.disable(logging.INFO)

DATAVERSE_URL = os.getenv("DATAVERSE_URL", "").rstrip("/")
TENANT_ID = os.getenv("TENANT_ID", "")
ENV_ID = os.getenv("ENV_ID", "")
SITE_NAME = "IncidentPortal"


def h():
    return {
        "Authorization": f"Bearer {auth_helper.get_token()}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def h_patch():
    """mspp_ テーブルへの PATCH には If-Match: * が必須"""
    headers = h()
    headers["If-Match"] = "*"
    return headers


def api(path):
    return f"{DATAVERSE_URL}/api/data/v9.2/{path}"


def log(msg):
    print(msg, flush=True)


def upsert_site_setting(website_id: str, name: str, value: str):
    """Site Setting を作成 or 更新"""
    r = requests.get(
        api(f"adx_sitesettings?$filter=adx_name eq '{name}' and "
            f"_adx_websiteid_value eq {website_id}&$select=adx_sitesettingid,adx_value"),
        headers=h(),
    )
    existing = r.json().get("value", []) if r.status_code == 200 else []
    if existing:
        sid = existing[0]["adx_sitesettingid"]
        if existing[0].get("adx_value") == value:
            log(f"    {name} = {value}  (既存OK)")
            return
        rp = requests.patch(api(f"adx_sitesettings({sid})"), headers=h(), json={"adx_value": value})
        log(f"    {name} = {value}  (update {rp.status_code})")
    else:
        body = {
            "adx_name": name,
            "adx_value": value,
            "adx_websiteid@odata.bind": f"/adx_websites({website_id})",
        }
        rc = requests.post(api("adx_sitesettings"), headers=h(), json=body)
        log(f"    {name} = {value}  (create {rc.status_code})")


def main():
    # --- 1. Website ID ---
    r = requests.get(api(f"adx_websites?$filter=adx_name eq '{SITE_NAME}'&$select=adx_websiteid,adx_name"), headers=h())
    sites = r.json().get("value", []) if r.status_code == 200 else []
    if not sites:
        r = requests.get(api("adx_websites?$select=adx_websiteid,adx_name"), headers=h())
        sites = [s for s in r.json().get("value", []) if SITE_NAME.lower() in s.get("adx_name", "").lower()]
    if not sites:
        log("❌ adx_website が見つかりません")
        sys.exit(1)
    website_id = sites[0]["adx_websiteid"]
    log(f"✓ Website: {sites[0]['adx_name']} ({website_id})")

    # --- 2. 認証 Site Settings ---
    log("\n[Site Settings] Entra ID 認証有効化")
    settings = {
        "Authentication/Registration/AzureADLoginEnabled": "true",
        "Authentication/Registration/LocalLoginEnabled": "false",
        "Authentication/Registration/ExternalLoginEnabled": "true",
        "Authentication/Registration/OpenRegistrationEnabled": "true",
        "Authentication/Registration/ProfileRedirectEnabled": "false",
        "Authentication/Registration/LoginButtonAuthenticationType": f"https://login.microsoftonline.com/{TENANT_ID}/",
    }
    for name, value in settings.items():
        upsert_site_setting(website_id, name, value)

    # --- 3. Web テンプレートに Liquid ユーザー注入 ---
    log("\n[Web Template] Liquid ユーザー注入")

    # mspp_websiteid を取得 (adx_websiteid とは異なる)
    r = requests.get(
        api(f"mspp_websites?$filter=mspp_name eq '{SITE_NAME}'&$select=mspp_websiteid,mspp_name"),
        headers=h(),
    )
    mspp_sites = r.json().get("value", []) if r.status_code == 200 else []
    if not mspp_sites:
        r = requests.get(api("mspp_websites?$select=mspp_websiteid,mspp_name"), headers=h())
        mspp_sites = [s for s in r.json().get("value", []) if SITE_NAME.lower() in s.get("mspp_name", "").lower()]
    if not mspp_sites:
        log("❌ mspp_websites が見つかりません")
        sys.exit(1)
    mspp_wid = mspp_sites[0]["mspp_websiteid"]
    log(f"    mspp_website: {mspp_sites[0]['mspp_name']} ({mspp_wid})")

    # dist-site のアセット名を取得
    dist_dir = os.path.join(_ROOT, "portal", "dist-site")
    js_files = glob.glob(os.path.join(dist_dir, "assets", "index-*.js"))
    css_files = glob.glob(os.path.join(dist_dir, "assets", "index-*.css"))
    if not js_files or not css_files:
        log("❌ dist-site/assets/ にビルドファイルが見つかりません")
        sys.exit(1)
    js_file = "assets/" + os.path.basename(js_files[0])
    css_file = "assets/" + os.path.basename(css_files[0])
    log(f"    Assets: /{js_file}, /{css_file}")

    # Liquid ユーザー注入 + SPA ローダー
    user_script = (
        '{% if user %}<script>window.__PP_USER__={'
        'userName:"{{ user.fullname | escape }}",'
        'firstName:"{{ user.firstname | escape }}",'
        'lastName:"{{ user.lastname | escape }}",'
        'email:"{{ user.emailaddress1 | escape }}",'
        'contactId:"{{ user.id }}",'
        'userRoles:["Authenticated Users"]'
        '};</script>{% endif %}'
    )
    spa_template = (
        '<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />\n'
        f'<link rel="stylesheet" href="/{css_file}" />\n'
        f'{user_script}\n'
        '<div id="root"></div>\n'
        f'<script type="module" src="/{js_file}"></script>\n'
    )

    # mspp_webtemplates から Default studio template を取得
    r = requests.get(
        api(f"mspp_webtemplates?$filter=_mspp_websiteid_value eq '{mspp_wid}'"
            f"&$select=mspp_webtemplateid,mspp_name"),
        headers=h(),
    )
    for wt in r.json().get("value", []):
        if "default studio" in wt.get("mspp_name", "").lower():
            wt_id = wt["mspp_webtemplateid"]
            rp = requests.patch(
                api(f"mspp_webtemplates({wt_id})"),
                headers=h_patch(),
                json={"mspp_source": spa_template},
            )
            log(f"    {wt['mspp_name']}: Liquid注入 ({rp.status_code})")

    # --- 4. Home mspp_copy にも user script 注入 ---
    log("\n[Home Page] mspp_copy に Liquid + SPA")
    new_copy = (
        f'{user_script}\n'
        '<div id="root"></div>\n'
        f'<script type="module" crossorigin src="/{js_file}"></script>\n'
        f'<link rel="stylesheet" crossorigin href="/{css_file}">'
    )
    r = requests.get(
        api(f"mspp_webpages?$filter=_mspp_websiteid_value eq '{mspp_wid}' and mspp_name eq 'Home'"
            f"&$select=mspp_webpageid,mspp_isroot"),
        headers=h(),
    )
    for p in r.json().get("value", []):
        pid = p["mspp_webpageid"]
        label = "Root" if p.get("mspp_isroot") else "Content"
        rp = requests.patch(api(f"mspp_webpages({pid})"), headers=h_patch(), json={"mspp_copy": new_copy})
        log(f"    {label} ({pid}): {rp.status_code}")

    # --- 5. サイト再起動 ---
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
            if SITE_NAME.lower() in s.get("name", "").lower():
                api_sid = s.get("id") or s.get("websiteId")
                break
    if api_sid:
        rr = requests.post(
            f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites/{api_sid}/restart?api-version=2024-10-01",
            headers=pp_h,
        )
        log(f"    restart: {rr.status_code}")
    else:
        log("    ⚠️ restart スキップ")

    log("\n✅ Entra ID 認証設定完了")
    log(f"    サイト URL: https://incidentportal.powerappsportals.com")
    log(f"    LoginButtonAuthenticationType → https://login.microsoftonline.com/{TENANT_ID}/")
    log("    ※ 初回ログイン時にブラウザで Entra ID 認証ダイアログが表示されます")


if __name__ == "__main__":
    main()
