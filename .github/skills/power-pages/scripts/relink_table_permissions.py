"""
Power Pages テーブル権限 Web ロール再付与スクリプト（デプロイ後の修復）

`pac pages upload-code-site` は `.powerpages-site/table-permissions/*.yml` で
既存のテーブル権限を上書きし、content JSON の `adx_entitypermission_webrole`
（＝ランタイム正本の Web ロール紐付け）を **消去する**ことがある。
その結果、Design Studio の「ロール」列が空になり、認証済みユーザーでも 403 になる。

このスクリプトは「サイト上の全 type=18 テーブル権限」の content JSON に対し、
指定 Web ロール（既定: Authenticated Users）を冪等に再付与する。
**デプロイ（upload-code-site）のたびに実行すること。**

前提: .env に DATAVERSE_URL, ENV_ID。再起動には PP_SUBDOMAIN。

検証済みの教訓:
- N:N `powerpagecomponent_powerpagecomponent` への $ref POST は 204 を返すが
  ポータルは認識しない（幽霊リンク）。content JSON が唯一の正本。
- Web ロール名の既定一致は "Authenticated"（部分一致）。
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

# 再付与する Web ロール名（部分一致）。複数付与したい場合はカンマ区切りで。
WEBROLE_NAMES = os.environ.get("RELINK_WEBROLE_NAMES", "Authenticated")

API = f"{DATAVERSE_URL}/api/data/v9.2"


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


def get_webrole_ids(site_id: str, headers: dict) -> list:
    """指定名（部分一致, カンマ区切り）に該当する Web ロール (type=11) の ID 一覧"""
    names = [n.strip().lower() for n in WEBROLE_NAMES.split(",") if n.strip()]
    r = requests.get(
        f"{API}/powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq 11&$select=powerpagecomponentid,name&$top=200",
        headers=headers,
    )
    r.raise_for_status()
    ids = []
    for c in r.json().get("value", []):
        cname = (c.get("name") or "").lower()
        if any(n in cname for n in names):
            ids.append(c["powerpagecomponentid"])
            print(f"  webrole: {c.get('name')} ({c['powerpagecomponentid']})")
    if not ids:
        print(f"ERROR: Web ロール '{WEBROLE_NAMES}' が見つかりません")
        sys.exit(1)
    return ids


def relink_all(site_id: str, role_ids: list, headers: dict) -> int:
    """全 type=18 テーブル権限の content.adx_entitypermission_webrole に role を冪等付与"""
    r = requests.get(
        f"{API}/powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq 18&$select=powerpagecomponentid,name,content&$top=500",
        headers=headers,
    )
    r.raise_for_status()
    fixed = 0
    for c in r.json().get("value", []):
        cid = c["powerpagecomponentid"]
        name = c.get("name")
        try:
            content = json.loads(c.get("content") or "{}")
        except json.JSONDecodeError:
            content = {}
        roles = content.get("adx_entitypermission_webrole") or []
        missing = [rid for rid in role_ids if rid not in roles]
        if not missing:
            print(f"  OK   : {name}")
            continue
        roles.extend(missing)
        content["adx_entitypermission_webrole"] = roles
        if not content.get("websiteid"):
            content["websiteid"] = site_id
        requests.patch(
            f"{API}/powerpagecomponents({cid})",
            headers=headers, json={"content": json.dumps(content)},
        ).raise_for_status()
        print(f"  FIXED: {name} → Web ロールを再付与")
        fixed += 1
    return fixed


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
    print("=== テーブル権限 Web ロール再付与（デプロイ後の修復） ===\n")
    headers = get_headers()

    print("[1/4] サイト ID を取得...")
    site_id = get_site_id(headers)
    print()

    print(f"[2/4] Web ロール '{WEBROLE_NAMES}' を取得...")
    role_ids = get_webrole_ids(site_id, headers)
    print()

    print("[3/4] 全テーブル権限 content の Web ロールを再付与...")
    fixed = relink_all(site_id, role_ids, headers)
    print(f"  → {fixed} 件を修復\n")

    print("[4/4] ポータルを再起動...")
    restart_site()
    print("\n完了! 再起動後 60-90秒でアクセス可能。")


if __name__ == "__main__":
    main()
