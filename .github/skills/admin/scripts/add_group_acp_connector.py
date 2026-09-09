"""Add one connector to an existing group ACP, preserving every existing rule."""

import argparse
import copy
import hashlib
import json
from pathlib import Path

from set_acp_connector import (assigned_policy_id, get_policy, connector_rule_set, add_connectors,
                               allowed_ids, denied_connectors, _request)
from delete_environment_group import inventory, ENVIRONMENTS_URL
from set_environment_routing import configuration_payload
from auth_helper import get_session


def build_plan(group_id, policy, environments, connector):
    if not connector.startswith("shared_") or not connector.replace("_", "").isalnum():
        raise ValueError("A standard connector ID is required")
    planned = configuration_payload(policy)
    rules = [item for item in planned["ruleSets"] if item["id"] == "ConnectorManagement"]
    if len(rules) != 1 or not isinstance(rules[0].get("inputs", {}).get("AllowedConnectorList"), list):
        raise ValueError("Exactly one complete existing ACP rule is required")
    entries = copy.deepcopy(rules[0]["inputs"]["AllowedConnectorList"])
    identifiers = [item["AllowedConnector"] for item in entries]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Duplicate connector entries")
    added = add_connectors(rules[0], [connector])
    if rules[0]["inputs"]["AllowedConnectorList"][:len(entries)] != entries:
        raise ValueError("Existing connector restrictions changed")
    members = sorted([{"id": item["name"], "name": item["properties"].get("displayName")}
                      for item in environments if (item["properties"].get("parentEnvironmentGroup") or {}).get("id") == group_id], key=lambda item: item["id"])
    return {"groupId": group_id, "before": configuration_payload(policy), "planned": planned,
            "added": added, "beforeCount": len(entries), "afterCount": len(entries) + len(added),
            "deniedExisting": sorted(denied_connectors() & allowed_ids(rules[0])), "members": members}


def snapshot(group_id, connector):
    policy_id = assigned_policy_id("EnvironmentGroup", group_id)
    if not policy_id:
        raise ValueError("No existing group policy")
    environments = inventory(get_session("https://api.bap.microsoft.com/.default"), ENVIRONMENTS_URL)
    return build_plan(group_id, get_policy(policy_id), environments, connector)


def fingerprint(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group-id", required=True)
    parser.add_argument("--connector", required=True)
    parser.add_argument("--report-file", type=Path, required=True)
    parser.add_argument("--expected-hash")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.report_file.exists() or (args.apply and not args.expected_hash):
        parser.error("Use a new report path; apply requires the approved plan hash")
    plan = snapshot(args.group_id, args.connector)
    report = {"status": "dry-run", "plan": plan, "expectedHash": fingerprint(plan)}
    args.report_file.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    save()
    try:
        if args.apply:
            if args.expected_hash != fingerprint(plan) or fingerprint(snapshot(args.group_id, args.connector)) != args.expected_hash:
                raise ValueError("Group configuration or membership changed; no write sent")
            if plan["added"]:
                report["status"] = "request-pending"
                save()
                _request("PATCH", "/governance/ruleBasedPolicies/" + plan["planned"]["id"], plan["planned"])
            actual = snapshot(args.group_id, args.connector)
            report["after"] = actual
            if actual["before"] != plan["planned"] or actual["members"] != plan["members"]:
                raise ValueError("Readback mismatch; inspect before retrying")
            report["status"] = "group-saved-verified"
        print(json.dumps({key: value for key, value in report.items() if key not in ("plan", "after")}, indent=2))
        print(json.dumps({key: value for key, value in plan.items() if key not in ("before", "planned")}, ensure_ascii=False, indent=2))
    except Exception as error:
        report.update(status="failed-or-unverified", error=str(error))
        raise
    finally:
        save()


if __name__ == "__main__":
    main()