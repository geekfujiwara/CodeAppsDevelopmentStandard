"""Power Platform データ ポリシー（DLP）の共通ヘルパー。

``auth_helper`` のキャッシュ済み認証を使うため、``Add-PowerAppsAccount`` や
``az login`` などの対話サインインは不要。読み取りは常に非対話で完走する。

```python
from dlp_helper import applied_policies, classify_connector, find_custom_connector
```
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from auth_helper import get_session  # noqa: E402

BAP_BASE = "https://api.bap.microsoft.com"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
POWERAPPS_BASE = "https://api.powerapps.com"
POWERAPPS_SCOPE = "https://service.powerapps.com/.default"
GOVERNANCE = "/providers/PowerPlatform.Governance/v1"
GOVERNANCE_API_VERSION = "2016-11-01"
CONNECTOR_API_VERSION = "2017-05-01"
_TIMEOUT = 60

# 管理センターの表示名と API 上の分類値の対応。
CLASSIFICATION_LABELS = {
    "Confidential": "Business",
    "General": "Non-business",
    "Blocked": "Blocked",
    "Ignore": "Ignore",
}
DATA_GROUPS = ("Confidential", "General", "Blocked")


def _request(method: str, url: str, scope: str, body: dict | None = None) -> Any:
    response = get_session(scope).request(
        method,
        url,
        headers={"Content-Type": "application/json"},
        json=body,
        timeout=_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {url.split('?')[0]} が失敗しました: HTTP {response.status_code}")
    if not response.content:
        return None
    return response.json()


def list_policies() -> list[dict[str, Any]]:
    """テナントから参照できる DLP ポリシーを列挙する。"""
    url = f"{BAP_BASE}{GOVERNANCE}/policies?$top=50&api-version={GOVERNANCE_API_VERSION}"
    return (_request("GET", url, BAP_SCOPE) or {}).get("value") or []


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
    """ポリシーのスコープ種別を解釈して、対象環境に適用されるかを判定する。"""
    names = environment_names(policy)
    environment_type = policy.get("environmentType")
    if environment_type == "OnlyEnvironments":
        return environment_id in names
    if environment_type == "ExceptEnvironments":
        return environment_id not in names
    return True


def applied_policies(environment_id: str) -> list[dict[str, Any]]:
    return [policy for policy in list_policies() if policy_applies(policy, environment_id)]


def list_custom_connectors(environment_id: str) -> list[dict[str, Any]]:
    url = (
        f"{POWERAPPS_BASE}/providers/Microsoft.PowerApps/scopes/admin/environments/"
        f"{environment_id}/apis?api-version={CONNECTOR_API_VERSION}"
    )
    return (_request("GET", url, POWERAPPS_SCOPE) or {}).get("value") or []


def list_connector_catalog(environment_id: str) -> list[dict[str, Any]]:
    """対象環境で参照できる全コネクタ（認定・Independent Publisher 含む）を列挙する。

    第一者判定はサービス ID と publisher の両方を確認する。
    ``properties.metadata.source`` は ``marketplace`` / ``independentpublisher`` /
    ``powerapps-user-defined``（カスタムコネクタ）を返す。
    """
    url = (
        f"{POWERAPPS_BASE}/providers/Microsoft.PowerApps/apis"
        f"?api-version=2016-11-01&showApisWithToS=true"
        f"&$filter=environment%20eq%20%27{environment_id}%27"
    )
    items = []
    visited = set()
    while url:
        if url in visited or urlparse(url).scheme != "https" or urlparse(url).netloc != urlparse(POWERAPPS_BASE).netloc:
            raise ValueError("Invalid connector catalog continuation URL")
        visited.add(url)
        data = _request("GET", url, POWERAPPS_SCOPE)
        if not isinstance(data, dict) or not isinstance(data.get("value"), list):
            raise ValueError("Incomplete connector catalog")
        items.extend(data["value"])
        next_url = data.get("nextLink") or data.get("@odata.nextLink")
        url = urljoin(url, next_url) if next_url else None
    return items


def connector_source(connector: dict[str, Any]) -> str:
    return ((connector.get("properties") or {}).get("metadata") or {}).get("source") or ""


def normalize_host(value: str) -> str:
    """``https://host/path`` でもホスト名だけを返す。不正な文字は拒否する。"""
    host = value.strip().lower()
    if host.startswith(("https://", "http://")):
        from urllib.parse import urlparse

        host = urlparse(host).hostname or ""
    if not re.fullmatch(r"[a-z0-9.-]+", host):
        raise ValueError(f"ホスト名として解釈できません: {value}")
    return host


def connector_host(connector: dict[str, Any]) -> str:
    """カスタムコネクタのバックエンドホストを返す（取得できない場合は空文字）。"""
    properties = connector.get("properties") or {}
    for candidate in (
        properties.get("primaryRuntimeUrl"),
        (properties.get("backendService") or {}).get("serviceUrl"),
        *(properties.get("runtimeUrls") or []),
    ):
        if candidate:
            try:
                return normalize_host(candidate)
            except ValueError:
                continue
    return ""


def find_custom_connector(
    environment_id: str, *, host: str | None = None, connector_name: str | None = None
) -> dict[str, Any]:
    """ホスト名またはコネクタ名からカスタムコネクタを 1 件に特定する。"""
    if not host and not connector_name:
        raise ValueError("host または connector_name のいずれかを指定してください")
    target_host = normalize_host(host) if host else None
    matches = []
    for connector in list_custom_connectors(environment_id):
        if connector_name:
            if connector.get("name") == connector_name:
                matches.append(connector)
        elif target_host and (
            connector_host(connector) == target_host
            or target_host in json.dumps(connector, ensure_ascii=True).lower()
        ):
            matches.append(connector)
    if not matches:
        raise RuntimeError(f"カスタムコネクタが見つかりません: {connector_name or target_host}")
    if len(matches) > 1:
        raise RuntimeError("条件に一致するコネクタが複数あります。コネクタ名で指定してください")
    return matches[0]


def classify_connector(policy: dict[str, Any], connector_id: str) -> tuple[str, bool]:
    """(分類, 明示分類かどうか) を返す。未分類なら既定グループを返す。"""
    for group in policy.get("connectorGroups") or []:
        for classified in group.get("connectors") or []:
            if classified.get("id") == connector_id or classified.get("name") == connector_id:
                return group.get("classification") or "unknown", True
    return policy.get("defaultConnectorsClassification") or "unknown", False


def connector_id_for(name: str) -> str:
    """``shared_xxx`` 形式の名前を DLP が保持する id 形式へ正規化する。"""
    if name.startswith("/providers/"):
        return name
    return f"/providers/Microsoft.PowerApps/apis/{name}"


def list_url_rules(tenant_id: str, policy_name: str) -> list[dict[str, Any]]:
    """テナントレベルのカスタムコネクタ URL パターン規則を取得する。"""
    url = (
        f"{BAP_BASE}{GOVERNANCE}/tenants/{tenant_id}/policies/{policy_name}"
        f"/urlPatterns?api-version={GOVERNANCE_API_VERSION}"
    )
    payload = _request("GET", url, BAP_SCOPE) or {}
    rules = payload.get("rules")
    if rules is None:
        rules = (payload.get("value") or {}).get("rules") or []
    return sorted(rules, key=lambda rule: rule.get("order", 0))


def replace_url_rules(tenant_id: str, policy_name: str, rules: list[dict[str, Any]]) -> Any:
    """URL パターン規則を丸ごと置き換える（API が全置換のため、既存規則も必ず含めて渡す）。"""
    url = (
        f"{BAP_BASE}{GOVERNANCE}/tenants/{tenant_id}/policies/{policy_name}"
        f"/urlPatterns?api-version={GOVERNANCE_API_VERSION}"
    )
    return _request("POST", url, BAP_SCOPE, {"rules": rules})


def pattern_matches(pattern: str, host: str) -> bool:
    """DLP の URL パターン（``*`` ワイルドカード）がホストに一致するかを判定する。"""
    if pattern == "*":
        return True
    regex = "".join(".*" if part == "*" else re.escape(part) for part in re.split(r"(\*)", pattern))
    return re.fullmatch(regex, f"https://{host}", flags=re.IGNORECASE) is not None


def matching_url_rule(rules: list[dict[str, Any]], host: str) -> dict[str, Any] | None:
    """評価順（先勝ち）で最初に一致した規則を返す。"""
    for rule in sorted(rules, key=lambda item: item.get("order", 0)):
        if pattern_matches(str(rule.get("pattern") or ""), host):
            return rule
    return None


def label(classification: str) -> str:
    return CLASSIFICATION_LABELS.get(classification, classification)
