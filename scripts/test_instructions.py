"""Bot configuration に instructions を直接設定してみるテスト"""
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
    "Content-Type": "application/json; charset=utf-8",
}

bot_id = "05be3e2f-9133-f111-88b5-7ced8dea312a"

# configuration に instructions と description を含めてみる
config = {
    "$kind": "BotConfiguration",
    "description": "社内のインシデント（障害・問題）を管理するためのAIアシスタントです。インシデントの起票、ステータス管理、コメント追加などを行います。",
    "instructions": "あなたは「インシデント管理アシスタント」です。社内のインシデント（障害・問題）を管理するためのAIエージェントです。\n\nユーザーの意図を正確に理解し、Dataverse のデータ操作を実行してください。日本語で丁寧に応答してください。",
    "settings": {
        "GenerativeActionsEnabled": True,
    },
    "aISettings": {
        "$kind": "AISettings",
        "useModelKnowledge": True,
        "isFileAnalysisEnabled": True,
        "isSemanticSearchEnabled": True,
        "optInUseLatestModels": True,
    },
    "recognizer": {
        "$kind": "GenerativeAIRecognizer",
    },
}

r = requests.patch(
    f"{API}/bots({bot_id})",
    headers=h,
    json={
        "configuration": json.dumps(config, ensure_ascii=False),
        "description": "社内のインシデント（障害・問題）を管理するためのAIアシスタントです。",
    },
)
print(f"PATCH status: {r.status_code}")
if not r.ok:
    print(r.text[:500])
else:
    print("OK - configuration updated with instructions + description")

# 確認
r2 = requests.get(f"{API}/bots({bot_id})", headers=h)
if r2.ok:
    bot = r2.json()
    desc = bot.get("description", "")
    print(f"\ndescription field: {desc}")
    config_str = bot.get("configuration", "")
    if config_str:
        parsed = json.loads(config_str)
        print(f"config.description: {parsed.get('description', '(none)')}")
        print(f"config.instructions: {parsed.get('instructions', '(none)')[:100]}")
