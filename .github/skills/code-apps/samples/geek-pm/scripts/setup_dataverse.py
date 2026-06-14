"""
Dataverse テーブル構築: {PREFIX}_project / {PREFIX}_task / {PREFIX}_member
==========================================================================
プロジェクト管理ポータル用テーブル。
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
    {
        "logical": f"{PREFIX}_project",
        "display": "Project",
        "plural":  "Projects",
        "description": "プロジェクト台帳",
        "columns": [
            {"logical": f"{PREFIX}_description", "type": "Memo",     "display": "Description", "maxLength": 4000},
            {"logical": f"{PREFIX}_start_date",  "type": "DateTime", "display": "Start Date",  "format": "DateOnly"},
            {"logical": f"{PREFIX}_end_date",    "type": "DateTime", "display": "End Date",    "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "Planning"),
                    (100000001, "In Progress"),
                    (100000002, "On Hold"),
                    (100000003, "Completed"),
                    (100000004, "Cancelled"),
                ],
            },
            {
                "logical": f"{PREFIX}_priority", "type": "Picklist", "display": "Priority",
                "options": [
                    (100000000, "Low"),
                    (100000001, "Medium"),
                    (100000002, "High"),
                    (100000003, "Critical"),
                ],
            },
            {"logical": f"{PREFIX}_owner",      "type": "String",   "display": "Owner",      "maxLength": 200},
            {"logical": f"{PREFIX}_department", "type": "String",   "display": "Department", "maxLength": 200},
            {"logical": f"{PREFIX}_notes",      "type": "Memo",     "display": "Notes",      "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_task",
        "display": "Task",
        "plural":  "Tasks",
        "description": "タスク管理",
        "columns": [
            {"logical": f"{PREFIX}_description",    "type": "Memo",     "display": "Description",    "maxLength": 4000},
            {"logical": f"{PREFIX}_assignee",       "type": "String",   "display": "Assignee",       "maxLength": 200},
            {"logical": f"{PREFIX}_start_date",     "type": "DateTime", "display": "Start Date",     "format": "DateOnly"},
            {"logical": f"{PREFIX}_due_date",       "type": "DateTime", "display": "Due Date",       "format": "DateOnly"},
            {"logical": f"{PREFIX}_completed_date", "type": "DateTime", "display": "Completed Date", "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "Not Started"),
                    (100000001, "In Progress"),
                    (100000002, "Completed"),
                    (100000003, "Cancelled"),
                    (100000004, "Blocked"),
                ],
            },
            {
                "logical": f"{PREFIX}_priority", "type": "Picklist", "display": "Priority",
                "options": [
                    (100000000, "Low"),
                    (100000001, "Medium"),
                    (100000002, "High"),
                    (100000003, "Critical"),
                ],
            },
            {"logical": f"{PREFIX}_progress", "type": "Integer", "display": "Progress", "minValue": 0, "maxValue": 100},
            {"logical": f"{PREFIX}_notes",    "type": "Memo",    "display": "Notes",    "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_member",
        "display": "Member",
        "plural":  "Members",
        "description": "プロジェクトメンバー",
        "columns": [
            {"logical": f"{PREFIX}_role",      "type": "String",   "display": "Role",      "maxLength": 200},
            {"logical": f"{PREFIX}_email",     "type": "String",   "display": "Email",     "maxLength": 200},
            {"logical": f"{PREFIX}_join_date", "type": "DateTime", "display": "Join Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_notes",     "type": "Memo",     "display": "Notes",     "maxLength": 4000},
        ],
    },
]

LOOKUPS = [
    {
        "from_table":     f"{PREFIX}_task",
        "column_logical": f"{PREFIX}_project_id",
        "display":        "Project",
        "to_table":       f"{PREFIX}_project",
    },
    {
        "from_table":     f"{PREFIX}_member",
        "column_logical": f"{PREFIX}_project_id",
        "display":        "Project",
        "to_table":       f"{PREFIX}_project",
    },
]

LOCALIZE_TABLES = [
    (f"{PREFIX}_project", "プロジェクト", "プロジェクト一覧"),
    (f"{PREFIX}_task",    "タスク",       "タスク一覧"),
    (f"{PREFIX}_member",  "メンバー",     "メンバー一覧"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_project", f"{PREFIX}_name",        "プロジェクト名"),
    (f"{PREFIX}_project", f"{PREFIX}_description", "説明"),
    (f"{PREFIX}_project", f"{PREFIX}_start_date",  "開始日"),
    (f"{PREFIX}_project", f"{PREFIX}_end_date",    "終了日"),
    (f"{PREFIX}_project", f"{PREFIX}_status",      "ステータス"),
    (f"{PREFIX}_project", f"{PREFIX}_priority",    "優先度"),
    (f"{PREFIX}_project", f"{PREFIX}_owner",       "オーナー"),
    (f"{PREFIX}_project", f"{PREFIX}_department",  "部門"),
    (f"{PREFIX}_project", f"{PREFIX}_notes",       "備考"),
    (f"{PREFIX}_task", f"{PREFIX}_name",           "タスク名"),
    (f"{PREFIX}_task", f"{PREFIX}_description",    "説明"),
    (f"{PREFIX}_task", f"{PREFIX}_assignee",       "担当者"),
    (f"{PREFIX}_task", f"{PREFIX}_start_date",     "開始日"),
    (f"{PREFIX}_task", f"{PREFIX}_due_date",       "期限"),
    (f"{PREFIX}_task", f"{PREFIX}_completed_date", "完了日"),
    (f"{PREFIX}_task", f"{PREFIX}_status",         "ステータス"),
    (f"{PREFIX}_task", f"{PREFIX}_priority",       "優先度"),
    (f"{PREFIX}_task", f"{PREFIX}_progress",       "進捗率"),
    (f"{PREFIX}_task", f"{PREFIX}_notes",          "備考"),
    (f"{PREFIX}_task", f"{PREFIX}_project_id",     "プロジェクト"),
    (f"{PREFIX}_member", f"{PREFIX}_name",         "メンバー名"),
    (f"{PREFIX}_member", f"{PREFIX}_role",         "役割"),
    (f"{PREFIX}_member", f"{PREFIX}_email",        "メール"),
    (f"{PREFIX}_member", f"{PREFIX}_join_date",    "参加日"),
    (f"{PREFIX}_member", f"{PREFIX}_notes",        "備考"),
    (f"{PREFIX}_member", f"{PREFIX}_project_id",   "プロジェクト"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_project", f"{PREFIX}_status", [
        (100000000, "計画中"), (100000001, "進行中"), (100000002, "保留"),
        (100000003, "完了"), (100000004, "中止"),
    ]),
    (f"{PREFIX}_project", f"{PREFIX}_priority", [
        (100000000, "低"), (100000001, "中"), (100000002, "高"), (100000003, "緊急"),
    ]),
    (f"{PREFIX}_task", f"{PREFIX}_status", [
        (100000000, "未着手"), (100000001, "進行中"), (100000002, "完了"),
        (100000003, "中止"), (100000004, "ブロック中"),
    ]),
    (f"{PREFIX}_task", f"{PREFIX}_priority", [
        (100000000, "低"), (100000001, "中"), (100000002, "高"), (100000003, "緊急"),
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
        base["Format"] = "None"
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


# ── Step 3: Lookups ──────────────────────────────────────────

def create_lookups():
    print("\n=== Step 3: Lookups ===")
    for lk in LOOKUPS:
        col_logical = lk["column_logical"]
        from_table  = lk["from_table"]
        to_table    = lk["to_table"]
        try:
            api_get(f"EntityDefinitions(LogicalName='{from_table}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName")
            print(f"  Lookup '{col_logical}' exists, skip")
            continue
        except Exception:
            pass
        def _add_lookup(l=lk):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.CreateOneToManyRequest",
                "OneToManyRelationship": {
                    "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                    "ReferencedEntity": l["to_table"],
                    "ReferencingEntity": l["from_table"],
                    "SchemaName": f"{l['from_table']}_{l['column_logical']}",
                    "ReferencingAttribute": l["column_logical"],
                },
                "Lookup": {
                    "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                    "SchemaName": l["column_logical"],
                    "DisplayName": label_jp(l["display"]),
                    "RequiredLevel": {"Value": "None"},
                },
            }
            api_post("CreateOneToMany", body, solution=SOLUTION_NAME)
            print(f"  Lookup '{col_logical}' created")
        retry_metadata(_add_lookup, f"Lookup {col_logical}")
        time.sleep(5)


# ── Step 4: Publish ──────────────────────────────────────────

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
            "Lookup":   "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
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
    print("  Dataverse Setup: geek-pm プロジェクト管理ポータル")
    print("=" * 60)
    print(f"  Env: {DATAVERSE_URL}")
    print(f"  Solution: {SOLUTION_NAME}")
    print(f"  Prefix: {PREFIX}")

    ensure_solution()
    create_tables()
    create_lookups()
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
