"""
Dataverse テーブル構築スクリプト — インシデント管理システム

Phase 1: ソリューション作成 → テーブル作成（マスタ→主→従属）→ Lookup → ローカライズ → デモデータ

使い方:
  1. .env ファイルに DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定
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
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", "インシデント管理")

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
            if "already exists" in err_lower or "same name already exists" in err_lower \
               or "0x80044363" in err or "0x80048403" in err or "not unique" in err_lower:
                print(f"  {description}: already exists — skipping")
                return None
            if "0x80040237" in err or "0x80040216" in err or ("another" in err_lower and "running" in err_lower):
                wait = 10 * (attempt + 1)
                print(f"  {description}: lock contention / metadata sync, waiting {wait}s …")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"{description}: max retries exceeded")

# ── ラベルヘルパー ────────────────────────────────────────

def label_jp(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}

# ── Phase 1.1: ソリューション作成 ─────────────────────────

def _save_env_value(key: str, value: str):
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


def ensure_solution():
    global SOLUTION_DISPLAY_NAME
    print("\n=== Phase 1.1: ソリューション確認 ===")
    existing = api_get("solutions",
                       {"$filter": f"uniquename eq '{SOLUTION_NAME}'",
                        "$select": "solutionid,friendlyname"})
    if existing["value"]:
        display_name = existing["value"][0].get("friendlyname", SOLUTION_DISPLAY_NAME)
        print(f"  ソリューション '{SOLUTION_NAME}' は既存（表示名: {display_name}）。スキップ。")
        SOLUTION_DISPLAY_NAME = display_name
        _save_env_value("SOLUTION_DISPLAY_NAME", display_name)
        print(f"  .env に SOLUTION_DISPLAY_NAME={display_name} を保存")
        return
    print(f"  ソリューション '{SOLUTION_NAME}' を作成します…")
    pubs = api_get("publishers",
                   {"$filter": f"customizationprefix eq '{PREFIX}'", "$select": "publisherid"})
    if not pubs["value"]:
        raise RuntimeError(f"パブリッシャー prefix='{PREFIX}' が見つかりません。Power Apps で作成してください。")
    pub_id = pubs["value"][0]["publisherid"]
    api_post("solutions", {
        "uniquename": SOLUTION_NAME,
        "friendlyname": SOLUTION_DISPLAY_NAME,
        "version": "1.0.0.0",
        "publisherid@odata.bind": f"/publishers({pub_id})",
    })
    _save_env_value("SOLUTION_DISPLAY_NAME", SOLUTION_DISPLAY_NAME)
    print(f"  ソリューション作成完了（表示名: {SOLUTION_DISPLAY_NAME}）")
    print(f"  .env に SOLUTION_DISPLAY_NAME={SOLUTION_DISPLAY_NAME} を保存")

# ── Phase 1.2: テーブル作成 ───────────────────────────────

TABLES = [
    # マスタ系
    {
        "logical": f"{PREFIX}_incidentcategory",
        "display": "Incident Category",
        "plural": "Incident Categories",
        "description": "インシデントカテゴリマスタ",
        "columns": [
            {
                "logical": f"{PREFIX}_description",
                "type": "Memo",
                "display": "Description",
                "maxLength": 2000,
            },
        ],
    },
    {
        "logical": f"{PREFIX}_priority",
        "display": "Priority",
        "plural": "Priorities",
        "description": "優先度マスタ",
        "columns": [
            {
                "logical": f"{PREFIX}_sortorder",
                "type": "Integer",
                "display": "Sort Order",
            },
        ],
    },
    {
        "logical": f"{PREFIX}_itasset",
        "display": "IT Asset",
        "plural": "IT Assets",
        "description": "IT資産マスタ",
        "columns": [
            {
                "logical": f"{PREFIX}_assettype",
                "type": "Picklist",
                "display": "Asset Type",
                "options": [
                    (100000000, "PC"),
                    (100000001, "Server"),
                    (100000002, "Printer"),
                    (100000003, "Network Device"),
                    (100000004, "Mobile Device"),
                    (100000005, "Software"),
                    (100000006, "Other"),
                ],
            },
            {
                "logical": f"{PREFIX}_assetnumber",
                "type": "String",
                "display": "Asset Number",
                "maxLength": 50,
            },
            {
                "logical": f"{PREFIX}_location",
                "type": "String",
                "display": "Location",
                "maxLength": 200,
            },
            {
                "logical": f"{PREFIX}_manufacturer",
                "type": "String",
                "display": "Manufacturer",
                "maxLength": 200,
            },
            {
                "logical": f"{PREFIX}_model",
                "type": "String",
                "display": "Model",
                "maxLength": 200,
            },
            {
                "logical": f"{PREFIX}_status",
                "type": "Picklist",
                "display": "Status",
                "options": [
                    (100000000, "Active"),
                    (100000001, "Broken"),
                    (100000002, "Maintenance"),
                    (100000003, "Retired"),
                ],
            },
            {
                "logical": f"{PREFIX}_remarks",
                "type": "Memo",
                "display": "Remarks",
                "maxLength": 2000,
            },
        ],
    },
    # 主テーブル
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
                    (100000002, "Resolved"),
                    (100000003, "Closed"),
                ],
            },
            {
                "logical": f"{PREFIX}_resolvedon",
                "type": "DateTime",
                "display": "Resolved On",
            },
            {
                "logical": f"{PREFIX}_resolution",
                "type": "Memo",
                "display": "Resolution",
                "maxLength": 4000,
            },
        ],
    },
    # 従属テーブル
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
        base["Format"] = "DateAndTime"
    elif col["type"] == "String":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.StringAttributeMetadata"
        base["FormatName"] = {"Value": "Text"}
        base["MaxLength"] = col.get("maxLength", 200)
    elif col["type"] == "Integer":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        base["MinValue"] = 0
        base["MaxValue"] = 100000
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
        time.sleep(10)  # メタデータ反映に十分な待機

        # カスタム列追加
        for col in tbl.get("columns", []):
            def _add_col(c=col, t=tbl):
                api_post(f"EntityDefinitions(LogicalName='{t['logical']}')/Attributes",
                         build_column_body(c))
                print(f"    列 '{c['logical']}' 追加完了")

            retry_metadata(_add_col, f"列 {col['logical']}")
            time.sleep(5)

# ── Phase 1.3: Lookup リレーションシップ ─────────────────

LOOKUPS = [
    # incident → incidentcategory
    {
        "schema": f"{PREFIX}_incident_{PREFIX}_incidentcategory",
        "referencing": f"{PREFIX}_incident",
        "referenced": f"{PREFIX}_incidentcategory",
        "lookup_attr": f"{PREFIX}_categoryid",
        "lookup_display": "Category",
    },
    # incident → priority
    {
        "schema": f"{PREFIX}_incident_{PREFIX}_priority",
        "referencing": f"{PREFIX}_incident",
        "referenced": f"{PREFIX}_priority",
        "lookup_attr": f"{PREFIX}_priorityid",
        "lookup_display": "Priority",
    },
    # incident → itasset
    {
        "schema": f"{PREFIX}_incident_{PREFIX}_itasset",
        "referencing": f"{PREFIX}_incident",
        "referenced": f"{PREFIX}_itasset",
        "lookup_attr": f"{PREFIX}_itassetid",
        "lookup_display": "IT Asset",
    },
    # incident → systemuser (担当者)
    {
        "schema": f"{PREFIX}_incident_systemuser_assignee",
        "referencing": f"{PREFIX}_incident",
        "referenced": "systemuser",
        "lookup_attr": f"{PREFIX}_assigneeid",
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
    (f"{PREFIX}_priority", "優先度", "優先度"),
    (f"{PREFIX}_itasset", "IT資産", "IT資産"),
    (f"{PREFIX}_incident", "インシデント", "インシデント"),
    (f"{PREFIX}_incidentcomment", "インシデントコメント", "インシデントコメント"),
]

LOCALIZE_COLUMNS = [
    # インシデントカテゴリ
    (f"{PREFIX}_incidentcategory", f"{PREFIX}_name", "カテゴリ名"),
    (f"{PREFIX}_incidentcategory", f"{PREFIX}_description", "説明"),
    # 優先度
    (f"{PREFIX}_priority", f"{PREFIX}_name", "優先度名"),
    (f"{PREFIX}_priority", f"{PREFIX}_sortorder", "表示順"),
    # IT資産
    (f"{PREFIX}_itasset", f"{PREFIX}_name", "資産名"),
    (f"{PREFIX}_itasset", f"{PREFIX}_assettype", "資産タイプ"),
    (f"{PREFIX}_itasset", f"{PREFIX}_assetnumber", "資産番号"),
    (f"{PREFIX}_itasset", f"{PREFIX}_location", "設置場所"),
    (f"{PREFIX}_itasset", f"{PREFIX}_manufacturer", "メーカー"),
    (f"{PREFIX}_itasset", f"{PREFIX}_model", "モデル"),
    (f"{PREFIX}_itasset", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_itasset", f"{PREFIX}_remarks", "備考"),
    # インシデント
    (f"{PREFIX}_incident", f"{PREFIX}_name", "タイトル"),
    (f"{PREFIX}_incident", f"{PREFIX}_description", "説明"),
    (f"{PREFIX}_incident", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_incident", f"{PREFIX}_categoryid", "カテゴリ"),
    (f"{PREFIX}_incident", f"{PREFIX}_priorityid", "優先度"),
    (f"{PREFIX}_incident", f"{PREFIX}_itassetid", "対象IT資産"),
    (f"{PREFIX}_incident", f"{PREFIX}_assigneeid", "担当者"),
    (f"{PREFIX}_incident", f"{PREFIX}_resolvedon", "解決日時"),
    (f"{PREFIX}_incident", f"{PREFIX}_resolution", "解決方法"),
    # インシデントコメント
    (f"{PREFIX}_incidentcomment", f"{PREFIX}_name", "コメント内容"),
    (f"{PREFIX}_incidentcomment", f"{PREFIX}_content", "詳細"),
    (f"{PREFIX}_incidentcomment", f"{PREFIX}_incidentid", "インシデント"),
]

# インシデント ステータス Choice ローカライズ
LOCALIZE_INCIDENT_STATUS = [
    (100000000, "新規"),
    (100000001, "対応中"),
    (100000002, "解決済"),
    (100000003, "クローズ"),
]

# IT資産 資産タイプ Choice ローカライズ
LOCALIZE_ASSET_TYPE = [
    (100000000, "PC"),
    (100000001, "サーバー"),
    (100000002, "プリンター"),
    (100000003, "ネットワーク機器"),
    (100000004, "モバイルデバイス"),
    (100000005, "ソフトウェア"),
    (100000006, "その他"),
]

# IT資産 ステータス Choice ローカライズ
LOCALIZE_ASSET_STATUS = [
    (100000000, "稼働中"),
    (100000001, "故障中"),
    (100000002, "メンテナンス中"),
    (100000003, "廃棄済"),
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
            "Integer": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
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
    _localize_options(f"{PREFIX}_incident", f"{PREFIX}_status", LOCALIZE_INCIDENT_STATUS)
    _localize_options(f"{PREFIX}_itasset", f"{PREFIX}_assettype", LOCALIZE_ASSET_TYPE)
    _localize_options(f"{PREFIX}_itasset", f"{PREFIX}_status", LOCALIZE_ASSET_STATUS)


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
    categories = [
        {"name": "ネットワーク障害", "desc": "ネットワーク接続・通信に関する障害"},
        {"name": "ソフトウェア不具合", "desc": "アプリケーション・システムの不具合"},
        {"name": "ハードウェア故障", "desc": "PC・プリンター等の物理的な故障"},
        {"name": "アカウント/権限", "desc": "アカウントロック・権限付与に関する問合せ"},
        {"name": "その他", "desc": "上記カテゴリに該当しないインシデント"},
    ]
    cat_ids = {}
    for c in categories:
        r = api_post(f"{PREFIX}_incidentcategories", {
            f"{PREFIX}_name": c["name"],
            f"{PREFIX}_description": c["desc"],
        })
        cat_ids[c["name"]] = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
        print(f"  カテゴリ: {c['name']}")

    # 優先度作成
    priorities = [
        {"name": "高", "order": 1},
        {"name": "中", "order": 2},
        {"name": "低", "order": 3},
    ]
    pri_ids = {}
    for p in priorities:
        r = api_post(f"{PREFIX}_priorities", {
            f"{PREFIX}_name": p["name"],
            f"{PREFIX}_sortorder": p["order"],
        })
        pri_ids[p["name"]] = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
        print(f"  優先度: {p['name']}")

    # IT資産作成
    assets = [
        {"name": "営業部PC-001", "type": 100000000, "number": "AST-2024-001", "location": "本社3F 営業部", "mfr": "Dell", "model": "Latitude 5540", "status": 100000000},
        {"name": "経理部PC-002", "type": 100000000, "number": "AST-2024-002", "location": "本社2F 経理部", "mfr": "Lenovo", "model": "ThinkPad T14", "status": 100000000},
        {"name": "会議室Aプリンター", "type": 100000002, "number": "AST-2023-010", "location": "本社3F 会議室A", "mfr": "Canon", "model": "imageRUNNER C3226F", "status": 100000000},
        {"name": "社内ファイルサーバー", "type": 100000001, "number": "AST-2022-050", "location": "本社B1F サーバールーム", "mfr": "HPE", "model": "ProLiant DL380 Gen10", "status": 100000000},
        {"name": "VPN装置", "type": 100000003, "number": "AST-2023-030", "location": "本社B1F サーバールーム", "mfr": "Fortinet", "model": "FortiGate 60F", "status": 100000000},
        {"name": "基幹業務システム", "type": 100000005, "number": "AST-SW-001", "location": "クラウド(Azure)", "mfr": "自社開発", "model": "v3.2.1", "status": 100000000},
        {"name": "社用スマホ-田中", "type": 100000004, "number": "AST-2024-MB01", "location": "大阪支社", "mfr": "Apple", "model": "iPhone 15", "status": 100000001},
        {"name": "コアスイッチ01", "type": 100000003, "number": "AST-2023-NW01", "location": "本社B1F サーバールーム", "mfr": "Cisco", "model": "Catalyst 9300", "status": 100000002},
    ]
    asset_ids = {}
    for a in assets:
        body = {
            f"{PREFIX}_name": a["name"],
            f"{PREFIX}_assettype": a["type"],
            f"{PREFIX}_assetnumber": a["number"],
            f"{PREFIX}_location": a["location"],
            f"{PREFIX}_manufacturer": a["mfr"],
            f"{PREFIX}_model": a["model"],
            f"{PREFIX}_status": a["status"],
        }
        r = api_post(f"{PREFIX}_itassets", body)
        asset_ids[a["name"]] = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
        print(f"  IT資産: {a['name']}")

    # インシデント作成
    incidents = [
        {
            "name": "営業部PC-001 ブルースクリーン頻発",
            "desc": "営業部の田中さんのPC（AST-2024-001）で起動時にブルースクリーンが発生します。今週に入り3回目です。",
            "status": 100000001,  # 対応中
            "category": "ハードウェア故障",
            "priority": "高",
            "asset": "営業部PC-001",
        },
        {
            "name": "VPN接続不可 — リモートワーク影響",
            "desc": "本日朝からVPN装置経由のリモート接続ができない状態です。リモートワーク社員約30名が影響を受けています。",
            "status": 100000000,  # 新規
            "category": "ネットワーク障害",
            "priority": "高",
            "asset": "VPN装置",
        },
        {
            "name": "基幹システム ログインエラー",
            "desc": "基幹業務システムに一部ユーザーがログインできません。「認証エラー」と表示されます。",
            "status": 100000002,  # 解決済
            "category": "ソフトウェア不具合",
            "priority": "中",
            "asset": "基幹業務システム",
        },
        {
            "name": "新入社員 アカウント作成依頼",
            "desc": "4月入社の新入社員5名のActive DirectoryアカウントとMicrosoft 365ライセンスの付与をお願いします。",
            "status": 100000003,  # クローズ
            "category": "アカウント/権限",
            "priority": "低",
            "asset": None,
        },
        {
            "name": "会議室Aプリンター 紙詰まり",
            "desc": "会議室AのプリンターでA4用紙が頻繁に紙詰まりを起こします。今日だけで4回発生しています。",
            "status": 100000001,  # 対応中
            "category": "ハードウェア故障",
            "priority": "中",
            "asset": "会議室Aプリンター",
        },
    ]

    inc_ids = []
    for inc in incidents:
        body = {
            f"{PREFIX}_name": inc["name"],
            f"{PREFIX}_description": inc["desc"],
            f"{PREFIX}_status": inc["status"],
        }
        cat = inc.get("category")
        if cat and cat_ids.get(cat):
            body[f"{PREFIX}_categoryid@odata.bind"] = \
                f"/{PREFIX}_incidentcategories({cat_ids[cat]})"
        pri = inc.get("priority")
        if pri and pri_ids.get(pri):
            body[f"{PREFIX}_priorityid@odata.bind"] = \
                f"/{PREFIX}_priorities({pri_ids[pri]})"
        asset = inc.get("asset")
        if asset and asset_ids.get(asset):
            body[f"{PREFIX}_itassetid@odata.bind"] = \
                f"/{PREFIX}_itassets({asset_ids[asset]})"

        r = api_post(f"{PREFIX}_incidents", body)
        inc_id = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
        inc_ids.append(inc_id)
        print(f"  インシデント: {inc['name']}")

    # コメント作成
    comments = [
        (0, "ディスク診断を実施。S.M.A.R.T.エラーを検出しました。SSD交換が必要です。"),
        (0, "Dell サポートに連絡済み。翌営業日にオンサイト対応予定。代替PCを田中さんに貸出済み。"),
        (1, "VPN装置のログを確認中。ファームウェアの自動アップデートが原因の可能性があります。"),
        (1, "ファームウェアをロールバックし、VPN接続が復旧しました。恒久対策のため次回メンテナンス窓口でアップデートを再適用予定。"),
        (2, "認証サーバーの証明書期限切れが原因と判明。証明書を更新し、全ユーザーのログインを確認済み。"),
        (3, "5名分のアカウント作成完了。各ユーザーにパスワード通知済み。ライセンスも割当済みです。"),
        (4, "給紙ローラーの摩耗が原因と思われます。Canonサービスセンターに部品を発注しました。"),
        (4, "到着まで約3営業日。それまでは本社2Fの複合機を使用するよう案内済みです。"),
    ]
    for idx, content in comments:
        if idx < len(inc_ids) and inc_ids[idx]:
            body = {
                f"{PREFIX}_name": content[:200],
                f"{PREFIX}_content": content,
                f"{PREFIX}_incidentid@odata.bind": f"/{PREFIX}_incidents({inc_ids[idx]})",
            }
            api_post(f"{PREFIX}_incidentcomments", body)
            print(f"  コメント: [{idx}] {content[:50]}...")

    print("  デモデータ投入完了")

# ── Phase 1.6: ソリューション含有検証 + 追加 ─────────────

def ensure_solution_membership():
    """全テーブルがソリューションに含まれているか確認し、不足分を AddSolutionComponent で追加"""
    print("\n=== Phase 1.6: ソリューション含有検証 ===")

    sols = api_get("solutions", {"$filter": f"uniquename eq '{SOLUTION_NAME}'", "$select": "solutionid"})
    if not sols["value"]:
        print(f"  ❌ ソリューション '{SOLUTION_NAME}' が見つかりません")
        return
    sol_id = sols["value"][0]["solutionid"]

    comps = api_get("solutioncomponents",
                    {"$filter": f"_solutionid_value eq {sol_id} and componenttype eq 1",
                     "$select": "objectid"})
    existing_ids = {c["objectid"] for c in comps.get("value", [])}

    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            meta = api_get(f"EntityDefinitions(LogicalName='{logical}')",
                           {"$select": "MetadataId"})
            meta_id = meta["MetadataId"]
            if meta_id in existing_ids:
                print(f"  ✅ {logical}: ソリューション内に存在")
            else:
                print(f"  ➕ {logical}: ソリューションに追加中…")
                api_post("AddSolutionComponent", {
                    "ComponentId": meta_id,
                    "ComponentType": 1,
                    "SolutionUniqueName": SOLUTION_NAME,
                    "AddRequiredComponents": False,
                    "DoNotIncludeSubcomponents": False,
                })
                print(f"  ✅ {logical}: 追加完了")
        except Exception as e:
            print(f"  ❌ {logical}: {e}")

# ── Phase 1.7: テーブル検証 ───────────────────────────────

def verify_tables():
    print("\n=== Phase 1.7: テーブル検証 ===")
    table_sets = {
        f"{PREFIX}_incidentcategory": f"{PREFIX}_incidentcategories",
        f"{PREFIX}_priority": f"{PREFIX}_priorities",
        f"{PREFIX}_itasset": f"{PREFIX}_itassets",
        f"{PREFIX}_incident": f"{PREFIX}_incidents",
        f"{PREFIX}_incidentcomment": f"{PREFIX}_incidentcomments",
    }
    for logical, plural in table_sets.items():
        try:
            data = api_get(f"{plural}?$top=1&$select={PREFIX}_name")
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

    ensure_solution()
    create_tables()
    create_lookups()
    publish_all()
    localize_tables()
    publish_all()
    insert_demo_data()
    ensure_solution_membership()
    verify_tables()

    print("\n✅ Dataverse セットアップ完了!")
    print("次のステップ: Code Apps のデプロイ → npx power-apps add-data-source")


if __name__ == "__main__":
    main()
