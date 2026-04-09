"""
Dataverse テーブル構築スクリプト — インシデント管理システム

Phase 1: ソリューション作成 → テーブル作成（マスタ→主→従属）→ Lookup → ローカライズ → デモデータ

使い方:
  1. .env ファイルに DATAVERSE_URL, TENANT_ID, MCP_CLIENT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定
  2. pip install azure-identity requests python-dotenv
  3. python scripts/setup_dataverse.py
"""

import json
import os
import sys
import time

# scripts/ ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")

# ── 認証 ──────────────────────────────────────────────────

def get_headers() -> dict:
    token = _get_token()
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "MSCRM.SolutionName": SOLUTION_NAME,
    }

# ── API ヘルパー ─────────────────────────────────────────

def api_get(path, params=None):
    r = requests.get(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                     headers=get_headers(), params=params)
    r.raise_for_status()
    return r.json()


def api_post(path, body):
    r = requests.post(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                      headers=get_headers(), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r


def api_put(path, body):
    h = get_headers()
    h["MSCRM.MergeLabels"] = "true"
    r = requests.put(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                     headers=h, json=body)
    r.raise_for_status()
    return r


def api_delete(path):
    r = requests.delete(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                        headers=get_headers())
    r.raise_for_status()
    return r

# ── リトライ付きメタデータ操作 ────────────────────────────

def retry_metadata(fn, description, max_attempts=5):
    """メタデータ操作をリトライ。ロック競合時は累進的に待機。"""
    for attempt in range(max_attempts):
        try:
            return fn()
        except requests.HTTPError as e:
            resp_text = ""
            if e.response is not None:
                try:
                    resp_text = e.response.text or e.response.content.decode("utf-8", errors="replace")
                except Exception:
                    resp_text = str(e.response.content)
            err = str(e) + " " + resp_text
            err_lower = err.lower()
            # 既存エンティティ / 列 / リレーションシップは全てスキップ
            if "already exists" in err_lower or "same name already exists" in err_lower \
               or "0x80044363" in err or "0x80048403" in err or "not unique" in err_lower:
                print(f"  {description}: already exists — skipping")
                return None
            if "0x80040237" in err or ("another" in err_lower and "running" in err_lower):
                wait = 10 * (attempt + 1)
                print(f"  {description}: lock contention, waiting {wait}s …")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"{description}: max retries exceeded")

# ── ラベルヘルパー ────────────────────────────────────────

def label_jp(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}

# ── Phase 1.1: ソリューション作成 ─────────────────────────

def ensure_solution():
    print("\n=== Phase 1.1: ソリューション確認 ===")
    existing = api_get("solutions",
                       {"$filter": f"uniquename eq '{SOLUTION_NAME}'", "$select": "solutionid"})
    if existing["value"]:
        print(f"  ソリューション '{SOLUTION_NAME}' は既存。スキップ。")
        return
    print(f"  ソリューション '{SOLUTION_NAME}' を作成します…")
    # パブリッシャー検索
    pubs = api_get("publishers",
                   {"$filter": f"customizationprefix eq '{PREFIX}'", "$select": "publisherid"})
    if not pubs["value"]:
        raise RuntimeError(f"パブリッシャー prefix='{PREFIX}' が見つかりません。Power Apps で作成してください。")
    pub_id = pubs["value"][0]["publisherid"]
    api_post("solutions", {
        "uniquename": SOLUTION_NAME,
        "friendlyname": "インシデント管理",
        "version": "1.0.0.0",
        "publisherid@odata.bind": f"/publishers({pub_id})",
    })
    print("  ソリューション作成完了")

# ── Phase 1.2: テーブル作成 ───────────────────────────────

TABLES = [
    # Phase 1: マスタ系
    {
        "logical": f"{PREFIX}_incidentcategory",
        "display": "Incident Category",
        "plural": "Incident Categories",
        "description": "インシデントカテゴリマスタ",
        "columns": [],
    },
    {
        "logical": f"{PREFIX}_location",
        "display": "Location",
        "plural": "Locations",
        "description": "設置場所マスタ",
        "columns": [],
    },
    # Phase 2: 主テーブル
    {
        "logical": f"{PREFIX}_incident",
        "display": "Incident",
        "plural": "Incidents",
        "description": "インシデント管理テーブル",
        "columns": [
            {
                "logical": f"{PREFIX}_description",
                "type": "Memo",
                "display": "Description",
                "maxLength": 4000,
            },
            {
                "logical": f"{PREFIX}_status",
                "type": "Picklist",
                "display": "Status",
                "options": [
                    (100000000, "New"),
                    (100000001, "In Progress"),
                    (100000002, "On Hold"),
                    (100000003, "Resolved"),
                    (100000004, "Closed"),
                ],
            },
            {
                "logical": f"{PREFIX}_priority",
                "type": "Picklist",
                "display": "Priority",
                "options": [
                    (100000000, "Critical"),
                    (100000001, "High"),
                    (100000002, "Medium"),
                    (100000003, "Low"),
                ],
            },
            {
                "logical": f"{PREFIX}_duedate",
                "type": "DateTime",
                "display": "Due Date",
            },
        ],
    },
    # Phase 3: 従属テーブル
    {
        "logical": f"{PREFIX}_incidentcomment",
        "display": "Incident Comment",
        "plural": "Incident Comments",
        "description": "インシデントコメント",
        "columns": [
            {
                "logical": f"{PREFIX}_content",
                "type": "Memo",
                "display": "Content",
                "maxLength": 4000,
            },
        ],
    },
]


def build_column_body(col):
    """列定義の JSON ボディを構築"""
    base = {
        "SchemaName": col["logical"],
        "DisplayName": label_jp(col["display"]),
        "RequiredLevel": {"Value": "None"},
    }
    if col["type"] == "Memo":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        base["Format"] = "Text"
        base["MaxLength"] = col.get("maxLength", 2000)
    elif col["type"] == "Picklist":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": False,
            "OptionSetType": "Picklist",
            "Options": [
                {"Value": v, "Label": label_jp(lbl)} for v, lbl in col["options"]
            ],
        }
    elif col["type"] == "DateTime":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        base["Format"] = "DateOnly"
    return base


def create_tables():
    print("\n=== Phase 1.2: テーブル作成 ===")
    for tbl in TABLES:
        def _create(t=tbl):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                "SchemaName": t["logical"],
                "DisplayName": label_jp(t["display"]),
                "DisplayCollectionName": label_jp(t["plural"]),
                "Description": label_jp(t["description"]),
                "OwnershipType": "UserOwned",
                "IsActivity": False,
                "HasActivities": False,
                "HasNotes": False,
                "HasFeedback": False,
                "PrimaryNameAttribute": f"{PREFIX}_name",
                "Attributes": [
                    {
                        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                        "SchemaName": f"{PREFIX}_name",
                        "DisplayName": label_jp("Name"),
                        "IsPrimaryName": True,
                        "RequiredLevel": {"Value": "ApplicationRequired"},
                        "FormatName": {"Value": "Text"},
                        "MaxLength": 200,
                    }
                ],
            }
            api_post("EntityDefinitions", body)
            print(f"  テーブル '{t['logical']}' 作成完了")

        retry_metadata(_create, f"テーブル {tbl['logical']}")
        time.sleep(5)  # メタデータ反映待ち

        # カスタム列追加
        for col in tbl.get("columns", []):
            def _add_col(c=col, t=tbl):
                api_post(f"EntityDefinitions(LogicalName='{t['logical']}')/Attributes",
                         build_column_body(c))
                print(f"    列 '{c['logical']}' 追加完了")

            retry_metadata(_add_col, f"列 {col['logical']}")
            time.sleep(3)

# ── Phase 1.3: Lookup リレーションシップ ─────────────────

LOOKUPS = [
    # incident → incidentcategory
    {
        "schema": f"{PREFIX}_incident_{PREFIX}_incidentcategory",
        "referencing": f"{PREFIX}_incident",
        "referenced": f"{PREFIX}_incidentcategory",
        "lookup_attr": f"{PREFIX}_incidentcategoryid",
        "lookup_display": "Category",
    },
    # incident → location
    {
        "schema": f"{PREFIX}_incident_{PREFIX}_location",
        "referencing": f"{PREFIX}_incident",
        "referenced": f"{PREFIX}_location",
        "lookup_attr": f"{PREFIX}_locationid",
        "lookup_display": "Location",
    },
    # incident → systemuser (担当者)
    {
        "schema": f"{PREFIX}_incident_systemuser_assignedto",
        "referencing": f"{PREFIX}_incident",
        "referenced": "systemuser",
        "lookup_attr": f"{PREFIX}_assignedtoid",
        "lookup_display": "Assigned To",
    },
    # incidentcomment → incident
    {
        "schema": f"{PREFIX}_incidentcomment_{PREFIX}_incident",
        "referencing": f"{PREFIX}_incidentcomment",
        "referenced": f"{PREFIX}_incident",
        "lookup_attr": f"{PREFIX}_incidentid",
        "lookup_display": "Incident",
    },
]


def create_lookups():
    print("\n=== Phase 1.3: Lookup リレーションシップ作成 ===")
    for lk in LOOKUPS:
        def _create(l=lk):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                "SchemaName": l["schema"],
                "ReferencedEntity": l["referenced"],
                "ReferencingEntity": l["referencing"],
                "Lookup": {
                    "SchemaName": l["lookup_attr"],
                    "DisplayName": label_jp(l["lookup_display"]),
                    "RequiredLevel": {"Value": "None"},
                },
            }
            api_post("RelationshipDefinitions", body)
            print(f"  Lookup '{l['schema']}' 作成完了")

        retry_metadata(_create, f"Lookup {lk['schema']}")
        time.sleep(5)

# ── Phase 1.4: 日本語ローカライズ ─────────────────────────

LOCALIZE_TABLES = [
    (f"{PREFIX}_incidentcategory", "インシデントカテゴリ", "インシデントカテゴリ"),
    (f"{PREFIX}_location", "場所", "場所"),
    (f"{PREFIX}_incident", "インシデント", "インシデント"),
    (f"{PREFIX}_incidentcomment", "インシデントコメント", "インシデントコメント"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_incident", f"{PREFIX}_name", "タイトル"),
    (f"{PREFIX}_incident", f"{PREFIX}_description", "説明"),
    (f"{PREFIX}_incident", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_incident", f"{PREFIX}_priority", "優先度"),
    (f"{PREFIX}_incident", f"{PREFIX}_duedate", "期限"),
    (f"{PREFIX}_incident", f"{PREFIX}_incidentcategoryid", "カテゴリ"),
    (f"{PREFIX}_incident", f"{PREFIX}_locationid", "場所"),
    (f"{PREFIX}_incident", f"{PREFIX}_assignedtoid", "担当者"),
    (f"{PREFIX}_incidentcategory", f"{PREFIX}_name", "カテゴリ名"),
    (f"{PREFIX}_location", f"{PREFIX}_name", "場所名"),
    (f"{PREFIX}_incidentcomment", f"{PREFIX}_name", "件名"),
    (f"{PREFIX}_incidentcomment", f"{PREFIX}_content", "内容"),
    (f"{PREFIX}_incidentcomment", f"{PREFIX}_incidentid", "インシデント"),
]

LOCALIZE_STATUS_OPTIONS = [
    (100000000, "新規"),
    (100000001, "対応中"),
    (100000002, "保留"),
    (100000003, "解決済"),
    (100000004, "クローズ"),
]

LOCALIZE_PRIORITY_OPTIONS = [
    (100000000, "緊急"),
    (100000001, "高"),
    (100000002, "中"),
    (100000003, "低"),
]


def localize_tables():
    print("\n=== Phase 1.4: 日本語ローカライズ ===")

    # テーブル表示名
    for logical, disp, plural in LOCALIZE_TABLES:
        data = api_get(
            f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId,DisplayName,DisplayCollectionName")
        mid = data["MetadataId"]
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
            "DisplayCollectionName": label_jp(plural),
        }
        api_put(f"EntityDefinitions({mid})", body)
        print(f"  テーブル '{logical}' → '{disp}'")

    # 列表示名
    for table, col, disp in LOCALIZE_COLUMNS:
        data = api_get(
            f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{col}')"
            f"?$select=MetadataId,AttributeType")
        mid = data["MetadataId"]
        attr_type = data.get("AttributeType", "")
        odata_type_map = {
            "String": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "Memo": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
            "Picklist": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "DateTime": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            "Lookup": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        }
        odata_type = odata_type_map.get(attr_type, "#Microsoft.Dynamics.CRM.AttributeMetadata")
        body = {
            "@odata.type": odata_type,
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
        }
        api_put(f"EntityDefinitions(LogicalName='{table}')/Attributes({mid})",
                body)
        print(f"  列 '{table}.{col}' → '{disp}'")

    # Choice オプション ローカライズ
    _localize_options(f"{PREFIX}_incident", f"{PREFIX}_status", LOCALIZE_STATUS_OPTIONS)
    _localize_options(f"{PREFIX}_incident", f"{PREFIX}_priority", LOCALIZE_PRIORITY_OPTIONS)


def _localize_options(table, col, options):
    """Choice オプションの日本語ラベルを更新"""
    for value, label_text in options:
        body = {
            "EntityLogicalName": table,
            "AttributeLogicalName": col,
            "Value": value,
            "Label": label_jp(label_text),
            "MergeLabels": True,
        }
        api_post("UpdateOptionValue", body)
        print(f"    Option {col}={value} → '{label_text}'")

# ── Phase 1.5: デモデータ投入 ─────────────────────────────

def insert_demo_data():
    print("\n=== Phase 1.5: デモデータ投入 ===")

    # カテゴリ作成
    categories = ["ネットワーク障害", "ハードウェア故障", "ソフトウェア不具合", "セキュリティ", "その他"]
    cat_ids = {}
    for name in categories:
        r = api_post(f"{PREFIX}_incidentcategories", {f"{PREFIX}_name": name})
        cat_ids[name] = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
        print(f"  カテゴリ: {name}")

    # 場所作成
    locations = ["本社1F", "本社2F", "本社3F", "大阪支店", "リモート"]
    loc_ids = {}
    for name in locations:
        r = api_post(f"{PREFIX}_locations", {f"{PREFIX}_name": name})
        loc_ids[name] = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
        print(f"  場所: {name}")

    # インシデント作成
    incidents = [
        {
            f"{PREFIX}_name": "本社3Fネットワーク接続不可",
            f"{PREFIX}_description": "本社3Fのフロア全体でネットワークに接続できない状態が続いています。スイッチの障害が疑われます。",
            f"{PREFIX}_status": 100000001,  # 対応中
            f"{PREFIX}_priority": 100000000,  # 緊急
            "category": "ネットワーク障害",
            "location": "本社3F",
        },
        {
            f"{PREFIX}_name": "会議室Aプロジェクター不具合",
            f"{PREFIX}_description": "会議室Aのプロジェクターが映像を出力しません。ランプ切れの可能性があります。",
            f"{PREFIX}_status": 100000000,  # 新規
            f"{PREFIX}_priority": 100000002,  # 中
            "category": "ハードウェア故障",
            "location": "本社2F",
        },
        {
            f"{PREFIX}_name": "経費精算システムログインエラー",
            f"{PREFIX}_description": "経費精算システムにログインできないユーザーが複数報告されています。認証サーバーの問題の可能性。",
            f"{PREFIX}_status": 100000002,  # 保留
            f"{PREFIX}_priority": 100000001,  # 高
            "category": "ソフトウェア不具合",
            "location": "リモート",
        },
        {
            f"{PREFIX}_name": "不審メール受信報告",
            f"{PREFIX}_description": "複数の社員からフィッシングメールの受信報告がありました。送信元ドメインの調査が必要です。",
            f"{PREFIX}_status": 100000001,  # 対応中
            f"{PREFIX}_priority": 100000000,  # 緊急
            "category": "セキュリティ",
            "location": "リモート",
        },
        {
            f"{PREFIX}_name": "大阪支店プリンター紙詰まり",
            f"{PREFIX}_description": "大阪支店のメインプリンターで頻繁に紙詰まりが発生しています。",
            f"{PREFIX}_status": 100000003,  # 解決済
            f"{PREFIX}_priority": 100000003,  # 低
            "category": "ハードウェア故障",
            "location": "大阪支店",
        },
    ]

    for inc in incidents:
        body = {
            f"{PREFIX}_name": inc[f"{PREFIX}_name"],
            f"{PREFIX}_description": inc[f"{PREFIX}_description"],
            f"{PREFIX}_status": inc[f"{PREFIX}_status"],
            f"{PREFIX}_priority": inc[f"{PREFIX}_priority"],
        }
        cat = inc.get("category")
        if cat and cat_ids.get(cat):
            body[f"{PREFIX}_incidentcategoryid@odata.bind"] = \
                f"/{PREFIX}_incidentcategories({cat_ids[cat]})"
        loc = inc.get("location")
        if loc and loc_ids.get(loc):
            body[f"{PREFIX}_locationid@odata.bind"] = \
                f"/{PREFIX}_locations({loc_ids[loc]})"

        api_post(f"{PREFIX}_incidents", body)
        print(f"  インシデント: {inc[f'{PREFIX}_name']}")

    print("  デモデータ投入完了")

# ── Phase 1.6: テーブル検証 ───────────────────────────────

def verify_tables():
    print("\n=== Phase 1.6: テーブル検証 ===")
    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            data = api_get(f"{logical}s?$top=1&$select={PREFIX}_name")
            count = len(data.get("value", []))
            print(f"  ✅ {logical}: OK (rows={count})")
        except Exception as e:
            print(f"  ❌ {logical}: FAILED — {e}")

# ── カスタマイズ公開 ──────────────────────────────────────

def publish_all():
    print("\n=== カスタマイズ公開 ===")
    api_post("PublishAllXml", {})
    print("  公開完了")

# ── メイン ────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  インシデント管理 — Dataverse セットアップ")
    print("=" * 60)
    print(f"  環境: {DATAVERSE_URL}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  プレフィックス: {PREFIX}")

    # 認証初期化（auth_helper がキャッシュ管理）

    ensure_solution()
    create_tables()
    create_lookups()
    publish_all()
    localize_tables()
    publish_all()
    insert_demo_data()
    verify_tables()

    print("\n✅ Dataverse セットアップ完了!")
    print("次のステップ: Code Apps のデプロイ → pac code add-data-source")


if __name__ == "__main__":
    main()
