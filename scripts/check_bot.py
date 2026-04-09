"""Bot レコードの全フィールドを確認する"""
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

# Bot レコード全体を取得
r = requests.get(f"{API}/bots({bot_id})", headers=h)
print(f"Status: {r.status_code}")
if r.ok:
    bot = r.json()
    # 主要フィールドを表示
    for key in sorted(bot.keys()):
        val = bot[key]
        if val is not None and val != "" and not key.startswith("@"):
            if isinstance(val, str) and len(val) > 200:
                print(f"  {key}: ({len(val)} chars) {val[:200]}...")
            else:
                print(f"  {key}: {val}")
    
    # configuration を詳細表示
    config = bot.get("configuration", "")
    if config:
        print("\n=== configuration (parsed) ===")
        try:
            parsed = json.loads(config)
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
        except:
            print(config[:500])
