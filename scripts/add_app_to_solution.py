"""Code App をソリューションに追加"""
import sys, os, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import get_token
from dotenv import load_dotenv
load_dotenv()

URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOL = os.environ.get("SOLUTION_NAME", "IncidentManagement")
APP_ID = "28e3fd52-3052-4cbf-9efa-e8067a094b1d"

token = get_token()
h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"}
API = URL + "/api/data/v9.2"

# 1. canvasappid で直接検索
print("=== Code App 検索 ===")
r = requests.get(f"{API}/canvasapps({APP_ID})?$select=canvasappid,name,displayname", headers=h)
if r.ok:
    app = r.json()
    print(f"  Found: {app.get('displayname','')} (canvasappid={app['canvasappid']})")
    cid = app["canvasappid"]
else:
    print(f"  canvasappid 直接検索失敗 ({r.status_code}), name フィルタで検索...")
    # Power Apps の appId は PowerApps API 側の ID、Dataverse 側は別 ID の可能性
    r2 = requests.get(f"{API}/canvasapps?$filter=contains(displayname,'インシデント')&$select=canvasappid,name,displayname", headers=h)
    r2.raise_for_status()
    apps = r2.json().get("value", [])
    if apps:
        app = apps[0]
        print(f"  Found by name: {app.get('displayname','')} (canvasappid={app['canvasappid']})")
        cid = app["canvasappid"]
    else:
        print("  Code App が見つかりません。pac solution add-component で追加します。")
        cid = None

if cid:
    print("\n=== ソリューションに追加 ===")
    body = {
        "ComponentId": cid,
        "ComponentType": 300,
        "SolutionUniqueName": SOL,
        "AddRequiredComponents": False,
        "DoNotIncludeSubcomponents": False,
    }
    r3 = requests.post(f"{API}/AddSolutionComponent", headers=h, json=body)
    if r3.ok:
        print(f"  ✅ Code App をソリューションに追加しました")
    else:
        print(f"  ERROR {r3.status_code}: {r3.text[:500]}")
        print("\n  → pac solution add-component で試みます")
else:
    print("\n→ pac コマンドで追加を試みます")
