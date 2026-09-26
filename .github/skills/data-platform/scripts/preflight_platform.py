"""データ基盤の事前確認（読み取りのみ）。

使い方:
    python preflight_platform.py --platform fabric --platform databricks --platform foundry [--out FILE]

確認: サブスクリプション / リソースプロバイダー登録 / リソースグループ / 既存リソースと計算状態。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import Api, HttpError, env, exit_code, load_env, print_json, result, summarize, write_json  # noqa: E402
from deploy_platform import derive_names  # noqa: E402

PROVIDERS = {
    "fabric": ["Microsoft.Fabric"],
    "databricks": ["Microsoft.Databricks"],
    "foundry": ["Microsoft.CognitiveServices", "Microsoft.Search"],
}
RESOURCES = {
    "fabric": [("capacityName", "Microsoft.Fabric/capacities", "2023-11-01")],
    "databricks": [("workspaceName", "Microsoft.Databricks/workspaces", "2024-05-01")],
    "foundry": [("accountName", "Microsoft.CognitiveServices/accounts", "2025-06-01"),
                ("searchName", "Microsoft.Search/searchServices", "2025-05-01")],
}


def _get(arm: Api, path: str) -> dict | None:
    try:
        return arm.json("GET", path)
    except HttpError as error:
        if error.status == 404:
            return None
        raise


def check_platform(arm: Api, subscription: str, platform: str, names: dict) -> list[dict]:
    checks = []
    for namespace in PROVIDERS[platform]:
        provider = _get(arm, f"/subscriptions/{subscription}/providers/{namespace}?api-version=2021-04-01") or {}
        state = provider.get("registrationState", "NotRegistered")
        checks.append(result(f"{platform}:provider:{namespace}", "verified" if state == "Registered" else "blocked",
                             "" if state == "Registered" else f"{namespace} が {state}。`az provider register -n {namespace}` が必要"))
    group = names["resourceGroup"]
    rg = _get(arm, f"/subscriptions/{subscription}/resourcegroups/{group}?api-version=2021-04-01")
    checks.append(result(f"{platform}:resource-group", "verified" if rg else "not-present", group))
    if platform == "databricks":
        managed = names["managedResourceGroupName"]
        managed_rg = _get(arm, f"/subscriptions/{subscription}/resourcegroups/{managed}?api-version=2021-04-01")
        if managed_rg and not str(managed_rg.get("managedBy", "")).lower().endswith(f"/workspaces/{names['workspaceName'].lower()}"):
            checks.append(result("databricks:managed-resource-group", "blocked",
                                 f"{managed} が workspace 管理外で既存。事前作成しない（別名を指定）"))
        else:
            checks.append(result("databricks:managed-resource-group", "verified",
                                 "未作成（Databricks が作成）" if not managed_rg else "workspace 管理下"))
    if not rg:
        return checks
    for key, resource_type, api_version in RESOURCES[platform]:
        path = f"/subscriptions/{subscription}/resourceGroups/{group}/providers/{resource_type}/{names[key]}?api-version={api_version}"
        resource = _get(arm, path)
        if not resource:
            checks.append(result(f"{platform}:{resource_type}", "not-present", names[key]))
            continue
        properties = resource.get("properties", {})
        checks.append(result(f"{platform}:{resource_type}", "verified", names[key],
                             provisioningState=properties.get("provisioningState"), state=properties.get("state")))
    return checks


def run(platforms: list[str], arm: Api | None = None) -> list[dict]:
    arm = arm or Api("arm")
    subscription = env("AZURE_SUBSCRIPTION_ID", required=True)
    checks = []
    sub = _get(arm, f"/subscriptions/{subscription}?api-version=2022-12-01")
    if not sub:
        return [result("subscription", "blocked", "サブスクリプションを参照できません（ロールまたは ID を確認）")]
    checks.append(result("subscription", "verified", sub.get("displayName", ""), state=sub.get("state")))
    names = derive_names(env("DP_NAME_PREFIX", required=True))
    for platform in platforms:
        checks.extend(check_platform(arm, subscription, platform, names[platform]))
    return checks


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--platform", action="append", choices=sorted(PROVIDERS), required=True)
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    checks = run(args.platform)
    report = summarize(checks)
    if args.out:
        write_json(args.out, report)
    print_json(report)
    return exit_code(checks)


if __name__ == "__main__":
    raise SystemExit(main())
