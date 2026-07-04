"""現在のユーザーをエンジニアレコードに割り当てるスクリプト"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '.github', 'skills', 'standard', 'scripts'))
from auth_helper import api_get, api_patch
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env'))
P = os.getenv("PUBLISHER_PREFIX", "geek")
DATAVERSE_URL = os.getenv("DATAVERSE_URL", "").rstrip("/")

# 1. 有効なユーザー一覧
print("=== 有効なシステムユーザー (上位10件) ===")
users = api_get("systemusers?$filter=isdisabled eq false and accessmode ne 4&$select=systemuserid,fullname,domainname&$top=10&$orderby=fullname")
for i, u in enumerate(users["value"]):
    print(f"  [{i}] {u['fullname']} | {u['domainname']} | {u['systemuserid']}")

# 2. エンジニア一覧
print("\n=== エンジニアレコード ===")
engineers = api_get(f"{P}_engineers?$select={P}_engineerid,{P}_name,{P}_area,_geek_userid_value")
for i, e in enumerate(engineers["value"]):
    uid = e.get("_geek_userid_value", None)
    print(f"  [{i}] {e[f'{P}_name']} | area={e.get(f'{P}_area', '')} | userid={uid or '(未割当)'}")

# 3. 割り当て
print("\n--- 割り当て ---")
eng_idx = int(input("エンジニア番号を入力: "))
user_idx = int(input("ユーザー番号を入力: "))

engineer = engineers["value"][eng_idx]
user = users["value"][user_idx]

eid = engineer[f"{P}_engineerid"]
uid = user["systemuserid"]

print(f"\n  エンジニア: {engineer[f'{P}_name']}")
print(f"  ユーザー: {user['fullname']} ({user['domainname']})")
confirm = input("割り当てますか? (y/n): ")

if confirm.lower() == "y":
    api_patch(f"{P}_engineers({eid})", {
        f"{P}_userid@odata.bind": f"/systemusers({uid})"
    })
    print("✅ 割り当て完了!")
else:
    print("キャンセルしました")
