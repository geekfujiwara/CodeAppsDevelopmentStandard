"""UI で設定した test_description がどこに保存されたか探す"""
from auth_helper import get_session
import os, json

s = get_session()
url = os.getenv("DATAVERSE_URL").rstrip("/")
bot_id = "05be3e2f-9133-f111-88b5-7ced8dea312a"

# 1. Bot レコード全体
print("=== Bot Record ===")
r = s.get(f"{url}/api/data/v9.2/bots({bot_id})")
bot = r.json()
for k, v in sorted(bot.items()):
    if v is not None and not k.startswith("@"):
        sv = str(v)
        if "test" in sv.lower():
            print(f"  {k}: {sv[:300]}")

# 2. 全コンポーネント
print("\n=== All Components ===")
r2 = s.get(f"{url}/api/data/v9.2/botcomponents",
           params={"$filter": f"_parentbotid_value eq '{bot_id}'",
                   "$select": "botcomponentid,componenttype,schemaname,data,name,description"})
comps = r2.json().get("value", [])
print(f"Total: {len(comps)}")
for c in comps:
    data = c.get("data", "") or ""
    desc = c.get("description", "") or ""
    name = c.get("name", "") or ""
    for field_name, field_val in [("data", data), ("description", desc), ("name", name)]:
        if "test" in field_val.lower():
            print(f"\n  Component {c['botcomponentid']} (type={c['componenttype']}):")
            print(f"    {field_name}: {field_val[:300]}")

# 3. GPT component data 先頭
print("\n=== GPT Component YAML (top 5 lines) ===")
for c in comps:
    if c.get("componenttype") == 15:
        data = c.get("data", "") or ""
        for i, line in enumerate(data.split("\n")[:8]):
            print(f"  {i}: {line}")
        # Also check description column
        print(f"  [description column]: {c.get('description', '(null)')}")

# 4. Check botcomponent description column specifically
print("\n=== botcomponent 'description' column check ===")
r3 = s.get(f"{url}/api/data/v9.2/botcomponents(cf20b37f-bd2a-4b77-8889-4cfc01a570a0)?$select=description,data")
bc = r3.json()
print(f"  description: {bc.get('description', '(null)')}")
print(f"  data[:200]: {(bc.get('data','') or '')[:200]}")
