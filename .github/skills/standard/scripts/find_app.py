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

# ソリューション内コンポーネント（ソリューション ID は .env(SOLUTION_ID) または第1引数で渡す）
SOL_ID = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SOLUTION_ID", "")).strip()
if not SOL_ID:
    sys.exit("SOLUTION_ID が未設定です（.env または引数で指定してください）")
r = requests.get(f"{API}/solutioncomponents?$filter=_solutionid_value eq {SOL_ID}&$select=componenttype,objectid&$top=50", headers=h)
r.raise_for_status()
comps = r.json().get("value", [])
print(f"Solution components: {len(comps)}")
for c in comps:
    ct = c["componenttype"]
    oid = c["objectid"]
    print(f"  Type {ct}: {oid}")
