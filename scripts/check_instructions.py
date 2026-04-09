"""指示コンポーネントの内容を確認する"""
import sys
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
        "$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
        "$select": "botcomponentid,name,data",
    },
)
print(f"Status: {r.status_code}")
for c in r.json().get("value", []):
    print(f"ID: {c['botcomponentid']}")
    print(f"Name: {c.get('name')}")
    data = c.get("data", "")
    print(f"Data length: {len(data)}")
    print(f"Data:\n{data[:1000]}")
