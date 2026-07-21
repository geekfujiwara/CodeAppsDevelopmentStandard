"""フローを Dataverse workflow テーブルから検索してソリューションに追加（接続参照も同時に追加）"""
import sys, os, json, requests
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))
from auth_helper import get_token
from dotenv import load_dotenv
load_dotenv()

URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOL = os.environ.get("SOLUTION_NAME", "SampleSolution")
# フロー Workflow ID は .env（FLOW_WORKFLOW_ID）または第1引数で渡す
FLOW_ID = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("FLOW_WORKFLOW_ID", "")).strip()
if not FLOW_ID:
    sys.exit("FLOW_WORKFLOW_ID が未設定です（.env または引数で指定してください）")

token = get_token()
h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0"}
API = URL + "/api/data/v9.2"

# connectionreference の componenttype (ObjectTypeCode) は環境依存のためメタデータから解決する
# （固定値 10037 を仮定すると "Cannot add datalakeworkspace..." のような誤ったエラーになることがある）
def get_connectionreference_componenttype():
    r = requests.get(f"{API}/EntityDefinitions(LogicalName='connectionreference')?$select=ObjectTypeCode", headers=h)
    r.raise_for_status()
    return r.json()["ObjectTypeCode"]

# 1. workflow テーブルで検索
print("=== Workflow テーブル検索 ===")
# name で検索
r = requests.get(f"{API}/workflows?$filter=contains(name,'{SOL}')&$select=workflowid,name,category,statecode&$top=10", headers=h)
r.raise_for_status()
flows = r.json().get("value", [])
print(f"Found: {len(flows)}")
for f in flows:
    print(f"  id={f['workflowid']} name={f['name']} cat={f['category']} state={f['statecode']}")

# 2. Flow ID で直接検索
print(f"\n=== Flow ID {FLOW_ID} で直接検索 ===")
r2 = requests.get(f"{API}/workflows({FLOW_ID})?$select=workflowid,name,category,statecode,clientdata", headers=h)
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

    # 4. 接続参照も追加する（★ フロー本体を追加しただけでは接続参照はソリューションに入らない）
    print("\n=== 接続参照をソリューションに追加 ===")
    conn_ref_names = set()
    try:
        client_data = json.loads(w.get("clientdata") or "{}")
        for ref in (client_data.get("properties", {}).get("connectionReferences") or {}).values():
            # connectionReferenceLogicalName は "connection" キーの下にネストされている
            n = (ref.get("connection") or {}).get("connectionReferenceLogicalName")
            if n:
                conn_ref_names.add(n)
    except (json.JSONDecodeError, AttributeError):
        pass

    if not conn_ref_names:
        print("  接続参照なし（HTTP/Control アクションのみのフロー等）")
    else:
        componenttype = get_connectionreference_componenttype()
        for name in sorted(conn_ref_names):
            rcr = requests.get(
                f"{API}/connectionreferences?$filter=connectionreferencelogicalname eq '{name}'&$select=connectionreferenceid",
                headers=h,
            )
            crs = rcr.json().get("value", [])
            if not crs:
                print(f"  {name}: connectionreference レコードが見つかりません（スキップ）")
                continue
            crid = crs[0]["connectionreferenceid"]
            body_cr = {
                "ComponentId": crid,
                "ComponentType": componenttype,
                "SolutionUniqueName": SOL,
                "AddRequiredComponents": False,
                "DoNotIncludeSubcomponents": False,
            }
            r4 = requests.post(f"{API}/AddSolutionComponent", headers=h, json=body_cr)
            if r4.ok:
                print(f"  ✅ {name} をソリューションに追加しました")
            else:
                print(f"  ERROR {name} {r4.status_code}: {r4.text[:300]}")
else:
    print(f"  Not found ({r2.status_code}): {r2.text[:300]}")
    print("  → Flow API で作成したフローは process テーブルに別 ID で格納されている可能性があります")

