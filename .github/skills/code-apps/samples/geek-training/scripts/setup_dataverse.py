"""
Dataverse テーブル構築: {PREFIX}_course / {PREFIX}_enrollment
=========================================
研修管理ポータルアプリ用テーブル。
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
        "logical": f"{PREFIX}_course", "display": "Course", "plural": "Courses", "description": "研修コース",
        "columns": [
            {"logical": f"{PREFIX}_category",       "type": "String",   "display": "Category",       "maxLength": 200},
            {"logical": f"{PREFIX}_instructor",     "type": "String",   "display": "Instructor",     "maxLength": 200},
            {"logical": f"{PREFIX}_format",         "type": "Picklist", "display": "Format",
             "options": [(100000000,"Classroom"),(100000001,"Online"),(100000002,"E-Learning")]},
            {"logical": f"{PREFIX}_status",         "type": "Picklist", "display": "Status",
             "options": [(100000000,"Open"),(100000001,"Full"),(100000002,"Closed")]},
            {"logical": f"{PREFIX}_start_date",     "type": "DateTime", "display": "Start Date",     "format": "DateOnly"},
            {"logical": f"{PREFIX}_duration_hours", "type": "Decimal",  "display": "Duration Hours", "precision": 1, "maxValue": 1000},
            {"logical": f"{PREFIX}_capacity",       "type": "Integer",  "display": "Capacity",       "minValue": 0, "maxValue": 100000},
            {"logical": f"{PREFIX}_description",    "type": "Memo",     "display": "Description",    "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_enrollment", "display": "Enrollment", "plural": "Enrollments", "description": "受講記録",
        "columns": [
            {"logical": f"{PREFIX}_course_ref",     "type": "String",   "display": "Course Ref",     "maxLength": 100},
            {"logical": f"{PREFIX}_department",     "type": "String",   "display": "Department",     "maxLength": 200},
            {"logical": f"{PREFIX}_status",         "type": "Picklist", "display": "Status",
             "options": [(100000000,"Enrolled"),(100000001,"In Progress"),(100000002,"Completed"),(100000003,"Cancelled")]},
            {"logical": f"{PREFIX}_enrolled_date",  "type": "DateTime", "display": "Enrolled Date",  "format": "DateOnly"},
            {"logical": f"{PREFIX}_completed_date", "type": "DateTime", "display": "Completed Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_rating",         "type": "Picklist", "display": "Rating",
             "options": [(100000000,"1 Star"),(100000001,"2 Stars"),(100000002,"3 Stars"),(100000003,"4 Stars"),(100000004,"5 Stars")]},
        ],
    },
]
LOOKUPS = []
LOCALIZE_TABLES = [
    (f"{PREFIX}_course",     "研修コース", "研修コース一覧"),
    (f"{PREFIX}_enrollment", "受講記録",   "受講記録一覧"),
]
LOCALIZE_COLUMNS = [
    (f"{PREFIX}_course", f"{PREFIX}_name",           "コース名"),
    (f"{PREFIX}_course", f"{PREFIX}_category",       "分野"),
    (f"{PREFIX}_course", f"{PREFIX}_instructor",     "講師"),
    (f"{PREFIX}_course", f"{PREFIX}_format",         "形式"),
    (f"{PREFIX}_course", f"{PREFIX}_status",         "ステータス"),
    (f"{PREFIX}_course", f"{PREFIX}_start_date",     "開催日"),
    (f"{PREFIX}_course", f"{PREFIX}_duration_hours", "時間"),
    (f"{PREFIX}_course", f"{PREFIX}_capacity",       "定員"),
    (f"{PREFIX}_course", f"{PREFIX}_description",    "概要"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_name",           "受講者名"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_course_ref",     "コースID"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_department",     "部門"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_status",         "ステータス"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_enrolled_date",  "申込日"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_completed_date", "修了日"),
    (f"{PREFIX}_enrollment", f"{PREFIX}_rating",         "満足度"),
]
LOCALIZE_OPTIONS = [
    (f"{PREFIX}_course", f"{PREFIX}_format",     [(100000000,"集合研修"),(100000001,"オンライン"),(100000002,"eラーニング")]),
    (f"{PREFIX}_course", f"{PREFIX}_status",     [(100000000,"募集中"),(100000001,"満席"),(100000002,"終了")]),
    (f"{PREFIX}_enrollment", f"{PREFIX}_status", [(100000000,"申込"),(100000001,"受講中"),(100000002,"修了"),(100000003,"キャンセル")]),
    (f"{PREFIX}_enrollment", f"{PREFIX}_rating", [(100000000,"★1"),(100000001,"★2"),(100000002,"★3"),(100000003,"★4"),(100000004,"★5")]),
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
    api_post("solutions", {"uniquename":SOLUTION_NAME,"friendlyname":SOLUTION_DISPLAY_NAME,"version":"1.0.0.0",
                           "publisherid@odata.bind":f"/publishers({pubs['value'][0]['publisherid']})"})
    _save_env_value("SOLUTION_DISPLAY_NAME", SOLUTION_DISPLAY_NAME); print(f"  Created: {SOLUTION_DISPLAY_NAME}")

def build_column_body(col):
    base = {"SchemaName":col["logical"],"DisplayName":label_jp(col["display"]),"RequiredLevel":{"Value":"None"}}
    t = col["type"]
    if t=="Memo":     base.update({"@odata.type":"#Microsoft.Dynamics.CRM.MemoAttributeMetadata","Format":"Text","MaxLength":col.get("maxLength",2000)})
    elif t=="Picklist": base.update({"@odata.type":"#Microsoft.Dynamics.CRM.PicklistAttributeMetadata","OptionSet":{"@odata.type":"#Microsoft.Dynamics.CRM.OptionSetMetadata","IsGlobal":False,"OptionSetType":"Picklist","Options":[{"Value":v,"Label":label_jp(l)} for v,l in col["options"]]}})
    elif t=="DateTime": base.update({"@odata.type":"#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata","Format":col.get("format","DateAndTime")})
    elif t=="String":   base.update({"@odata.type":"#Microsoft.Dynamics.CRM.StringAttributeMetadata","FormatName":{"Value":"Text"},"MaxLength":col.get("maxLength",200)})
    elif t=="Integer":  base.update({"@odata.type":"#Microsoft.Dynamics.CRM.IntegerAttributeMetadata","MinValue":col.get("minValue",0),"MaxValue":col.get("maxValue",100000)})
    elif t=="Decimal":  base.update({"@odata.type":"#Microsoft.Dynamics.CRM.DecimalAttributeMetadata","Precision":col.get("precision",2),"MinValue":col.get("minValue",0),"MaxValue":col.get("maxValue",100000000000)})
    return base

def create_tables():
    print("\n=== Step 2: Tables ===")
    for tbl in TABLES:
        logical = tbl["logical"]
        def _create(t=tbl):
            api_post("EntityDefinitions", {"@odata.type":"#Microsoft.Dynamics.CRM.EntityMetadata","SchemaName":t["logical"],
                "DisplayName":label_jp(t["display"]),"DisplayCollectionName":label_jp(t["plural"]),
                "Description":label_jp(t["description"]),"OwnershipType":"UserOwned",
                "IsActivity":False,"HasActivities":False,"HasNotes":False,"HasFeedback":False,
                "PrimaryNameAttribute":f"{PREFIX}_name",
                "Attributes":[{"@odata.type":"#Microsoft.Dynamics.CRM.StringAttributeMetadata","SchemaName":f"{PREFIX}_name",
                    "DisplayName":label_jp("Name"),"IsPrimaryName":True,"RequiredLevel":{"Value":"ApplicationRequired"},
                    "FormatName":{"Value":"Text"},"MaxLength":200}]}, solution=SOLUTION_NAME)
            print(f"  Table '{logical}' created")
        retry_metadata(_create, f"Table {logical}"); time.sleep(10)
        for col in tbl.get("columns",[]):
            cl = col["logical"]
            try: api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{cl}')?$select=LogicalName"); print(f"    Column '{cl}' exists, skip"); continue
            except: pass
            def _add(c=col,ln=logical):
                api_post(f"EntityDefinitions(LogicalName='{ln}')/Attributes",build_column_body(c),solution=SOLUTION_NAME); print(f"    Column '{c['logical']}' added")
            retry_metadata(_add, f"Column {cl}"); time.sleep(5)

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
        api_request(f"EntityDefinitions(LogicalName='{table}')/Attributes({mid})",{"@odata.type":ot,"MetadataId":mid,"DisplayName":label_jp(disp)},method="PUT")
        print(f"  Column '{table}.{col}' -> '{disp}'")
    for table, col, options in LOCALIZE_OPTIONS:
        for value, label_text in options:
            api_post("UpdateOptionValue",{"EntityLogicalName":table,"AttributeLogicalName":col,"Value":value,"Label":label_jp(label_text),"MergeLabels":True})
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
                api_post("AddSolutionComponent",{"ComponentId":mid,"ComponentType":1,"SolutionUniqueName":SOLUTION_NAME,"AddRequiredComponents":False,"DoNotIncludeSubcomponents":False})
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
    print("="*60); print("  Dataverse Setup: geek-training 研修管理ポータル"); print("="*60)
    print(f"  Env: {DATAVERSE_URL}"); print(f"  Solution: {SOLUTION_NAME}"); print(f"  Prefix: {PREFIX}")
    ensure_solution(); create_tables(); publish_all(); localize(); publish_all(); ensure_solution_membership(); verify()
    print("\n=== DONE ===")

if __name__ == "__main__":
    try: main()
    except Exception as e: print(f"\nERROR: {e}"); traceback.print_exc(); sys.exit(1)
