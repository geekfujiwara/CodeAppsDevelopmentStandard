"""Step 2: 主要テーブルの列構造とレコード件数を確認"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from auth_helper import api_get

TABLES = {
    "conversationtranscript": "conversationtranscripts",
    "agentconversationmessage": "agentconversationmessages",
    "bot": "bots",
    "msdyn_copilotinteractions": "msdyn_copilotinteractionses",
}

def show_attributes(logical):
    res = api_get(
        f"EntityDefinitions(LogicalName='{logical}')/Attributes"
        "?$select=LogicalName,AttributeType,DisplayName,IsValidForRead"
    )
    attrs = []
    for a in res.get("value", []):
        if not a.get("IsValidForRead"):
            continue
        disp = a.get("DisplayName", {})
        label = ""
        if disp and disp.get("UserLocalizedLabel"):
            label = disp["UserLocalizedLabel"]["Label"]
        attrs.append((a["LogicalName"], a.get("AttributeType", ""), label))
    return sorted(attrs)

def count_rows(eset):
    try:
        res = api_get(f"{eset}?$count=true&$top=1")
        return res.get("@odata.count", "?")
    except Exception as e:
        return f"ERR {e}"

def main():
    for logical, eset in TABLES.items():
        print(f"\n{'='*70}\n■ {logical}  ({eset})")
        cnt = count_rows(eset)
        print(f"  レコード件数: {cnt}")
        for ln, t, label in show_attributes(logical):
            print(f"    {ln:40s} | {t:18s} | {label}")

if __name__ == "__main__":
    main()
