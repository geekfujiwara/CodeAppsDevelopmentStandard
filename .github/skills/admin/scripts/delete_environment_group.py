"""Delete only an explicitly approved empty, unrouted environment group."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
from auth_helper import get_session
from set_environment_routing import group_references, read_routing_policy

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
    return {"group": group, "memberCount": 0, "tenantReferences": [], "routingPolicy": policy, "environmentCount": len(environments)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--group-id", default=os.getenv("ADMIN_DELETE_GROUP_ID"))
    parser.add_argument("--expected-name", default=os.getenv("ADMIN_DELETE_GROUP_NAME"))
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.group_id or not args.expected_name or not args.tenant_id:
        parser.error("--tenant-id, --group-id and --expected-name are required")
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
        report["status"] = "dry-run"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.apply:
            report["preflight"] = preflight(pp_session, bap_session, group_id, args.expected_name, args.tenant_id)
            response = pp_session.delete(f"{PP_BASE}/environmentmanagement/environmentGroups/{group_id}?api-version=2024-10-01", timeout=120)
            report["httpStatus"] = response.status_code
            if response.status_code not in (200, 204):
                report["response"] = response.text
                raise ValueError(f"Deletion rejected: HTTP {response.status_code}; see report")
            remaining = inventory(pp_session, GROUPS_URL)
            if any(group.get("id", "").lower() == group_id.lower() for group in remaining):
                raise ValueError("Delete accepted but group still listed; completion unverified")
            report["status"] = "deleted-verified"
        print(json.dumps({"group": args.expected_name, "status": report["status"], "report": str(report_path)}, ensure_ascii=False))
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