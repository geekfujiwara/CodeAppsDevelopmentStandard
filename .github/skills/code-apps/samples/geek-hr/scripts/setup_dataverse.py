"""
Dataverse テーブル構築: 人事管理ポータル
=========================================
社員台帳・採用管理・評価管理アプリ用テーブル。
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
        "logical": f"{PREFIX}_employee",
        "display": "Employee",
        "plural":  "Employees",
        "description": "社員台帳テーブル",
        "columns": [
            {"logical": f"{PREFIX}_department",      "type": "String",   "display": "Department",      "maxLength": 200},
            {"logical": f"{PREFIX}_position",        "type": "String",   "display": "Position",        "maxLength": 200},
            {
                "logical": f"{PREFIX}_employment_type", "type": "Picklist", "display": "Employment Type",
                "options": [
                    (100000000, "Full-time"),
                    (100000001, "Contract"),
                    (100000002, "Part-time"),
                    (100000003, "Temp"),
                ],
            },
            {"logical": f"{PREFIX}_hire_date",       "type": "DateTime", "display": "Hire Date",       "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_status",       "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "Active"),
                    (100000001, "On Leave"),
                    (100000002, "Resigned"),
                ],
            },
            {"logical": f"{PREFIX}_email",           "type": "String",   "display": "Email",           "maxLength": 320},
            {"logical": f"{PREFIX}_phone",           "type": "String",   "display": "Phone",           "maxLength": 50},
            {"logical": f"{PREFIX}_notes",           "type": "Memo",     "display": "Notes",           "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_recruitment",
        "display": "Recruitment",
        "plural":  "Recruitments",
        "description": "採用ポジションテーブル",
        "columns": [
            {"logical": f"{PREFIX}_department",     "type": "String",   "display": "Department",     "maxLength": 200},
            {"logical": f"{PREFIX}_required_count", "type": "Integer",  "display": "Required Count", "minValue": 1, "maxValue": 999},
            {
                "logical": f"{PREFIX}_status",      "type": "Picklist", "display": "Status",
                "options": [
                    (100000000, "Open"),
                    (100000001, "Screening"),
                    (100000002, "Hired"),
                    (100000003, "Closed"),
                ],
            },
            {"logical": f"{PREFIX}_deadline",       "type": "DateTime", "display": "Deadline",       "format": "DateOnly"},
            {"logical": f"{PREFIX}_description",    "type": "Memo",     "display": "Description",    "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_candidate",
        "display": "Candidate",
        "plural":  "Candidates",
        "description": "採用候補者テーブル",
        "columns": [
            {"logical": f"{PREFIX}_full_name",      "type": "String",   "display": "Full Name",      "maxLength": 200},
            {
                "logical": f"{PREFIX}_stage",       "type": "Picklist", "display": "Stage",
                "options": [
                    (100000000, "Document Review"),
                    (100000001, "1st Interview"),
                    (100000002, "2nd Interview"),
                    (100000003, "Final Interview"),
                    (100000004, "Offer"),
                    (100000005, "Rejected"),
                ],
            },
            {"logical": f"{PREFIX}_score",          "type": "Integer",  "display": "Score",          "minValue": 0, "maxValue": 100},
            {"logical": f"{PREFIX}_interview_date", "type": "DateTime", "display": "Interview Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_notes",          "type": "Memo",     "display": "Notes",          "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_evaluation",
        "display": "Evaluation",
        "plural":  "Evaluations",
        "description": "社員評価テーブル",
        "columns": [
            {"logical": f"{PREFIX}_period",          "type": "String",   "display": "Period",          "maxLength": 100},
            {"logical": f"{PREFIX}_score",           "type": "Integer",  "display": "Score",           "minValue": 1, "maxValue": 5},
            {"logical": f"{PREFIX}_comment",         "type": "Memo",     "display": "Comment",         "maxLength": 4000},
            {"logical": f"{PREFIX}_evaluation_date", "type": "DateTime", "display": "Evaluation Date", "format": "DateOnly"},
        ],
    },
]

LOOKUPS = [
    {
        "from_table":     f"{PREFIX}_candidate",
        "to_table":       f"{PREFIX}_recruitment",
        "logical":        f"{PREFIX}_recruitment_id",
        "display":        "Recruitment Position",
        "description":    "候補者が応募しているポジション",
    },
    {
        "from_table":     f"{PREFIX}_evaluation",
        "to_table":       f"{PREFIX}_employee",
        "logical":        f"{PREFIX}_employee_id",
        "display":        "Employee",
        "description":    "評価対象の社員",
    },
]

LOCALIZE_TABLES = [
    (f"{PREFIX}_employee",   "社員台帳",     "社員台帳一覧"),
    (f"{PREFIX}_recruitment","採用ポジション","採用ポジション一覧"),
    (f"{PREFIX}_candidate",  "候補者",        "候補者一覧"),
    (f"{PREFIX}_evaluation", "評価",          "評価一覧"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_employee", f"{PREFIX}_name",            "氏名"),
    (f"{PREFIX}_employee", f"{PREFIX}_department",      "部門"),
    (f"{PREFIX}_employee", f"{PREFIX}_position",        "役職"),
    (f"{PREFIX}_employee", f"{PREFIX}_employment_type", "雇用形態"),
    (f"{PREFIX}_employee", f"{PREFIX}_hire_date",       "入社日"),
    (f"{PREFIX}_employee", f"{PREFIX}_status",          "在籍状況"),
    (f"{PREFIX}_employee", f"{PREFIX}_email",           "メールアドレス"),
    (f"{PREFIX}_employee", f"{PREFIX}_phone",           "電話番号"),
    (f"{PREFIX}_employee", f"{PREFIX}_notes",           "備考"),

    (f"{PREFIX}_recruitment", f"{PREFIX}_name",            "ポジション名"),
    (f"{PREFIX}_recruitment", f"{PREFIX}_department",      "部門"),
    (f"{PREFIX}_recruitment", f"{PREFIX}_required_count",  "募集人数"),
    (f"{PREFIX}_recruitment", f"{PREFIX}_status",          "ステータス"),
    (f"{PREFIX}_recruitment", f"{PREFIX}_deadline",        "締切日"),
    (f"{PREFIX}_recruitment", f"{PREFIX}_description",     "職務内容"),

    (f"{PREFIX}_candidate", f"{PREFIX}_name",           "氏名"),
    (f"{PREFIX}_candidate", f"{PREFIX}_full_name",      "氏名（フルネーム）"),
    (f"{PREFIX}_candidate", f"{PREFIX}_stage",          "選考ステージ"),
    (f"{PREFIX}_candidate", f"{PREFIX}_score",          "評価スコア"),
    (f"{PREFIX}_candidate", f"{PREFIX}_interview_date", "面接日"),
    (f"{PREFIX}_candidate", f"{PREFIX}_notes",          "メモ"),

    (f"{PREFIX}_evaluation", f"{PREFIX}_name",            "評価名"),
    (f"{PREFIX}_evaluation", f"{PREFIX}_period",          "評価期間"),
    (f"{PREFIX}_evaluation", f"{PREFIX}_score",           "スコア"),
    (f"{PREFIX}_evaluation", f"{PREFIX}_comment",         "コメント"),
    (f"{PREFIX}_evaluation", f"{PREFIX}_evaluation_date", "評価日"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_employee", f"{PREFIX}_employment_type", [
        (100000000, "正社員"),
        (100000001, "契約社員"),
        (100000002, "パート/アルバイト"),
        (100000003, "派遣"),
    ]),
    (f"{PREFIX}_employee", f"{PREFIX}_status", [
        (100000000, "在籍"),
        (100000001, "休職"),
        (100000002, "退職"),
    ]),
    (f"{PREFIX}_recruitment", f"{PREFIX}_status", [
        (100000000, "募集中"),
        (100000001, "選考中"),
        (100000002, "採用決定"),
        (100000003, "募集終了"),
    ]),
    (f"{PREFIX}_candidate", f"{PREFIX}_stage", [
        (100000000, "書類審査"),
        (100000001, "一次面接"),
        (100000002, "二次面接"),
        (100000003, "最終面接"),
        (100000004, "内定"),
        (100000005, "不採用"),
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


# ── Step 3: ルックアップ ──────────────────────────────────────

def create_lookups():
    print("\n=== Step 3: Lookups ===")
    for lk in LOOKUPS:
        logical = lk["logical"]
        try:
            api_get(f"EntityDefinitions(LogicalName='{lk['from_table']}')/Attributes(LogicalName='{logical}')?$select=LogicalName")
            print(f"  Lookup '{logical}' exists, skip")
            continue
        except Exception:
            pass
        def _add(l=lk):
            api_post(
                f"EntityDefinitions(LogicalName='{l['from_table']}')/Attributes",
                {
                    "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                    "SchemaName": l["logical"],
                    "DisplayName": label_jp(l["display"]),
                    "Description": label_jp(l["description"]),
                    "RequiredLevel": {"Value": "None"},
                    "Targets": [l["to_table"]],
                },
                solution=SOLUTION_NAME,
            )
            print(f"  Lookup '{l['logical']}' created")
        retry_metadata(_add, f"Lookup {logical}")
        time.sleep(5)


# ── Step 4: Publish ────────────────────────────────────────

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
    print("  Dataverse Setup: geek-hr 人事管理ポータル")
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
