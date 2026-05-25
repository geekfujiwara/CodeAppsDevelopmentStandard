"""
Power Pages ポータル管理スクリプト
- ポータル一覧表示
- プロビジョニング状態確認
- 新規サイト作成 (Power Platform API)
- 再起動

Usage:
    python manage_portal.py                       # 一覧 + 状態表示
    python manage_portal.py --action list         # サイト一覧
    python manage_portal.py --action create --name "MySite" --subdomain "mysite"
    python manage_portal.py --action restart --site-id {id}
    python manage_portal.py --action admin-url    # 管理画面 URL を表示
"""
import argparse
import json
import os
import sys
import webbrowser

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))

PP_API_BASE = "https://api.powerplatform.com/powerpages/environments"
API_VERSION = "2024-10-01"
SCOPE = "https://api.powerplatform.com/.default"


def get_env_id() -> str:
    env_id = os.environ.get("ENV_ID")
    if not env_id:
        print("❌ .env に ENV_ID が設定されていません。")
        sys.exit(1)
    return env_id


def get_headers() -> dict:
    from auth_helper import get_token
    token = get_token(scope=SCOPE)
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def list_websites(env_id: str) -> list:
    import requests
    url = f"{PP_API_BASE}/{env_id}/websites?api-version={API_VERSION}"
    r = requests.get(url, headers=get_headers())
    r.raise_for_status()
    return r.json().get("value", [])


def create_website(env_id: str, name: str, subdomain: str) -> dict:
    import requests
    from auth_helper import get_token

    # Organization ID を取得
    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    token_dv = get_token()
    headers_dv = {"Authorization": f"Bearer {token_dv}", "Accept": "application/json"}
    org_r = requests.get(f"{dv_url}/api/data/v9.2/organizations?$select=organizationid", headers=headers_dv)
    org_r.raise_for_status()
    org_id = org_r.json()["value"][0]["organizationid"]

    url = f"{PP_API_BASE}/{env_id}/websites?api-version={API_VERSION}"
    body = {
        "dataverseOrganizationId": org_id,
        "name": name,
        "selectedBaseLanguage": 1041,
        "subdomain": subdomain,
        "templateName": "DefaultPortalTemplate",
    }
    print(f"📦 Creating website: {name} ({subdomain}.powerappsportals.com)")
    r = requests.post(url, headers=get_headers(), json=body)
    if r.status_code == 202:
        print("✅ 作成リクエスト受理 (202 Accepted)")
        print("   プロビジョニングに 10〜20 分かかります。")
        print(f"   状態確認: python {os.path.basename(__file__)} --action list")
        data = r.json() if r.text else {}
        if "id" in data:
            print(f"   Website ID: {data['id']}")
        return data
    else:
        print(f"❌ 作成失敗: {r.status_code}")
        print(r.text)
        sys.exit(1)


def restart_website(env_id: str, site_id: str):
    import requests
    url = f"{PP_API_BASE}/{env_id}/websites/{site_id}/restart?api-version={API_VERSION}"
    r = requests.post(url, headers=get_headers())
    if r.status_code in (200, 202):
        print(f"✅ Restart 成功: {site_id}")
    else:
        print(f"❌ Restart 失敗: {r.status_code} {r.text}")


def show_admin_url(env_id: str, open_browser: bool = False):
    url = f"https://make.powerpages.microsoft.com/environments/{env_id}/portals/home"
    print(f"🌐 Power Pages 管理画面:")
    print(f"   {url}")
    if open_browser:
        webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser(description="Power Pages ポータル管理")
    parser.add_argument("--action", choices=["list", "create", "restart", "admin-url"], default="list")
    parser.add_argument("--name", help="サイト名 (create 時)")
    parser.add_argument("--subdomain", help="サブドメイン (create 時)")
    parser.add_argument("--site-id", help="Website ID (restart 時)")
    parser.add_argument("--open", action="store_true", help="管理画面をブラウザで開く")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv()

    env_id = get_env_id()

    if args.action == "admin-url":
        show_admin_url(env_id, open_browser=args.open)
        return

    if args.action == "list":
        sites = list_websites(env_id)
        if not sites:
            print("⚠️  この環境にはポータルが登録されていません。")
            print("   レガシーポータルは Power Platform API に登録されないため、")
            print("   管理画面で確認してください。")
            show_admin_url(env_id)
        else:
            print(f"📋 ポータル一覧 ({len(sites)} 件):")
            for s in sites:
                state = s.get("state", "不明")
                status = s.get("status", "不明")
                url = s.get("siteUrl", s.get("websiteUrl", "N/A"))
                print(f"   • {s.get('name', '?')} [{state}/{status}]")
                print(f"     URL: {url}")
                print(f"     ID: {s.get('id', '?')}")

    elif args.action == "create":
        if not args.name or not args.subdomain:
            print("❌ --name と --subdomain は必須です。")
            sys.exit(1)
        create_website(env_id, args.name, args.subdomain)

    elif args.action == "restart":
        if not args.site_id:
            sites = list_websites(env_id)
            if not sites:
                print("❌ サイトが見つかりません。")
                sys.exit(1)
            args.site_id = sites[0]["id"]
            print(f"   自動選択: {sites[0].get('name')} ({args.site_id})")
        restart_website(env_id, args.site_id)


if __name__ == "__main__":
    main()
