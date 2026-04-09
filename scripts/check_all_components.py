"""Bot の全 botcomponent を一覧表示する"""
import sys, json
sys.path.insert(0, "scripts")
from auth_helper import get_token, DATAVERSE_URL
import requests

token = get_token()
API = f"{DATAVERSE_URL}/api/data/v9.2"
h = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
}

bot_id = "05be3e2f-9133-f111-88b5-7ced8dea312a"

r = requests.get(
    f"{API}/botcomponents",
    headers=h,
    params={
        "$filter": f"_parentbotid_value eq '{bot_id}'",
        "$select": "botcomponentid,name,componenttype,schemaname,data,description",
    },
)
print(f"Status: {r.status_code}")
for c in r.json().get("value", []):
    print(f"\n--- {c.get('name')} ---")
    print(f"  type: {c.get('componenttype')}")
    print(f"  schema: {c.get('schemaname')}")
    desc = c.get("description", "")
    if desc:
        print(f"  description: {desc[:200]}")
    data = c.get("data", "")
    if data:
        print(f"  data ({len(data)} chars): {data[:300]}")
