"""Copilot Studio 関連テーブルの探索スクリプト（Step 1: テーブル発見）"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from auth_helper import api_get

def main():
    # メタデータは contains() 非対応のため全件取得してクライアント側フィルタ
    res = api_get(
        "EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,"
        "PrimaryIdAttribute,PrimaryNameAttribute,IsManaged,EntitySetName"
    )
    patterns = ["conversation", "transcript", "bot", "copilot", "msdyn_ai", "session", "analytics"]
    rows = []
    for ent in res.get("value", []):
        ln = ent["LogicalName"]
        if not any(p in ln for p in patterns):
            continue
        disp = ent.get("DisplayName", {})
        label = ""
        if disp and disp.get("UserLocalizedLabel"):
            label = disp["UserLocalizedLabel"]["Label"]
        rows.append((ln, ent.get("EntitySetName", ""), label))

    print(f"=== 会話/Bot関連テーブル ({len(rows)}件) ===")
    for ln, eset, label in sorted(rows):
        print(f"  {ln:45s} | {eset:40s} | {label}")

if __name__ == "__main__":
    main()
