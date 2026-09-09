"""Inspect and retarget an existing modern environment routing rule (dry-run by default)."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
from auth_helper import get_session

API_VERSION = "2021-10-01-preview"


def tenant_host(tenant_id):
    compact = UUID(tenant_id).hex
    return f"https://{compact[:30]}.{compact[30:]}.tenant.api.powerplatform.com"


def read_collection(session, url):
    origin = urlparse(url).netloc
    visited = set()
    result = []
    while url:
        if url in visited or urlparse(url).scheme != "https" or urlparse(url).netloc != origin:
            raise ValueError("Invalid policy continuation URL")
        visited.add(url)
        response = session.get(url, timeout=120)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("value"), list):
            raise ValueError("Incomplete policy inventory")
        result.extend(data["value"])
        continuation = data.get("nextLink") or data.get("@odata.nextLink")
        url = urljoin(url, continuation) if continuation else None
    return result


def routing_policy(policies):
    matches = [policy for policy in policies if any(rule.get("id") == "EnvironmentRouting" for rule in policy.get("ruleSets", []))]
    if len(matches) != 1:
        raise ValueError("Expected exactly one EnvironmentRouting policy; inspect schema before writing")
    policy = matches[0]
    UUID(policy["id"])
    routing_inputs(policy)
    return policy


def routing_inputs(policy):
    matches = [rule for rule in policy["ruleSets"] if rule.get("id") == "EnvironmentRouting"]
    if len(matches) != 1:
        raise ValueError("Ambiguous EnvironmentRouting rule set")
    inputs = matches[0].get("inputs", {})
    rules = inputs.get("RoutingRules")
    if not isinstance(rules, list) or not isinstance(inputs.get("Portals"), list) or len(rules) > 25:
        raise ValueError("Unrecognized routing schema")
    priorities = []
    names = []
    for rule in rules:
        if not isinstance(rule, dict) or not isinstance(rule.get("Name"), str) or not rule["Name"]:
            raise ValueError("Invalid routing rule name")
        if not isinstance(rule.get("SecurityGroups"), list) or "EnvironmentGroup" not in rule:
            raise ValueError("Incomplete routing rule")
        if type(rule.get("Priority")) is not int:
            raise ValueError("Invalid routing priority")
        if rule["EnvironmentGroup"]:
            UUID(rule["EnvironmentGroup"])
        for group_id in rule["SecurityGroups"]:
            UUID(group_id)
        priorities.append(rule["Priority"])
        names.append(rule["Name"])
    if sorted(priorities) != list(range(1, len(rules) + 1)) or len(set(names)) != len(names):
        raise ValueError("Duplicate names or noncontiguous priorities")
    return inputs


def read_routing_policy(session, tenant_id):
    url = f"{tenant_host(tenant_id)}/governance/tenantRuleBasedPolicies?api-version={API_VERSION}"
    return routing_policy(read_collection(session, url))


def payload(policy):
    return copy.deepcopy({key: policy[key] for key in ("id", "name", "ruleSets")})


def fingerprint(policy):
    return hashlib.sha256(json.dumps(payload(policy), sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def configuration_payload(policy):
    result = payload(policy)
    for rule in result["ruleSets"]:
        rule.pop("lastModifiedDate", None)
    return result


def plan_retarget(policy, rule_name, source_group_id, target_group_id):
    source_group_id = str(UUID(source_group_id))
    target_group_id = str(UUID(target_group_id))
    result = payload(policy)
    rules = routing_inputs(result)["RoutingRules"]
    matches = [rule for rule in rules if rule["Name"] == rule_name]
    if len(matches) != 1 or str(matches[0]["EnvironmentGroup"]).lower() != source_group_id:
        raise ValueError("Rule name/source group mismatch; regenerate dry-run")
    matches[0]["EnvironmentGroup"] = target_group_id
    return result


def group_references(policy, group_id):
    return [rule["Name"] for rule in routing_inputs(policy)["RoutingRules"]
            if str(rule["EnvironmentGroup"]).lower() == group_id.lower()]


def plan_delete_rule(policy, rule_name, source_group_id):
    source_group_id = str(UUID(source_group_id))
    result = payload(policy)
    inputs = routing_inputs(result)
    matches = [rule for rule in inputs["RoutingRules"] if rule["Name"] == rule_name]
    if len(matches) != 1 or str(matches[0]["EnvironmentGroup"]).lower() != source_group_id:
        raise ValueError("Rule name/source group mismatch; regenerate dry-run")
    if len(inputs["RoutingRules"]) <= 1:
        raise ValueError("Cannot delete the final routing rule; use group detachment instead")
    remaining = sorted([rule for rule in inputs["RoutingRules"] if rule["Name"] != rule_name], key=lambda rule: rule["Priority"])
    for priority, rule in enumerate(remaining, start=1):
        rule["Priority"] = priority
    inputs["RoutingRules"] = remaining
    routing_inputs(result)
    return result


def resolve_target_group(groups, target_id):
    target_id = str(UUID(target_id))
    if UUID(target_id).int == 0:
        return {"id": target_id, "displayName": "None (standalone developer environment)"}
    targets = [group for group in groups if group.get("id", "").lower() == target_id]
    if len(targets) != 1:
        raise ValueError("Target group is missing or ambiguous")
    return targets[0]


def apply_retarget(session, tenant_id, policy, planned, expected_hash):
    if not expected_hash or fingerprint(policy) != expected_hash:
        raise ValueError("Reviewed policy hash mismatch")
    latest = read_routing_policy(session, tenant_id)
    if fingerprint(latest) != expected_hash:
        raise ValueError("Routing policy changed since dry-run; no PATCH sent")
    url = f"{tenant_host(tenant_id)}/governance/ruleBasedPolicies/{policy['id']}?api-version={API_VERSION}"
    response = session.patch(url, json=planned, timeout=120)
    response.raise_for_status()
    actual = read_routing_policy(session, tenant_id)
    if configuration_payload(actual) != configuration_payload(planned):
        raise ValueError("PATCH accepted but readback differs; inspect before retrying")
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--rule-name", default=os.getenv("ADMIN_ROUTING_RULE_NAME"))
    parser.add_argument("--source-group-id", default=os.getenv("ADMIN_ROUTING_SOURCE_GROUP_ID"))
    parser.add_argument("--target-group-id", default=os.getenv("ADMIN_ROUTING_TARGET_GROUP_ID"))
    parser.add_argument("--delete-rule", action="store_true", help="Delete the named rule, preserving remaining rule order; cannot remove the final rule")
    parser.add_argument("--expected-hash")
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.tenant_id:
        parser.error("--tenant-id is required")
    changes = [args.rule_name, args.source_group_id] if args.delete_rule else [args.rule_name, args.source_group_id, args.target_group_id]
    if args.delete_rule and (args.target_group_id or not all(changes)):
        parser.error("--delete-rule requires rule name and source group, with no target group")
    if any(changes) and not all(changes):
        parser.error("Specify rule name, source group and target group together")
    if args.apply and (not all(changes) or not args.expected_hash):
        parser.error("--apply requires a retarget and --expected-hash from reviewed dry-run")
    report_path = Path(args.report_file)
    if report_path.exists():
        parser.error("Report exists; use a new path")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {"status": "not-started"}
    try:
        session = get_session("https://api.powerplatform.com/.default")
        policy = read_routing_policy(session, args.tenant_id)
        report.update({"before": policy, "expectedHash": fingerprint(policy), "status": "read-only"})
        if all(changes):
            if args.delete_rule:
                planned = plan_delete_rule(policy, args.rule_name, args.source_group_id)
                report["operation"] = "delete-rule"
            else:
                groups = read_collection(session, "https://api.powerplatform.com/environmentmanagement/environmentGroups?api-version=2024-10-01")
                target_id = str(UUID(args.target_group_id))
                target = resolve_target_group(groups, target_id)
                planned = plan_retarget(policy, args.rule_name, args.source_group_id, target_id)
                report.update({"operation": "retarget", "targetGroup": target})
            report.update({"planned": planned, "status": "dry-run"})
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            if args.apply:
                report["after"] = apply_retarget(session, args.tenant_id, policy, planned, args.expected_hash)
                report["status"] = "saved-verified"
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        report.update({"status": "failed-or-unverified", "error": str(error)})
        print(str(error), file=sys.stderr)
        return 1
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())