"""GPT コンポーネントの先頭行を確認"""
from auth_helper import get_session
import os

s = get_session()
url = os.getenv("DATAVERSE_URL").rstrip("/")
r = s.get(f"{url}/api/data/v9.2/botcomponents(cf20b37f-bd2a-4b77-8889-4cfc01a570a0)?$select=data")
data = r.json().get("data", "")
lines = data.split("\n")
print(f"Total lines: {len(lines)}")
for i, line in enumerate(lines[:8]):
    print(f"  {i}: {line}")
