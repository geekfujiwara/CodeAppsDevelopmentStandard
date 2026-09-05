"""Copilot Studio MCP カスタムコネクタの DLP 分類を読み取り診断する。"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from auth_helper import get_token  # noqa: E402

BAP_BASE = "https://api.bap.microsoft.com"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
POWERAPPS_BASE = "https://api.powerapps.com"
POWERAPPS_SCOPE = "https://service.powerapps.com/.default"
TIMEOUT = 60


def get_json(url: str, scope: str) -> dict[str, Any]:
    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {get_token(scope=scope)}"},
        timeout=TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"管理 API の GET に失敗しました: HTTP {response.status_code}")
    return response.json()


def normalize_host(value: str) -> str:
    host = value.strip().lower()
    if host.startswith(("https://", "http://")):
        host = urlparse(host).hostname or ""
    if not re.fullmatch(r"[a-z0-9.-]+", host):
        raise ValueError("--connector-host にはホスト名だけを指定してください")
    return host


def environment_names(policy: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for environment in policy.get("environments") or []:
        if isinstance(environment, str):
            names.append(environment)
        elif environment.get("name"):
            names.append(environment["name"])
        elif environment.get("id"):
            names.append(environment["id"].rstrip("/").split("/")[-1])
    return names


def policy_applies(policy: dict[str, Any], environment_id: str) -> bool:
    names = environment_names(policy)
    environment_type = policy.get("environmentType")
    if environment_type == "OnlyEnvironments":
        return environment_id in names
    if environment_type == "ExceptEnvironments":
        return environment_id not in names
    return True


def list_policies() -> list[dict[str, Any]]:
    url = f"{BAP_BASE}/providers/PowerPlatform.Governance/v1/policies?$top=50&api-version=2016-11-01"
    return get_json(url, BAP_SCOPE).get("value") or []


def list_connectors(environment_id: str) -> list[dict[str, Any]]:
    url = (
        f"{POWERAPPS_BASE}/providers/Microsoft.PowerApps/scopes/admin/environments/"
        f"{environment_id}/apis?api-version=2017-05-01"
    )
    return get_json(url, POWERAPPS_SCOPE).get("value") or []


def list_url_rules(tenant_id: str, policy_id: str) -> list[dict[str, Any]]:
    url = (
        f"{BAP_BASE}/providers/PowerPlatform.Governance/v1/tenants/{tenant_id}/policies/"
        f"{policy_id}/urlPatterns?api-version=2016-11-01"
    )
    payload = get_json(url, BAP_SCOPE)
    if payload.get("rules") is not None:
        return payload["rules"]
    return (payload.get("value") or {}).get("rules") or []


def find_connector(
    connectors: list[dict[str, Any]], host: str, connector_name: str | None
) -> dict[str, Any]:
    matches = []
    for connector in connectors:
        if connector_name and connector.get("name") == connector_name:
            matches.append(connector)
        elif not connector_name and host in json.dumps(connector, ensure_ascii=True).lower():
            matches.append(connector)
    if not matches:
        raise RuntimeError(f"対象ホストのカスタムコネクタが見つかりません: {host}")
    if len(matches) > 1:
        raise RuntimeError("対象ホストに一致するコネクタが複数あります。--connector-name で絞ってください")
    return matches[0]


def connector_classification(policy: dict[str, Any], connector: dict[str, Any]) -> str:
    for group in policy.get("connectorGroups") or []:
        for classified in group.get("connectors") or []:
            if classified.get("id") == connector.get("id") or classified.get("name") == connector.get("name"):
                return group.get("classification") or "unknown"
    return f"{policy.get('defaultConnectorsClassification', 'unknown')} (default)"


def main() -> int:
    parser = argparse.ArgumentParser(description="Copilot Studio MCP の DLP 分類を読み取り診断する")
    parser.add_argument("--environment-id", default=os.getenv("POWER_PLATFORM_ENVIRONMENT_ID"))
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
    connector = find_connector(list_connectors(args.environment_id), host, args.connector_name)
    display_name = (connector.get("properties") or {}).get("displayName") or connector.get("name")
    print(f"Connector: {display_name} [{connector.get('name')}]")

    policies = [policy for policy in list_policies() if policy_applies(policy, args.environment_id)]
    if not policies:
        print("Applied DLP policies: 0")
        return 0

    for policy in policies:
        print(f"Policy: {policy.get('displayName')} [{policy.get('environmentType')}]")
        print(f"  Connector classification: {connector_classification(policy, connector)}")
        rules = sorted(list_url_rules(args.tenant_id, policy["name"]), key=lambda item: item.get("order", 0))
        for rule in rules:
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