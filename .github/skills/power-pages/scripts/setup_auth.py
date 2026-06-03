"""
Power Pages SSO 自動リダイレクト設定スクリプト

初回デプロイ後に実行し、/SignIn で Entra ID に直接リダイレクトされるようにする。
Site Settings (adx_sitesettings) を作成し、ポータルを再起動する。

前提: .env に DATAVERSE_URL, ENV_ID, TENANT_ID が設定済み。
"""
import os
import sys
import json
import requests
from pathlib import Path

# auth_helper.py を読み込み
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from auth_helper import get_token

# === 環境変数 ===
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
ENV_ID = os.environ["ENV_ID"]
TENANT_ID = os.environ["TENANT_ID"]
SUBDOMAIN = os.environ.get("PP_SUBDOMAIN", "")  # ポータルのサブドメイン

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}/"

# === SSO Site Settings ===
SSO_SETTINGS = {
    "Authentication/Registration/LoginButtonAuthenticationType": AUTHORITY,
    "Authentication/Registration/LocalLoginEnabled": "false",
    "Authentication/Registration/ExternalLoginEnabled": "true",
    "Authentication/Registration/AzureADLoginEnabled": "false",
    "Authentication/Registration/ProfileRedirectEnabled": "false",
    "Authentication/Registration/OpenRegistrationEnabled": "false",
    "Authentication/Registration/InvitationEnabled": "false",
}


def get_headers(scope: str = None):
    token = get_token(scope=scope) if scope else get_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_adx_website_id() -> str:
    """adx_websites テーブルから最新のサイト ID を取得"""
    headers = get_headers()
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/adx_websites?$top=1&$orderby=createdon desc&$select=adx_websiteid,adx_name",
        headers=headers,
    )
    r.raise_for_status()
    sites = r.json()["value"]
    if not sites:
        print("ERROR: adx_websites にレコードが見つかりません。upload-code-site を先に実行してください。")
        sys.exit(1)
    print(f"  adx_website: {sites[0]['adx_name']} ({sites[0]['adx_websiteid']})")
    return sites[0]["adx_websiteid"]


def upsert_site_setting(name: str, value: str, adx_website_id: str, headers: dict):
    """adx_sitesettings に設定を upsert"""
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
        setting_id = existing[0]["adx_sitesettingid"]
        r = requests.patch(
            f"{DATAVERSE_URL}/api/data/v9.2/adx_sitesettings({setting_id})",
            headers=headers,
            json=body,
        )
        r.raise_for_status()
        print(f"  UPDATED: {name} = {value}")
    else:
        r = requests.post(
            f"{DATAVERSE_URL}/api/data/v9.2/adx_sitesettings",
            headers=headers,
            json=body,
        )
        r.raise_for_status()
        print(f"  CREATED: {name} = {value}")


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
            r = requests.post(
                f"{base}/{site['id']}/restart?api-version=2024-10-01",
                headers=headers,
            )
            r.raise_for_status()
            print(f"  RESTARTED: {SUBDOMAIN}.powerappsportals.com")
            return

    print(f"  WARNING: subdomain '{SUBDOMAIN}' が見つかりません")


def main():
    print("=== Power Pages SSO 自動リダイレクト設定 ===")
    print()

    # 1. adx_website ID を取得
    print("[1/3] adx_website ID を取得...")
    adx_website_id = get_adx_website_id()
    print()

    # 2. Site Settings を upsert
    print("[2/3] Site Settings を設定...")
    headers = get_headers()
    for name, value in SSO_SETTINGS.items():
        upsert_site_setting(name, value, adx_website_id, headers)
    print()

    # 3. ポータル再起動
    print("[3/3] ポータルを再起動...")
    restart_site()
    print()

    print("=== 完了 ===")
    print("ブラウザで /SignIn にアクセスし、自動的に Entra ID にリダイレクトされることを確認してください。")
    print("(再起動後 60-90秒でアクセス可能)")


if __name__ == "__main__":
    main()
