"""description の設定タイミングを検証: data PATCH → description PATCH → publish → 再確認"""
from auth_helper import api_patch, api_post, api_get, get_session
import os

s = get_session()
url = os.getenv("DATAVERSE_URL").rstrip("/")
comp_id = "cf20b37f-bd2a-4b77-8889-4cfc01a570a0"
bot_id = "05be3e2f-9133-f111-88b5-7ced8dea312a"
desc_text = "社内のインシデント管理AIエージェント"

def check():
    r = s.get(f"{url}/api/data/v9.2/botcomponents({comp_id})?$select=description")
    return r.json().get("description", "(null)")

# Step 1: description を設定
print(f"Before: {check()}")
api_patch(f"botcomponents({comp_id})", {"description": desc_text})
print(f"After PATCH: {check()}")

# Step 2: publish
print("Publishing...")
try:
    api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
    print("Published")
except Exception as e:
    print(f"Publish error: {e}")

print(f"After publish: {check()}")
