"""環境戦略の現状スキャン（読み取り専用）。

テナント設定・環境グループ・環境・マネージド環境・コネクタ ポリシー・ライセンス・
Copilot クレジットを読み取り、[environment-strategy.json](../references/environment-strategy.json)
のブループリントと突き合わせてギャップを出力する。**一切変更しない。**

使い方:
    python scan_environment_strategy.py --tenant-id <TENANT_ID>
    python scan_environment_strategy.py --tenant-id <TENANT_ID> --report-file scan.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import applied_policies, get_token  # noqa: E402
from set_acp_connector import allowed_ids, assigned_policy_id, connector_rule_set, get_policy  # noqa: E402

BAP_BASE = "https://api.bap.microsoft.com"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
PP_BASE = "https://api.powerplatform.com"
PP_SCOPE = "https://api.powerplatform.com/.default"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"
_TIMEOUT = 120


def _get(url: str, scope: str, method: str = "GET", body: dict | None = None):
    response = requests.request(
        method,
        url,
        headers={"Authorization": f"Bearer {get_token(scope=scope)}", "Content-Type": "application/json"},
        json=body,
        timeout=_TIMEOUT,
    )
    if response.status_code >= 300:
        return {"_error": f"HTTP {response.status_code}"}
    return response.json() if response.content else {}


def tenant_settings() -> dict:
    url = f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2020-10-01"
    return _get(url, BAP_SCOPE, method="POST", body={})


def environment_groups() -> list[dict]:
    data = _get(f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01", PP_SCOPE)
    return data.get("value") or []


def environments() -> list[dict]:
    url = (
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments"
        f"?api-version=2021-04-01&$expand=properties"
    )
    return (_get(url, BAP_SCOPE).get("value")) or []


def copilot_allocation(environment_id: str) -> float | None:
    url = f"{PP_BASE}/licensing/environments/{environment_id}/allocations?api-version=2022-03-01-preview"
    data = _get(url, PP_SCOPE)
    for allocation in data.get("currencyAllocations") or []:
        if allocation.get("currencyType") == "MCSMessages":
            return allocation.get("allocated")
    return None


def license_summary(blueprint: dict) -> dict:
    data = _get("https://graph.microsoft.com/v1.0/subscribedSkus", GRAPH_SCOPE)
    if "_error" in data:
        return {"error": data["_error"]}
    managed_keys = blueprint["licenses"]["managedEnvironmentSkuKeywords"]
    copilot_keys = blueprint["licenses"]["copilotStudioSkuKeywords"]
    premium, copilot = [], []
    for sku in data.get("value") or []:
        part = (sku.get("skuPartNumber") or "").upper()
        entry = {
            "skuPartNumber": part,
            "enabled": (sku.get("prepaidUnits") or {}).get("enabled", 0),
            "consumed": sku.get("consumedUnits", 0),
        }
        if any(key in part for key in managed_keys):
            premium.append(entry)
        if any(key in part for key in copilot_keys):
            copilot.append(entry)
    return {"premiumLikeSkus": premium, "copilotStudioSkus": copilot}


def _nested(settings: dict, path: str):
    current = settings
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def scan(tenant_id: str, blueprint: dict) -> dict:
    settings = tenant_settings()
    groups = environment_groups()
    group_by_id = {group.get("id"): group.get("displayName") for group in groups}
    envs = []
    for environment in environments():
        properties = environment.get("properties") or {}
        environment_id = environment.get("name")
        governance = properties.get("governanceConfiguration") or {}
        extended = governance.get("settings", {}).get("extendedSettings", {}) if governance else {}
        parent = (properties.get("parentEnvironmentGroup") or {}).get("id")
        acp_policy = assigned_policy_id("Environment", environment_id)
        acp_count = None
        if acp_policy:
            rule_set = connector_rule_set(get_policy(acp_policy))
            acp_count = len(allowed_ids(rule_set)) if rule_set else None
        envs.append(
            {
                "id": environment_id,
                "displayName": properties.get("displayName"),
                "sku": properties.get("environmentSku"),
                "isDefault": properties.get("isDefault", False),
                "managed": governance.get("protectionLevel") == "Standard",
                "sharingLimit": extended.get("limitSharingMode"),
                "maxSharingUsers": extended.get("maxLimitUserSharing"),
                "solutionCheckerMode": extended.get("solutionCheckerMode"),
                "hasDataverse": bool(properties.get("linkedEnvironmentMetadata")),
                "group": group_by_id.get(parent),
                "acpPolicyId": acp_policy,
                "acpAllowedCount": acp_count,
                "copilotCredits": copilot_allocation(environment_id),
            }
        )

    dlp = [
        {"name": policy.get("name"), "displayName": policy.get("displayName"), "type": policy.get("environmentType")}
        for policy in applied_policies(envs[0]["id"])
    ] if envs else []

    setting_gaps = []
    for path, spec in blueprint["tenantSettings"].items():
        if "expected" not in spec:
            continue
        actual = _nested(settings, path)
        if actual != spec["expected"]:
            setting_gaps.append(
                {"setting": path, "label": spec["label"], "actual": actual, "expected": spec["expected"], "why": spec["why"]}
            )

    blueprint_groups = [group["name"] for group in blueprint["groups"]]
    existing_groups = [group.get("displayName") for group in groups]
    return {
        "tenantId": tenant_id,
        "tenantSettings": {
            path: _nested(settings, path) for path in blueprint["tenantSettings"]
        },
        "tenantSettingGaps": setting_gaps,
        "environmentGroups": [{"id": g.get("id"), "displayName": g.get("displayName")} for g in groups],
        "missingGroups": [name for name in blueprint_groups if name not in existing_groups],
        "environments": envs,
        "unmanagedEnvironments": [e["displayName"] for e in envs if not e["managed"] and e["hasDataverse"]],
        "ungroupedEnvironments": [e["displayName"] for e in envs if not e["group"] and e["hasDataverse"]],
        "classicDlpPolicies": dlp,
        "licenses": license_summary(blueprint),
    }


def print_report(report: dict, blueprint: dict) -> None:
    print("=== 環境戦略スキャン（読み取りのみ・変更していません）===\n")

    print(f"環境グループ: {len(report['environmentGroups'])} 件")
    for group in report["environmentGroups"]:
        print(f"  - {group['displayName']}")
    if report["missingGroups"]:
        print(f"  未作成（推奨）: {', '.join(report['missingGroups'])}")

    print(f"\n環境: {len(report['environments'])} 件")
    print(f"  {'環境名':<28}{'SKU':<12}{'managed':<9}{'共有上限':<10}{'グループ':<24}{'ACP許可':<8}Copilot")
    for environment in report["environments"]:
        limit = environment["maxSharingUsers"]
        limit_text = "無制限" if limit in (None, -1) else str(limit)
        print(
            f"  {str(environment['displayName'])[:26]:<28}"
            f"{str(environment['sku'])[:10]:<12}"
            f"{'はい' if environment['managed'] else 'いいえ':<9}"
            f"{limit_text:<10}"
            f"{str(environment['group'] or '-')[:22]:<24}"
            f"{str(environment['acpAllowedCount'] or '-'):<8}"
            f"{environment['copilotCredits'] if environment['copilotCredits'] is not None else '-'}"
        )

    if report["unmanagedEnvironments"]:
        print(f"\n[要対応] マネージド環境ではない: {', '.join(report['unmanagedEnvironments'])}")
        print("         環境グループにはマネージド環境しか入れられません。")
    if report["ungroupedEnvironments"]:
        print(f"[要対応] どのグループにも属していない: {', '.join(report['ungroupedEnvironments'])}")

    print("\n--- テナント設定 ---")
    for path, spec in blueprint["tenantSettings"].items():
        actual = report["tenantSettings"].get(path)
        expected = spec.get("expected", spec.get("expectedGroup"))
        mark = "OK  " if "expected" in spec and actual == spec["expected"] else "確認"
        print(f"  [{mark}] {spec['label']}: 現在={actual} / 推奨={expected}")

    print(f"\n--- クラシック DLP（適用中 {len(report['classicDlpPolicies'])} 件）---")
    for policy in report["classicDlpPolicies"]:
        print(f"  {policy['displayName']} ({policy['type']})")
    print(f"  推奨: {blueprint['connectorPolicy']['mode']}（{blueprint['connectorPolicy']['profile']} プロファイル）")

    licenses = report["licenses"]
    print("\n--- ライセンス ---")
    if licenses.get("error"):
        print(f"  取得できませんでした（{licenses['error']}）。Microsoft Graph の権限を確認してください。")
    else:
        if not licenses["premiumLikeSkus"]:
            print("  [要対応] Power Apps Premium 等のスタンドアロン ライセンスが見つかりません。")
            print(f"           {blueprint['licenses']['why']}")
        for sku in licenses["premiumLikeSkus"]:
            print(f"  {sku['skuPartNumber']}: {sku['consumed']} / {sku['enabled']}")
        if not licenses["copilotStudioSkus"]:
            print("  [確認] Copilot Studio のライセンス / クレジットが見つかりません。")
        for sku in licenses["copilotStudioSkus"]:
            print(f"  {sku['skuPartNumber']}: {sku['consumed']} / {sku['enabled']}")

    allocated = sum(e["copilotCredits"] or 0 for e in report["environments"])
    print(f"\n  Copilot クレジット（MCSMessages）割り当て済み合計: {allocated}")
    print("  テナントの購入数は 管理センター > ライセンス > Copilot Credits で確認する。")


def main() -> int:
    parser = argparse.ArgumentParser(description="環境戦略の現状を読み取り専用でスキャンする")
    parser.add_argument("--tenant-id", default=os.environ.get("TENANT_ID"), help="テナント ID")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT, help="ブループリント JSON")
    parser.add_argument("--report-file", type=Path, help="スキャン結果を JSON で書き出す")
    args = parser.parse_args()

    if not args.tenant_id:
        parser.error("--tenant-id が必要です。")

    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    report = scan(args.tenant_id, blueprint)
    print_report(report, blueprint)

    if args.report_file:
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nスキャン結果を書き出しました: {args.report_file}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
