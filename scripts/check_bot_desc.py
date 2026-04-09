"""Bot レコードの description フィールドを確認する"""
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
r = requests.get(f"{API}/bots({bot_id})", headers=h)
print(f"Status: {r.status_code}")
if r.ok:
    d = r.json()
    print(f"name: {d.get('name')}")
    print(f"description: {d.get('description')}")
    print(f"iconbase64: {str(d.get('iconbase64', ''))[:50]}")
    # Check configuration for any description
    config = d.get("configuration", "")
    print(f"configuration length: {len(config)}")
    print(f"configuration: {config[:500]}")
