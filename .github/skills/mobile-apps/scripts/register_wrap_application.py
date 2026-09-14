"""Plan and create the Entra application required by Power Apps Wrap."""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
from auth_helper import get_session, get_token  # noqa: E402


CONTRACT = "power-apps-wrap-entra-registration/2026-09-14"
CLEANUP_CONTRACT = "power-apps-wrap-entra-registration-cleanup/2026-09-14"
GRAPH_ORIGIN = "https://graph.microsoft.com"
CREATE_PATH = "/v1.0/applications"
GUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
REDIRECT_URIS = [
    "https://login.microsoftonline.com/common/oauth2/nativeclient",
    "msauth.com.microsoft.PreviewApp://auth",
]
REQUIRED_RESOURCE_ACCESS = [
    ("00000007-0000-0000-c000-000000000000", ["78ce3f0f-a1ce-49c2-8cde-64b5c0896db4"]),
    ("fe053c5f-3692-4f14-aef2-ee34fc081cae", ["6c3012bf-22c1-4bb5-959b-dff738314144"]),
    ("00000003-0000-0000-c000-000000000000", ["e1fe6dd8-ba31-4d61-89e7-88639da4683d"]),
    ("475226c6-020e-4fb2-8a90-7a972cbfc1d4", ["0eb56b90-a7b5-43b5-9402-8137a8083e90"]),
    ("00000009-0000-0000-c000-000000000000", ["2448370f-f988-42cd-909c-6528efd67c1a"]),
    (
        "8578e004-a5c6-46e7-913e-12f58912df43",
        [
            "5991ee89-0511-4700-b3be-d42ef2e7d61d",
            "5322d31f-39c1-4756-9c92-ae069c366b70",
            "41e78a9d-569c-4929-ad5e-5ab23eeb83f4",
            "d0ac573f-48ce-4693-88c1-8fa719eb8b45",
            "5d973cb3-b843-4baf-bc35-646ccb9181ce",
            "f0d8fd94-fdad-465b-b174-c37a1470196b",
        ],
    ),
]


def canonical_json(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def canonical_hash(plan):
    return hashlib.sha256(canonical_json(plan).encode("utf-8")).hexdigest()


def registration_body(display_name):
    return {
        "displayName": display_name,
        "publicClient": {"redirectUris": list(REDIRECT_URIS)},
        "requiredResourceAccess": [
            {
                "resourceAppId": resource_app_id,
                "resourceAccess": [{"id": scope_id, "type": "Scope"} for scope_id in scopes],
            }
            for resource_app_id, scopes in REQUIRED_RESOURCE_ACCESS
        ],
        "signInAudience": "AzureADMultipleOrgs",
    }


def build_plan(tenant_id, display_name):
    plan = {
        "contract": CONTRACT,
        "operation": "create-wrap-entra-application",
        "method": "POST",
        "origin": GRAPH_ORIGIN,
        "path": CREATE_PATH,
        "tenantId": tenant_id,
        "body": registration_body(display_name),
    }
    return validate_plan(plan)


def validate_plan(plan):
    if plan.get("contract") != CONTRACT or plan.get("operation") != "create-wrap-entra-application":
        raise ValueError("Unsupported Wrap registration contract")
    if plan.get("method") != "POST" or plan.get("origin") != GRAPH_ORIGIN or plan.get("path") != CREATE_PATH:
        raise ValueError("Unexpected Microsoft Graph target")
    if not GUID_PATTERN.fullmatch(str(plan.get("tenantId", ""))):
        raise ValueError("tenantId must be a GUID")
    body = plan.get("body")
    if not isinstance(body, dict) or not isinstance(body.get("displayName"), str) or not body["displayName"].strip():
        raise ValueError("displayName is required")
    if body != registration_body(body["displayName"]):
        raise ValueError("Registration body differs from the observed Wrap contract")
    return plan


def load_approved_plan(path, expected_hash):
    plan = validate_plan(json.loads(path.read_text(encoding="utf-8")))
    if not expected_hash or canonical_hash(plan) != expected_hash.lower():
        raise ValueError("Plan changed or approval hash is missing")
    return plan


def token_tenant_id(token):
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Microsoft Graph token is not a JWT")
    payload = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
    tenant_id = json.loads(base64.urlsafe_b64decode(payload)).get("tid")
    if not GUID_PATTERN.fullmatch(str(tenant_id or "")):
        raise ValueError("Microsoft Graph token has no valid tenant ID")
    return tenant_id.lower()


def normalized_registration(value):
    result = {
        "displayName": value.get("displayName"),
        "publicClient": {"redirectUris": sorted((value.get("publicClient") or {}).get("redirectUris") or [])},
        "requiredResourceAccess": [],
        "signInAudience": value.get("signInAudience"),
    }
    for item in value.get("requiredResourceAccess") or []:
        result["requiredResourceAccess"].append(
            {
                "resourceAppId": item.get("resourceAppId"),
                "resourceAccess": sorted(
                    [
                        {"id": access.get("id"), "type": access.get("type")}
                        for access in item.get("resourceAccess") or []
                    ],
                    key=lambda access: (str(access["id"]), str(access["type"])),
                ),
            }
        )
    result["requiredResourceAccess"].sort(key=lambda item: str(item["resourceAppId"]))
    return result


def verify_readback(plan, actual):
    validate_plan(plan)
    if normalized_registration(actual) != normalized_registration(plan["body"]):
        raise ValueError("Microsoft Graph read-back differs from the approved Wrap contract")


def apply_plan(plan):
    validate_plan(plan)
    token = get_token("https://graph.microsoft.com/.default")
    if token_tenant_id(token) != plan["tenantId"].lower():
        raise ValueError("Approved tenant does not match the Microsoft Graph token")
    session = get_session("https://graph.microsoft.com/.default")
    escaped_name = plan["body"]["displayName"].replace("'", "''")
    duplicate = session.get(
        f"{GRAPH_ORIGIN}/v1.0/applications",
        params={"$filter": f"displayName eq '{escaped_name}'", "$select": "id,appId,displayName"},
        timeout=60,
    )
    duplicate.raise_for_status()
    if duplicate.json().get("value"):
        raise RuntimeError("An Entra application with the approved display name already exists")

    response = session.post(f"{GRAPH_ORIGIN}{CREATE_PATH}", json=copy.deepcopy(plan["body"]), timeout=60)
    response.raise_for_status()
    created = response.json()
    object_id = created.get("id")
    if not GUID_PATTERN.fullmatch(str(object_id or "")):
        raise ValueError("Microsoft Graph create response has no application object ID")
    readback = session.get(
        f"{GRAPH_ORIGIN}/v1.0/applications/{object_id}",
        params={
            "$select": "id,appId,displayName,publicClient,requiredResourceAccess,signInAudience"
        },
        timeout=60,
    )
    readback.raise_for_status()
    actual = readback.json()
    verify_readback(plan, actual)
    return {
        "objectId": actual["id"],
        "clientId": actual["appId"],
        "displayName": actual["displayName"],
    }


def build_cleanup_plan(plan, registration):
    validate_plan(plan)
    for key in ("objectId", "clientId"):
        if not GUID_PATTERN.fullmatch(str(registration.get(key, ""))):
            raise ValueError(f"registration {key} must be a GUID")
    if registration.get("displayName") != plan["body"]["displayName"]:
        raise ValueError("registration displayName does not match the create plan")
    return {
        "contract": CLEANUP_CONTRACT,
        "operation": "delete-wrap-entra-application",
        "method": "DELETE",
        "origin": GRAPH_ORIGIN,
        "path": f"/v1.0/applications/{registration['objectId']}",
        "tenantId": plan["tenantId"],
        "objectId": registration["objectId"],
        "clientId": registration["clientId"],
        "displayName": registration["displayName"],
    }


def validate_cleanup_plan(plan):
    if plan.get("contract") != CLEANUP_CONTRACT or plan.get("operation") != "delete-wrap-entra-application":
        raise ValueError("Unsupported Wrap cleanup contract")
    if plan.get("method") != "DELETE" or plan.get("origin") != GRAPH_ORIGIN:
        raise ValueError("Unexpected Microsoft Graph cleanup target")
    for key in ("tenantId", "objectId", "clientId"):
        if not GUID_PATTERN.fullmatch(str(plan.get(key, ""))):
            raise ValueError(f"cleanup {key} must be a GUID")
    if plan.get("path") != f"/v1.0/applications/{plan['objectId']}" or not plan.get("displayName"):
        raise ValueError("Cleanup target identity is incomplete")
    return plan


def cleanup_registration(plan):
    validate_cleanup_plan(plan)
    token = get_token("https://graph.microsoft.com/.default")
    if token_tenant_id(token) != plan["tenantId"].lower():
        raise ValueError("Approved tenant does not match the Microsoft Graph token")
    session = get_session("https://graph.microsoft.com/.default")
    url = f"{GRAPH_ORIGIN}{plan['path']}"
    current = session.get(url, params={"$select": "id,appId,displayName"}, timeout=60)
    current.raise_for_status()
    actual = current.json()
    if any(actual.get(key) != plan[value] for key, value in (("id", "objectId"), ("appId", "clientId"), ("displayName", "displayName"))):
        raise ValueError("Cleanup target identity changed; no delete sent")
    response = session.delete(url, timeout=60)
    response.raise_for_status()
    absent = session.get(url, params={"$select": "id"}, timeout=60)
    if absent.status_code != 404:
        raise ValueError("Deleted Wrap registration is still present")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("--tenant-id", required=True)
    plan_parser.add_argument("--name", required=True)
    plan_parser.add_argument("--output", type=Path, required=True)
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--plan", type=Path, required=True)
    apply_parser.add_argument("--expected-hash", required=True)
    apply_parser.add_argument("--report-file", type=Path, required=True)
    cleanup_parser = subparsers.add_parser("cleanup")
    cleanup_parser.add_argument("--report-file", type=Path, required=True)
    cleanup_parser.add_argument("--expected-hash", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.command == "plan":
        plan = build_plan(args.tenant_id, args.name)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Plan: {args.output}")
        print(f"Approval SHA-256: {canonical_hash(plan)}")
        return

    if args.command == "cleanup":
        report = json.loads(args.report_file.read_text(encoding="utf-8"))
        cleanup_plan = validate_cleanup_plan(report.get("cleanupPlan", {}))
        if canonical_hash(cleanup_plan) != args.expected_hash.lower():
            raise ValueError("Cleanup plan changed or approval hash is missing")
        cleanup_registration(cleanup_plan)
        report["status"] = "deleted-verified"
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Wrap registration deleted and absence verified")
        return

    if args.report_file.exists():
        raise ValueError("Use a new report path")
    plan = load_approved_plan(args.plan, args.expected_hash)
    report = {"status": "request-pending", "planHash": canonical_hash(plan)}
    args.report_file.parent.mkdir(parents=True, exist_ok=True)
    args.report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    try:
        registration = apply_plan(plan)
        cleanup_plan = build_cleanup_plan(plan, registration)
        report.update(
            status="created-verified",
            registration=registration,
            cleanupPlan=cleanup_plan,
            cleanupHash=canonical_hash(cleanup_plan),
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception as error:
        report.update(status="failed-or-unverified", error=str(error))
        raise
    finally:
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()