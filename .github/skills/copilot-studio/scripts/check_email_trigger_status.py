"""メールトリガーの現在の状態を包括的に確認する"""
import json, os, sys
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))
from auth_helper import api_get, DATAVERSE_URL
from dotenv import load_dotenv
load_dotenv()

BOT_ID = os.getenv("BOT_ID", "")
BOT_SCHEMA = os.getenv("BOT_SCHEMA", "")

print("=" * 60)
print("1. Bot 基本情報")
print("=" * 60)
bot = api_get(f"bots({BOT_ID})?$select=name,schemaname,configuration,publishedon")
print(f"  Name: {bot.get('name')}")
print(f"  Schema: {bot.get('schemaname')}")
print(f"  Published: {bot.get('publishedon')}")

# configuration から channels を確認
config = json.loads(bot.get("configuration", "{}") or "{}")
print(f"  GenerativeActionsEnabled: {config.get('settings', {}).get('GenerativeActionsEnabled')}")
print(f"  optInUseLatestModels: {config.get('aISettings', {}).get('optInUseLatestModels')}")

print("\n" + "=" * 60)
print("2. GPT コンポーネント（Instructions）")
print("=" * 60)
gpt_comps = api_get(
    "botcomponents",
    {"$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 15",
     "$select": "botcomponentid,schemaname,data"}
)
for comp in gpt_comps.get("value", []):
    print(f"  Schema: {comp.get('schemaname')}")
    data = comp.get("data", "")
    # instructions の先頭200文字を表示
    idx = data.find("instructions:")
    if idx >= 0:
        snippet = data[idx:idx+300].replace("\n", "\n    ")
        print(f"    {snippet}...")

print("\n" + "=" * 60)
print("3. ExternalTriggerComponent（トリガー）")
print("=" * 60)
triggers = api_get(
    "botcomponents",
    {"$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 17",
     "$select": "botcomponentid,schemaname,data,name"}
)
for t in triggers.get("value", []):
    print(f"  Name: {t.get('name')}")
    print(f"  Schema: {t.get('schemaname')}")
    data = t.get("data", "")
    print(f"  Data (first 300): {data[:300]}")
    print()

print("\n" + "=" * 60)
print("4. ツール（action コンポーネント）")
print("=" * 60)
actions = api_get(
    "botcomponents",
    {"$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 9",
     "$select": "botcomponentid,schemaname,name,componenttype"}
)
for a in actions.get("value", []):
    schema = a.get("schemaname", "")
    if ".action." in schema:
        print(f"  Schema: {schema}")
        print(f"  Name: {a.get('name')}")

print("\n" + "=" * 60)
print("5. メールトリガーフロー")
print("=" * 60)
flows = api_get(
    "workflows",
    {"$filter": "contains(name,'メール') and category eq 5",
     "$select": "workflowid,name,statecode,statuscode,description"}
)
for f in flows.get("value", []):
    state = "有効(Active)" if f["statecode"] == 1 else "無効(Draft)"
    print(f"  Name: {f['name']}")
    print(f"  ID: {f['workflowid']}")
    print(f"  State: {state} (statecode={f['statecode']}, statuscode={f['statuscode']})")
    print(f"  Desc: {f.get('description', '')[:100]}")
    print()

# 日報関連フローも検索
flows2 = api_get(
    "workflows",
    {"$filter": "contains(name,'日報') and category eq 5",
     "$select": "workflowid,name,statecode,statuscode"}
)
for f in flows2.get("value", []):
    state = "有効(Active)" if f["statecode"] == 1 else "無効(Draft)"
    print(f"  Name: {f['name']}")
    print(f"  ID: {f['workflowid']}")
    print(f"  State: {state}")
    print()

print("\n" + "=" * 60)
print("6. フロー詳細（clientdata 確認）")
print("=" * 60)
# メールトリガーフローの clientdata を確認
for f in flows.get("value", []) + flows2.get("value", []):
    wf_id = f["workflowid"]
    detail = api_get(f"workflows({wf_id})?$select=clientdata,name")
    cd_raw = detail.get("clientdata", "")
    if cd_raw:
        try:
            cd = json.loads(cd_raw)
            triggers_def = cd.get("properties", {}).get("definition", {}).get("triggers", {})
            actions_def = cd.get("properties", {}).get("definition", {}).get("actions", {})
            connrefs = cd.get("properties", {}).get("connectionReferences", {})
            print(f"\n  --- {detail['name']} ---")
            print(f"  Triggers: {list(triggers_def.keys())}")
            print(f"  Actions: {list(actions_def.keys())}")
            print(f"  ConnectionRefs: {list(connrefs.keys())}")
            # ExecuteCopilot のプロンプトを確認
            for aname, adef in actions_def.items():
                if "ExecuteCopilot" in adef.get("inputs", {}).get("host", {}).get("operationId", ""):
                    msg = adef["inputs"]["parameters"].get("body/message", "")
                    print(f"  Prompt (first 300): {msg[:300]}")
        except:
            pass

print("\n✅ 調査完了")
