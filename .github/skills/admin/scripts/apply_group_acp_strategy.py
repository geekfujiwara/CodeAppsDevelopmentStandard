"""Preview or apply connector allowlists exclusively to existing environment groups."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from apply_acp_profile import DEFAULT_PROFILE_FILE, _process, load_profile, resolve_catalog_set
from dlp_helper import list_connector_catalog
from set_acp_connector import allowed_ids, assigned_policy_id, connector_rule_set, get_policy

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
from auth_helper import get_session
from set_environment_routing import read_collection as read_verified_collection

BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"


def read_collection(url, scope):
    return read_verified_collection(get_session(scope), url)


def group_profile(group, blueprint, overrides):
    if group["code"] in overrides:
        if group["code"] == "DEF" and overrides[group["code"]] != "block-all":
            raise ValueError("The default environment group must block all connectors.")
        return overrides[group["code"]]
    configuration = group.get("connectorPolicyOverride", {})
    if configuration.get("mode") == "BlockAll":
        return "block-all"
    return configuration.get("profile", blueprint["connectorPolicy"]["profile"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment-id", default=os.environ.get("ENV_ID"), required=not os.environ.get("ENV_ID"), help="Catalog source only; never a write target")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT)
    parser.add_argument("--group-code", action="append", default=[])
    parser.add_argument("--group-profile", action="append", default=[], help="Approved local exception: CODE=PROFILE; never changes the standard")
    parser.add_argument("--report-file", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    if blueprint["connectorPolicy"].get("managementScope") != "EnvironmentGroup":
        parser.error("Only environment-group scope is supported.")
    overrides = dict(item.split("=", 1) for item in args.group_profile)
    codes = {group["code"] for group in blueprint["groups"]}
    if (set(overrides) | set(args.group_code)) - codes:
        parser.error("Unknown group code.")
    groups = read_collection("https://api.powerplatform.com/environmentmanagement/environmentGroups?api-version=2024-10-01", "https://api.powerplatform.com/.default")
    environments = read_collection("https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2021-04-01", "https://api.bap.microsoft.com/.default")
    catalog = list_connector_catalog(args.environment_id)
    display = {item["name"]: item.get("properties", {}).get("displayName", "") for item in catalog}
    report = {"scope": "EnvironmentGroup", "individualEnvironmentWrites": False, "groups": [], "unmanagedGroups": []}
    expected_names = {group["name"] for group in blueprint["groups"]}
    report["unmanagedGroups"] = [group["displayName"] for group in groups if group["displayName"] not in expected_names]
    for definition in blueprint["groups"]:
        if args.group_code and definition["code"] not in args.group_code:
            continue
        matches = [group for group in groups if group["displayName"] == definition["name"]]
        if len(matches) != 1:
            raise ValueError(f"Group missing or ambiguous: {definition['name']}")
        group = matches[0]
        profile_name = group_profile(definition, blueprint, overrides)
        profile = load_profile(DEFAULT_PROFILE_FILE, profile_name)
        target = resolve_catalog_set(profile, catalog)
        policy_id = assigned_policy_id("EnvironmentGroup", group["id"])
        if not policy_id:
            raise ValueError(f"Create and assign a group policy first: {group['displayName']}")
        policy = get_policy(policy_id)
        current = allowed_ids(connector_rule_set(policy) or {})
        row = {"name": group["displayName"], "groupId": group["id"], "policyId": policy_id, "profile": profile_name, "allowedCount": len(target), "allowed": sorted(target), "added": sorted(target - current), "removed": sorted(current - target), "members": []}
        for environment in environments:
            properties = environment.get("properties", {})
            if (properties.get("parentEnvironmentGroup") or {}).get("id") != group["id"]:
                continue
            env_policy_id = assigned_policy_id("Environment", environment["name"])
            rule = connector_rule_set(get_policy(env_policy_id)) if env_policy_id else None
            previous = allowed_ids(rule or {})
            restricted = [entry["AllowedConnector"] for entry in (rule or {}).get("inputs", {}).get("AllowedConnectorList", []) if entry.get("AllowedActionsMode") != "AllAllowed" or entry.get("AllowedConnectionTypesMode") != "AllAllowed"]
            row["members"].append({"name": properties.get("displayName"), "environmentId": environment["name"], "previousCount": len(previous), "added": sorted(target - previous), "removed": sorted(previous - target), "restrictedEntriesToReview": restricted})
        report["groups"].append(row)
    for row in report["groups"]:
        print(f"{row['name']}: {row['profile']} -> {row['allowedCount']} allowed; group +{len(row['added'])}/-{len(row['removed'])}")
        for member in row["members"]:
            print(f"  {member['name']}: {member['previousCount']} -> {row['allowedCount']}; +{len(member['added'])}/-{len(member['removed'])}; restricted={len(member['restrictedEntriesToReview'])}")
    print("Unchanged groups outside blueprint:", ", ".join(report["unmanagedGroups"]))
    if args.report_file:
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        for row in report["groups"]:
            if any(member["restrictedEntriesToReview"] for member in row["members"]):
                raise ValueError("Member action restrictions require a separate reviewed migration before group replacement.")
        for row in report["groups"]:
            if assigned_policy_id("EnvironmentGroup", row["groupId"]) != row["policyId"]:
                raise ValueError("Group assignment changed; stop and review again.")
            _process(row["name"], row["policyId"], set(row["allowed"]), display, set(), False, 20, True)
        print("Group policies saved. Publish rules in the integrated browser, then verify every member and runtime separately.")
    else:
        print("Dry-run only. Review full report and obtain approval before --apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())