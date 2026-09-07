"""テナントレベル DLP ポリシーで、カスタムコネクタ（自前 MCP Server 等）の分類を設定する。

`Ignore *` だけのポリシーではカスタムコネクタが未分類のままになり、
Copilot Studio でツールが「データ損失防止ポリシーによりブロック」と表示されることがある。
対象ホストだけに URL パターン規則を 1 本追加して、明示的に分類する。

```powershell
python .github/skills/admin/scripts/set_dlp_custom_connector.py `
  --tenant-id $env:TENANT_ID `
  --policy "Tenant policy" `
  --host func-example-mcp.azurewebsites.net `
  --classification General            # 既定は変更内容の表示のみ（dry-run）
```

実際に適用するときだけ `--apply` を付ける。既存規則と末尾の `*` 規則は保持する。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import (  # noqa: E402
    DATA_GROUPS,
    label,
    list_policies,
    list_url_rules,
    normalize_host,
    replace_url_rules,
)

WILDCARD = "*"


def _resolve_policy(identifier: str) -> dict:
    matches = [
        policy
        for policy in list_policies()
        if identifier in (policy.get("name"), policy.get("displayName"))
    ]
    if not matches:
        raise SystemExit(f"ポリシーが見つかりません: {identifier}")
    if len(matches) > 1:
        raise SystemExit("同名のポリシーが複数あります。ポリシー名（GUID）で指定してください")
    return matches[0]


def _build_rules(existing: list[dict], pattern: str, classification: str) -> list[dict]:
    """対象パターンを先頭に、既存規則を維持したまま並べ直す（`*` は必ず末尾）。"""
    others = [dict(rule) for rule in existing if str(rule.get("pattern")) not in (pattern, WILDCARD)]
    wildcard = [dict(rule) for rule in existing if str(rule.get("pattern")) == WILDCARD]
    new_rule = {"customConnectorRuleClassification": classification, "pattern": pattern}
    ordered = [new_rule, *others, *wildcard]
    for index, rule in enumerate(ordered, start=1):
        rule["order"] = index
    return ordered


def _print_rules(title: str, rules: list[dict]) -> None:
    print(title)
    for rule in rules:
        classification = rule.get("customConnectorRuleClassification")
        print(f"    {rule.get('order')}. {label(classification)} <- {rule.get('pattern')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="カスタムコネクタの DLP 分類を設定する")
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID") or os.getenv("ENTRA_TENANT_ID"))
    parser.add_argument("--policy", required=True, help="ポリシーの表示名または名前（GUID）")
    parser.add_argument("--host", required=True, help="カスタムコネクタのホスト名")
    parser.add_argument("--classification", required=True, choices=DATA_GROUPS)
    parser.add_argument("--apply", action="store_true", help="実際にポリシーを更新する")
    args = parser.parse_args()

    if not args.tenant_id:
        parser.error("--tenant-id（または TENANT_ID）が必要です")

    host = normalize_host(args.host)
    pattern = f"https://{host}*"
    policy = _resolve_policy(args.policy)
    existing = list_url_rules(args.tenant_id, policy["name"])
    updated = _build_rules(existing, pattern, args.classification)

    print(f"ポリシー: {policy.get('displayName')} [{policy.get('environmentType')}]")
    _print_rules("  現在の URL 規則:", existing)
    _print_rules("  変更後の URL 規則:", updated)

    if not args.apply:
        print("\ndry-run のため変更していません。適用するには --apply を付けて再実行してください。")
        return 0

    replace_url_rules(args.tenant_id, policy["name"], updated)
    _print_rules("\n適用後（再取得）:", list_url_rules(args.tenant_id, policy["name"]))
    print("\n反映まで通常 1 時間程度（最大 24 時間）かかります。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
