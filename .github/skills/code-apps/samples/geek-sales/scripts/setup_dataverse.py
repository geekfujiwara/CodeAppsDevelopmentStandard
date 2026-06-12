"""
Dataverse テーブル構築: geek_conversationsummary
================================================
Copilot Studio 会話トランスクリプトの日次集計テーブル。
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

SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "").strip()
PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", SOLUTION_NAME)

if not all([DATAVERSE_URL, SOLUTION_NAME, PREFIX]):
    print("ERROR: DATAVERSE_URL / SOLUTION_NAME / PUBLISHER_PREFIX required in .env", file=sys.stderr)
    sys.exit(1)

# ════════════════════════════════════════════════════════════════
# テーブル定義
# ════════════════════════════════════════════════════════════════

TABLES = [
    {
        "logical": f"{PREFIX}_conversationsummary",
        "display": "Conversation Summary",
        "plural": "Conversation Summaries",
        "description": "Copilot Studio 会話トランスクリプトの集計サマリー（1会話=1行）",
        "columns": [
            {"logical": f"{PREFIX}_transcriptid", "type": "String", "display": "Transcript ID", "maxLength": 100},
            {"logical": f"{PREFIX}_botname", "type": "String", "display": "Bot Name", "maxLength": 200},
            {"logical": f"{PREFIX}_botid", "type": "String", "display": "Bot ID", "maxLength": 100},
            {"logical": f"{PREFIX}_starttime", "type": "DateTime", "display": "Start Time", "format": "DateAndTime"},
            {
                "logical": f"{PREFIX}_outcome", "type": "Picklist", "display": "Outcome",
                "options": [
                    (100000000, "Resolved"),
                    (100000001, "Abandoned"),
                    (100000002, "Escalated"),
                    (100000003, "None"),
                ],
            },
            {"logical": f"{PREFIX}_channel", "type": "String", "display": "Channel", "maxLength": 100},
            {"logical": f"{PREFIX}_usermsgcount", "type": "Integer", "display": "User Messages"},
            {"logical": f"{PREFIX}_botmsgcount", "type": "Integer", "display": "Bot Messages"},
            {"logical": f"{PREFIX}_tooleventcount", "type": "Integer", "display": "Tool Events"},
            {"logical": f"{PREFIX}_durationsec", "type": "Decimal", "display": "Duration (sec)", "precision": 1, "maxValue": 100000000},
            {"logical": f"{PREFIX}_toolservers", "type": "String", "display": "Tool Servers", "maxLength": 500},
            {"logical": f"{PREFIX}_firstusertext", "type": "Memo", "display": "First User Text", "maxLength": 4000},
        ],
    },
]

LOOKUPS = []

LOCALIZE_TABLES = [
    (f"{PREFIX}_conversationsummary", "会話サマリー", "会話サマリー"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_name", "名前"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_transcriptid", "トランスクリプトID"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_botname", "エージェント名"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_botid", "エージェントID"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_starttime", "開始日時"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_outcome", "結果"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_channel", "チャネル"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_usermsgcount", "ユーザーメッセージ数"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_botmsgcount", "Botメッセージ数"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_tooleventcount", "ツールイベント数"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_durationsec", "所要時間(秒)"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_toolservers", "ツールサーバー"),
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_firstusertext", "最初のユーザー発話"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_conversationsummary", f"{PREFIX}_outcome", [
        (100000000, "解決"),
        (100000001, "放棄"),
        (100000002, "エスカレーション"),
        (100000003, "なし"),
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
            "String": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "Memo": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
            "Picklist": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "DateTime": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            "Integer": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
            "Decimal": "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
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
    print("  Dataverse Setup: geek_conversationsummary")
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
