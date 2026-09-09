"""Recommend routing every existing rule to the personal developer group; apply only with approval."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path

from delete_environment_group import ENVIRONMENTS_URL, GROUPS_URL, inventory
from set_environment_routing import configuration_payload, fingerprint, get_session, read_routing_policy, routing_inputs, apply_retarget

BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"
BAP_BASE = "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform"
SETTINGS_URL = f"{BAP_BASE}/listTenantSettings?api-version=2021-04-01"
UPDATE_URL = f"{BAP_BASE}/scopes/admin/updateTenantSettings?api-version=2021-04-01"
TARGET_KEY = "environmentRoutingTargetEnvironmentGroupId"


def read_settings(session):
    response = session.post(SETTINGS_URL, json={}, timeout=120)
    response.raise_for_status()
    settings = response.json()
    governance = settings.get("powerPlatform", {}).get("governance")
    if not isinstance(governance, dict) or TARGET_KEY not in governance or "enableDefaultEnvironmentRouting" not in governance:
        raise ValueError("Legacy routing settings are incomplete")
    return settings


def memberships(environments):
    return sorted([{"id": item["name"], "groupId": (item["properties"].get("parentEnvironmentGroup") or {}).get("id")}
                   for item in environments], key=lambda item: item["id"])


def build_plan(blueprint, groups, environments, policy, settings):
    definitions = [item for item in blueprint["groups"] if item["code"] == "PSN"]
    if len(definitions) != 1:
        raise ValueError("Personal developer group definition missing or ambiguous")
    targets = [item for item in groups if item["displayName"] == definitions[0]["name"]]
    if len(targets) != 1:
        raise ValueError("Personal developer group missing or ambiguous; create it only after separate approval")
    target = targets[0]
    planned = configuration_payload(policy)
    rules = routing_inputs(planned)["RoutingRules"]
    if not rules:
        raise ValueError("No existing routing rules; creation and audience require separate approval")
    changes = []
    for rule in rules:
        changes.append({"ruleName": rule["Name"], "sourceGroupId": rule["EnvironmentGroup"],
                        "targetGroupId": target["id"], "priority": rule["Priority"],
                        "securityGroups": rule["SecurityGroups"], "changeRequired": rule["EnvironmentGroup"] != target["id"]})
        rule["EnvironmentGroup"] = target["id"]
    legacy_before = settings["powerPlatform"]["governance"][TARGET_KEY]
    return {"recommendation": "Route all existing modern rules and the legacy target to the personal developer group",
            "requiresConsent": True, "targetGroup": target, "rules": changes,
            "modernBefore": policy, "modernPlanned": planned, "legacyBefore": settings,
            "legacyChange": {"before": legacy_before, "after": target["id"], "changeRequired": legacy_before != target["id"]},
            "preserved": ["Portals", "SecurityGroups", "Priority", "routing enablement", "environment membership", "ACP"],
            "environmentMemberships": memberships(environments), "groupIds": sorted(item["id"] for item in groups)}


def scan_routing(tenant_id, blueprint, pp_session=None, bap_session=None):
    pp_session = pp_session or get_session("https://api.powerplatform.com/.default")
    bap_session = bap_session or get_session("https://api.bap.microsoft.com/.default")
    return build_plan(blueprint, inventory(pp_session, GROUPS_URL), inventory(bap_session, ENVIRONMENTS_URL),
                      read_routing_policy(pp_session, tenant_id), read_settings(bap_session))


def plan_hash(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def apply_plan(tenant_id, blueprint, plan, expected_hash, pp_session, bap_session, record):
    if not expected_hash or plan_hash(plan) != expected_hash:
        raise ValueError("Reviewed routing plan hash mismatch; no writes sent")
    current = scan_routing(tenant_id, blueprint, pp_session, bap_session)
    if plan_hash(current) != expected_hash:
        raise ValueError("Routing or membership changed since approval; no writes sent")
    if any(item["changeRequired"] for item in plan["rules"]):
        record({"stage": "modern-routing", "phase": "request"})
        apply_retarget(pp_session, tenant_id, plan["modernBefore"], plan["modernPlanned"], fingerprint(plan["modernBefore"]))
        record({"stage": "modern-routing", "phase": "verified"})
    if plan["legacyChange"]["changeRequired"]:
        if read_settings(bap_session) != plan["legacyBefore"]:
            raise ValueError("Legacy settings changed; stop and review partial result")
        delta = {"powerPlatform": {"governance": {TARGET_KEY: plan["targetGroup"]["id"]}}}
        record({"stage": "legacy-routing", "phase": "request", "delta": delta})
        response = bap_session.post(UPDATE_URL, json=delta, timeout=120)
        record({"stage": "legacy-routing", "phase": "response", "httpStatus": response.status_code})
        response.raise_for_status()
    actual = scan_routing(tenant_id, blueprint, pp_session, bap_session)
    expected_settings = copy.deepcopy(plan["legacyBefore"])
    expected_settings["powerPlatform"]["governance"][TARGET_KEY] = plan["targetGroup"]["id"]
    if actual["legacyBefore"] != expected_settings or configuration_payload(actual["modernBefore"]) != plan["modernPlanned"]:
        raise ValueError("Routing readback mismatch; inspect partial result before retrying")
    if actual["environmentMemberships"] != plan["environmentMemberships"] or actual["groupIds"] != plan["groupIds"]:
        raise ValueError("Environment membership or groups changed during apply")
    return {"allExistingRulesOnTarget": True, "legacyTargetOnTarget": True, "otherSettingsPreserved": True,
            "environmentMembershipsUnchanged": True, "ruleCount": len(actual["rules"]), "after": actual}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT)
    parser.add_argument("--report-file", type=Path, required=True)
    parser.add_argument("--expected-hash")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.tenant_id or (args.apply and not args.expected_hash):
        parser.error("Tenant ID required; --apply also requires the approved --expected-hash")
    if args.report_file.exists():
        parser.error("Report exists; choose a new path")
    args.report_file.parent.mkdir(parents=True, exist_ok=True)
    report = {"status": "not-started", "operations": []}

    def save():
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def record(operation):
        report["status"] = "applying"
        report["operations"].append(operation)
        save()

    try:
        blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
        pp_session = get_session("https://api.powerplatform.com/.default")
        bap_session = get_session("https://api.bap.microsoft.com/.default")
        plan = scan_routing(args.tenant_id, blueprint, pp_session, bap_session)
        report.update({"plan": plan, "expectedHash": plan_hash(plan), "status": "dry-run"})
        save()
        if args.apply:
            report["verification"] = apply_plan(args.tenant_id, blueprint, plan, args.expected_hash, pp_session, bap_session, record)
            report["status"] = "saved-verified"
        print(json.dumps({"status": report["status"], "targetGroup": plan["targetGroup"]["displayName"],
                          "rules": plan["rules"], "legacyChange": plan["legacyChange"], "expectedHash": report["expectedHash"]}, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        report.update({"status": "failed-or-unverified", "error": str(error)})
        print(str(error))
        return 1
    finally:
        save()


if __name__ == "__main__":
    raise SystemExit(main())