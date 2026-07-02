"""担当エリアテーブル作成 - InteractiveBrowserCredential 使用版"""
import sys, os, time, requests, json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env'))

TENANT_ID = os.getenv("TENANT_ID", "")
DATAVERSE_URL = os.getenv("DATAVERSE_URL", "").rstrip("/")
P = os.getenv("PUBLISHER_PREFIX", "geek")
SOLUTION = os.getenv("SOLUTION_NAME", "RiDS3")

# --- InteractiveBrowserCredential で認証（ブラウザ自動起動）---
from azure.identity import InteractiveBrowserCredential

print("ブラウザが開きます。サインインしてください...")
credential = InteractiveBrowserCredential(tenant_id=TENANT_ID)
scope = f"{DATAVERSE_URL}/.default"
token = credential.get_token(scope).token
print("✅ 認証成功\n")

# --- API ヘルパー ---
BASE = f"{DATAVERSE_URL}/api/data/v9.2"
HEADERS = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json; charset=utf-8",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Accept": "application/json",
}

def api_get(path):
    r = requests.get(f"{BASE}/{path}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def api_post(path, body, solution=None):
    h = {**HEADERS}
    if solution:
        h["MSCRM.SolutionName"] = solution
    r = requests.post(f"{BASE}/{path}", headers=h, json=body)
    if r.status_code == 204:
        eid = r.headers.get("OData-EntityId", "")
        if "(" in eid:
            return eid.split("(")[-1].rstrip(")")
        return None
    r.raise_for_status()
    return r.json() if r.text else None

def api_patch(path, body):
    r = requests.patch(f"{BASE}/{path}", headers=HEADERS, json=body)
    r.raise_for_status()

def api_put(path, body):
    h = {**HEADERS, "MSCRM.MergeLabels": "true"}
    r = requests.put(f"{BASE}/{path}", headers=h, json=body)
    r.raise_for_status()

# ============================================================
# Step 1: 担当エリアテーブル作成
# ============================================================
print("=" * 60)
print("Step 1: 担当エリア (areas) テーブル作成")
print("=" * 60)

TABLE_SCHEMA = f"{P}_area"
FROM_TABLE = f"{P}_engineers"
LOOKUP_COL = f"{P}_areaid"

existing = None
try:
    existing = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=MetadataId,LogicalName")
    print(f"  テーブル {TABLE_SCHEMA} は既存。スキップ。")
except requests.HTTPError as e:
    if e.response.status_code == 404:
        existing = None
    else:
        raise

if not existing:
    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": f"{P}_area",
        "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area", "LanguageCode": 1033}]},
        "DisplayCollectionName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Areas", "LanguageCode": 1033}]},
        "Description": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Service area master", "LanguageCode": 1033}]},
        "HasActivities": False,
        "HasNotes": False,
        "OwnershipType": "UserOwned",
        "PrimaryNameAttribute": f"{P}_name",
        "Attributes": [{
            "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": f"{P}_name",
            "RequiredLevel": {"Value": "ApplicationRequired"},
            "MaxLength": 200,
            "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Name", "LanguageCode": 1033}]},
            "Description": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area name", "LanguageCode": 1033}]},
            "IsPrimaryName": True
        }]
    }
    api_post("EntityDefinitions", body, solution=SOLUTION)
    print("  ✅ テーブル作成完了")
    time.sleep(10)

# ============================================================
# Step 2: PublishAllXml
# ============================================================
print("\nStep 2: カスタマイズ公開")
api_post("PublishAllXml", {})
print("  ✅ 公開完了")
time.sleep(5)

# ============================================================
# Step 3: CE テーブルに areaid Lookup を追加
# ============================================================
print("\n" + "=" * 60)
print("Step 3: CE テーブルへ areaid Lookup 追加")
print("=" * 60)

try:
    api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/Attributes(LogicalName='{LOOKUP_COL}')?$select=LogicalName")
    print(f"  Lookup {LOOKUP_COL} は既存。スキップ。")
except requests.HTTPError as e:
    if e.response.status_code == 404:
        lookup_body = {
            "OneToManyRelationship": {
                "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                "SchemaName": f"{P}_{FROM_TABLE}_{LOOKUP_COL}",
                "ReferencedEntity": TABLE_SCHEMA,
                "ReferencingEntity": FROM_TABLE,
                "CascadeConfiguration": {
                    "Assign": "NoCascade", "Delete": "RemoveLink", "Merge": "NoCascade",
                    "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade"
                }
            },
            "Lookup": {
                "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                "SchemaName": f"{P}_areaid",
                "RequiredLevel": {"Value": "None"},
                "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area", "LanguageCode": 1033}]},
                "Description": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Service area", "LanguageCode": 1033}]}
            }
        }
        h = {**HEADERS, "MSCRM.SolutionName": SOLUTION}
        r = requests.post(f"{BASE}/CreateOneToMany", headers=h, json=lookup_body)
        r.raise_for_status()
        print("  ✅ Lookup 作成完了")
        time.sleep(5)
    else:
        raise

# ============================================================
# Step 4: 公開
# ============================================================
print("\nStep 4: 再公開")
api_post("PublishAllXml", {})
print("  ✅ 公開完了")
time.sleep(3)

# ============================================================
# Step 5: ローカライズ（日本語）
# ============================================================
print("\n" + "=" * 60)
print("Step 5: ローカライズ")
print("=" * 60)

LANG = 1041

try:
    meta = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=MetadataId")
    mid = meta["MetadataId"]
    api_put(f"EntityDefinitions({mid})", {
        "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area", "LanguageCode": 1033},
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "担当エリア", "LanguageCode": LANG},
        ]},
        "DisplayCollectionName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Areas", "LanguageCode": 1033},
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "担当エリア", "LanguageCode": LANG},
        ]},
    })
    print("  ✅ テーブル名ローカライズ完了")
except Exception as e:
    print(f"  ⚠ テーブル名ローカライズ失敗: {e}")

try:
    attr = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')/Attributes(LogicalName='{P}_name')?$select=MetadataId")
    amid = attr["MetadataId"]
    api_put(f"EntityDefinitions({mid})/Attributes({amid})", {
        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Name", "LanguageCode": 1033},
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "エリア名", "LanguageCode": LANG},
        ]},
    })
    print("  ✅ 列 name ローカライズ完了")
except Exception as e:
    print(f"  ⚠ 列ローカライズ失敗: {e}")

try:
    eng_meta = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')?$select=MetadataId")
    eng_mid = eng_meta["MetadataId"]
    attr2 = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/Attributes(LogicalName='{LOOKUP_COL}')?$select=MetadataId")
    amid2 = attr2["MetadataId"]
    api_put(f"EntityDefinitions({eng_mid})/Attributes({amid2})", {
        "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area", "LanguageCode": 1033},
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "担当エリア", "LanguageCode": LANG},
        ]},
    })
    print("  ✅ engineers.areaid ローカライズ完了")
except Exception as e:
    print(f"  ⚠ engineers.areaid ローカライズ失敗: {e}")

api_post("PublishAllXml", {})
print("  ✅ 再公開完了")

# ============================================================
# Step 6: デモデータ投入
# ============================================================
print("\n" + "=" * 60)
print("Step 6: デモデータ投入")
print("=" * 60)

AREAS = ["東京", "大阪", "名古屋", "福岡", "札幌"]

entity_set = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=EntitySetName")
area_set_name = entity_set["EntitySetName"]
print(f"  EntitySetName: {area_set_name}")

existing_areas = api_get(f"{area_set_name}?$select={P}_name,{P}_areaid")
existing_names = {str(a[f"{P}_name"]) for a in existing_areas.get("value", [])}
area_ids = {str(a[f"{P}_name"]): str(a[f"{P}_areaid"]) for a in existing_areas.get("value", [])}

for name in AREAS:
    if name in existing_names:
        print(f"  {name} — 既存。スキップ。")
    else:
        aid = api_post(area_set_name, {f"{P}_name": name}, solution=SOLUTION)
        area_ids[name] = aid
        print(f"  ✅ {name} 作成完了 (ID: {aid})")

print(f"\n  エリアID: {json.dumps(area_ids, ensure_ascii=False, indent=2)}")

# ============================================================
# Step 7: 既存 CE のエリアをテキスト→Lookup に移行
# ============================================================
print("\n" + "=" * 60)
print("Step 7: 既存 CE のエリア移行")
print("=" * 60)

rels = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq '{LOOKUP_COL}'")
navprop = None
for r in rels.get("value", []):
    if r["ReferencingAttribute"] == LOOKUP_COL:
        navprop = r["ReferencingEntityNavigationPropertyName"]
        break

if not navprop:
    print("  ⚠ NavProp が見つかりません")
else:
    print(f"  NavProp: {navprop}")
    engineers = api_get(f"{P}_engineers?$select={P}_engineerid,{P}_name,{P}_area,_{P}_areaid_value")
    for eng in engineers.get("value", []):
        eid = eng[f"{P}_engineerid"]
        area_text = str(eng.get(f"{P}_area", "") or "")
        current_areaid = eng.get(f"_{P}_areaid_value")
        if current_areaid:
            print(f"  {eng[f'{P}_name']} — areaid 設定済。スキップ。")
            continue
        if area_text and area_text in area_ids:
            api_patch(f"{P}_engineers({eid})", {f"{navprop}@odata.bind": f"/{area_set_name}({area_ids[area_text]})"})
            print(f"  ✅ {eng[f'{P}_name']} → {area_text}")
        elif area_text:
            print(f"  ⚠ {eng[f'{P}_name']} — エリア '{area_text}' がマスタに無い")
        else:
            print(f"  — {eng[f'{P}_name']} — エリア未設定")

# ============================================================
# Step 8: ログインユーザー → CE 割当
# ============================================================
print("\n" + "=" * 60)
print("Step 8: ログインユーザー → CE 割当")
print("=" * 60)

users = api_get("systemusers?$filter=isdisabled eq false and accessmode ne 4&$select=systemuserid,fullname,domainname&$top=10&$orderby=fullname")
print("\n  有効ユーザー:")
for i, u in enumerate(users["value"]):
    print(f"    [{i}] {u['fullname']} ({u['domainname']})")

engineers = api_get(f"{P}_engineers?$select={P}_engineerid,{P}_name,_{P}_userid_value")
print("\n  エンジニア:")
for i, e in enumerate(engineers["value"]):
    uid = e.get(f"_{P}_userid_value")
    status = f"userid={uid}" if uid else "(未割当)"
    print(f"    [{i}] {e[f'{P}_name']} — {status}")

uid_rels = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq '{P}_userid'")
uid_navprop = None
for r in uid_rels.get("value", []):
    if r["ReferencingAttribute"] == f"{P}_userid":
        uid_navprop = r["ReferencingEntityNavigationPropertyName"]
        break
print(f"\n  userid NavProp: {uid_navprop}")

print("\n  割り当てたいエンジニア番号とユーザー番号を入力:")
eng_idx = int(input("  エンジニア番号: "))
user_idx = int(input("  ユーザー番号: "))

engineer = engineers["value"][eng_idx]
user = users["value"][user_idx]
eid = engineer[f"{P}_engineerid"]
uid = user["systemuserid"]

print(f"\n  {engineer[f'{P}_name']} ← {user['fullname']}")
confirm = input("  割り当てますか? (y/n): ")
if confirm.lower() == "y":
    api_patch(f"{P}_engineers({eid})", {f"{uid_navprop}@odata.bind": f"/systemusers({uid})"})
    print("  ✅ 割当完了!")
else:
    print("  キャンセル")

# ============================================================
# Step 9: ソリューション含有確認
# ============================================================
print("\n" + "=" * 60)
print("Step 9: ソリューション含有確認")
print("=" * 60)

try:
    entity_meta = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=MetadataId")
    api_post("AddSolutionComponent", {
        "ComponentId": entity_meta["MetadataId"],
        "ComponentType": 1,
        "SolutionUniqueName": SOLUTION,
        "AddRequiredComponents": False,
        "IncludedComponentSettingsValues": None
    })
    print(f"  ✅ {TABLE_SCHEMA} ソリューション含有確認済")
except Exception as e:
    print(f"  ⚠ {e}")

print("\n🎉 完了!")
