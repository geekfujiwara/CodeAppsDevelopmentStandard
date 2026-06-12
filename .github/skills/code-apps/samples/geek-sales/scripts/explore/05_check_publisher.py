"""Step 0: パブリッシャー確認 + ソリューション/テーブル名衝突チェック"""
import sys, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from auth_helper import api_get
from dotenv import load_dotenv
load_dotenv()

SOLUTION_NAME = os.getenv("SOLUTION_NAME", "")
PREFIX = os.getenv("PUBLISHER_PREFIX", "")

def main():
    # 1. 既存パブリッシャー一覧
    pubs = api_get("publishers?$filter=customizationprefix ne 'none'&$select=friendlyname,uniquename,customizationprefix&$orderby=friendlyname")
    print("=== Existing Publishers ===")
    for p in pubs.get("value", []):
        print(f"  {p['customizationprefix']:8s} | {p['friendlyname']} ({p['uniquename']})")

    # 2. ソリューション名の重複チェック
    print(f"\n=== Solution check: {SOLUTION_NAME} ===")
    sol = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")
    vals = sol.get("value", [])
    if vals:
        print(f"  EXISTS: {vals[0]['friendlyname']} ({vals[0]['solutionid']})")
    else:
        print("  Not found (will be created)")

    # 3. テーブルスキーマ名の重複チェック
    print(f"\n=== Table check: {PREFIX}_conversationsummary ===")
    # All entities with geek_ prefix
    ents = api_get(f"EntityDefinitions?$select=LogicalName,DisplayName")
    geek_tables = [e for e in ents.get("value", []) if e["LogicalName"].startswith(f"{PREFIX}_")]
    print(f"  Tables with prefix '{PREFIX}_': {len(geek_tables)}")
    for e in geek_tables:
        dn = (e.get("DisplayName") or {}).get("UserLocalizedLabel") or {}
        print(f"    {e['LogicalName']:40s} | {dn.get('Label','')}")

    target = f"{PREFIX}_conversationsummary"
    match = [e for e in geek_tables if e["LogicalName"] == target]
    if match:
        print(f"\n  WARNING: {target} already exists!")
    else:
        print(f"\n  OK: {target} does not exist yet")

if __name__ == "__main__":
    main()
