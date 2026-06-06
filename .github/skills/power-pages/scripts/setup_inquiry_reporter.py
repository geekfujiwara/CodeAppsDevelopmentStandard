"""
Power Pages 問い合わせ報告者 Contact Lookup セットアップ

Power Pages では createdby がアプリケーションユーザー（サービスアカウント）になるため、
ログインユーザー（報告者）を追跡するには Contact テーブルへの Lookup 列が必要。
このスクリプトは以下を冪等に実行する:

1. カスタムテーブルに Contact への Lookup 列を作成（Dataverse メタデータ API）
2. Contact テーブル権限に appendto=true を付与（Lookup バインドに必須）
3. カスタムテーブルの Web API 有効化を確認

前提:
  - .env に DATAVERSE_URL, ENV_ID, SOLUTION_NAME, PUBLISHER_PREFIX
  - .env に PORTAL_TABLE_LOGICAL（対象テーブルの論理名）
  - Contact Self 権限は setup_contact_self.py で作成済み

設計原則（教訓 19）:
  - Power Pages では createdby ≠ ログインユーザー → Contact Lookup で追跡
  - フォームでは checkAuth() で Contact 情報を自動取得し入力不要にする
  - Code Apps では createdby = 操作ユーザーなのでこのスクリプトは不要

Usage:
  python .github/skills/power-pages/scripts/setup_inquiry_reporter.py
"""
import os
import sys
import json
import time
import requests
from pathlib import Path

# auth_helper を読み込む（スキルルート → skills/standard/scripts）
SKILL_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(SKILL_ROOT))
from auth_helper import get_token, retry_metadata

# === 環境変数 ===
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
ENV_ID = os.environ.get("ENV_ID", "")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "")
SUBDOMAIN = os.environ.get("PP_SUBDOMAIN", "")

# 対象テーブル（レコードを作成するテーブル。報告者 Lookup を追加する先）
TABLE_LOGICAL = os.environ.get("PORTAL_TABLE_LOGICAL", "")
# Lookup 列名（デフォルト: {prefix}_inquirerid）
LOOKUP_ATTR = os.environ.get("REPORTER_LOOKUP_ATTR", f"{PREFIX}_inquirerid")
# リレーション スキーマ名
RELATIONSHIP_SCHEMA = os.environ.get(
    "REPORTER_RELATIONSHIP_SCHEMA", f"{PREFIX}_{TABLE_LOGICAL.replace(PREFIX + '_', '')}_contact"
)

API = f"{DATAVERSE_URL}/api/data/v9.2"


def get_headers(scope: str = None) -> dict:
    token = get_token(scope=scope) if scope else get_token()
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def check_env():
    """必須環境変数の確認"""
    missing = []
    if not DATAVERSE_URL:
        missing.append("DATAVERSE_URL")
    if not SOLUTION_NAME:
        missing.append("SOLUTION_NAME")
    if not PREFIX:
        missing.append("PUBLISHER_PREFIX")
    if not TABLE_LOGICAL:
        missing.append("PORTAL_TABLE_LOGICAL")
    if missing:
        print(f"ERROR: 必須環境変数が未設定: {', '.join(missing)}")
        print("  .env.example を参照して設定してください")
        sys.exit(1)


def check_table_exists(headers: dict) -> bool:
    """対象テーブルの存在確認"""
    r = requests.get(
        f"{API}/EntityDefinitions(LogicalName='{TABLE_LOGICAL}')?$select=LogicalName",
        headers=headers,
    )
    return r.status_code == 200


def check_lookup_exists(headers: dict) -> bool:
    """Lookup 列が既に存在するか確認"""
    r = requests.get(
        f"{API}/EntityDefinitions(LogicalName='{TABLE_LOGICAL}')"
        f"/Attributes(LogicalName='{LOOKUP_ATTR}')?$select=LogicalName",
        headers=headers,
    )
    return r.status_code == 200


def create_contact_lookup(headers: dict):
    """Contact テーブルへの Lookup 列 (ManyToOne) を作成"""

    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": RELATIONSHIP_SCHEMA,
        "ReferencedEntity": "contact",
        "ReferencingEntity": TABLE_LOGICAL,
        "Lookup": {
            "SchemaName": LOOKUP_ATTR,
            "DisplayName": {
                "@odata.type": "#Microsoft.Dynamics.CRM.Label",
                "LocalizedLabels": [
                    {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel",
                     "Label": "Inquirer", "LanguageCode": 1033},
                    {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel",
                     "Label": "報告者", "LanguageCode": 1041},
                ],
            },
            "RequiredLevel": {"Value": "None"},
        },
    }

    sol_header = {"MSCRM.SolutionName": SOLUTION_NAME} if SOLUTION_NAME else {}
    h = {**headers, **sol_header}

    r = requests.post(f"{API}/RelationshipDefinitions", headers=h, json=body)
    if r.status_code in (200, 201, 204):
        print(f"  CREATED: Lookup '{LOOKUP_ATTR}' (→ contact)")
        return True
    elif "already exists" in r.text.lower() or r.status_code == 409:
        print(f"  SKIP: リレーション '{RELATIONSHIP_SCHEMA}' は既に存在")
        return True
    else:
        print(f"  ERROR: {r.status_code} — {r.text[:500]}")
        return False


def localize_lookup(headers: dict):
    """Lookup 列の日本語ラベルを設定"""
    r = requests.get(
        f"{API}/EntityDefinitions(LogicalName='{TABLE_LOGICAL}')"
        f"/Attributes(LogicalName='{LOOKUP_ATTR}')?$select=MetadataId",
        headers=headers,
    )
    if r.status_code != 200:
        print("  SKIP ローカライズ: 列が見つかりません")
        return
    mid = r.json()["MetadataId"]
    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        "MetadataId": mid,
        "DisplayName": {
            "@odata.type": "#Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [
                {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel",
                 "Label": "報告者", "LanguageCode": 1041},
                {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel",
                 "Label": "Inquirer", "LanguageCode": 1033},
            ],
        },
    }
    h = {**headers, "MSCRM.MergeLabels": "true"}
    r = requests.put(
        f"{API}/EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes({mid})",
        headers=h, json=body,
    )
    if r.status_code in (200, 204):
        print("  LOCALIZED: 報告者 / Inquirer")
    else:
        print(f"  WARN: ローカライズ失敗 {r.status_code}")


def publish_all(headers: dict):
    """カスタマイズ公開"""
    r = requests.post(f"{API}/PublishAllXml", headers=headers, json={})
    if r.status_code in (200, 204):
        print("  PublishAllXml: OK")
    else:
        print(f"  PublishAllXml: {r.status_code} (再実行してください)")


def ensure_contact_appendto(headers: dict):
    """Contact Self テーブル権限に appendto=true を付与。
    Lookup バインド時に Contact 側に AppendTo 権限がないと 403 になる。"""
    # サイト ID を取得
    r = requests.get(
        f"{API}/powerpagesites?$top=1&$orderby=createdon desc&$select=powerpagesiteid",
        headers=headers,
    )
    r.raise_for_status()
    sites = r.json()["value"]
    if not sites:
        print("  SKIP: powerpagesites が見つかりません")
        return
    site_id = sites[0]["powerpagesiteid"]

    # Contact - Self 権限を検索
    r = requests.get(
        f"{API}/powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq 18&$select=powerpagecomponentid,name,content&$top=500",
        headers=headers,
    )
    r.raise_for_status()
    contact_perm = None
    for c in r.json().get("value", []):
        content = json.loads(c.get("content") or "{}")
        if content.get("entitylogicalname") == "contact" and content.get("scope") == 756150004:
            contact_perm = c
            break

    if not contact_perm:
        print("  SKIP: Contact Self 権限が見つかりません（先に setup_contact_self.py を実行してください）")
        return

    content = json.loads(contact_perm.get("content") or "{}")
    if content.get("appendto"):
        print("  OK: Contact Self 権限の appendto は既に true")
        return

    # appendto を有効化
    content["appendto"] = True
    r = requests.patch(
        f"{API}/powerpagecomponents({contact_perm['powerpagecomponentid']})",
        headers=headers,
        json={"content": json.dumps(content)},
    )
    r.raise_for_status()
    print("  UPDATED: Contact Self 権限に appendto=true を設定")


def verify_webapi_settings(headers: dict):
    """Webapi/{table}/enabled と fields の存在を確認（警告のみ）"""
    # adx_websites からサイトを取得
    r = requests.get(
        f"{API}/adx_websites?$top=1&$orderby=createdon desc&$select=adx_websiteid",
        headers=headers,
    )
    if r.status_code != 200 or not r.json().get("value"):
        print("  SKIP: adx_websites が見つかりません")
        return
    website_id = r.json()["value"][0]["adx_websiteid"]

    # EntitySetName を取得
    r = requests.get(
        f"{API}/EntityDefinitions(LogicalName='{TABLE_LOGICAL}')?$select=EntitySetName",
        headers=headers,
    )
    if r.status_code != 200:
        print("  SKIP: EntitySetName 取得失敗")
        return
    entity_set = r.json()["EntitySetName"]

    # サイト設定確認
    enabled_name = f"Webapi/{entity_set}/enabled"
    r = requests.get(
        f"{API}/adx_sitesettings?$filter=adx_name eq '{enabled_name}' "
        f"and _adx_websiteid_value eq '{website_id}'&$select=adx_sitesettingid",
        headers=headers,
    )
    if r.status_code == 200 and r.json().get("value"):
        print(f"  OK: {enabled_name} = true")
    else:
        print(f"  WARN: {enabled_name} が見つかりません。setup_permissions.py で作成してください")


def restart_site(headers: dict):
    """PP API でサイトを再起動"""
    if not SUBDOMAIN or not ENV_ID:
        print("  SKIP: PP_SUBDOMAIN / ENV_ID 未設定")
        return
    pp_headers = get_headers(scope="https://api.powerplatform.com/.default")
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2024-10-01", headers=pp_headers)
    if r.status_code != 200:
        print(f"  WARN: PP API リスト取得失敗 ({r.status_code})")
        return
    for site in r.json().get("value", []):
        if site.get("subdomain", "") == SUBDOMAIN:
            requests.post(
                f"{base}/{site['id']}/restart?api-version=2024-10-01", headers=pp_headers
            ).raise_for_status()
            print(f"  RESTARTED: {SUBDOMAIN}")
            return
    print(f"  WARN: subdomain '{SUBDOMAIN}' が見つかりません")


def main():
    print("=" * 60)
    print("  Power Pages 報告者 Contact Lookup セットアップ（教訓 19）")
    print("=" * 60)
    print(f"  環境:       {DATAVERSE_URL}")
    print(f"  対象テーブル: {TABLE_LOGICAL}")
    print(f"  Lookup 列:  {LOOKUP_ATTR}")
    print(f"  リレーション: {RELATIONSHIP_SCHEMA}")
    print()

    check_env()
    headers = get_headers()

    # --- Step 1: テーブル存在確認 ---
    print("[1/6] テーブル存在確認...")
    if not check_table_exists(headers):
        print(f"  ERROR: テーブル '{TABLE_LOGICAL}' が存在しません")
        print("  先に setup_dataverse.py でテーブルを作成してください")
        sys.exit(1)
    print(f"  OK: {TABLE_LOGICAL}")
    print()

    # --- Step 2: Lookup 列作成 ---
    print("[2/6] Contact Lookup 列を作成...")
    if check_lookup_exists(headers):
        print(f"  SKIP: Lookup '{LOOKUP_ATTR}' は既に存在")
    else:
        def _create():
            create_contact_lookup(headers)
        retry_metadata(_create, f"Lookup {RELATIONSHIP_SCHEMA}")
        time.sleep(5)
    print()

    # --- Step 3: ローカライズ ---
    print("[3/6] 日本語ローカライズ...")
    localize_lookup(headers)
    print()

    # --- Step 4: カスタマイズ公開 ---
    print("[4/6] カスタマイズ公開...")
    publish_all(headers)
    print()

    # --- Step 5: Contact Self 権限に AppendTo 付与 ---
    print("[5/6] Contact Self 権限に AppendTo を付与...")
    ensure_contact_appendto(headers)
    print()

    # --- Step 6: Web API 設定確認 + 再起動 ---
    print("[6/6] Web API 設定確認 + サイト再起動...")
    verify_webapi_settings(headers)
    restart_site(headers)

    print()
    print("=" * 60)
    print("  完了!")
    print()
    print("  次のステップ:")
    print("  1. フロントエンドで checkAuth() → user.contactId を取得")
    print(f"  2. POST 時に bindLookup(body, \"{LOOKUP_ATTR}\", \"contacts\", contactId)")
    print("  3. フォームでは報告者情報を読み取り専用で表示（入力不要）")
    print("=" * 60)


if __name__ == "__main__":
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    main()
