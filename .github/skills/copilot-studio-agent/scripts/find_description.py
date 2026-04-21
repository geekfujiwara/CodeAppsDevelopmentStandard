"""Bot の全コンポーネントから 'test' を含むものを検索"""
from auth_helper import get_session
import os

s = get_session()
url = os.getenv("DATAVERSE_URL").rstrip("/")

# 全コンポーネント
r = s.get(f"{url}/api/data/v9.2/botcomponents",
          params={"$filter": "_parentbotid_value eq '05be3e2f-9133-f111-88b5-7ced8dea312a'",
                  "$select": "botcomponentid,componenttype,schemaname,data,name"})
comps = r.json().get("value", [])
print(f"Total components: {len(comps)}")

for c in comps:
    data = c.get("data", "") or ""
    name = c.get("name", "") or ""
    has_test = "test" in data.lower() or "test" in name.lower()
    print(f"\nType={c['componenttype']} schema={c.get('schemaname','')} name={name[:60]}")
    if has_test:
        print("  *** CONTAINS 'test' ***")
    if data:
        print(f"  data[:200]: {data[:200]}")

# Also check bot record itself
print("\n--- Bot record ---")
r2 = s.get(f"{url}/api/data/v9.2/bots(05be3e2f-9133-f111-88b5-7ced8dea312a)")
bot = r2.json()
for k, v in sorted(bot.items()):
    sv = str(v)
    if v is not None and not k.startswith("@") and not k.startswith("_"):
        if "test" in sv.lower():
            print(f"  {k}: {sv[:200]}")

# Check applicationmanifestinformation
ami = bot.get("applicationmanifestinformation", "")
if ami:
    print(f"\napplicationmanifestinformation:\n{ami[:500]}")
