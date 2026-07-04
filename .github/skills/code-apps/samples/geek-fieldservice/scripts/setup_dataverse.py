"""
Dataverse テーブル構築: {PREFIX}_equipment / {PREFIX}_work_order / {PREFIX}_schedule
=========================================
設備保全管理ポータルアプリ用テーブル。
"""
import os, sys, time, traceback
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auth_helper import api_get, api_post, api_request, retry_metadata, DATAVERSE_URL

SOLUTION_NAME         = os.environ.get("SOLUTION_NAME", "").strip()
PREFIX                = os.environ.get("PUBLISHER_PREFIX", "").strip()
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", SOLUTION_NAME)
if not all([DATAVERSE_URL, SOLUTION_NAME, PREFIX]):
    print("ERROR: DATAVERSE_URL / SOLUTION_NAME / PUBLISHER_PREFIX required", file=sys.stderr); sys.exit(1)

TABLES = [
    {
        "logical": f"{PREFIX}_equipment", "display": "Equipment", "plural": "Equipment", "description": "設備マスタ",
        "columns": [
            {"logical": f"{PREFIX}_equipment_code", "type": "String",   "display": "Equipment Code", "maxLength": 100},
            {"logical": f"{PREFIX}_category",       "type": "String",   "display": "Category",       "maxLength": 200},
            {"logical": f"{PREFIX}_location",       "type": "String",   "display": "Location",       "maxLength": 200},
            {"logical": f"{PREFIX}_manufacturer",   "type": "String",   "display": "Manufacturer",   "maxLength": 200},
            {"logical": f"{PREFIX}_model",          "type": "String",   "display": "Model",          "maxLength": 200},
            {"logical": f"{PREFIX}_install_date",   "type": "DateTime", "display": "Install Date",   "format": "DateOnly"},
            {"logical": f"{PREFIX}_status",         "type": "Picklist", "display": "Status",
             "options": [(100000000,"Active"),(100000001,"Inactive"),(100000002,"Under Repair"),(100000003,"Disposed")]},
            {"logical": f"{PREFIX}_notes",          "type": "Memo",     "display": "Notes",          "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_work_order", "display": "Work Order", "plural": "Work Orders", "description": "作業指示",
        "columns": [
            {"logical": f"{PREFIX}_work_type",      "type": "Picklist", "display": "Work Type",
             "options": [(100000000,"Inspection"),(100000001,"Repair"),(100000002,"Emergency"),(100000003,"Other")]},
            {"logical": f"{PREFIX}_priority",       "type": "Picklist", "display": "Priority",
             "options": [(100000000,"Low"),(100000001,"Medium"),(100000002,"High"),(100000003,"Critical")]},
            {"logical": f"{PREFIX}_status",         "type": "Picklist", "display": "Status",
             "options": [(100000000,"Not Started"),(100000001,"In Progress"),(100000002,"Completed"),(100000003,"On Hold")]},
            {"logical": f"{PREFIX}_assignee",       "type": "String",   "display": "Assignee",       "maxLength": 200},
            {"logical": f"{PREFIX}_planned_date",   "type": "DateTime", "display": "Planned Date",   "format": "DateOnly"},
            {"logical": f"{PREFIX}_completed_date", "type": "DateTime", "display": "Completed Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_description",    "type": "Memo",     "display": "Description",    "maxLength": 4000},
            {"logical": f"{PREFIX}_notes",          "type": "Memo",     "display": "Notes",          "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_schedule", "display": "Maintenance Schedule", "plural": "Maintenance Schedules", "description": "点検スケジュール",
        "columns": [
            {"logical": f"{PREFIX}_inspection_type", "type": "String",   "display": "Inspection Type", "maxLength": 200},
            {"logical": f"{PREFIX}_period",          "type": "Picklist", "display": "Period",
             "options": [(100000000,"Weekly"),(100000001,"Monthly"),(100000002,"Quarterly"),(100000003,"Semi-Annual"),(100000004,"Annual")]},
            {"logical": f"{PREFIX}_next_date",       "type": "DateTime", "display": "Next Date",       "format": "DateOnly"},
            {"logical": f"{PREFIX}_notes",           "type": "Memo",     "display": "Notes",           "maxLength": 4000},
        ],
    },
]

LOOKUPS = [
    {"from_table": f"{PREFIX}_work_order", "column_logical": f"{PREFIX}_equipment_id", "display": "Equipment", "to_table": f"{PREFIX}_equipment"},
    {"from_table": f"{PREFIX}_schedule",   "column_logical": f"{PREFIX}_equipment_id", "display": "Equipment", "to_table": f"{PREFIX}_equipment"},
]

LOCALIZE_TABLES = [
    (f"{PREFIX}_equipment",  "設備マスタ",       "設備マスタ一覧"),
    (f"{PREFIX}_work_order", "作業指示",         "作業指示一覧"),
    (f"{PREFIX}_schedule",   "点検スケジュール", "点検スケジュール一覧"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_equipment", f"{PREFIX}_name",           "設備名"),
    (f"{PREFIX}_equipment", f"{PREFIX}_equipment_code", "設備コード"),
    (f"{PREFIX}_equipment", f"{PREFIX}_category",       "カテゴリ"),
    (f"{PREFIX}_equipment", f"{PREFIX}_location",       "設置場所"),
    (f"{PREFIX}_equipment", f"{PREFIX}_manufacturer",   "メーカー"),
    (f"{PREFIX}_equipment", f"{PREFIX}_model",          "モデル"),
    (f"{PREFIX}_equipment", f"{PREFIX}_install_date",   "設置日"),
    (f"{PREFIX}_equipment", f"{PREFIX}_status",         "ステータス"),
    (f"{PREFIX}_equipment", f"{PREFIX}_notes",          "備考"),
    (f"{PREFIX}_work_order", f"{PREFIX}_name",            "件名"),
    (f"{PREFIX}_work_order", f"{PREFIX}_equipment_id",    "設備"),
    (f"{PREFIX}_work_order", f"{PREFIX}_work_type",       "作業種別"),
    (f"{PREFIX}_work_order", f"{PREFIX}_priority",        "優先度"),
    (f"{PREFIX}_work_order", f"{PREFIX}_status",          "ステータス"),
    (f"{PREFIX}_work_order", f"{PREFIX}_assignee",        "担当者"),
    (f"{PREFIX}_work_order", f"{PREFIX}_planned_date",    "予定日"),
    (f"{PREFIX}_work_order", f"{PREFIX}_completed_date",  "完了日"),
    (f"{PREFIX}_work_order", f"{PREFIX}_description",     "作業内容"),
    (f"{PREFIX}_work_order", f"{PREFIX}_notes",           "備考"),
    (f"{PREFIX}_schedule", f"{PREFIX}_name",            "件名"),
    (f"{PREFIX}_schedule", f"{PREFIX}_equipment_id",    "設備"),
    (f"{PREFIX}_schedule", f"{PREFIX}_inspection_type", "点検種別"),
    (f"{PREFIX}_schedule", f"{PREFIX}_period",          "周期"),
    (f"{PREFIX}_schedule", f"{PREFIX}_next_date",       "次回点検日"),
    (f"{PREFIX}_schedule", f"{PREFIX}_notes",           "備考"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_equipment", f"{PREFIX}_status", [
        (100000000,"稼働中"),(100000001,"停止中"),(100000002,"修理中"),(100000003,"廃棄"),
    ]),
    (f"{PREFIX}_work_order", f"{PREFIX}_work_type", [
        (100000000,"定期点検"),(100000001,"修理"),(100000002,"緊急対応"),(100000003,"その他"),
    ]),
    (f"{PREFIX}_work_order", f"{PREFIX}_priority", [
        (100000000,"低"),(100000001,"中"),(100000002,"高"),(100000003,"緊急"),
    ]),
    (f"{PREFIX}_work_order", f"{PREFIX}_status", [
        (100000000,"未着手"),(100000001,"作業中"),(100000002,"完了"),(100000003,"保留"),
    ]),
    (f"{PREFIX}_schedule", f"{PREFIX}_period", [
        (100000000,"週次"),(100000001,"月次"),(100000002,"四半期"),(100000003,"半年"),(100000004,"年次"),
    ]),
]

def label_jp(text): return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}
def _save_env_value(key, value):
    env_path = Path(__file__).resolve().parents[1] / ".env"
    lines = []
    found = False
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f: lines = f.readlines()
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"; found = True; break
    if not found: lines.append(f"{key}={value}\n")
    with open(env_path, "w", encoding="utf-8") as f: f.writelines(lines)

def get_entity_set_name(ln):
    return api_get(f"EntityDefinitions(LogicalName='{ln}')?$select=EntitySetName")["EntitySetName"]

def ensure_solution():
    global SOLUTION_DISPLAY_NAME
    print("\n=== Step 1: Solution ===")
    existing = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")
    if existing.get("value"):
        dn = existing["value"][0].get("friendlyname", SOLUTION_DISPLAY_NAME)
        print(f"  Exists: {SOLUTION_NAME} ({dn})"); SOLUTION_DISPLAY_NAME = dn; _save_env_value("SOLUTION_DISPLAY_NAME", dn); return
    pubs = api_get(f"publishers?$filter=customizationprefix eq '{PREFIX}'&$select=publisherid")
    if not pubs.get("value"): raise RuntimeError(f"Publisher prefix='{PREFIX}' not found")
    api_post("solutions", {"uniquename": SOLUTION_NAME, "friendlyname": SOLUTION_DISPLAY_NAME, "version": "1.0.0.0",
                           "publisherid@odata.bind": f"/publishers({pubs['value'][0]['publisherid']})"})
    _save_env_value("SOLUTION_DISPLAY_NAME", SOLUTION_DISPLAY_NAME); print(f"  Created: {SOLUTION_DISPLAY_NAME}")

def build_column_body(col):
    base = {"SchemaName": col["logical"], "DisplayName": label_jp(col["display"]), "RequiredLevel": {"Value": "None"}}
    t = col["type"]
    if t == "Memo":   base.update({"@odata.type":"#Microsoft.Dynamics.CRM.MemoAttributeMetadata","Format":"Text","MaxLength":col.get("maxLength",2000)})
    elif t == "Picklist": base.update({"@odata.type":"#Microsoft.Dynamics.CRM.PicklistAttributeMetadata","OptionSet":{"@odata.type":"#Microsoft.Dynamics.CRM.OptionSetMetadata","IsGlobal":False,"OptionSetType":"Picklist","Options":[{"Value":v,"Label":label_jp(l)} for v,l in col["options"]]}})
    elif t == "DateTime": base.update({"@odata.type":"#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata","Format":col.get("format","DateAndTime")})
    elif t == "String":   base.update({"@odata.type":"#Microsoft.Dynamics.CRM.StringAttributeMetadata","FormatName":{"Value":"Text"},"MaxLength":col.get("maxLength",200)})
    elif t == "Integer":  base.update({"@odata.type":"#Microsoft.Dynamics.CRM.IntegerAttributeMetadata","MinValue":col.get("minValue",0),"MaxValue":col.get("maxValue",100000)})
    elif t == "Decimal":  base.update({"@odata.type":"#Microsoft.Dynamics.CRM.DecimalAttributeMetadata","Precision":col.get("precision",2),"MinValue":col.get("minValue",0),"MaxValue":col.get("maxValue",100000000000)})
    return base

def create_tables():
    print("\n=== Step 2: Tables ===")
    for tbl in TABLES:
        logical = tbl["logical"]
        def _create(t=tbl):
            api_post("EntityDefinitions", {
                "@odata.type":"#Microsoft.Dynamics.CRM.EntityMetadata","SchemaName":t["logical"],
                "DisplayName":label_jp(t["display"]),"DisplayCollectionName":label_jp(t["plural"]),
                "Description":label_jp(t["description"]),"OwnershipType":"UserOwned",
                "IsActivity":False,"HasActivities":False,"HasNotes":False,"HasFeedback":False,
                "PrimaryNameAttribute":f"{PREFIX}_name",
                "Attributes":[{"@odata.type":"#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                    "SchemaName":f"{PREFIX}_name","DisplayName":label_jp("Name"),"IsPrimaryName":True,
                    "RequiredLevel":{"Value":"ApplicationRequired"},"FormatName":{"Value":"Text"},"MaxLength":200}],
            }, solution=SOLUTION_NAME)
            print(f"  Table '{logical}' created")
        retry_metadata(_create, f"Table {logical}"); time.sleep(10)
        for col in tbl.get("columns", []):
            cl = col["logical"]
            try: api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{cl}')?$select=LogicalName"); print(f"    Column '{cl}' exists, skip"); continue
            except: pass
            def _add(c=col, ln=logical):
                api_post(f"EntityDefinitions(LogicalName='{ln}')/Attributes", build_column_body(c), solution=SOLUTION_NAME); print(f"    Column '{c['logical']}' added")
            retry_metadata(_add, f"Column {cl}"); time.sleep(5)

def create_lookups():
    print("\n=== Step 3: Lookups ===")
    for lk in LOOKUPS:
        ft, cl, tt, d = lk["from_table"], lk["column_logical"], lk["to_table"], lk["display"]
        try: api_get(f"EntityDefinitions(LogicalName='{ft}')/Attributes(LogicalName='{cl}')?$select=LogicalName"); print(f"  Lookup '{cl}' exists, skip"); continue
        except: pass
        def _lk(fft=ft, ccl=cl, ttt=tt, dd=d):
            api_post("CreateOneToManyRelationship", {
                "@odata.type":"#Microsoft.Dynamics.CRM.CreateOneToManyRequest",
                "OneToManyRelationship":{"@odata.type":"#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                    "SchemaName":f"{ccl}_rel","ReferencedEntity":ttt,"ReferencingEntity":fft,
                    "Lookup":{"@odata.type":"#Microsoft.Dynamics.CRM.LookupAttributeMetadata","SchemaName":ccl,
                        "DisplayName":{"LocalizedLabels":[{"Label":dd,"LanguageCode":1033}]},"RequiredLevel":{"Value":"None"}}},
            }, solution=SOLUTION_NAME); print(f"  Lookup '{ccl}' -> '{ttt}' created")
        retry_metadata(_lk, f"Lookup {cl}"); time.sleep(10)

def publish_all():
    print("\n  Publishing..."); api_post("PublishAllXml", {}); print("  Published")

def localize():
    print("\n=== Step 5: Localize ===")
    for logical, disp, plural in LOCALIZE_TABLES:
        mid = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")["MetadataId"]
        api_request(f"EntityDefinitions({mid})", {"@odata.type":"#Microsoft.Dynamics.CRM.EntityMetadata","MetadataId":mid,
            "DisplayName":label_jp(disp),"DisplayCollectionName":label_jp(plural)}, method="PUT")
        print(f"  Table '{logical}' -> '{disp}'")
    odata_map = {"String":"#Microsoft.Dynamics.CRM.StringAttributeMetadata","Memo":"#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "Picklist":"#Microsoft.Dynamics.CRM.PicklistAttributeMetadata","DateTime":"#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "Integer":"#Microsoft.Dynamics.CRM.IntegerAttributeMetadata","Decimal":"#Microsoft.Dynamics.CRM.DecimalAttributeMetadata"}
    for table, col, disp in LOCALIZE_COLUMNS:
        data = api_get(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{col}')?$select=MetadataId,AttributeType")
        mid = data["MetadataId"]; ot = odata_map.get(data.get("AttributeType",""),"#Microsoft.Dynamics.CRM.AttributeMetadata")
        api_request(f"EntityDefinitions(LogicalName='{table}')/Attributes({mid})", {"@odata.type":ot,"MetadataId":mid,"DisplayName":label_jp(disp)}, method="PUT")
        print(f"  Column '{table}.{col}' -> '{disp}'")
    for table, col, options in LOCALIZE_OPTIONS:
        for value, label_text in options:
            api_post("UpdateOptionValue", {"EntityLogicalName":table,"AttributeLogicalName":col,"Value":value,"Label":label_jp(label_text),"MergeLabels":True})
            print(f"    Option {col}={value} -> '{label_text}'")

def ensure_solution_membership():
    print("\n=== Step 7: Solution membership ===")
    sols = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid")
    if not sols.get("value"): print("  Solution not found!"); return
    sol_id = sols["value"][0]["solutionid"]
    existing_ids = {c["objectid"] for c in api_get(f"solutioncomponents?$filter=_solutionid_value eq {sol_id} and componenttype eq 1&$select=objectid").get("value",[])}
    for tbl in TABLES:
        try:
            mid = api_get(f"EntityDefinitions(LogicalName='{tbl['logical']}')?$select=MetadataId")["MetadataId"]
            if mid in existing_ids: print(f"  OK: {tbl['logical']}")
            else:
                api_post("AddSolutionComponent", {"ComponentId":mid,"ComponentType":1,"SolutionUniqueName":SOLUTION_NAME,"AddRequiredComponents":False,"DoNotIncludeSubcomponents":False})
                print(f"  Added: {tbl['logical']}")
        except Exception as e: print(f"  ERR: {tbl['logical']}: {e}")

def verify():
    print("\n=== Step 8: Verify ===")
    for tbl in TABLES:
        try:
            eset = get_entity_set_name(tbl["logical"])
            data = api_get(f"{eset}?$top=1&$select={PREFIX}_name")
            print(f"  OK: {tbl['logical']} ({eset}) rows={len(data.get('value',[]))}")
        except Exception as e: print(f"  FAIL: {tbl['logical']}: {e}")

def main():
    print("=" * 60); print("  Dataverse Setup: geek-maintenance 設備保全管理ポータル"); print("=" * 60)
    print(f"  Env: {DATAVERSE_URL}"); print(f"  Solution: {SOLUTION_NAME}"); print(f"  Prefix: {PREFIX}")
    ensure_solution(); create_tables(); create_lookups(); publish_all(); localize(); publish_all(); ensure_solution_membership(); verify()
    print("\n=== DONE ===")

if __name__ == "__main__":
    try: main()
    except Exception as e: print(f"\nERROR: {e}"); traceback.print_exc(); sys.exit(1)
