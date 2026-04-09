"""フローを Dataverse workflow テーブルから検索してソリューションに追加"""
import sys, os, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import get_token
from dotenv import load_dotenv
load_dotenv()

URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOL = os.environ.get("SOLUTION_NAME", "IncidentManagement")
FLOW_ID = "7bfda812-803b-4d5e-a992-b5af6153c572"

token = get_token()
h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0"}
API = URL + "/api/data/v9.2"

# 1. workflow テーブルで検索
print("=== Workflow テーブル検索 ===")
# name で検索
r = requests.get(f"{API}/workflows?$filter=contains(name,'インシデント')&$select=workflowid,name,category,statecode&$top=10", headers=h)
r.raise_for_status()
flows = r.json().get("value", [])
print(f"Found: {len(flows)}")
for f in flows:
    print(f"  id={f['workflowid']} name={f['name']} cat={f['category']} state={f['statecode']}")

# 2. Flow ID で直接検索
print(f"\n=== Flow ID {FLOW_ID} で直接検索 ===")
r2 = requests.get(f"{API}/workflows({FLOW_ID})?$select=workflowid,name,category,statecode", headers=h)
if r2.ok:
    w = r2.json()
    print(f"  Found: {w['name']} (cat={w['category']}, state={w['statecode']})")
    
    # 3. ソリューションに追加
    print("\n=== ソリューションに追加 ===")
    body = {
        "ComponentId": FLOW_ID,
        "ComponentType": 29,
        "SolutionUniqueName": SOL,
        "AddRequiredComponents": False,
        "DoNotIncludeSubcomponents": False,
    }
    r3 = requests.post(f"{API}/AddSolutionComponent", headers=h, json=body)
    if r3.ok:
        print(f"  ✅ フローをソリューションに追加しました")
    else:
        print(f"  ERROR {r3.status_code}: {r3.text[:500]}")
else:
    print(f"  Not found ({r2.status_code}): {r2.text[:300]}")
    print("  → Flow API で作成したフローは process テーブルに別 ID で格納されている可能性があります")
