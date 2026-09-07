"""環境戦略を適用する。

設定は**環境グループのルール**で行うのを原則とし、グループ ルールに存在しない
項目だけをテナント設定・環境個別設定で補う（ブループリントの `ruleModel` 参照）。

- 不足している環境グループを作成する
- グループのルール（共有上限 / ソリューション チェッカー / Code Apps / クレジット プール /
  アンマネージド禁止 / ACP 専用モード / コネクタ許可リスト / ウェルカム コンテンツ）を適用する
- 既定環境を既定環境グループへ割り当てる
- 既定環境ルーティングの宛先グループを変更する
- テナント設定をブループリントの推奨値に合わせる

既定は **dry-run**。実際に変更するときだけ `--apply` を付ける。

使い方:
    python apply_environment_strategy.py                          # dry-run（全体）
    python apply_environment_strategy.py --groups-only --apply
    python apply_environment_strategy.py --rules-only --apply
    python apply_environment_strategy.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402
from set_environment_group_rules import (  # noqa: E402
    apply_classic,
    apply_policy,
    get_classic_rule_set,
    get_policy,
    save_classic,
    save_policy,
    set_connector_list,
    set_welcome_content,
    tenant_host,
)

BAP_BASE = "https://api.bap.microsoft.com"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
PP_BASE = "https://api.powerplatform.com"
PP_SCOPE = "https://api.powerplatform.com/.default"
BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"
_TIMEOUT = 180


def _call(method: str, url: str, scope: str, body: dict | None = None) -> tuple[int, dict]:
    for attempt in range(4):
        try:
            response = requests.request(
                method,
                url,
                headers={"Authorization": f"Bearer {get_token(scope=scope)}", "Content-Type": "application/json"},
                json=body,
                timeout=_TIMEOUT,
            )
            break
        except requests.exceptions.SSLError:
            if attempt == 3:
                raise
            time.sleep(3)
    payload = {}
    if response.content:
        try:
            payload = response.json()
        except ValueError:
            payload = {"raw": response.text[:400]}
    return response.status_code, payload


def list_groups() -> list[dict]:
    _, data = _call("GET", f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01", PP_SCOPE)
    return data.get("value") or []


def create_group(display_name: str, description: str) -> tuple[int, dict]:
    return _call(
        "POST",
        f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01",
        PP_SCOPE,
        {"displayName": display_name, "description": description},
    )


def get_tenant_settings() -> dict:
    _, data = _call(
        "POST",
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2021-04-01",
        BAP_SCOPE,
        {},
    )
    return data


def save_tenant_settings(delta: dict) -> tuple[int, dict]:
    """変更する項目だけを含む差分を送る（全量を送る API ではない）。"""
    return _call(
        "POST",
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/updateTenantSettings?api-version=2021-04-01",
        BAP_SCOPE,
        delta,
    )


def _read(settings: dict, path: str):
    current = settings
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _write(settings: dict, path: str, value) -> None:
    parts = path.split(".")
    current = settings
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def apply_groups(blueprint: dict, apply: bool) -> int:
    existing = {group.get("displayName") for group in list_groups()}
    missing = [group for group in blueprint["groups"] if group["name"] not in existing]

    print("=== 環境グループ ===")
    if not missing:
        print("  推奨グループはすべて存在します。")
        return 0

    failures = 0
    for group in missing:
        if not apply:
            print(f"  [dry-run] 作成予定: {group['name']}")
            continue
        status, payload = create_group(group["name"], group["purpose"])
        if status < 300:
            print(f"  [作成] {group['name']} (id={payload.get('id')})")
        else:
            failures += 1
            print(f"  [失敗] {group['name']}: HTTP {status} {json.dumps(payload, ensure_ascii=False)[:200]}")
    return failures


def apply_tenant_settings(blueprint: dict, apply: bool) -> int:
    settings = get_tenant_settings()
    if not settings:
        print("=== テナント設定 ===\n  取得に失敗しました。")
        return 1

    groups_by_name = {group.get("displayName"): group.get("id") for group in list_groups()}
    changes = []
    for path, spec in blueprint["tenantSettings"].items():
        if "expected" in spec:
            expected = spec["expected"]
        elif spec.get("expectedGroup"):
            expected = groups_by_name.get(spec["expectedGroup"])
            if not expected:
                print(f"  [スキップ] {spec['label']}: グループ `{spec['expectedGroup']}` が未作成です。")
                continue
        else:
            continue
        actual = _read(settings, path)
        if actual != expected:
            changes.append((path, spec, actual, expected))

    print("\n=== テナント設定 ===")
    if not changes:
        print("  推奨値との差分はありません。")
        return 0

    for path, spec, actual, expected in changes:
        prefix = "[変更]" if apply else "[dry-run]"
        print(f"  {prefix} {spec['label']}: {actual} -> {expected}")
        print(f"           理由: {spec['why']}")

    if not apply:
        return 0

    delta: dict = {}
    for path, _spec, _actual, expected in changes:
        _write(delta, path, expected)
    status, payload = save_tenant_settings(delta)
    if status < 300:
        print("  テナント設定を保存しました。")
        return 0
    print(f"  [失敗] テナント設定の保存: HTTP {status} {json.dumps(payload, ensure_ascii=False)[:300]}")
    return 1


def derive_rules(group: dict, blueprint: dict) -> tuple[list[str], list[str], bool, str | None]:
    """ブループリントの `rules` を、グループ ルールの設定式へ変換する。"""
    rules = group.get("rules") or {}
    classic: list[str] = []
    policy: list[str] = []

    limit = rules.get("sharingLimitUsers")
    if "sharingLimitUsers" in rules:
        value = -1 if limit is None else limit
        for resource in ("App", "Flow", "UsersBot"):
            classic.append(f"Sharing/{resource}/MaximumShareLimit={value}")
    if rules.get("solutionCheckerMode"):
        classic.append(f"SolutionChecker/solutionCheckerMode={rules['solutionCheckerMode']}")

    if "codeApps" in rules:
        policy.append(f"CodeAppsFeature/PowerApps_AllowCodeApps={str(bool(rules['codeApps'])).lower()}")
    if "copilotCredits" in rules:
        policy.append(
            "CostControlsDrawFromTenantCreditPool/DrawFromTenantCreditPool="
            f"{str(bool(rules['copilotCredits'])).lower()}"
        )
    if "managedSolutionsOnly" in rules:
        policy.append(
            "BlockUnmanagedCustomization/IsLockdownOfUnmanagedCustomizationEnabled="
            f"{str(bool(rules['managedSolutionsOnly'])).lower()}"
        )
    if blueprint["connectorPolicy"]["mode"] == "ACPOnly":
        policy.append("AdvancedConnectorPoliciesOnly/EnableAdvancedConnectorPoliciesOnly=true")

    override = group.get("connectorPolicyOverride") or {}
    block_all = override.get("mode") == "BlockAll"
    welcome = rules.get("welcomeMessage") if rules.get("makerWelcomeContent") else None
    return classic, policy, block_all, welcome


def apply_group_rules(blueprint: dict, tenant_id: str, apply: bool) -> int:
    host = tenant_host(tenant_id)
    by_name = {group.get("displayName"): group.get("id") for group in list_groups()}

    print("\n=== 環境グループのルール ===")
    failures = 0
    for group in blueprint["groups"]:
        group_id = by_name.get(group["name"])
        if not group_id:
            print(f"  [スキップ] {group['name']}: グループが未作成です。")
            failures += 1
            continue

        classic_updates, policy_updates, block_all, welcome = derive_rules(group, blueprint)
        rule_set = get_classic_rule_set(host, group_id)
        policy_doc = get_policy(host, group_id)
        parameters, classic_changes = apply_classic(rule_set, classic_updates)
        rule_sets, policy_changes = apply_policy(policy_doc, policy_updates)
        if block_all:
            policy_changes.append(set_connector_list(rule_sets, []))
        if welcome:
            policy_changes.append(set_welcome_content(rule_sets, welcome, blueprint["guideline"].get("url")))

        print(f"\n  {group['name']}")
        for change in classic_changes + policy_changes:
            print(f"    {'' if apply else '[dry-run] '}{change}")
        if not apply:
            continue
        try:
            if classic_changes:
                save_classic(host, group_id, rule_set, parameters)
            if policy_changes:
                save_policy(host, group_id, policy_doc, rule_sets)
            print("    ルールを発行しました。")
        except Exception as error:  # noqa: BLE001
            failures += 1
            print(f"    [失敗] {error}")
    return failures


def assign_environments(blueprint: dict, apply: bool) -> int:
    """既定環境を、既定環境グループへ割り当てる。"""
    target = next((g for g in blueprint["groups"] if g.get("isolateDefaultEnvironment")), None)
    if not target:
        return 0
    group_id = {g.get("displayName"): g.get("id") for g in list_groups()}.get(target["name"])
    if not group_id:
        print("\n=== 既定環境の割り当て ===\n  グループが未作成です。")
        return 1

    _, data = _call("GET", f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2021-04-01", BAP_SCOPE)
    default_environment = next(
        (e for e in data.get("value", []) if (e.get("properties") or {}).get("environmentSku") == "Default"), None
    )
    print("\n=== 既定環境の割り当て ===")
    if not default_environment:
        print("  既定環境が見つかりませんでした。")
        return 1

    properties = default_environment.get("properties", {})
    current = (properties.get("parentEnvironmentGroup") or {}).get("id")
    name = properties.get("displayName")
    if current == group_id:
        print(f"  {name}: すでに {target['name']} に所属しています。")
        return 0
    if not apply:
        print(f"  [dry-run] {name}: {current or '未所属'} -> {target['name']}")
        return 0

    status, payload = _call(
        "PATCH",
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/"
        f"{default_environment['name']}?api-version=2021-04-01",
        BAP_SCOPE,
        {"properties": {"parentEnvironmentGroup": {"id": group_id}}},
    )
    if status < 300:
        print(f"  {name} を {target['name']} へ割り当てました（反映まで数十秒）。")
        return 0
    print(f"  [失敗] HTTP {status} {json.dumps(payload, ensure_ascii=False)[:200]}")
    return 1


def print_manual_steps() -> None:
    print("\n=== 別スクリプトで行う設定（環境グループのルールに無い項目） ===")
    print("  1. マネージド環境ではない環境をマネージド化する（set_managed_environment.py）")
    print("     グループにはマネージド環境しか入れられない。")
    print("  2. 既定環境以外の環境をグループへ割り当てる")
    print("     PATCH .../environments/{id} の properties.parentEnvironmentGroup.id で設定できる。")
    print("  3. Dataverse 検索を有効化する（enable_dataverse_search.py）")
    print("  4. Copilot クレジットの環境別配分（set_environment_capacity.py）")
    print("     グループ ルールはテナント クレジット プールの消費可否のみ。")
    print("  5. 利用ガイドラインを SharePoint に公開し、URL をウェルカム コンテンツへ設定する")


def main() -> int:
    parser = argparse.ArgumentParser(description="環境戦略を適用する")
    parser.add_argument("--tenant-id", help="テナント ID（グループ ルールの適用に必要）")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT, help="ブループリント JSON")
    parser.add_argument("--groups-only", action="store_true", help="環境グループの作成のみ行う")
    parser.add_argument("--rules-only", action="store_true", help="グループのルールのみ適用する")
    parser.add_argument("--tenant-settings-only", action="store_true", help="テナント設定のみ変更する")
    parser.add_argument("--apply", action="store_true", help="実際に変更する（既定は dry-run）")
    args = parser.parse_args()

    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    if not args.apply:
        print("[dry-run] 変更は行いません。適用するには --apply を付けてください。\n")

    only = args.groups_only or args.rules_only or args.tenant_settings_only
    failures = 0
    if args.groups_only or not only:
        failures += apply_groups(blueprint, args.apply)
    if args.rules_only or not only:
        if not args.tenant_id:
            parser.error("グループのルールを適用するには --tenant-id が必要です。")
        failures += apply_group_rules(blueprint, args.tenant_id, args.apply)
        failures += assign_environments(blueprint, args.apply)
    if args.tenant_settings_only or not only:
        failures += apply_tenant_settings(blueprint, args.apply)

    print_manual_steps()
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
