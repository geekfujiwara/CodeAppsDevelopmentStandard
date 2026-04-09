"""Dataverse 接続の詳細を確認"""
import sys, os, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import get_token
from dotenv import load_dotenv
load_dotenv()

ENV_ID = "9dd13689-8a7e-4fd8-ab92-52445d8ff1b0"

PA_API = "https://api.powerapps.com"
token = get_token(scope="https://service.powerapps.com/.default")
h = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

# List all Dataverse connections
r = requests.get(
    f"{PA_API}/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections",
    headers=h,
    params={"$filter": f"environment eq '{ENV_ID}'", "api-version": "2016-11-01"}
)
r.raise_for_status()
conns = r.json().get("value", [])
print(f"Dataverse connections: {len(conns)}")
for c in conns:
    name = c["name"]
    props = c.get("properties", {})
    statuses = props.get("statuses", [])
    status_list = [s.get("status", "") for s in statuses]
    created_by = props.get("createdBy", {}).get("displayName", "")
    print(f"  {name}")
    print(f"    statuses: {status_list}")
    print(f"    createdBy: {created_by}")
    print(f"    authenticatedUser: {props.get('authenticatedUser', {})}")
