"""Plan and apply an approval-bound environment-group ACP mode change."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path

from auth_helper import get_session
from delete_environment_group import ENVIRONMENTS_URL, inventory
from set_environment_group_rules import apply_policy, get_policy, save_policy, tenant_host
from set_environment_routing import configuration_payload


CONTRACT = "environment-group-acp-mode/2026-09-14"
RULE_ID = "AdvancedConnectorPoliciesOnly"
INPUT_KEY = "EnableAdvancedConnectorPoliciesOnly"


def canonical_json(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def fingerprint(plan):
    return hashlib.sha256(canonical_json(plan).encode("utf-8")).hexdigest()


def _policy_payload(policy):
    if not policy or not policy.get("id"):
        raise ValueError("The environment group must already have a rule-based policy")
    result = configuration_payload(policy)
    result["ruleSets"], _ = apply_policy(result, [])
    return result


def build_plan(group_id, policy, environments, enabled):
    if not group_id:
        raise ValueError("group_id is required")
    before = _policy_payload(policy)
    planned = copy.deepcopy(before)
    planned["ruleSets"], _ = apply_policy(
        planned, [f"{RULE_ID}/{INPUT_KEY}={'true' if enabled else 'false'}"]
    )
    members = sorted(
        [
            {"id": item["name"], "name": item.get("properties", {}).get("displayName")}
            for item in environments
            if (item.get("properties", {}).get("parentEnvironmentGroup") or {}).get("id")
            == group_id
        ],
        key=lambda item: item["id"],
    )
    return {
        "contract": CONTRACT,
        "operation": "set-environment-group-acp-mode",
        "groupId": group_id,
        "enabled": enabled,
        "before": before,
        "planned": planned,
        "members": members,
    }


def validate_plan(plan):
    if plan.get("contract") != CONTRACT or plan.get("operation") != "set-environment-group-acp-mode":
        raise ValueError("Unsupported ACP mode contract")
    if not isinstance(plan.get("enabled"), bool) or not plan.get("groupId"):
        raise ValueError("ACP mode plan target is invalid")
    before = plan.get("before")
    planned = plan.get("planned")
    if not isinstance(before, dict) or not isinstance(planned, dict):
        raise ValueError("ACP mode plan must contain before and planned policy snapshots")
    if before.get("id") != planned.get("id"):
        raise ValueError("Policy identity changed")
    expected = copy.deepcopy(before)
    expected["ruleSets"], _ = apply_policy(
        expected, [f"{RULE_ID}/{INPUT_KEY}={'true' if plan['enabled'] else 'false'}"]
    )
    if planned != expected:
        raise ValueError("Planned policy changes fields outside ACP-only mode")
    members = plan.get("members")
    if not isinstance(members, list) or members != sorted(members, key=lambda item: item["id"]):
        raise ValueError("Environment-group members must be a sorted list")
    return plan


def snapshot(tenant_id, group_id, enabled):
    host = tenant_host(tenant_id)
    policy = get_policy(host, group_id)
    environments = inventory(get_session("https://api.bap.microsoft.com/.default"), ENVIRONMENTS_URL)
    return build_plan(group_id, policy, environments, enabled), policy


def verify_readback(plan, actual):
    validate_plan(plan)
    validate_plan(actual)
    if actual["before"] != plan["planned"]:
        raise ValueError("ACP mode read-back does not match the approved policy")
    if actual["members"] != plan["members"]:
        raise ValueError("Environment-group membership changed during apply")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--group-id", required=True)
    parser.add_argument("--mode", choices=("acp-only", "mixed"), required=True)
    parser.add_argument("--report-file", type=Path, required=True)
    parser.add_argument("--expected-hash")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.report_file.exists() or (args.apply and not args.expected_hash):
        parser.error("Use a new report path; apply requires the approved plan hash")

    enabled = args.mode == "acp-only"
    plan, policy = snapshot(args.tenant_id, args.group_id, enabled)
    validate_plan(plan)
    report = {"status": "dry-run", "plan": plan, "expectedHash": fingerprint(plan)}
    args.report_file.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    save()
    try:
        if args.apply:
            if args.expected_hash.lower() != fingerprint(plan):
                raise ValueError("Policy or group membership changed; no write sent")
            report["status"] = "request-pending"
            save()
            save_policy(
                tenant_host(args.tenant_id),
                args.group_id,
                policy,
                plan["planned"]["ruleSets"],
            )
            actual, _ = snapshot(args.tenant_id, args.group_id, enabled)
            report["after"] = actual
            verify_readback(plan, actual)
            report["status"] = "group-saved-verified"
        print(json.dumps({"status": report["status"], "expectedHash": report["expectedHash"]}, indent=2))
        print(json.dumps({"groupId": plan["groupId"], "enabled": enabled, "members": plan["members"]}, ensure_ascii=False, indent=2))
    except Exception as error:
        report.update(status="failed-or-unverified", error=str(error))
        raise
    finally:
        save()


if __name__ == "__main__":
    main()