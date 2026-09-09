"""Remove one connector from an existing group ACP, preserving every other rule."""

import argparse
import copy
import hashlib
import json
from pathlib import Path

from set_acp_connector import assigned_policy_id, get_policy, allowed_ids, _request
from delete_environment_group import inventory, ENVIRONMENTS_URL
from set_environment_routing import configuration_payload
from auth_helper import get_session

CONNECTIONS_URL = ("https://api.powerapps.com/providers/Microsoft.PowerApps/scopes/admin"
                   "/environments/{environment}/apis/{connector}/connections?api-version=2016-11-01")


def members(environments, group_id):
    return sorted([{"id": item["name"], "name": item["properties"].get("displayName")}
                   for item in environments
                   if (item["properties"].get("parentEnvironmentGroup") or {}).get("id") == group_id],
                  key=lambda item: item["id"])


def build_plan(group_id, policy, group_members, connector):
    if not connector.startswith("shared_") or not connector.replace("_", "").isalnum():
        raise ValueError("A standard connector ID is required")
    planned = configuration_payload(policy)
    rules = [item for item in planned["ruleSets"] if item["id"] == "ConnectorManagement"]
    if len(rules) != 1 or not isinstance(rules[0].get("inputs", {}).get("AllowedConnectorList"), list):
        raise ValueError("Exactly one complete existing ACP rule is required")
    entries = copy.deepcopy(rules[0]["inputs"]["AllowedConnectorList"])
    identifiers = [item["AllowedConnector"].rsplit("/", 1)[-1] for item in entries]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Duplicate connector entries")
    if identifiers.count(connector) != 1:
        raise ValueError("The connector is not allowed exactly once in this group policy")
    index = identifiers.index(connector)
    remaining = entries[:index] + entries[index + 1:]
    rules[0]["inputs"]["AllowedConnectorList"] = remaining
    return {"groupId": group_id, "connector": connector, "before": configuration_payload(policy),
            "planned": planned, "removed": [entries[index]], "beforeCount": len(entries),
            "afterCount": len(remaining), "members": group_members}


def snapshot(group_id, connector):
    policy_id = assigned_policy_id("EnvironmentGroup", group_id)
    if not policy_id:
        raise ValueError("No existing group policy")
    environments = inventory(get_session("https://api.bap.microsoft.com/.default"), ENVIRONMENTS_URL)
    return build_plan(group_id, get_policy(policy_id), members(environments, group_id), connector)


def dependencies(plan):
    """Existing connections that stop working once the connector is blocked."""
    session = get_session("https://service.powerapps.com/.default")
    result = []
    for member in plan["members"]:
        response = session.get(CONNECTIONS_URL.format(environment=member["id"], connector=plan["connector"]), timeout=120)
        row = {"environmentId": member["id"], "name": member["name"], "status": response.status_code}
        row["connectionCount"] = len(response.json().get("value", [])) if response.status_code < 300 else None
        result.append(row)
    return result


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
    report = {"status": "dry-run", "plan": plan, "expectedHash": fingerprint(plan),
              "dependencies": dependencies(plan)}
    args.report_file.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    save()
    try:
        if args.apply:
            if args.expected_hash != fingerprint(plan) or fingerprint(snapshot(args.group_id, args.connector)) != args.expected_hash:
                raise ValueError("Group configuration or membership changed; no write sent")
            report["status"] = "request-pending"
            save()
            _request("PATCH", "/governance/ruleBasedPolicies/" + plan["planned"]["id"], plan["planned"])
            policy_id = assigned_policy_id("EnvironmentGroup", args.group_id)
            actual = configuration_payload(get_policy(policy_id))
            environments = inventory(get_session("https://api.bap.microsoft.com/.default"), ENVIRONMENTS_URL)
            report["after"] = {"policy": actual, "members": members(environments, args.group_id)}
            rule = [item for item in actual["ruleSets"] if item["id"] == "ConnectorManagement"]
            if actual != plan["planned"] or report["after"]["members"] != plan["members"] or \
                    args.connector in allowed_ids(rule[0] if rule else {}):
                raise ValueError("Readback mismatch; inspect before retrying")
            report["status"] = "group-saved-verified"
        print(json.dumps({key: value for key, value in report.items() if key not in ("plan", "after")}, ensure_ascii=False, indent=2))
        print(json.dumps({key: value for key, value in plan.items() if key not in ("before", "planned")}, ensure_ascii=False, indent=2))
    except Exception as error:
        report.update(status="failed-or-unverified", error=str(error))
        raise
    finally:
        save()


if __name__ == "__main__":
    main()
