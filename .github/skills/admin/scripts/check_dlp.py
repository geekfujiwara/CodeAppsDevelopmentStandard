"""ソリューション開発前の DLP（データ ポリシー）事前チェック。

対象環境に **適用される** DLP ポリシーを読み取り、そのソリューションが使う
コネクタが「ブロックされていないか」「同一グループに揃っているか」を判定する。
読み取り専用でポリシーは一切変更しない。手順の詳細は references/dlp-precheck.md を参照。

```powershell
python .github/skills/admin/scripts/check_dlp.py `
  --environment-id $env:ENV_ID `
  --tenant-id $env:TENANT_ID `
  --connector shared_commondataserviceforapps `
  --connector shared_office365 `
  --custom-host func-example-mcp.azurewebsites.net
```

終了コード: 0 = 問題なし / 1 = 開発前に解消が必要な問題を検出。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import (  # noqa: E402
    applied_policies,
    classify_connector,
    connector_id_for,
    label,
    list_url_rules,
    matching_url_rule,
    normalize_host,
)

# dlp_helper が standard/scripts を sys.path に追加済み
from connector_catalog import ConnectorResolutionError, resolve_connector_id  # noqa: E402


def _custom_classification(policy: dict, tenant_id: str | None, host: str) -> tuple[str, str]:
    """カスタムコネクタの実効分類と、その根拠を返す。"""
    default = policy.get("defaultConnectorsClassification") or "unknown"
    if not tenant_id:
        return default, "既定（--tenant-id 未指定のため URL 規則は未評価）"
    rule = matching_url_rule(list_url_rules(tenant_id, policy["name"]), host)
    if rule is None:
        return default, "既定（一致する URL 規則なし）"
    classification = rule.get("customConnectorRuleClassification") or "unknown"
    pattern = rule.get("pattern")
    if classification == "Ignore":
        return default, f"既定（URL 規則 '{pattern}' が Ignore のため未分類）"
    return classification, f"URL 規則 '{pattern}'"


def main() -> int:
    parser = argparse.ArgumentParser(description="開発前に DLP ポリシーの影響を確認する（読み取り専用）")
    parser.add_argument(
        "--environment-id", default=os.getenv("ENV_ID") or os.getenv("POWER_PLATFORM_ENVIRONMENT_ID")
    )
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID") or os.getenv("ENTRA_TENANT_ID"))
    parser.add_argument(
        "--connector",
        action="append",
        default=[],
        metavar="CONNECTOR",
        help="標準コネクタのコネクタ ID または通称（例: shared_sharepointonline / sharepoint。複数指定可）",
    )
    parser.add_argument(
        "--custom-host",
        action="append",
        default=[],
        metavar="HOST",
        help="カスタムコネクタ／MCP Server のホスト名（複数指定可）",
    )
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id（または ENV_ID）が必要です")
    if not args.connector and not args.custom_host:
        parser.error("--connector または --custom-host を 1 つ以上指定してください")

    # 通称（sharepoint 等）でもコネクタ ID でも受け付ける。曖昧な場合は問い合わせず停止する。
    connectors: list[str] = []
    for name in args.connector:
        try:
            connectors.append(resolve_connector_id(name))
        except ConnectorResolutionError as exc:
            parser.error(str(exc))

    hosts = [normalize_host(host) for host in args.custom_host]
    policies = applied_policies(args.environment_id)
    if not policies:
        print(f"環境 {args.environment_id} に適用される DLP ポリシーはありません。制約なしで開発できます。")
        return 0

    problems: list[str] = []
    for policy in policies:
        print(f"\n=== ポリシー: {policy.get('displayName')} [{policy.get('environmentType')}] ===")
        print(f"    既定の分類: {label(policy.get('defaultConnectorsClassification') or 'unknown')}")
        groups: set[str] = set()

        for name in connectors:
            classification, explicit = classify_connector(policy, connector_id_for(name))
            source = "明示分類" if explicit else "既定"
            print(f"    [標準] {name}: {label(classification)}（{source}）")
            groups.add(classification)
            if classification == "Blocked":
                problems.append(f"{policy.get('displayName')}: {name} がブロックされています")

        for host in hosts:
            classification, source = _custom_classification(policy, args.tenant_id, host)
            print(f"    [カスタム] {host}: {label(classification)}（{source}）")
            groups.add(classification)
            if classification == "Blocked":
                problems.append(f"{policy.get('displayName')}: {host} がブロックされています")
            elif "未分類" in source:
                problems.append(
                    f"{policy.get('displayName')}: {host} が未分類です"
                    "（Copilot Studio 等でツールがブロック扱いになる場合があります）"
                )

        usable = groups - {"Blocked"}
        if {"Confidential", "General"} <= usable:
            problems.append(
                f"{policy.get('displayName')}: Business と Non-business のコネクタが混在しています"
                "（同一アプリ／フロー／エージェントでは併用できません）"
            )

    print("\n--- 判定 ---")
    if problems:
        for problem in problems:
            print(f"NG: {problem}")
        print("\n開発を始める前に、上記を管理者と解消してください。")
        print("カスタムコネクタの分類は set_dlp_custom_connector.py で設定できます。")
        return 1

    print("OK: このソリューションのコネクタ構成は、適用中の DLP ポリシーで利用できます。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
