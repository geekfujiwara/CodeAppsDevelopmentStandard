"""Delete only an explicitly approved empty, unrouted environment group."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
from auth_helper import get_session
from set_environment_routing import API_VERSION, group_references, read_routing_policy, tenant_host

PP_BASE = "https://api.powerplatform.com"
BAP_BASE = "https://api.bap.microsoft.com"
GROUPS_URL = f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01"
ENVIRONMENTS_URL = f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2021-04-01"
SETTINGS_URL = f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2020-10-01"


def inventory(session, url):
    origin = urlparse(url).netloc
    visited = set()
    result = []
    while url:
        if url in visited or urlparse(url).scheme != "https" or urlparse(url).netloc != origin:
            raise ValueError("Invalid inventory continuation URL")
        visited.add(url)
        response = session.get(url, timeout=120)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("value"), list):
            raise ValueError("Incomplete inventory response")
        result.extend(data["value"])
        next_url = data.get("nextLink") or data.get("@odata.nextLink")
        url = urljoin(url, next_url) if next_url else None
    return result


def references(value, target, path=""):
    found = []
    if isinstance(value, dict):
        for key, item in value.items():
            found.extend(references(item, target, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(references(item, target, f"{path}[{index}]"))
    elif isinstance(value, str) and value.lower() == target.lower():
        found.append(path)
    return found


def validate_target(groups, environments, settings, group_id, expected_name):
    matches = [group for group in groups if group.get("id", "").lower() == group_id.lower()]
    if len(matches) != 1 or matches[0].get("displayName") != expected_name:
        raise ValueError("Group ID/name mismatch or group missing")
    governance = settings.get("powerPlatform", {}).get("governance")
    if not isinstance(governance, dict) or "enableDefaultEnvironmentRouting" not in governance:
        raise ValueError("Routing configuration could not be verified")
    if governance["enableDefaultEnvironmentRouting"] is True and "environmentRoutingTargetEnvironmentGroupId" not in governance:
        raise ValueError("Routing target could not be verified")
    members = []
    for environment in environments:
        if not isinstance(environment.get("properties"), dict):
            raise ValueError("Environment membership could not be verified")
        parent = environment["properties"].get("parentEnvironmentGroup") or {}
        if parent.get("id", "").lower() == group_id.lower():
            members.append(environment.get("name"))
    blockers = references(settings, group_id)
    if members or blockers:
        raise ValueError(f"Deletion blocked: members={members}, tenant references={blockers}")
    if matches[0].get("childrenGroupIds"):
        raise ValueError("Group has child groups")
    return matches[0]


def policy_inventory(session, tenant_id, groups, environments):
    host = tenant_host(tenant_id)
    group_policies = {}
    owners = {}

    def register(policy_id, resource_type, resource_id):
        policy_id = str(UUID(policy_id))
        owners.setdefault(policy_id, []).append({"type": resource_type, "id": resource_id})

    for group in groups:
        group_id = str(UUID(group["id"]))
        policies = inventory(session, f"{host}/governance/environmentGroups/{group_id}/ruleBasedPolicies?api-version={API_VERSION}&includeCustomerContent=true")
        identifiers = []
        for policy in policies:
            if not isinstance(policy, dict) or not isinstance(policy.get("ruleSets"), list):
                raise ValueError("Incomplete group policy inventory")
            policy_id = str(UUID(policy["id"]))
            identifiers.append(policy_id)
            register(policy_id, "EnvironmentGroup", group_id)
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Duplicate group policies")
        group_policies[group_id] = policies
    for environment in environments:
        environment_id = environment["name"]
        assignments = inventory(session, f"{PP_BASE}/governance/ruleBasedPolicies/environments/{environment_id}/assignments?api-version=2024-10-01")
        for assignment in assignments:
            register(assignment["policyId"], "Environment", environment_id)
    policies = inventory(session, f"{host}/governance/tenantRuleBasedPolicies?api-version={API_VERSION}")
    for policy in policies:
        register(policy["id"], "Tenant", tenant_id)
    return group_policies, owners


def require_exclusive_policies(policies, owners, group_id):
    for policy in policies:
        if owners.get(str(UUID(policy["id"]))) != [{"type": "EnvironmentGroup", "id": group_id}]:
            raise ValueError("Shared or unverified policy; no deletion is permitted")


def preflight(pp_session, bap_session, group_id, expected_name, tenant_id):
    groups = inventory(pp_session, GROUPS_URL)
    environments = inventory(bap_session, ENVIRONMENTS_URL)
    response = bap_session.post(SETTINGS_URL, json={}, timeout=120)
    response.raise_for_status()
    settings = response.json()
    group = validate_target(groups, environments, settings, group_id, expected_name)
    policy = read_routing_policy(pp_session, tenant_id)
    blockers = group_references(policy, group_id)
    if blockers:
        raise ValueError(f"Modern routing rules still reference this group: {blockers}")
    group_policies, owners = policy_inventory(pp_session, tenant_id, groups, environments)
    policies = group_policies[group_id]
    require_exclusive_policies(policies, owners, group_id)
    memberships = sorted([{"id": item["name"], "groupId": (item["properties"].get("parentEnvironmentGroup") or {}).get("id")} for item in environments], key=lambda item: item["id"])
    return {"group": group, "memberCount": 0, "tenantReferences": [], "routingPolicy": policy,
            "environmentCount": len(environments), "environmentMemberships": memberships,
            "otherGroupIds": sorted(item["id"] for item in groups if item["id"] != group_id),
            "policies": policies, "policyOwners": {item["id"]: owners[str(UUID(item["id"]))] for item in policies}}


def plan_hash(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def delete_via_api(pp_session, bap_session, tenant_id, group_id, expected_name, plan, expected_hash, record):
    if not expected_hash or plan_hash(plan) != expected_hash:
        raise ValueError("Reviewed deletion plan hash mismatch; no DELETE sent")
    latest = preflight(pp_session, bap_session, group_id, expected_name, tenant_id)
    if plan_hash(latest) != expected_hash:
        raise ValueError("Deletion plan changed; no DELETE sent")
    host = tenant_host(tenant_id)

    def remove(path, stage):
        record({"stage": stage, "path": path, "phase": "request"})
        response = pp_session.delete(f"{host}{path}", timeout=120)
        record({"stage": stage, "path": path, "phase": "response", "httpStatus": response.status_code})
        if response.status_code not in (200, 204):
            raise ValueError(f"{stage} rejected: HTTP {response.status_code}; inspect partial result before retrying")

    for policy in plan["policies"]:
        policy_id = str(UUID(policy["id"]))
        remove(f"/governance/ruleBasedPolicies/{policy_id}/environmentGroups/{group_id}/assignments?api-version={API_VERSION}", "detach-policy")
        groups = inventory(pp_session, GROUPS_URL)
        environments = inventory(bap_session, ENVIRONMENTS_URL)
        _, owners = policy_inventory(pp_session, tenant_id, groups, environments)
        if owners.get(policy_id):
            raise ValueError("Policy still assigned after detach; policy and group deletion stopped")
        remove(f"/governance/ruleBasedPolicies/{policy_id}?api-version={API_VERSION}", "delete-exclusive-policy")
        response = pp_session.get(f"{host}/governance/ruleBasedPolicies/{policy_id}?api-version={API_VERSION}", timeout=120)
        if response.status_code != 404:
            raise ValueError("Policy deletion is not verified; group deletion stopped")
    current = preflight(pp_session, bap_session, group_id, expected_name, tenant_id)
    if current["policies"] or current["environmentMemberships"] != plan["environmentMemberships"] or current["otherGroupIds"] != plan["otherGroupIds"]:
        raise ValueError("Assignments or membership changed; group deletion stopped")
    remove(f"/environmentmanagement/environmentGroups/{group_id}?api-version=1", "delete-group")
    remaining = inventory(pp_session, GROUPS_URL)
    identifiers = {item["id"] for item in remaining}
    if group_id in identifiers or not set(plan["otherGroupIds"]) <= identifiers:
        raise ValueError("Group deletion or preservation of other groups not verified")
    environments = inventory(bap_session, ENVIRONMENTS_URL)
    memberships = sorted([{"id": item["name"], "groupId": (item["properties"].get("parentEnvironmentGroup") or {}).get("id")} for item in environments], key=lambda item: item["id"])
    if memberships != plan["environmentMemberships"]:
        raise ValueError("Environment membership changed; inspect before further operations")
    return {"groupAbsent": True, "otherGroupsPreserved": True, "environmentMembershipsUnchanged": True, "environmentCount": len(environments)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--group-id", default=os.getenv("ADMIN_DELETE_GROUP_ID"))
    parser.add_argument("--expected-name", default=os.getenv("ADMIN_DELETE_GROUP_NAME"))
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--expected-hash")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.group_id or not args.expected_name or not args.tenant_id:
        parser.error("--tenant-id, --group-id and --expected-name are required")
    if args.apply and not args.expected_hash:
        parser.error("--apply requires --expected-hash from the approved dry-run")
    group_id = str(UUID(args.group_id))
    report_path = Path(args.report_file)
    if report_path.exists():
        parser.error("Report already exists; choose a new path to preserve evidence")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {"groupId": group_id, "expectedName": args.expected_name, "apply": args.apply}
    try:
        pp_session = get_session(f"{PP_BASE}/.default")
        bap_session = get_session(f"{BAP_BASE}/.default")
        report["preflight"] = preflight(pp_session, bap_session, group_id, args.expected_name, args.tenant_id)
        report["expectedHash"] = plan_hash(report["preflight"])
        report["operations"] = []
        report["status"] = "dry-run"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.apply:
            def record(operation):
                report["status"] = "applying"
                report["operations"].append(operation)
                report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

            report["verification"] = delete_via_api(pp_session, bap_session, args.tenant_id, group_id, args.expected_name, report["preflight"], args.expected_hash, record)
            report["status"] = "deleted-verified"
        print(json.dumps({"group": args.expected_name, "status": report["status"], "expectedHash": report["expectedHash"], "policyCount": len(report["preflight"]["policies"]), "report": str(report_path)}, ensure_ascii=False))
        return 0
    except Exception as error:
        report["status"] = "failed-or-unverified"
        report["error"] = str(error)
        print(str(error), file=sys.stderr)
        return 1
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())