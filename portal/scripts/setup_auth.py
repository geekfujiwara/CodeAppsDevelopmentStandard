"""Power Pages: Entra ID SSO 認証設定 (EDM 2.0 Code Site 対応)

EDM 2.0 Code Site では adx_websites テーブルが存在しないため、
powerpagecomponents type=9 (site settings) を直接更新する。

実施内容:
1. powerpagesites からサイト ID 取得
2. powerpagecomponents type=9 で認証 Site Settings を更新/作成
3. PP API でサイト再起動

Ref: microsoft/power-platform-skills setup-auth
  - Provider identifier: https://login.windows.net/{tenantId}/ (NOT login.microsoftonline.com)
  - API version: 2022-03-01-preview

Usage:
    py portal/scripts/setup_auth.py
"""
from __future__ import annotations
import json
import logging
import os
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
SITE_NAME = os.getenv("PAGES_SITE_NAME", "IncidentPortal")
SUBDOMAIN = os.getenv("PAGES_SUBDOMAIN", "")


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


def upsert_edm_site_setting(site_id: str, lang_id: str, name: str, value: str):
    """EDM 2.0: powerpagecomponents type=9 でサイト設定を upsert"""
    # 既存チェック
    r = requests.get(
        api(f"powerpagecomponents?$filter=powerpagecomponenttype eq 9 "
            f"and _powerpagesiteid_value eq {site_id} and name eq '{name}'"),
        headers=h(),
    )
    existing = r.json().get("value", []) if r.status_code == 200 else []

    content_json = json.dumps({"value": value})

    if existing:
        comp_id = existing[0]["powerpagecomponentid"]
        old_content = existing[0].get("content", "")
        try:
            old_val = json.loads(old_content).get("value", "")
        except Exception:
            old_val = old_content
        if old_val == value:
            log(f"    {name} = {value}  (既存OK)")
            return
        rp = requests.patch(
            api(f"powerpagecomponents({comp_id})"),
            headers=h(),
            json={"content": content_json},
        )
        log(f"    {name} = {value}  (update {rp.status_code})")
    else:
        body = {
            "powerpagecomponenttype": 9,
            "name": name,
            "content": content_json,
            "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
        }
        if lang_id:
            body["powerpagesitelanguageid@odata.bind"] = f"/powerpagesitelanguages({lang_id})"
        rc = requests.post(api("powerpagecomponents"), headers=h(), json=body)
        log(f"    {name} = {value}  (create {rc.status_code})")


def main():
    log("=" * 60)
    log("Entra ID SSO 認証設定 (EDM 2.0 Code Site)")
    log("=" * 60)

    # --- 1. powerpagesites からサイト取得 ---
    log("\n[1/3] サイト情報取得")
    r = requests.get(api("powerpagesites"), headers=h())
    r.raise_for_status()
    sites = [s for s in r.json().get("value", [])
             if (s.get("name") or "").lower() == SITE_NAME.lower()]
    if not sites:
        log(f"❌ powerpagesites に '{SITE_NAME}' が見つかりません")
        sys.exit(1)
    site_id = sites[0]["powerpagesiteid"]
    log(f"  Site: {sites[0]['name']} ({site_id})")

    # site language
    r = requests.get(
        api(f"powerpagesitelanguages?$filter=_powerpagesiteid_value eq {site_id}"),
        headers=h(),
    )
    langs = r.json().get("value", [])
    lang_id = langs[0]["powerpagesitelanguageid"] if langs else ""
    log(f"  Language: {lang_id or '(none)'}")

    # --- 2. 認証 Site Settings ---
    log("\n[2/3] 認証 Site Settings 更新")

    # Provider identifier: login.windows.net (NOT login.microsoftonline.com)
    # Ref: microsoft/power-platform-skills setup-auth resolveProviderIdentifier()
    provider_id = f"https://login.windows.net/{TENANT_ID}/"

    settings = {
        "Authentication/Registration/AzureADLoginEnabled": "true",
        "Authentication/Registration/LocalLoginEnabled": "false",
        "Authentication/Registration/ExternalLoginEnabled": "true",
        "Authentication/Registration/OpenRegistrationEnabled": "true",
        "Authentication/Registration/ProfileRedirectEnabled": "false",
        "Authentication/Registration/LoginButtonAuthenticationType": provider_id,
    }
    for name, value in settings.items():
        upsert_edm_site_setting(site_id, lang_id, name, value)

    # --- 3. サイト再起動 ---
    log("\n[3/3] サイト再起動")
    pp_token = auth_helper.get_token(scope="https://api.powerplatform.com/.default")
    pp_h = {"Authorization": f"Bearer {pp_token}"}
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    lr = requests.get(f"{base}?api-version=2022-03-01-preview", headers=pp_h)
    api_sid = None
    if lr.status_code == 200:
        for s in lr.json().get("value", []):
            name_match = SITE_NAME.lower() in s.get("name", "").lower()
            sub_match = SUBDOMAIN and s.get("subdomain", "").lower() == SUBDOMAIN.lower()
            if name_match or sub_match:
                api_sid = s.get("id")
                break
    if api_sid:
        rr = requests.post(
            f"{base}/{api_sid}/restart?api-version=2022-03-01-preview",
            headers=pp_h,
        )
        log(f"  Restart: {rr.status_code}")
    else:
        log("  ⚠️ restart スキップ — PP API にサイトが見つかりません")

    site_url = f"https://{SUBDOMAIN}.powerappsportals.com" if SUBDOMAIN else "(unknown)"
    log("\n" + "=" * 60)
    log("✅ Entra ID SSO 認証設定完了")
    log(f"  サイト URL: {site_url}")
    log(f"  Provider: {provider_id}")
    log(f"  LocalLogin: false, ProfileRedirect: false")
    log("  ※ 60-90秒後に InPrivate ブラウザで SSO をテストしてください")
    log("=" * 60)


if __name__ == "__main__":
    main()
