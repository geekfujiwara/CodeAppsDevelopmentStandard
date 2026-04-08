"""一時スクリプト: 壊れた Bot を削除する"""
import sys, requests
sys.path.insert(0, "scripts")
from auth_helper import get_token, DATAVERSE_URL

token = get_token()
API = DATAVERSE_URL + "/api/data/v9.2"
bot_id = "419c29eb-8f33-f111-88b5-7ced8dea312a"
h = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
}

# 1. List bot components
url = f"{API}/botcomponents?$filter=_parentbotid_value eq '{bot_id}'"
r = requests.get(url, headers=h)
print(f"Components: {r.status_code}")
if r.ok:
    for c in r.json().get("value", []):
        cid = c["botcomponentid"]
        cname = c.get("name", "?")
        ctype = c.get("componenttype", "?")
        print(f"  {cname} (type={ctype}, id={cid})")
        rd = requests.delete(f"{API}/botcomponents({cid})", headers=h)
        print(f"    delete: {rd.status_code}")

# 2. Delete bot
print("\nDeleting bot...")
rd = requests.delete(f"{API}/bots({bot_id})", headers=h)
print(f"Bot delete: {rd.status_code}")
if not rd.ok:
    print(rd.text[:300])
else:
    print("OK")
