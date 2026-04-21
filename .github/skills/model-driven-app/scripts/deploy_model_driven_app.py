"""
モデル駆動型アプリ デプロイスクリプト

Dataverse Web API を使用してモデル駆動型アプリ（AppModule）を作成・構成・公開する。
setup_dataverse.py で作成済みの Dataverse テーブルをすべてアプリに含め、
SiteMap を自動生成してナビゲーションを構築する。

手順:
  1. .env で APP_DISPLAY_NAME, APP_UNIQUE_NAME を設定（オプション。未設定時は SOLUTION_NAME から自動生成）
  2. python .github/skills/model-driven-app/scripts/deploy_model_driven_app.py

依存:
  - .github/skills/power-platform-standard/scripts/auth_helper.py（共通認証）
  - .env（DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX）

API リファレンス:
  https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/create-manage-model-driven-apps-using-code
"""

import json
import os
import re
import sys
import time
import uuid

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "power-platform-standard", "scripts"))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "")
APP_DISPLAY_NAME = os.environ.get("APP_DISPLAY_NAME", "")
APP_UNIQUE_NAME = os.environ.get("APP_UNIQUE_NAME", "")
APP_DESCRIPTION = os.environ.get("APP_DESCRIPTION", "")

# デフォルト WebResource ID（システム標準アイコン）
DEFAULT_WEBRESOURCE_ID = "953b9fac-1e5e-e611-80d6-00155ded156f"

API = f"{DATAVERSE_URL}/api/data/v9.2"

# ── 認証 ──────────────────────────────────────────────────

def get_headers(include_solution=True):
    token = _get_token()
    h = {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }
    if include_solution and SOLUTION_NAME:
        h["MSCRM.SolutionName"] = SOLUTION_NAME
    return h


# ── API ヘルパー ─────────────────────────────────────────

def api_get(path, params=None):
    r = requests.get(f"{API}/{path}", headers=get_headers(False), params=params)
    r.raise_for_status()
    return r.json()


def api_post(path, body, include_solution=True):
    r = requests.post(f"{API}/{path}", headers=get_headers(include_solution), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r


def api_patch(path, body, include_solution=False):
    r = requests.patch(f"{API}/{path}", headers=get_headers(include_solution), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r


def api_post_json(path, body, include_solution=True):
    """POST して JSON レスポンスを返す"""
    r = requests.post(f"{API}/{path}", headers=get_headers(include_solution), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    if r.content:
        return r.json()
    return None


# ── Step 1: ソリューション内テーブル一覧を取得 ─────────

def get_solution_tables():
    """ソリューション内のカスタムテーブル（EntityMetadata）を取得する"""
    print("\n=== Step 1: ソリューション内テーブル一覧の取得 ===")

    # ソリューション ID を取得
    sols = api_get("solutions", {
        "$filter": f"uniquename eq '{SOLUTION_NAME}'",
        "$select": "solutionid"
    })
    if not sols.get("value"):
        raise RuntimeError(f"ソリューション '{SOLUTION_NAME}' が見つかりません")
    sol_id = sols["value"][0]["solutionid"]
    print(f"  ソリューション ID: {sol_id}")

    # ソリューション内のエンティティ コンポーネント（componenttype=1）を取得
    comps = api_get("solutioncomponents", {
        "$filter": f"_solutionid_value eq {sol_id} and componenttype eq 1",
        "$select": "objectid"
    })
    entity_ids = [c["objectid"] for c in comps.get("value", [])]
    print(f"  エンティティ コンポーネント数: {len(entity_ids)}")

    # 各エンティティの詳細を取得
    tables = []
    for eid in entity_ids:
        try:
            meta = api_get(f"EntityDefinitions({eid})", {
                "$select": "LogicalName,DisplayName,EntitySetName,MetadataId,IsCustomEntity"
            })
            display = ""
            dn = meta.get("DisplayName", {})
            if dn and dn.get("LocalizedLabels"):
                for lbl in dn["LocalizedLabels"]:
                    if lbl.get("LanguageCode") == 1041:
                        display = lbl["Label"]
                        break
                if not display:
                    display = dn["LocalizedLabels"][0].get("Label", "")
            if not display:
                display = meta["LogicalName"]
            tables.append({
                "logical_name": meta["LogicalName"],
                "display_name": display,
                "entity_set_name": meta.get("EntitySetName", ""),
                "metadata_id": meta["MetadataId"],
                "is_custom": meta.get("IsCustomEntity", False),
            })
            print(f"  テーブル: {meta['LogicalName']} ({display})")
        except requests.HTTPError as e:
            print(f"  ⚠️ エンティティ {eid} の取得失敗: {e}")

    return tables, sol_id


# ── Step 2: SiteMap XML 構築 ──────────────────────────────

def _detect_theme(name_no_prefix, all_logical_names):
    """テーブル名からテーマキーを検出する。

    例: "incident" → "incident", "incidentcomment" → "incident",
        "market_insight" → "market_insight"

    他のテーブル名のプレフィックスに一致する場合はそのテーマにまとめる。
    """
    # 他テーブルの名前（プレフィックス除去後）を収集
    all_names = []
    for ln in all_logical_names:
        parts = ln.split("_", 1)
        if len(parts) > 1:
            all_names.append(parts[1])

    # 自分の名前が他テーブル名で始まるか（例: incidentcomment → incident）
    for other in sorted(all_names, key=len):
        if other != name_no_prefix and name_no_prefix.startswith(other):
            return other

    return name_no_prefix


def _theme_display_name(theme_key, theme_tables):
    """テーマキーからグループ表示名を生成する。

    メインテーブル（テーマキーと同名）の display_name を使用。
    見つからない場合はテーマキーをタイトルケースに。
    """
    for t in theme_tables:
        name_no_prefix = t["logical_name"].split("_", 1)[1] if "_" in t["logical_name"] else t["logical_name"]
        if name_no_prefix == theme_key:
            return t["display_name"]
    # フォールバック: 最初のテーブルの表示名
    if theme_tables:
        return theme_tables[0]["display_name"]
    return theme_key.replace("_", " ").title()


def build_sitemap_xml(tables, app_display_name):
    """テーブル一覧から SiteMap XML を動的に構築する。

    テーブルを以下のルールでグループ化:
      1. マスタ系: テーブル名に category, priority, asset, master, type, status が含まれる
      2. 別テーマ: インシデント系でも マスタ系でもないテーブル（market_insight 等）
      3. トランザクション系: 上記以外（メインの業務データ）
    """
    print("\n=== Step 2: SiteMap XML 構築 ===")

    MASTER_KEYWORDS = ("category", "priority", "asset", "master", "type", "status", "location", "department")

    # テーブル分類
    # まず PREFIX を取得（全テーブル共通のプレフィックスを推定）
    prefixes = set()
    for t in tables:
        parts = t["logical_name"].split("_", 1)
        if len(parts) > 1:
            prefixes.add(parts[0])

    # メインテーマのテーブル群を特定（最も多いテーブルを含むテーマ）
    # incident を含むテーブルを「インシデント管理」グループにまとめる
    theme_groups = {}  # theme_key -> list of tables
    master_tables = []

    for t in tables:
        name = t["logical_name"]
        # プレフィックスを除去した名前で判定
        name_no_prefix = name.split("_", 1)[1] if "_" in name else name

        # マスタ判定
        is_master = any(kw in name_no_prefix.lower() for kw in MASTER_KEYWORDS)
        if is_master:
            master_tables.append(t)
            continue

        # テーマ判定: テーブル名の主キーワードでグループ化
        # 例: geek_incident → "incident", geek_incidentcomment → "incident"
        #     geek_market_insight → "market_insight"
        theme_key = _detect_theme(name_no_prefix, [tt["logical_name"] for tt in tables])
        if theme_key not in theme_groups:
            theme_groups[theme_key] = []
        theme_groups[theme_key].append(t)

    # グループごとに SubArea を構築
    # ★ SiteMap XML は PVA 正式フォーマットを使用:
    #   - IntroducedVersion="7.0.0.0" を SiteMap / Area / Group に付与
    #   - ShowGroups="true" を Area に付与（グループヘッダー表示に必須）
    #   - Title 属性ではなく <Titles><Title LCID="1041" ... /></Titles> 要素を使用
    #   - AvailableOffline="true" を SubArea に付与
    #   - IsProfile="false" を Group に付与
    groups_xml_parts = []

    # テーマごとのトランザクショングループ（テーブル数が多い順）
    sorted_themes = sorted(theme_groups.items(), key=lambda x: len(x[1]), reverse=True)
    for theme_key, theme_tables in sorted_themes:
        group_title = _theme_display_name(theme_key, theme_tables)
        subareas = "".join(
            f'<SubArea Id="sub_{t["logical_name"]}" Entity="{t["logical_name"]}" AvailableOffline="true" />'
            for t in theme_tables
        )
        groups_xml_parts.append(
            f'<Group Id="grp_{theme_key}" IntroducedVersion="7.0.0.0" IsProfile="false">'
            f'<Titles><Title LCID="1041" Title="{group_title}" /></Titles>'
            f'{subareas}</Group>'
        )
        print(f"  グループ [{group_title}]: {', '.join(t['display_name'] for t in theme_tables)}")

    # マスタグループ
    if master_tables:
        subareas = "".join(
            f'<SubArea Id="sub_{t["logical_name"]}" Entity="{t["logical_name"]}" AvailableOffline="true" />'
            for t in master_tables
        )
        groups_xml_parts.append(
            f'<Group Id="grp_master" IntroducedVersion="7.0.0.0" IsProfile="false">'
            f'<Titles><Title LCID="1041" Title="マスタデータ" /></Titles>'
            f'{subareas}</Group>'
        )
        print(f"  グループ [マスタデータ]: {', '.join(t['display_name'] for t in master_tables)}")

    all_groups = "".join(groups_xml_parts)

    # ShowGroups="true" がないとグループヘッダーが表示されず最初のグループしか見えない
    sitemap_xml = (
        f'<SiteMap IntroducedVersion="7.0.0.0">'
        f'<Area Id="MainArea" ShowGroups="true" IntroducedVersion="7.0.0.0">'
        f'<Titles><Title LCID="1041" Title="{app_display_name}" /></Titles>'
        f'{all_groups}'
        f'</Area></SiteMap>'
    )

    total = sum(len(v) for v in theme_groups.values()) + len(master_tables)
    print(f"  SubArea 合計: {total}")
    print(f"  SiteMap XML:\n{sitemap_xml[:800]}")
    return sitemap_xml


# ── Step 3: SiteMap レコード作成 ──────────────────────────

def ensure_sitemap(sitemap_xml, app_unique_name):
    """SiteMap レコードをべき等に作成/更新する"""
    print("\n=== Step 3: SiteMap レコード作成 ===")

    sitemap_name = f"{app_unique_name}_SiteMap"

    # 既存検索
    existing = api_get("sitemaps", {
        "$filter": f"sitemapnameunique eq '{sitemap_name}'",
        "$select": "sitemapid,sitemapnameunique"
    })

    body = {
        "sitemapname": sitemap_name,
        "sitemapnameunique": sitemap_name,
        "sitemapxml": sitemap_xml,
        "isappaware": True,
    }

    if existing.get("value"):
        sm_id = existing["value"][0]["sitemapid"]
        print(f"  既存 SiteMap を更新: {sm_id}")
        api_patch(f"sitemaps({sm_id})", body, include_solution=True)
    else:
        print(f"  SiteMap '{sitemap_name}' を新規作成")
        resp = api_post("sitemaps", body, include_solution=True)
        # OData-EntityId ヘッダーから ID を取得
        entity_id_header = resp.headers.get("OData-EntityId", "")
        match = re.search(r"\(([0-9a-fA-F\-]+)\)", entity_id_header)
        if match:
            sm_id = match.group(1)
        else:
            # 再検索
            refetch = api_get("sitemaps", {
                "$filter": f"sitemapnameunique eq '{sitemap_name}'",
                "$select": "sitemapid"
            })
            sm_id = refetch["value"][0]["sitemapid"]
        print(f"  SiteMap 作成完了: {sm_id}")

    return sm_id


# ── Step 4: AppModule 作成 ────────────────────────────────

def ensure_app_module(app_display_name, app_unique_name, app_description):
    """AppModule をべき等に作成する"""
    print("\n=== Step 4: AppModule（モデル駆動型アプリ）作成 ===")

    # 既存検索（unpublished 含む）
    existing = api_get("appmodules", {
        "$filter": f"uniquename eq '{app_unique_name}'",
        "$select": "appmoduleid,name,uniquename"
    })

    if existing.get("value"):
        app_id = existing["value"][0]["appmoduleid"]
        print(f"  既存アプリ '{app_unique_name}' が見つかりました: {app_id}")
        # 名前・説明・clienttype を更新（Unified Interface 対応）
        api_patch(f"appmodules({app_id})", {
            "name": app_display_name,
            "description": app_description,
            "clienttype": 4,  # Unified Interface
        })
        print(f"  アプリのプロパティを更新しました（clienttype=4: Unified Interface）")
        return app_id

    print(f"  アプリ '{app_display_name}' (uniquename: {app_unique_name}) を新規作成")
    body = {
        "name": app_display_name,
        "uniquename": app_unique_name,
        "description": app_description,
        "clienttype": 4,  # Unified Interface
        "webresourceid": DEFAULT_WEBRESOURCE_ID,
    }
    resp = api_post("appmodules", body, include_solution=True)

    # OData-EntityId ヘッダーから ID を取得
    entity_id_header = resp.headers.get("OData-EntityId", "")
    match = re.search(r"\(([0-9a-fA-F\-]+)\)", entity_id_header)
    if match:
        app_id = match.group(1)
    else:
        refetch = api_get("appmodules", {
            "$filter": f"uniquename eq '{app_unique_name}'",
            "$select": "appmoduleid"
        })
        app_id = refetch["value"][0]["appmoduleid"]

    print(f"  アプリ作成完了: {app_id}")
    return app_id


# ── Step 5: コンポーネント追加 ────────────────────────────

def add_app_components(app_id, sitemap_id, tables):
    """SiteMap とテーブル（ビュー・フォーム含む）をアプリに追加する"""
    print("\n=== Step 5: アプリコンポーネント追加 ===")

    components = []

    # SiteMap を追加
    components.append({
        "sitemapid": sitemap_id,
        "@odata.type": "Microsoft.Dynamics.CRM.sitemap",
    })
    print(f"  SiteMap: {sitemap_id}")

    # テーブルごとにビュー（savedquery）とフォーム（systemform）を追加
    for t in tables:
        entity = t["logical_name"]

        # メインビュー（Active xxx を取得）
        views = api_get("savedqueries", {
            "$filter": f"returnedtypecode eq '{entity}' and querytype eq 0",
            "$select": "savedqueryid,name",
            "$top": "5",
            "$orderby": "name"
        })
        for v in views.get("value", []):
            components.append({
                "savedqueryid": v["savedqueryid"],
                "@odata.type": "Microsoft.Dynamics.CRM.savedquery",
            })
            print(f"  ビュー: {v['name']} ({entity})")

        # メインフォーム（type=2=Main）
        forms = api_get("systemforms", {
            "$filter": f"objecttypecode eq '{entity}' and type eq 2",
            "$select": "formid,name",
            "$top": "5"
        })
        for f in forms.get("value", []):
            components.append({
                "formid": f["formid"],
                "@odata.type": "Microsoft.Dynamics.CRM.systemform",
            })
            print(f"  フォーム: {f['name']} ({entity})")

    if not components:
        print("  ⚠️ 追加するコンポーネントがありません")
        return

    # バッチで追加（100 件ごとに分割）
    batch_size = 50
    for i in range(0, len(components), batch_size):
        batch = components[i:i + batch_size]
        try:
            api_post_json("AddAppComponents", {
                "AppId": app_id,
                "Components": batch,
            }, include_solution=False)
            print(f"  バッチ {i // batch_size + 1}: {len(batch)} コンポーネント追加完了")
        except requests.HTTPError as e:
            err_text = ""
            if e.response is not None:
                err_text = e.response.text[:500]
            # 既に追加済みの場合は続行
            if "already exists" in err_text.lower() or "duplicate" in err_text.lower():
                print(f"  バッチ {i // batch_size + 1}: 一部コンポーネントは既に追加済み")
            else:
                print(f"  ⚠️ バッチ {i // batch_size + 1} 追加失敗: {err_text}")
                # 1 件ずつフォールバック
                _add_components_one_by_one(app_id, batch)


def _add_components_one_by_one(app_id, components):
    """コンポーネントを 1 件ずつ追加する（フォールバック）"""
    for comp in components:
        try:
            api_post_json("AddAppComponents", {
                "AppId": app_id,
                "Components": [comp],
            }, include_solution=False)
        except requests.HTTPError:
            odata_type = comp.get("@odata.type", "unknown")
            comp_id = next((v for k, v in comp.items() if k != "@odata.type"), "?")
            print(f"    ⚠️ スキップ: {odata_type} ({comp_id})")


# ── Step 6: セキュリティロール関連付け ────────────────────

def associate_security_roles(app_id):
    """Basic User ロールをアプリに関連付ける"""
    print("\n=== Step 6: セキュリティロール関連付け ===")

    # Basic User ロール（旧 Common Data Service User）を検索
    roles = api_get("roles", {
        "$filter": "name eq 'Basic User' or name eq 'Common Data Service User'",
        "$select": "roleid,name"
    })

    if not roles.get("value"):
        # フォールバック: System Administrator
        roles = api_get("roles", {
            "$filter": "name eq 'System Administrator'",
            "$select": "roleid,name"
        })

    for role in roles.get("value", []):
        role_id = role["roleid"]
        role_name = role["name"]
        try:
            h = get_headers(False)
            r = requests.post(
                f"{API}/appmodules({app_id})/appmoduleroles_association/$ref",
                headers=h,
                json={"@odata.id": f"{API}/roles({role_id})"}
            )
            if r.ok:
                print(f"  ✅ ロール関連付け: {role_name} ({role_id})")
            elif r.status_code == 409 or "already" in r.text.lower():
                print(f"  ⏭️  既に関連付け済み: {role_name}")
            else:
                print(f"  ⚠️ 関連付け失敗 ({r.status_code}): {r.text[:300]}")
        except Exception as e:
            print(f"  ⚠️ ロール関連付けエラー: {e}")


# ── Step 7: バリデーション ────────────────────────────────

def validate_app(app_id):
    """アプリを検証する"""
    print("\n=== Step 7: アプリ検証 ===")

    try:
        result = api_get(f"ValidateApp(AppModuleId={app_id})")
        validation = result.get("AppValidationResponse", {})
        success = validation.get("ValidationSuccess", False)
        issues = validation.get("ValidationIssueList", [])

        if success:
            print("  ✅ 検証成功")
        else:
            print("  ⚠️ 検証に問題があります:")
            for issue in issues:
                err_type = issue.get("ErrorType", "Unknown")
                message = issue.get("Message", "")
                print(f"    [{err_type}] {message}")

        return success
    except requests.HTTPError as e:
        print(f"  ⚠️ 検証リクエスト失敗: {e}")
        return False


# ── Step 8: アプリ公開 ────────────────────────────────────

def publish_app(app_id):
    """アプリを公開する"""
    print("\n=== Step 8: アプリ公開 ===")

    publish_xml = (
        f"<importexportxml>"
        f"<appmodules><appmodule>{app_id}</appmodule></appmodules>"
        f"</importexportxml>"
    )

    try:
        api_post("PublishXml", {"ParameterXml": publish_xml}, include_solution=False)
        print("  ✅ アプリ公開完了")
    except requests.HTTPError as e:
        print(f"  ⚠️ 公開失敗: {e}")
        if e.response is not None:
            print(f"     {e.response.text[:500]}")


# ── Step 9: ソリューション含有検証 ────────────────────────

def verify_solution_membership(app_id, sitemap_id, sol_id):
    """アプリと SiteMap がソリューションに含まれているか検証する"""
    print("\n=== Step 9: ソリューション含有検証 ===")

    COMPONENT_TYPE_SITEMAP = 62
    COMPONENT_TYPE_APPMODULE = 80

    components_to_add = [
        (app_id, COMPONENT_TYPE_APPMODULE, "AppModule"),
        (sitemap_id, COMPONENT_TYPE_SITEMAP, "SiteMap"),
    ]

    for comp_id, comp_type, name in components_to_add:
        try:
            api_post_json("AddSolutionComponent", {
                "ComponentId": comp_id,
                "ComponentType": comp_type,
                "SolutionUniqueName": SOLUTION_NAME,
                "AddRequiredComponents": False,
                "DoNotIncludeSubcomponents": False,
            }, include_solution=False)
            print(f"  ✅ {name} をソリューションに追加/検証: {comp_id}")
        except requests.HTTPError as e:
            err_text = e.response.text if e.response else ""
            if "already" in err_text.lower():
                print(f"  ⏭️  {name} は既にソリューション内: {comp_id}")
            else:
                print(f"  ⚠️ {name} のソリューション追加に失敗: {err_text[:300]}")


# ── メイン ────────────────────────────────────────────────

def main():
    global APP_DISPLAY_NAME, APP_UNIQUE_NAME, APP_DESCRIPTION

    # デフォルト値の設定
    if not APP_DISPLAY_NAME:
        APP_DISPLAY_NAME = SOLUTION_NAME.replace("_", " ")
    if not APP_UNIQUE_NAME:
        APP_UNIQUE_NAME = SOLUTION_NAME
    if not APP_DESCRIPTION:
        APP_DESCRIPTION = f"{APP_DISPLAY_NAME} モデル駆動型アプリ"

    print("=" * 60)
    print(f"  モデル駆動型アプリ デプロイ")
    print(f"  アプリ名: {APP_DISPLAY_NAME}")
    print(f"  ユニーク名: {APP_UNIQUE_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print("=" * 60)

    # Step 1: テーブル一覧の取得
    tables, sol_id = get_solution_tables()
    if not tables:
        print("\n⚠️ ソリューション内にテーブルが見つかりません。先に setup_dataverse.py を実行してください。")
        sys.exit(1)

    # Step 2: SiteMap XML 構築
    sitemap_xml = build_sitemap_xml(tables, APP_DISPLAY_NAME)

    # Step 3: SiteMap レコード作成
    sitemap_id = ensure_sitemap(sitemap_xml, APP_UNIQUE_NAME)

    # Step 4: AppModule 作成
    app_id = ensure_app_module(APP_DISPLAY_NAME, APP_UNIQUE_NAME, APP_DESCRIPTION)

    # Step 5: コンポーネント追加
    add_app_components(app_id, sitemap_id, tables)

    # Step 6: セキュリティロール
    associate_security_roles(app_id)

    # Step 7: バリデーション
    validate_app(app_id)

    # Step 8: アプリ公開
    publish_app(app_id)

    # Step 9: ソリューション含有検証
    verify_solution_membership(app_id, sitemap_id, sol_id)

    # 結果表示
    app_url = f"{DATAVERSE_URL}/main.aspx?appid={app_id}"
    print("\n" + "=" * 60)
    print(f"  ✅ モデル駆動型アプリのデプロイ完了")
    print(f"  アプリ ID: {app_id}")
    print(f"  SiteMap ID: {sitemap_id}")
    print(f"  アプリ URL: {app_url}")
    print("=" * 60)

    # .env に APP_ID を保存
    _save_env_value("APP_MODULE_ID", app_id)
    print(f"\n  .env に APP_MODULE_ID={app_id} を保存しました")


def _save_env_value(key, value):
    """既存の .env ファイルにキーを追記または更新する"""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    lines = []
    found = False
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}\n")
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)


if __name__ == "__main__":
    main()
