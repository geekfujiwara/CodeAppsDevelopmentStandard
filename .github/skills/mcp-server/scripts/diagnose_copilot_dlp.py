"""Copilot Studio MCP カスタムコネクタの DLP 分類を読み取り診断する。

DLP の共通ロジックは admin スキルの `dlp_helper.py` に集約している。
このスクリプトは MCP のホスト名を起点に、コネクタ特定と URL 規則の照合だけを行う。
読み取り専用でポリシーは変更しない。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_SKILLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_SKILLS / "standard" / "scripts"))
sys.path.insert(0, str(_SKILLS / "admin" / "scripts"))

from dlp_helper import (  # noqa: E402
    applied_policies,
    classify_connector,
    find_custom_connector,
    list_url_rules,
    normalize_host,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Copilot Studio MCP の DLP 分類を読み取り診断する")
    parser.add_argument(
        "--environment-id", default=os.getenv("POWER_PLATFORM_ENVIRONMENT_ID") or os.getenv("ENV_ID")
    )
    parser.add_argument("--connector-host", default=os.getenv("MCP_CONNECTOR_HOST"))
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID") or os.getenv("ENTRA_TENANT_ID"))
    parser.add_argument("--connector-name")
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id または POWER_PLATFORM_ENVIRONMENT_ID を指定してください")
    if not args.connector_host:
        parser.error("--connector-host または MCP_CONNECTOR_HOST を指定してください")
    if not args.tenant_id:
        parser.error("--tenant-id、TENANT_ID、ENTRA_TENANT_ID のいずれかを指定してください")

    host = normalize_host(args.connector_host)
    connector = find_custom_connector(
        args.environment_id, host=host, connector_name=args.connector_name
    )
    display_name = (connector.get("properties") or {}).get("displayName") or connector.get("name")
    print(f"Connector: {display_name} [{connector.get('name')}]")

    policies = applied_policies(args.environment_id)
    if not policies:
        print("Applied DLP policies: 0")
        return 0

    for policy in policies:
        print(f"Policy: {policy.get('displayName')} [{policy.get('environmentType')}]")
        classification, explicit = classify_connector(
            policy, connector.get("id") or connector.get("name", "")
        )
        suffix = "" if explicit else " (default)"
        print(f"  Connector classification: {classification}{suffix}")
        for rule in list_url_rules(args.tenant_id, policy["name"]):
            pattern = str(rule.get("pattern") or "")
            if pattern == "*" or host in pattern.lower():
                print(
                    "  URL pattern: "
                    f"{rule.get('order')} {rule.get('customConnectorRuleClassification')} {pattern}"
                )

    print("Read-only diagnosis complete. No policy was changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())