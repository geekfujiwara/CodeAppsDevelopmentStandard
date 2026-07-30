"""
既存 Dataverse テーブルのメタデータを調査し、Code Apps 実装に必要な情報を出力する。

Code Apps で既存テーブルに接続する場合、生成される型定義だけでは
EntitySetName / 主キー / 主名称列 / 選択肢（OptionSet）の値が分からず、
クエリや表示ラベルの実装で手戻りが発生する。実装前にこれを確定させる。

認証は standard スキルの auth_helper を使う（requests / MSAL の直呼びは禁止）。

使い方:
  python .github/skills/code-apps/scripts/inspect_table_metadata.py {prefix}_store {prefix}_salesplan
  python .github/skills/code-apps/scripts/inspect_table_metadata.py {prefix}_store --custom-only
  python .github/skills/code-apps/scripts/inspect_table_metadata.py {prefix}_store --json > table-metadata.json

必要な環境変数（`.env` / references/.env.example 参照）:
  DATAVERSE_URL           Dataverse 組織 URL
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# --- auth_helper（standard スキル）を import パスに追加 ---
_SCRIPT_DIR = Path(__file__).resolve().parent
_CANDIDATES = [
    _SCRIPT_DIR.parent.parent / "standard" / "scripts",  # .github/skills/standard/scripts
    *[p / ".github" / "skills" / "standard" / "scripts" for p in _SCRIPT_DIR.parents],
    *[p / "scripts" for p in _SCRIPT_DIR.parents],
    *_SCRIPT_DIR.parents,
]
for _c in _CANDIDATES:
    if (_c / "auth_helper.py").is_file():
        sys.path.insert(0, str(_c))
        break
else:  # noqa: PLW0120
    sys.exit("auth_helper.py が見つかりません（standard スキルの scripts フォルダを確認）")

for _p in _SCRIPT_DIR.parents:
    if (_p / ".env").is_file():
        load_dotenv(_p / ".env")
        break

from auth_helper import api_get  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# 子属性（yomi_ / _base など）を除いた実列だけを対象にする
ATTR_SELECT = (
    "LogicalName,SchemaName,AttributeType,IsCustomAttribute,"
    "IsValidForCreate,IsValidForUpdate,AttributeOf"
)


def label(node):
    """DisplayName / OptionSet ラベルからユーザー既定言語のラベルを取り出す。"""
    if not node:
        return ""
    localized = node.get("UserLocalizedLabel") or {}
    if localized.get("Label"):
        return localized["Label"]
    labels = node.get("LocalizedLabels") or []
    return labels[0]["Label"] if labels else ""


def fetch_table(logical_name, custom_only):
    entity = api_get(
        f"EntityDefinitions(LogicalName='{logical_name}')"
        "?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName"
    )

    attrs = api_get(
        f"EntityDefinitions(LogicalName='{logical_name}')/Attributes"
        f"?$select={ATTR_SELECT}"
    )["value"]
    attrs = [a for a in attrs if not a.get("AttributeOf")]
    if custom_only:
        attrs = [a for a in attrs if a.get("IsCustomAttribute")]
    attrs.sort(key=lambda a: a["LogicalName"])

    picklists = api_get(
        f"EntityDefinitions(LogicalName='{logical_name}')/Attributes"
        "/Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        "?$select=LogicalName&$expand=OptionSet($select=Options)"
    )["value"]
    options = {
        p["LogicalName"]: [
            {"value": o["Value"], "label": label(o.get("Label"))}
            for o in (p.get("OptionSet") or {}).get("Options", [])
        ]
        for p in picklists
        if not custom_only or any(a["LogicalName"] == p["LogicalName"] for a in attrs)
    }

    lookups = api_get(
        f"EntityDefinitions(LogicalName='{logical_name}')/Attributes"
        "/Microsoft.Dynamics.CRM.LookupAttributeMetadata"
        "?$select=LogicalName,Targets"
    )["value"]

    return {
        "logicalName": entity["LogicalName"],
        "displayName": label(entity.get("DisplayName")),
        "entitySetName": entity["EntitySetName"],
        "primaryIdAttribute": entity["PrimaryIdAttribute"],
        "primaryNameAttribute": entity["PrimaryNameAttribute"],
        "attributes": [
            {
                "logicalName": a["LogicalName"],
                "type": a["AttributeType"],
                "isCustom": bool(a.get("IsCustomAttribute")),
                "writable": bool(a.get("IsValidForCreate") or a.get("IsValidForUpdate")),
            }
            for a in attrs
        ],
        "optionSets": options,
        "lookups": {
            l["LogicalName"]: l.get("Targets", [])
            for l in lookups
            if not custom_only or any(a["LogicalName"] == l["LogicalName"] for a in attrs)
        },
    }


def print_table(t):
    print(f"\n=== {t['logicalName']}  {t['displayName']} ===")
    print(f"  EntitySetName        : {t['entitySetName']}")
    print(f"  PrimaryIdAttribute   : {t['primaryIdAttribute']}")
    print(f"  PrimaryNameAttribute : {t['primaryNameAttribute']}")

    print(f"\n  列 ({len(t['attributes'])})")
    width = max((len(a["logicalName"]) for a in t["attributes"]), default=0)
    for a in t["attributes"]:
        flag = "" if a["writable"] else "  (読み取り専用)"
        print(f"    {a['logicalName']:<{width}}  {a['type']}{flag}")

    if t["lookups"]:
        print("\n  参照列（$expand の対象）")
        for name, targets in sorted(t["lookups"].items()):
            print(f"    {name} -> {', '.join(targets)}")

    if t["optionSets"]:
        print("\n  選択肢")
        for name, opts in sorted(t["optionSets"].items()):
            print(f"    {name}")
            for o in opts:
                print(f"      {o['value']}  {o['label']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tables", nargs="+", help="調査対象テーブルの論理名")
    parser.add_argument("--custom-only", action="store_true", help="カスタム列のみ出力")
    parser.add_argument("--json", action="store_true", help="JSON で出力")
    args = parser.parse_args()

    if not os.environ.get("DATAVERSE_URL", "").strip():
        raise SystemExit("DATAVERSE_URL が .env に設定されていません。")

    result = [fetch_table(name, args.custom_only) for name in args.tables]

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for t in result:
            print_table(t)


if __name__ == "__main__":
    main()
