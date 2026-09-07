"""環境グループのルールを非公開 API で確認・設定する。

Power Platform 管理センターが使うテナント専用ホスト
`https://{tenant30}.{tenant2}.tenant.api.powerplatform.com` の governance API を直接叩く。
公開ドキュメントには無いが、`auth_helper` の既存トークン（`api.powerplatform.com` スコープ）で動作する。

ルールは 2 系統ある。

1. **クラシック ルール**（`ruleSets`）: Sharing / SolutionChecker / Lifecycle / AdminDigest /
   GenerativeAISettings / Copilot / MakerOnboarding
2. **ポリシー ルール**（`ruleBasedPolicies`）: ConnectorManagement / AdvancedConnectorPoliciesOnly /
   BlockUnmanagedCustomization / CodeAppsFeature / CostControlsDrawFromTenantCreditPool /
   MakerOnboardingContent / ReleaseChannel など

ルール ID の一覧は [rule-catalog.md](../references/rule-catalog.md) を参照。

使い方:
    # 現在のルールを表示
    python set_environment_group_rules.py --environment-group-id <GID> --list

    # クラシック ルール（Type[/ResourceType]/Id=value）
    python set_environment_group_rules.py --environment-group-id <GID> \
        --rule "Sharing/App/MaximumShareLimit=1" \
        --rule "SolutionChecker/solutionCheckerMode=block" --apply

    # ポリシー ルール（RuleSetId/InputKey=value）
    python set_environment_group_rules.py --environment-group-id <GID> \
        --policy-rule "BlockUnmanagedCustomization/IsLockdownOfUnmanagedCustomizationEnabled=true" \
        --policy-rule "CodeAppsFeature/PowerApps_AllowCodeApps=false" --apply

    # 全コネクタをブロック + ウェルカム メッセージ
    python set_environment_group_rules.py --environment-group-id <GID> \
        --block-all-connectors --welcome-markdown-file welcome.md --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402

PP_SCOPE = "https://api.powerplatform.com/.default"
API_VERSION = "2021-10-01-preview"
CONNECTOR_PREFIX = "/providers/Microsoft.PowerApps/apis/"
DEFAULT_POLICY_NAME = "Default Policy Name"
_TIMEOUT = 180

# 管理センターが既定値を持たないルールは、追加時にこの雛形を使う。
POLICY_RULE_VERSIONS = {
    "ConnectorManagement": "1.0",
    "AdvancedConnectorPoliciesOnly": "1.0",
    "BlockUnmanagedCustomization": "1.0",
    "CodeAppsFeature": "1.0",
    "CostControlsDrawFromTenantCreditPool": "1.0",
    "MakerOnboardingContent": "1.0",
    "ReleaseChannel": "1.0",
}

# GET は Boolean / 整数も文字列で返すが、PATCH は JSON の型どおりでないと 400 になる。
# 値が常に文字列のルールだけ型変換の対象外にする。
STRING_ONLY_RULES = {"MakerOnboardingContent"}


def tenant_host(tenant_id: str) -> str:
    compact = tenant_id.replace("-", "")
    return f"https://{compact[:30]}.{compact[30:]}.tenant.api.powerplatform.com"


def _request(host: str, method: str, path: str, body: dict | None = None) -> dict:
    separator = "&" if "?" in path else "?"
    response = requests.request(
        method,
        f"{host}{path}{separator}api-version={API_VERSION}",
        headers={"Authorization": f"Bearer {get_token(scope=PP_SCOPE)}", "Content-Type": "application/json"},
        json=body,
        timeout=_TIMEOUT,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"HTTP {response.status_code} {method} {path}: {response.text[:400]}")
    return response.json() if response.content else {}


def get_classic_rule_set(host: str, group_id: str) -> dict | None:
    data = _request(host, "GET", f"/governance/environmentGroups/{group_id}/ruleSets")
    values = data.get("value") or []
    return values[0] if values else None


def get_policy(host: str, group_id: str) -> dict | None:
    data = _request(
        host, "GET", f"/governance/environmentGroups/{group_id}/ruleBasedPolicies?includeCustomerContent=true"
    )
    values = data.get("value") or []
    return values[0] if values else None


def _parse_classic(expression: str) -> tuple[str, str, str, str]:
    """`Type[/ResourceType]/Id=value` を (type, resourceType, id, value) に分解する。"""
    left, _, value = expression.partition("=")
    parts = [p for p in left.split("/") if p]
    if len(parts) == 3:
        return parts[0], parts[1], parts[2], value
    if len(parts) == 2:
        return parts[0], "NotSpecified", parts[1], value
    raise ValueError(f"形式が不正です: {expression}（例: Sharing/App/MaximumShareLimit=1）")


def _coerce(rule_id: str, value):
    if rule_id in STRING_ONLY_RULES or not isinstance(value, str):
        return value
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    if value.lstrip("-").isdigit():
        return int(value)
    return value


def _parse_policy(expression: str) -> tuple[str, str, str]:
    left, _, value = expression.partition("=")
    parts = [p for p in left.split("/") if p]
    if len(parts) != 2:
        raise ValueError(f"形式が不正です: {expression}（例: CodeAppsFeature/PowerApps_AllowCodeApps=false）")
    return parts[0], parts[1], value


def apply_classic(rule_set: dict | None, updates: list[str]) -> tuple[list[dict], list[str]]:
    parameters = [dict(p) for p in (rule_set or {}).get("parameters", [])]
    changes = []
    for expression in updates:
        rule_type, resource_type, key, value = _parse_classic(expression)
        target = next(
            (p for p in parameters if p.get("type") == rule_type and p.get("resourceType", "NotSpecified") == resource_type),
            None,
        )
        if target is None:
            target = {"type": rule_type, "resourceType": resource_type, "value": []}
            parameters.append(target)
        target.setdefault("value", [])
        entry = next((v for v in target["value"] if v.get("id") == key), None)
        before = entry.get("value") if entry else None
        if entry is None:
            target["value"].append({"id": key, "value": value})
        else:
            entry["value"] = value
        changes.append(f"{rule_type}/{resource_type}/{key}: {before} -> {value}")
    return parameters, changes


def apply_policy(policy: dict | None, updates: list[str]) -> tuple[list[dict], list[str]]:
    rule_sets = [json.loads(json.dumps(rs)) for rs in (policy or {}).get("ruleSets", [])]
    for rule in rule_sets:
        rule["inputs"] = {k: _coerce(rule.get("id", ""), v) for k, v in (rule.get("inputs") or {}).items()}
    changes = []
    for expression in updates:
        rule_id, key, value = _parse_policy(expression)
        target = next((rs for rs in rule_sets if rs.get("id") == rule_id), None)
        if target is None:
            target = {"id": rule_id, "version": POLICY_RULE_VERSIONS.get(rule_id, "1.0"), "inputs": {}}
            rule_sets.append(target)
        inputs = target.setdefault("inputs", {})
        before = inputs.get(key)
        inputs[key] = _coerce(rule_id, value)
        changes.append(f"{rule_id}/{key}: {before} -> {inputs[key]}")
    return rule_sets, changes


def set_connector_list(rule_sets: list[dict], connectors: list[str]) -> str:
    target = next((rs for rs in rule_sets if rs.get("id") == "ConnectorManagement"), None)
    if target is None:
        target = {"id": "ConnectorManagement", "version": "1.0", "inputs": {}}
        rule_sets.append(target)
    before = len(target.get("inputs", {}).get("AllowedConnectorList") or [])
    target["inputs"] = {
        "AllowedConnectorList": [
            {
                "AllowedConnector": name if name.startswith("/") else CONNECTOR_PREFIX + name,
                "AllowedActionsMode": "AllAllowed",
                "AllowedConnectionTypesMode": "AllAllowed",
            }
            for name in connectors
        ]
    }
    return f"ConnectorManagement/AllowedConnectorList: {before} 件 -> {len(connectors)} 件"


def set_welcome_content(rule_sets: list[dict], markdown: str, url: str | None) -> str:
    target = next((rs for rs in rule_sets if rs.get("id") == "MakerOnboardingContent"), None)
    if target is None:
        target = {"id": "MakerOnboardingContent", "version": "1.0", "inputs": {}}
        rule_sets.append(target)
    inputs = target.setdefault("inputs", {})
    inputs["makerOnboardingMarkdown"] = markdown
    inputs["makerOnboardingUrl"] = url or inputs.get("makerOnboardingUrl", "")
    inputs["makerOnboardingTimestamp"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    inputs.setdefault("makerOnboardingPortals", "")
    return f"MakerOnboardingContent: {len(markdown)} 文字のウェルカム コンテンツを設定"


def save_classic(host: str, group_id: str, rule_set: dict | None, parameters: list[dict]) -> None:
    if rule_set and rule_set.get("id"):
        body = {"id": rule_set["id"], "parameters": parameters, "environmentFilter": None, "lastModified": None}
        _request(host, "PUT", f"/governance/ruleSets/{rule_set['id']}", body)
        return
    staged = [dict(p, hasStagedChanges=True) for p in parameters]
    _request(host, "POST", f"/governance/environmentGroups/{group_id}/ruleSets", {"parameters": staged})


def save_policy(host: str, group_id: str, policy: dict | None, rule_sets: list[dict]) -> str:
    if policy and policy.get("id"):
        body = {"id": policy["id"], "name": policy.get("name") or DEFAULT_POLICY_NAME, "ruleSets": rule_sets}
        _request(host, "PATCH", f"/governance/ruleBasedPolicies/{policy['id']}", body)
        return policy["id"]
    created = _request(host, "POST", "/governance/ruleBasedPolicies", {"name": DEFAULT_POLICY_NAME, "ruleSets": rule_sets})
    policy_id = created.get("id")
    _request(host, "POST", f"/governance/ruleBasedPolicies/{policy_id}/environmentGroups/{group_id}/assignments", {})
    return policy_id


def print_current(rule_set: dict | None, policy: dict | None) -> None:
    print("=== クラシック ルール（ruleSets）===")
    if not rule_set:
        print("  未設定")
    else:
        print(f"  ruleSetId: {rule_set.get('id')}")
        for parameter in rule_set.get("parameters", []):
            resource = parameter.get("resourceType", "NotSpecified")
            for value in parameter.get("value", []):
                print(f"  {parameter.get('type')}/{resource}/{value.get('id')} = {value.get('value')}")

    print("\n=== ポリシー ルール（ruleBasedPolicies）===")
    if not policy:
        print("  未設定")
        return
    print(f"  policyId: {policy.get('id')} / name: {policy.get('name')}")
    for rule in policy.get("ruleSets", []):
        for key, value in (rule.get("inputs") or {}).items():
            display = f"<{len(value)} 件>" if isinstance(value, list) else str(value)[:80]
            print(f"  {rule.get('id')}/{key} = {display}")


def main() -> int:
    parser = argparse.ArgumentParser(description="環境グループのルールを確認・設定する")
    parser.add_argument("--tenant-id", default=os.environ.get("TENANT_ID"), help="テナント ID")
    parser.add_argument("--environment-group-id", required=True, help="環境グループ ID")
    parser.add_argument("--list", action="store_true", help="現在のルールを表示して終了する")
    parser.add_argument("--rule", action="append", default=[], help="クラシック ルール Type[/ResourceType]/Id=value")
    parser.add_argument("--policy-rule", action="append", default=[], help="ポリシー ルール RuleSetId/InputKey=value")
    parser.add_argument("--allow-connector", action="append", default=[], help="ACP で許可するコネクタ（全置換）")
    parser.add_argument("--block-all-connectors", action="store_true", help="ACP の許可リストを空にして全ブロック")
    parser.add_argument("--welcome-markdown-file", type=Path, help="ウェルカム コンテンツの Markdown ファイル")
    parser.add_argument("--welcome-url", help="ウェルカム コンテンツのリンク先 URL")
    parser.add_argument("--apply", action="store_true", help="実際に変更する（既定は dry-run）")
    args = parser.parse_args()

    if not args.tenant_id:
        parser.error("--tenant-id が必要です。")

    host = tenant_host(args.tenant_id)
    rule_set = get_classic_rule_set(host, args.environment_group_id)
    policy = get_policy(host, args.environment_group_id)

    if args.list:
        print_current(rule_set, policy)
        return 0

    parameters, classic_changes = apply_classic(rule_set, args.rule)
    rule_sets, policy_changes = apply_policy(policy, args.policy_rule)

    if args.block_all_connectors:
        policy_changes.append(set_connector_list(rule_sets, []))
    elif args.allow_connector:
        policy_changes.append(set_connector_list(rule_sets, args.allow_connector))

    if args.welcome_markdown_file:
        markdown = args.welcome_markdown_file.read_text(encoding="utf-8")
        policy_changes.append(set_welcome_content(rule_sets, markdown, args.welcome_url))

    if not classic_changes and not policy_changes:
        print("変更対象がありません。--rule / --policy-rule / --block-all-connectors などを指定してください。")
        return 0

    prefix = "" if args.apply else "[dry-run] "
    for change in classic_changes + policy_changes:
        print(f"  {prefix}{change}")

    if not args.apply:
        print("\n適用するには --apply を付けてください。")
        return 0

    if classic_changes:
        save_classic(host, args.environment_group_id, rule_set, parameters)
        print("\nクラシック ルールを保存しました。")
    if policy_changes:
        policy_id = save_policy(host, args.environment_group_id, policy, rule_sets)
        print(f"ポリシー ルールを保存しました（policyId={policy_id}）。")
    print("グループ内の全環境へ反映されます。反映には数分かかることがあります。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
