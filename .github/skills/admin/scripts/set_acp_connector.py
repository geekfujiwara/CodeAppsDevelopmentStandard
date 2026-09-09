"""ACP（Advanced connector policies）の許可コネクタを追加／削除する。

ACP は default-deny の厳格な許可リストです。許可リストに無いコネクタは
クラシック DLP が OK でもブロックされます（mixed mode では両方の
「より制限の厳しい設定」が適用されるため）。

既定は dry-run。実際に書き込むには --apply を付けます。

使い方:
    # 環境に効いている ACP を確認（読み取りのみ）
    python set_acp_connector.py --environment-id <ENV_ID> --list

    # 対象コネクタが許可されているか確認
    python set_acp_connector.py --environment-id <ENV_ID> --connector shared_xxx

    # 書き込みは apply_acp_profile.py / apply_group_acp_strategy.py でグループのみへ行う
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from auth_helper import get_session  # noqa: E402
from set_environment_routing import configuration_payload  # noqa: E402

PP_BASE = "https://api.powerplatform.com"
PP_SCOPE = "https://api.powerplatform.com/.default"
API_VERSION = "2024-10-01"
RULE_SET_ID = "ConnectorManagement"
CONNECTOR_PREFIX = "/providers/Microsoft.PowerApps/apis/"
PROFILE_FILE = Path(__file__).resolve().parents[1] / "references" / "acp-profiles.json"
_TIMEOUT = 120


def denied_connectors() -> set[str]:
    """どのプロファイル・経路でも許可してはならないレガシー コネクタ ID。"""
    return set(json.loads(PROFILE_FILE.read_text(encoding="utf-8")).get("legacyConnectors", []))


def assert_not_denied(connectors) -> None:
    """許可対象にレガシー コネクタが含まれていたら書き込み前に停止する。"""
    blocked = sorted(denied_connectors() & {str(name).rsplit("/", 1)[-1] for name in connectors})
    if blocked:
        raise ValueError(
            "レガシー コネクタは許可できません（acp-profiles.json legacyConnectors）: "
            + ", ".join(blocked)
        )


def _request(method: str, path: str, body: dict | None = None):
    url = f"{PP_BASE}{path}"
    sep = "&" if "?" in path else "?"
    url = f"{url}{sep}api-version={API_VERSION}"
    response = get_session(PP_SCOPE).request(
        method,
        url,
        headers={"Content-Type": "application/json"},
        json=body,
        timeout=_TIMEOUT,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"{method} {url} -> HTTP {response.status_code}: {response.text[:500]}")
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError:
        return None


def assigned_policy_id(resource_type: str, resource_id: str) -> str | None:
    if resource_type not in ("Environment", "EnvironmentGroup"):
        raise ValueError("Unknown assignment resource type")
    segment = "environments" if resource_type == "Environment" else "environmentGroups"
    data = _request("GET", f"/governance/ruleBasedPolicies/{segment}/{resource_id}/assignments")
    if not isinstance(data, dict) or not isinstance(data.get("value"), list):
        raise ValueError("Incomplete policy assignments")
    values = data["value"]
    if data.get("nextLink") or data.get("@odata.nextLink") or len(values) > 1:
        raise ValueError("Ambiguous policy assignments; inspect before continuing")
    if values and not values[0].get("policyId"):
        raise ValueError("Policy assignment has no policy ID")
    return values[0].get("policyId") if values else None


def get_policy(policy_id: str) -> dict:
    return _request("GET", f"/governance/ruleBasedPolicies/{policy_id}")


def connector_rule_set(policy: dict) -> dict | None:
    for rule_set in policy.get("ruleSets", []):
        if rule_set.get("id") == RULE_SET_ID:
            return rule_set
    return None


def allowed_ids(rule_set: dict) -> set[str]:
    entries = rule_set.get("inputs", {}).get("AllowedConnectorList", [])
    return {entry.get("AllowedConnector", "").rsplit("/", 1)[-1] for entry in entries}


def add_connectors(rule_set: dict, connectors: list[str]) -> list[str]:
    """許可リストに未登録のコネクタを追加し、追加したものを返す。"""
    assert_not_denied(connectors)
    entries = rule_set.setdefault("inputs", {}).setdefault("AllowedConnectorList", [])
    existing = allowed_ids(rule_set)
    added = []
    for connector in connectors:
        if connector in existing:
            continue
        entries.append(
            {
                "AllowedConnector": f"{CONNECTOR_PREFIX}{connector}",
                "AllowedActionsMode": "AllAllowed",
                "AllowedConnectionTypesMode": "AllAllowed",
            }
        )
        added.append(connector)
    return added


def patch_policy(policy_id: str, policy: dict, rule_set: dict) -> None:
    """ConnectorManagement だけを差し替え、グループの他のルールは必ず保持して送る。"""
    assert_not_denied(allowed_ids(rule_set))
    body = configuration_payload(policy)
    updated = copy.deepcopy(rule_set)
    updated.pop("lastModifiedDate", None)
    positions = [index for index, rule in enumerate(body["ruleSets"]) if rule.get("id") == RULE_SET_ID]
    if len(positions) > 1:
        raise ValueError(f"{RULE_SET_ID} ルールが重複しています。確認するまで書き込みません。")
    if positions:
        body["ruleSets"][positions[0]] = updated
    else:
        body["ruleSets"].append(updated)
    _request("PATCH", f"/governance/ruleBasedPolicies/{policy_id}", body)


def _process(label: str, policy_id: str, connectors: list[str], list_only: bool, apply: bool) -> bool:
    policy = get_policy(policy_id)
    rule_set = connector_rule_set(policy)
    print(f"\n=== {label}: {policy.get('name')} ({policy_id}) ===")
    if rule_set is None:
        print(f"  {RULE_SET_ID} ルールセットがありません（ACP 未適用）。")
        return True

    ids = allowed_ids(rule_set)
    print(f"  許可コネクタ数: {len(ids)}")
    if list_only:
        for connector in sorted(ids):
            print(f"    {connector}")
        return True

    all_ok = True
    for connector in connectors:
        state = "許可" if connector in ids else "ブロック"
        print(f"  [{state}] {connector}")
        all_ok = all_ok and connector in ids
    if all_ok:
        print("  変更はありません。")
        return True

    added = add_connectors(rule_set, connectors)
    if not apply:
        print(f"  [dry-run] 追加予定: {', '.join(added)}")
        print("  実際に反映するには --apply を付けてください。")
        return False

    patch_policy(policy_id, policy, rule_set)
    print(f"  追加しました: {', '.join(added)}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="ACP の許可コネクタを確認・追加する")
    parser.add_argument("--environment-id", default=os.environ.get("ENV_ID"), help="対象環境 ID")
    parser.add_argument("--environment-group-id", help="環境グループ ID（未指定なら環境から解決）")
    parser.add_argument("--policy-id", help="ポリシー ID を直接指定する場合")
    parser.add_argument("--connector", action="append", default=[], help="コネクタ ID（shared_xxx、複数可）")
    parser.add_argument("--include-group", action="store_true", help="環境グループ側のポリシーも読み取る")
    parser.add_argument("--list", action="store_true", help="許可コネクタを一覧表示するだけ")
    parser.add_argument("--apply", action="store_true", help="実際に書き込む（既定は dry-run）")
    args = parser.parse_args()

    if args.apply:
        parser.error("この CLI は読み取り専用です。apply_acp_profile.py / apply_group_acp_strategy.py でグループのみへ設定してください。")

    if not args.policy_id and not args.environment_id:
        parser.error("--environment-id または --policy-id が必要です。")
    if not args.list and not args.connector:
        parser.error("--connector か --list を指定してください。")

    targets: list[tuple[str, str]] = []
    if args.policy_id:
        targets.append(("ポリシー", args.policy_id))
    else:
        env_policy = assigned_policy_id("Environment", args.environment_id)
        if env_policy:
            targets.append(("環境ポリシー", env_policy))
        else:
            print("環境に ACP は割り当てられていません。")
        if args.include_group:
            group_id = args.environment_group_id
            if not group_id:
                group_id = _environment_group_id(args.environment_id)
            if group_id:
                group_policy = assigned_policy_id("EnvironmentGroup", group_id)
                if group_policy:
                    targets.append(("環境グループ ポリシー", group_policy))
            else:
                print("環境グループが見つかりませんでした。")

    if not targets:
        print("更新対象のポリシーがありません。")
        return 0

    ok = True
    for label, policy_id in targets:
        ok = _process(label, policy_id, args.connector, args.list, args.apply) and ok
    return 0 if ok else 1


def _environment_group_id(environment_id: str) -> str | None:
    """BAP API から環境グループ ID を取得する。"""
    session = get_session("https://api.bap.microsoft.com/.default")
    url = (
        "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform"
        f"/scopes/admin/environments/{environment_id}?api-version=2021-04-01"
    )
    response = session.get(url, timeout=_TIMEOUT)
    if response.status_code >= 300:
        return None
    group = response.json().get("properties", {}).get("parentEnvironmentGroup") or {}
    return group.get("id")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"エラー: {exc}", file=sys.stderr)
        sys.exit(2)
