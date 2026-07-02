"""担当エリアテーブル作成 + CE テーブルへの Lookup 追加 + デモデータ + ユーザー割当スクリプト"""
import sys, os, time, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '.github', 'skills', 'standard', 'scripts'))
from auth_helper import api_get, api_post, api_patch, api_request, retry_metadata
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env'))
P = os.getenv("PUBLISHER_PREFIX", "geek")
SOLUTION = os.getenv("SOLUTION_NAME", "RiDS3")
LANG = 1041  # Japanese

# ============================================================
# Step 1: 担当エリアテーブル作成
# ============================================================
print("=" * 60)
print("Step 1: 担当エリア (areas) テーブル作成")
print("=" * 60)

TABLE_SCHEMA = f"{P}_area"
TABLE_SET = f"{P}_areas"

# テーブル存在チェック
existing = None
try:
    existing = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=MetadataId,LogicalName")
    print(f"  テーブル {TABLE_SCHEMA} は既存。スキップ。")
except Exception:
    existing = None

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
        "Attributes": [
            {
                "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                "SchemaName": f"{P}_name",
                "RequiredLevel": {"Value": "ApplicationRequired"},
                "MaxLength": 200,
                "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Name", "LanguageCode": 1033}]},
                "Description": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area name", "LanguageCode": 1033}]},
                "IsPrimaryName": True
            }
        ]
    }
    retry_metadata(lambda: api_post("EntityDefinitions", body, solution=SOLUTION), "areas テーブル作成")
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

LOOKUP_COL = f"{P}_areaid"
FROM_TABLE = f"{P}_engineer"
TO_TABLE = f"{P}_area"

# Lookup 存在チェック
try:
    api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/Attributes(LogicalName='{LOOKUP_COL}')?$select=LogicalName")
    print(f"  Lookup {LOOKUP_COL} は既存。スキップ。")
except Exception:
    lookup_body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": f"{LOOKUP_COL}_rel",
        "ReferencedEntity": TO_TABLE,
        "ReferencingEntity": FROM_TABLE,
        "Lookup": {
            "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": LOOKUP_COL,
            "DisplayName": {"LocalizedLabels": [{"Label": "Area", "LanguageCode": 1033}]},
            "RequiredLevel": {"Value": "None"},
        },
    }
    retry_metadata(lambda: api_post("RelationshipDefinitions", lookup_body, solution=SOLUTION), "areaid Lookup 作成")
    print("  ✅ Lookup 作成完了")
    time.sleep(5)

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

# テーブル名ローカライズ
try:
    meta = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=MetadataId")
    mid = meta["MetadataId"]
    api_request(f"EntityDefinitions({mid})", {
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

# 列ローカライズ: areas.name
try:
    attr = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')/Attributes(LogicalName='{P}_name')?$select=MetadataId")
    amid = attr["MetadataId"]
    api_request(f"EntityDefinitions({mid})/Attributes({amid})", {
        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Name", "LanguageCode": 1033},
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "エリア名", "LanguageCode": LANG},
        ]},
    })
    print("  ✅ 列 name ローカライズ完了")
except Exception as e:
    print(f"  ⚠ 列ローカライズ失敗: {e}")

# 列ローカライズ: engineers.areaid
try:
    eng_meta = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')?$select=MetadataId")
    eng_mid = eng_meta["MetadataId"]
    attr2 = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/Attributes(LogicalName='{LOOKUP_COL}')?$select=MetadataId")
    amid2 = attr2["MetadataId"]
    api_request(f"EntityDefinitions({eng_mid})/Attributes({amid2})", {
        "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        "DisplayName": {"@odata.type": "#Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "Area", "LanguageCode": 1033},
            {"@odata.type": "#Microsoft.Dynamics.CRM.LocalizedLabel", "Label": "担当エリア", "LanguageCode": LANG},
        ]},
    })
    print("  ✅ engineers.areaid ローカライズ完了")
except Exception as e:
    print(f"  ⚠ engineers.areaid ローカライズ失敗: {e}")

# 再公開
api_post("PublishAllXml", {})
print("  ✅ 再公開完了")

# ============================================================
# Step 6: デモデータ投入
# ============================================================
print("\n" + "=" * 60)
print("Step 6: デモデータ投入")
print("=" * 60)

AREAS = ["東京", "大阪", "名古屋", "福岡", "札幌"]

# EntitySetName 取得
entity_set = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=EntitySetName")
area_set_name = entity_set["EntitySetName"]
print(f"  EntitySetName: {area_set_name}")

# 既存データチェック
existing_areas = api_get(f"{area_set_name}?$select={P}_name,{P}_areaid")
existing_names = {str(a[f"{P}_name"]) for a in existing_areas.get("value", [])}

area_ids = {}
for a in existing_areas.get("value", []):
    area_ids[str(a[f"{P}_name"])] = str(a[f"{P}_areaid"])

for name in AREAS:
    if name in existing_names:
        print(f"  {name} — 既存。スキップ。")
    else:
        aid = api_post(area_set_name, {f"{P}_name": name}, solution=SOLUTION)
        area_ids[name] = aid
        print(f"  ✅ {name} 作成完了 (ID: {aid})")

print(f"\n  エリアID一覧: {area_ids}")

# ============================================================
# Step 7: 既存 CE のエリアをテキスト→Lookup に移行
# ============================================================
print("\n" + "=" * 60)
print("Step 7: 既存 CE のエリア移行 (テキスト→Lookup)")
print("=" * 60)

# NavProp 名を取得
rels = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntityNavigationPropertyName,SchemaName&$filter=ReferencingAttribute eq '{LOOKUP_COL}'")
navprop = None
for r in rels.get("value", []):
    if r["ReferencingAttribute"] == LOOKUP_COL:
        navprop = r["ReferencingEntityNavigationPropertyName"]
        break

if not navprop:
    print("  ⚠ NavProp が見つかりません。手動確認が必要です。")
else:
    print(f"  NavProp: {navprop}")
    
    # 既存エンジニアを取得
    engineers = api_get(f"{P}_engineers?$select={P}_engineerid,{P}_name,{P}_area,_geek_areaid_value")
    for eng in engineers.get("value", []):
        eid = eng[f"{P}_engineerid"]
        area_text = str(eng.get(f"{P}_area", "") or "")
        current_areaid = eng.get("_geek_areaid_value")
        
        if current_areaid:
            print(f"  {eng[f'{P}_name']} — areaid 設定済。スキップ。")
            continue
            
        if area_text and area_text in area_ids:
            api_patch(f"{P}_engineers({eid})", {
                f"{navprop}@odata.bind": f"/{area_set_name}({area_ids[area_text]})"
            })
            print(f"  ✅ {eng[f'{P}_name']} → {area_text}")
        elif area_text:
            print(f"  ⚠ {eng[f'{P}_name']} — エリア '{area_text}' がマスタに無い")
        else:
            print(f"  — {eng[f'{P}_name']} — エリア未設定")

# ============================================================
# Step 8: ログインユーザーを CE に割当
# ============================================================
print("\n" + "=" * 60)
print("Step 8: ログインユーザー → CE 割当")
print("=" * 60)

# 現在ユーザー取得
users = api_get("systemusers?$filter=isdisabled eq false and accessmode ne 4&$select=systemuserid,fullname,domainname&$top=10&$orderby=fullname")
print("\n  有効ユーザー:")
for i, u in enumerate(users["value"]):
    print(f"    [{i}] {u['fullname']} ({u['domainname']})")

# 未割当 CE 取得
engineers = api_get(f"{P}_engineers?$select={P}_engineerid,{P}_name,_geek_userid_value")
print("\n  エンジニア:")
for i, e in enumerate(engineers["value"]):
    uid = e.get("_geek_userid_value")
    status = f"userid={uid}" if uid else "(未割当)"
    print(f"    [{i}] {e[f'{P}_name']} — {status}")

# userid NavProp 取得
uid_rels = api_get(f"EntityDefinitions(LogicalName='{FROM_TABLE}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq '{P}_userid'")
uid_navprop = None
for r in uid_rels.get("value", []):
    if r["ReferencingAttribute"] == f"{P}_userid":
        uid_navprop = r["ReferencingEntityNavigationPropertyName"]
        break
print(f"\n  userid NavProp: {uid_navprop}")

print("\n  割り当てたいエンジニア番号とユーザー番号を入力してください。")
eng_idx = int(input("  エンジニア番号: "))
user_idx = int(input("  ユーザー番号: "))

engineer = engineers["value"][eng_idx]
user = users["value"][user_idx]
eid = engineer[f"{P}_engineerid"]
uid = user["systemuserid"]

print(f"\n  {engineer[f'{P}_name']} ← {user['fullname']} ({user['domainname']})")
confirm = input("  割り当てますか? (y/n): ")
if confirm.lower() == "y":
    api_patch(f"{P}_engineers({eid})", {
        f"{uid_navprop}@odata.bind": f"/systemusers({uid})"
    })
    print("  ✅ 割当完了!")
else:
    print("  キャンセル")

# ============================================================
# Step 9: ソリューション含有確認
# ============================================================
print("\n" + "=" * 60)
print("Step 9: ソリューション含有確認")
print("=" * 60)

sol = api_get(f"solutions?$filter=uniquename eq '{SOLUTION}'&$select=solutionid")
sol_id = sol["value"][0]["solutionid"]

# areas テーブルをソリューションに追加
try:
    entity_meta = api_get(f"EntityDefinitions(LogicalName='{TABLE_SCHEMA}')?$select=MetadataId")
    api_post("AddSolutionComponent", {
        "ComponentId": entity_meta["MetadataId"],
        "ComponentType": 1,  # Entity
        "SolutionUniqueName": SOLUTION,
        "AddRequiredComponents": False,
        "IncludedComponentSettingsValues": None
    })
    print(f"  ✅ {TABLE_SCHEMA} をソリューションに追加/確認")
except Exception as e:
    print(f"  ⚠ ソリューション含有: {e}")

print("\n🎉 完了!")
