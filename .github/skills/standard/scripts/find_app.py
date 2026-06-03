"""ソリューションコンポーネント確認"""
import sys, os, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import get_token
from dotenv import load_dotenv
load_dotenv()

URL = os.environ["DATAVERSE_URL"].rstrip("/")
token = get_token()
h = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
API = URL + "/api/data/v9.2"

# ソリューション内コンポーネント
SOL_ID = "e24ef4f2-2433-f111-88b5-7ced8dea312a"
r = requests.get(f"{API}/solutioncomponents?$filter=_solutionid_value eq {SOL_ID}&$select=componenttype,objectid&$top=50", headers=h)
r.raise_for_status()
comps = r.json().get("value", [])
print(f"Solution components: {len(comps)}")
for c in comps:
    ct = c["componenttype"]
    oid = c["objectid"]
    print(f"  Type {ct}: {oid}")
