"""
Dataverse テーブル構築: {PREFIX}_asset / {PREFIX}_loan / {PREFIX}_disposal / {PREFIX}_inventory_check
=========================================
資産管理ポータルアプリ用テーブル。
"""
import os
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auth_helper import (
    api_get, api_post, api_patch, api_delete, api_request,
    retry_metadata, DATAVERSE_URL,
)

SOLUTION_NAME         = os.environ.get("SOLUTION_NAME", "").strip()
PREFIX                = os.environ.get("PUBLISHER_PREFIX", "").strip()
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", SOLUTION_NAME)

if not all([DATAVERSE_URL, SOLUTION_NAME, PREFIX]):
    print("ERROR: DATAVERSE_URL / SOLUTION_NAME / PUBLISHER_PREFIX required in .env", file=sys.stderr)
    sys.exit(1)

# ════════════════════════════════════════════════════════════════
# テーブル定義
# ════════════════════════════════════════════════════════════════

TABLES = [
    # ── 資産台帳 ─────────────────────────────────────────────
    {
        "logical": f"{PREFIX}_asset",
        "display": "Asset",
        "plural":  "Assets",
        "description": "IT資産・備品管理テーブル",
        "columns": [
            {"logical": f"{PREFIX}_asset_name",     "type": "String",   "display": "Asset Name",     "maxLength": 200},
            {"logical": f"{PREFIX}_asset_number",   "type": "String",   "display": "Asset Number",   "maxLength": 100},
            {
                "logical": f"{PREFIX}_category",    "type": "Picklist", "display": "Category",
                "options": [
                    (100000000, "PC"),
                    (100000001, "Laptop"),
                    (100000002, "Monitor"),
                    (100000003, "Smartphone"),
                    (100000004, "Tablet"),
                    (100000005, "Peripheral"),
                    (100000006, "Office Equipment"),
                    (100000007, "Other"),
                ],
            },
            {"logical": f"{PREFIX}_serial_number",  "type": "String",   "display": "Serial Number",  "maxLength": 200},
            {"logical": f"{PREFIX}_purchase_date",  "type": "DateTime", "display": "Purchase Date",  "format": "DateOnly"},
            {"logical": f"{PREFIX}_purchase_price", "type": "Decimal",  "display": "Purchase Price", "precision": 2, "maxValue": 100000000000},
            {
                "logical": f"{PREFIX}_status",      "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "In Use"),
                    (100000001, "On Loan"),
                    (100000002, "Stored"),
                    (100000003, "Under Repair"),
                    (100000004, "Disposed"),
                ],
            },
            {"logical": f"{PREFIX}_location",       "type": "String",   "display": "Location",       "maxLength": 200},
            {"logical": f"{PREFIX}_department",     "type": "String",   "display": "Department",     "maxLength": 200},
            {"logical": f"{PREFIX}_notes",          "type": "Memo",     "display": "Notes",          "maxLength": 4000},
        ],
    },
    # ── 貸出管理 ─────────────────────────────────────────────
    {
        "logical": f"{PREFIX}_loan",
        "display": "Loan",
        "plural":  "Loans",
        "description": "資産貸出管理テーブル",
        "columns": [
            {"logical": f"{PREFIX}_asset_name",      "type": "String",   "display": "Asset Name",      "maxLength": 200},
            {"logical": f"{PREFIX}_borrower_name",   "type": "String",   "display": "Borrower Name",   "maxLength": 200},
            {"logical": f"{PREFIX}_loan_date",       "type": "DateTime", "display": "Loan Date",       "format": "DateOnly"},
            {"logical": f"{PREFIX}_return_due_date", "type": "DateTime", "display": "Return Due Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_return_date",     "type": "DateTime", "display": "Return Date",     "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_status",       "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "On Loan"),
                    (100000001, "Returned"),
                    (100000002, "Overdue"),
                ],
            },
            {"logical": f"{PREFIX}_notes",           "type": "Memo",     "display": "Notes",           "maxLength": 4000},
        ],
    },
    # ── 廃棄管理 ─────────────────────────────────────────────
    {
        "logical": f"{PREFIX}_disposal",
        "display": "Disposal",
        "plural":  "Disposals",
        "description": "資産廃棄管理テーブル",
        "columns": [
            {"logical": f"{PREFIX}_asset_name",    "type": "String",   "display": "Asset Name",    "maxLength": 200},
            {"logical": f"{PREFIX}_disposal_date", "type": "DateTime", "display": "Disposal Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_reason",        "type": "Memo",     "display": "Reason",        "maxLength": 2000},
            {
                "logical": f"{PREFIX}_status",     "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "Pending"),
                    (100000001, "Approved"),
                    (100000002, "Completed"),
                ],
            },
            {"logical": f"{PREFIX}_notes",         "type": "Memo",     "display": "Notes",         "maxLength": 4000},
        ],
    },
    # ── 棚卸 ─────────────────────────────────────────────────
    {
        "logical": f"{PREFIX}_inventory_check",
        "display": "Inventory Check",
        "plural":  "Inventory Checks",
        "description": "資産棚卸管理テーブル",
        "columns": [
            {"logical": f"{PREFIX}_asset_name", "type": "String",   "display": "Asset Name", "maxLength": 200},
            {"logical": f"{PREFIX}_check_date", "type": "DateTime", "display": "Check Date", "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_result",  "type": "Picklist", "display": "Result",
                "options": [
                    (100000000, "Confirmed"),
                    (100000001, "Unknown"),
                    (100000002, "Lost"),
                ],
            },
            {"logical": f"{PREFIX}_checker",    "type": "String",   "display": "Checker",    "maxLength": 200},
            {"logical": f"{PREFIX}_notes",      "type": "Memo",     "display": "Notes",      "maxLength": 4000},
        ],
    },
]

LOOKUPS = []

LOCALIZE_TABLES = [
    (f"{PREFIX}_asset",           "資産台帳",   "資産台帳一覧"),
    (f"{PREFIX}_loan",            "貸出管理",   "貸出管理一覧"),
    (f"{PREFIX}_disposal",        "廃棄管理",   "廃棄管理一覧"),
    (f"{PREFIX}_inventory_check", "棚卸",       "棚卸一覧"),
]

LOCALIZE_COLUMNS = [
    # Asset
    (f"{PREFIX}_asset", f"{PREFIX}_name",           "件名"),
    (f"{PREFIX}_asset", f"{PREFIX}_asset_name",     "資産名"),
    (f"{PREFIX}_asset", f"{PREFIX}_asset_number",   "資産番号"),
    (f"{PREFIX}_asset", f"{PREFIX}_category",       "カテゴリ"),
    (f"{PREFIX}_asset", f"{PREFIX}_serial_number",  "シリアル番号"),
    (f"{PREFIX}_asset", f"{PREFIX}_purchase_date",  "購入日"),
    (f"{PREFIX}_asset", f"{PREFIX}_purchase_price", "購入価格"),
    (f"{PREFIX}_asset", f"{PREFIX}_status",         "ステータス"),
    (f"{PREFIX}_asset", f"{PREFIX}_location",       "場所"),
    (f"{PREFIX}_asset", f"{PREFIX}_department",     "部門"),
    (f"{PREFIX}_asset", f"{PREFIX}_notes",          "備考"),
    # Loan
    (f"{PREFIX}_loan",  f"{PREFIX}_name",            "件名"),
    (f"{PREFIX}_loan",  f"{PREFIX}_asset_name",      "資産名"),
    (f"{PREFIX}_loan",  f"{PREFIX}_borrower_name",   "借用者"),
    (f"{PREFIX}_loan",  f"{PREFIX}_loan_date",       "貸出日"),
    (f"{PREFIX}_loan",  f"{PREFIX}_return_due_date", "返却期限"),
    (f"{PREFIX}_loan",  f"{PREFIX}_return_date",     "返却日"),
    (f"{PREFIX}_loan",  f"{PREFIX}_status",          "ステータス"),
    (f"{PREFIX}_loan",  f"{PREFIX}_notes",           "備考"),
    # Disposal
    (f"{PREFIX}_disposal", f"{PREFIX}_name",          "件名"),
    (f"{PREFIX}_disposal", f"{PREFIX}_asset_name",    "資産名"),
    (f"{PREFIX}_disposal", f"{PREFIX}_disposal_date", "廃棄予定日"),
    (f"{PREFIX}_disposal", f"{PREFIX}_reason",        "廃棄理由"),
    (f"{PREFIX}_disposal", f"{PREFIX}_status",        "ステータス"),
    (f"{PREFIX}_disposal", f"{PREFIX}_notes",         "備考"),
    # InventoryCheck
    (f"{PREFIX}_inventory_check", f"{PREFIX}_name",       "件名"),
    (f"{PREFIX}_inventory_check", f"{PREFIX}_asset_name", "資産名"),
    (f"{PREFIX}_inventory_check", f"{PREFIX}_check_date", "確認日"),
    (f"{PREFIX}_inventory_check", f"{PREFIX}_result",     "結果"),
    (f"{PREFIX}_inventory_check", f"{PREFIX}_checker",    "担当者"),
    (f"{PREFIX}_inventory_check", f"{PREFIX}_notes",      "備考"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_asset", f"{PREFIX}_category", [
        (100000000, "PC"),
        (100000001, "ノートPC"),
        (100000002, "モニター"),
        (100000003, "スマートフォン"),
        (100000004, "タブレット"),
        (100000005, "周辺機器"),
        (100000006, "オフィス備品"),
        (100000007, "その他"),
    ]),
    (f"{PREFIX}_asset", f"{PREFIX}_status", [
        (100000000, "使用中"),
        (100000001, "貸出中"),
        (100000002, "保管中"),
        (100000003, "修理中"),
        (100000004, "廃棄済み"),
    ]),
    (f"{PREFIX}_loan", f"{PREFIX}_status", [
        (100000000, "貸出中"),
        (100000001, "返却済み"),
        (100000002, "延滞"),
    ]),
    (f"{PREFIX}_disposal", f"{PREFIX}_status", [
        (100000000, "申請中"),
        (100000001, "承認済み"),
        (100000002, "廃棄完了"),
    ]),
    (f"{PREFIX}_inventory_check", f"{PREFIX}_result", [
        (100000000, "確認済み"),
        (100000001, "不明"),
        (100000002, "紛失"),
    ]),
]


# ── 共通ヘルパー ─────────────────────────────────────────────

def label_jp(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}

def _save_env_value(key, value):
    env_path = Path(__file__).resolve().parents[1] / ".env"
    lines = []
    found = False
    if env_path.exists():
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

def get_entity_set_name(logical_name):
    meta = api_get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=EntitySetName")
    return meta["EntitySetName"]


# ── Step 1: ソリューション ──────────────────────────────────

def ensure_solution():
    global SOLUTION_DISPLAY_NAME
    print("\n=== Step 1: Solution ===")
    existing = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")
    if existing.get("value"):
        dn = existing["value"][0].get("friendlyname", SOLUTION_DISPLAY_NAME)
        print(f"  Exists: {SOLUTION_NAME} ({dn})")
        SOLUTION_DISPLAY_NAME = dn
        _save_env_value("SOLUTION_DISPLAY_NAME", dn)
        return
    print(f"  Creating '{SOLUTION_NAME}'...")
    pubs = api_get(f"publishers?$filter=customizationprefix eq '{PREFIX}'&$select=publisherid")
    if not pubs.get("value"):
        raise RuntimeError(f"Publisher prefix='{PREFIX}' not found")
    pub_id = pubs["value"][0]["publisherid"]
    api_post("solutions", {
        "uniquename": SOLUTION_NAME,
        "friendlyname": SOLUTION_DISPLAY_NAME,
        "version": "1.0.0.0",
        "publisherid@odata.bind": f"/publishers({pub_id})",
    })
    _save_env_value("SOLUTION_DISPLAY_NAME", SOLUTION_DISPLAY_NAME)
    print(f"  Created: {SOLUTION_DISPLAY_NAME}")


# ── Step 2: テーブル ─────────────────────────────────────────

def build_column_body(col):
    base = {
        "SchemaName": col["logical"],
        "DisplayName": label_jp(col["display"]),
        "RequiredLevel": {"Value": "None"},
    }
    t = col["type"]
    if t == "Memo":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        base["Format"] = "Text"
        base["MaxLength"] = col.get("maxLength", 2000)
    elif t == "Picklist":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": False, "OptionSetType": "Picklist",
            "Options": [{"Value": v, "Label": label_jp(lbl)} for v, lbl in col["options"]],
        }
    elif t == "DateTime":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        base["Format"] = col.get("format", "DateAndTime")
    elif t == "String":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.StringAttributeMetadata"
        base["FormatName"] = {"Value": "Text"}
        base["MaxLength"] = col.get("maxLength", 200)
    elif t == "Integer":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 100000)
    elif t == "Decimal":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        base["Precision"] = col.get("precision", 2)
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 100000000000)
    return base


def create_tables():
    print("\n=== Step 2: Tables ===")
    for tbl in TABLES:
        logical = tbl["logical"]
        def _create(t=tbl):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                "SchemaName": t["logical"],
                "DisplayName": label_jp(t["display"]),
                "DisplayCollectionName": label_jp(t["plural"]),
                "Description": label_jp(t["description"]),
                "OwnershipType": "UserOwned",
                "IsActivity": False, "HasActivities": False,
                "HasNotes": False, "HasFeedback": False,
                "PrimaryNameAttribute": f"{PREFIX}_name",
                "Attributes": [{
                    "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                    "SchemaName": f"{PREFIX}_name",
                    "DisplayName": label_jp("Name"),
                    "IsPrimaryName": True,
                    "RequiredLevel": {"Value": "ApplicationRequired"},
                    "FormatName": {"Value": "Text"},
                    "MaxLength": 200,
                }],
            }
            api_post("EntityDefinitions", body, solution=SOLUTION_NAME)
            print(f"  Table '{logical}' created")
        retry_metadata(_create, f"Table {logical}")
        time.sleep(10)

        for col in tbl.get("columns", []):
            col_logical = col["logical"]
            try:
                api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName")
                print(f"    Column '{col_logical}' exists, skip")
                continue
            except Exception:
                pass
            def _add(c=col, ln=logical):
                api_post(f"EntityDefinitions(LogicalName='{ln}')/Attributes", build_column_body(c), solution=SOLUTION_NAME)
                print(f"    Column '{c['logical']}' added")
            retry_metadata(_add, f"Column {col_logical}")
            time.sleep(5)


# ── Step 3-4: Publish ────────────────────────────────────────

def publish_all():
    print("\n  Publishing...")
    api_post("PublishAllXml", {})
    print("  Published")


# ── Step 5: Localize ─────────────────────────────────────────

def localize():
    print("\n=== Step 5: Localize ===")
    for logical, disp, plural in LOCALIZE_TABLES:
        data = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
        mid = data["MetadataId"]
        api_request(f"EntityDefinitions({mid})", {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
            "DisplayCollectionName": label_jp(plural),
        }, method="PUT")
        print(f"  Table '{logical}' -> '{disp}'")

    for table, col, disp in LOCALIZE_COLUMNS:
        data = api_get(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{col}')?$select=MetadataId,AttributeType")
        mid = data["MetadataId"]
        odata_map = {
            "String":   "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "Memo":     "#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
            "Picklist": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "DateTime": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            "Integer":  "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
            "Decimal":  "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
        }
        ot = odata_map.get(data.get("AttributeType", ""), "#Microsoft.Dynamics.CRM.AttributeMetadata")
        api_request(f"EntityDefinitions(LogicalName='{table}')/Attributes({mid})", {
            "@odata.type": ot, "MetadataId": mid, "DisplayName": label_jp(disp),
        }, method="PUT")
        print(f"  Column '{table}.{col}' -> '{disp}'")

    for table, col, options in LOCALIZE_OPTIONS:
        for value, label_text in options:
            api_post("UpdateOptionValue", {
                "EntityLogicalName": table, "AttributeLogicalName": col,
                "Value": value, "Label": label_jp(label_text), "MergeLabels": True,
            })
            print(f"    Option {col}={value} -> '{label_text}'")


# ── Step 7: Solution membership ──────────────────────────────

def ensure_solution_membership():
    print("\n=== Step 7: Solution membership ===")
    sols = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid")
    if not sols.get("value"):
        print("  Solution not found!"); return
    sol_id = sols["value"][0]["solutionid"]
    comps = api_get(f"solutioncomponents?$filter=_solutionid_value eq {sol_id} and componenttype eq 1&$select=objectid")
    existing_ids = {c["objectid"] for c in comps.get("value", [])}
    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            meta = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
            mid = meta["MetadataId"]
            if mid in existing_ids:
                print(f"  OK: {logical}")
            else:
                api_post("AddSolutionComponent", {
                    "ComponentId": mid, "ComponentType": 1,
                    "SolutionUniqueName": SOLUTION_NAME,
                    "AddRequiredComponents": False, "DoNotIncludeSubcomponents": False,
                })
                print(f"  Added: {logical}")
        except Exception as e:
            print(f"  ERR: {logical}: {e}")


# ── Step 8: Verify ───────────────────────────────────────────

def verify():
    print("\n=== Step 8: Verify ===")
    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            eset = get_entity_set_name(logical)
            data = api_get(f"{eset}?$top=1&$select={PREFIX}_name")
            print(f"  OK: {logical} ({eset}) rows={len(data.get('value', []))}")
        except Exception as e:
            print(f"  FAIL: {logical}: {e}")


# ── Main ─────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Dataverse Setup: geek-asset 資産管理ポータル")
    print("=" * 60)
    print(f"  Env: {DATAVERSE_URL}")
    print(f"  Solution: {SOLUTION_NAME}")
    print(f"  Prefix: {PREFIX}")

    ensure_solution()
    create_tables()
    publish_all()
    localize()
    publish_all()
    ensure_solution_membership()
    verify()

    print("\n=== DONE ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nERROR: {e}")
        traceback.print_exc()
        sys.exit(1)
