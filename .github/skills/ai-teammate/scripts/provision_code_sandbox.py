#!/usr/bin/env python3
"""Provision the Azure Container Apps dynamic session pool used as the agent's code sandbox.

Creates (idempotently) a ``Microsoft.App/sessionPools`` resource, grants the app's
managed identity the session executor role on it, and optionally writes the runtime
settings the agent needs. The pool management endpoint is always read back from ARM;
it is never assembled by hand.

Three checks run on every successful invocation, not only under ``--check``:
  1. requested pool values are inside the documented ranges (before the write)
  2. the pool reached ``Succeeded`` and reports a management endpoint (after the write)
  3. the managed identity holds the session executor role on the pool

Skipping 3 is the classic failure: everything provisions cleanly and the agent gets
403 the first time a user asks it to run code.

Usage:
    python scripts/provision_code_sandbox.py --write-settings
    python scripts/provision_code_sandbox.py --check
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ARM = "https://management.azure.com"
API_VERSION = "2025-02-02-preview"
EXECUTOR_ROLE = "Azure ContainerApps Session Executor"
CONTAINER_TYPES = ("PythonLTS",)
MAX_SESSIONS_RANGE = (1, 600)
COOLDOWN_RANGE = (300, 3600)


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def az(*args: str) -> str:
    result = subprocess.run(
        ["az", *args], capture_output=True, text=True, shell=(os.name == "nt")
    )
    if result.returncode != 0:
        raise RuntimeError(f"az {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def az_json(*args: str):
    output = az(*args, "--output", "json")
    return json.loads(output) if output else None


def rest(method: str, url: str, body: dict | None = None):
    args = ["rest", "--method", method, "--url", url]
    path: str | None = None
    try:
        if body is not None:
            with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
                json.dump(body, handle)
                path = handle.name
            args += ["--headers", "Content-Type=application/json", "--body", f"@{path}"]
        output = az(*args, "--output", "json")
        return json.loads(output) if output else None
    finally:
        if path:
            Path(path).unlink(missing_ok=True)


def validate_request(container_type: str, max_sessions: int, cooldown: int) -> None:
    """Reject out-of-range values before the ARM write, not after a confusing 400."""
    if container_type not in CONTAINER_TYPES:
        raise SystemExit(f"container type must be one of {', '.join(CONTAINER_TYPES)}; got {container_type}")
    low, high = MAX_SESSIONS_RANGE
    if not low <= max_sessions <= high:
        raise SystemExit(f"--max-sessions must be between {low} and {high}; got {max_sessions}")
    low, high = COOLDOWN_RANGE
    if not low <= cooldown <= high:
        raise SystemExit(f"--cooldown-seconds must be between {low} and {high}; got {cooldown}")


def pool_id(subscription: str, resource_group: str, name: str) -> str:
    return (
        f"/subscriptions/{subscription}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.App/sessionPools/{name}"
    )


def get_pool(resource_id: str) -> dict | None:
    try:
        return rest("GET", f"{ARM}{resource_id}?api-version={API_VERSION}")
    except RuntimeError:
        return None


def create_pool(
    resource_id: str, location: str, container_type: str, max_sessions: int, cooldown: int, egress: bool
) -> dict:
    body = {
        "location": location,
        "properties": {
            "poolManagementType": "Dynamic",
            "containerType": container_type,
            "scaleConfiguration": {"maxConcurrentSessions": max_sessions},
            "dynamicPoolConfiguration": {
                "executionType": "Timed",
                "cooldownPeriodInSeconds": cooldown,
            },
            "sessionNetworkConfiguration": {
                "status": "EgressEnabled" if egress else "EgressDisabled"
            },
        },
    }
    return rest("PUT", f"{ARM}{resource_id}?api-version={API_VERSION}", body)


def assert_pool_ready(pool: dict | None) -> str:
    """A pool without a management endpoint is unusable; fail here instead of at runtime."""
    if not pool:
        raise SystemExit("Session pool was not found after provisioning.")
    properties = pool.get("properties", {})
    state = properties.get("provisioningState")
    if state != "Succeeded":
        raise SystemExit(f"Session pool provisioning state is {state}; expected Succeeded.")
    endpoint = properties.get("poolManagementEndpoint")
    if not endpoint:
        raise SystemExit("Session pool has no poolManagementEndpoint. Do not assemble the URL by hand.")
    return endpoint


def executor_role_id(subscription: str) -> str:
    roles = az_json(
        "role", "definition", "list", "--name", EXECUTOR_ROLE,
        "--scope", f"/subscriptions/{subscription}", "--query", "[].id",
    ) or []
    if not roles:
        raise SystemExit(
            f"Role definition '{EXECUTOR_ROLE}' was not found in this subscription. "
            "Register the Microsoft.App provider and retry."
        )
    return roles[0]


def has_role(principal_id: str, scope: str) -> bool:
    existing = az_json(
        "role", "assignment", "list", "--assignee", principal_id,
        "--scope", scope, "--query", "[].roleDefinitionName",
    ) or []
    return EXECUTOR_ROLE in existing


def assign_role(principal_id: str, role_id: str, scope: str) -> None:
    az(
        "role", "assignment", "create", "--assignee-object-id", principal_id,
        "--assignee-principal-type", "ServicePrincipal", "--role", role_id,
        "--scope", scope, "--output", "none",
    )


def assert_role_granted(principal_id: str, scope: str) -> None:
    """Runs on the success path too: a missing role only surfaces as a runtime 403."""
    if not has_role(principal_id, scope):
        raise SystemExit(
            f"Managed identity {principal_id} does not hold '{EXECUTOR_ROLE}' on the pool. "
            "The agent would receive 403 on its first code execution."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subscription")
    parser.add_argument("--resource-group")
    parser.add_argument("--name", help="Session pool name. Defaults to <AGENT_NAME>-sandbox.")
    parser.add_argument("--location")
    parser.add_argument("--principal-id", help="Object ID of the App Service managed identity.")
    parser.add_argument("--container-type", default="PythonLTS")
    parser.add_argument("--max-sessions", type=int, default=10)
    parser.add_argument("--cooldown-seconds", type=int, default=300)
    parser.add_argument(
        "--no-egress", action="store_true",
        help="Block outbound network access from sessions. pip install stops working.",
    )
    parser.add_argument("--webapp")
    parser.add_argument("--write-settings", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    subscription = args.subscription or os.environ.get("AZURE_SUBSCRIPTION_ID")
    resource_group = args.resource_group or os.environ.get("AZURE_RESOURCE_GROUP")
    name = args.name or os.environ.get("SANDBOX_POOL_NAME") or f"{os.environ.get('AGENT_NAME', 'agent')}-sandbox"
    principal_id = args.principal_id or os.environ.get("AGENT_IDENTITY_PRINCIPAL_ID")
    webapp = args.webapp or os.environ.get("AGENT_WEBAPP_NAME")
    egress = not args.no_egress

    if not subscription or not resource_group:
        parser.error("--subscription and --resource-group are required (or set AZURE_*).")
    if not principal_id:
        parser.error("--principal-id is required (or set AGENT_IDENTITY_PRINCIPAL_ID).")

    resource_id = pool_id(subscription, resource_group, name)

    try:
        if args.check:
            pool = get_pool(resource_id)
            endpoint = assert_pool_ready(pool)
            assert_role_granted(principal_id, resource_id)
            network = pool["properties"].get("sessionNetworkConfiguration", {}).get("status")
            print(f"pool      : {name} ({pool['location']})")
            print(f"endpoint  : {endpoint}")
            print(f"egress    : {network}")
            print(f"role      : {EXECUTOR_ROLE} granted to {principal_id}")
            return 0

        location = args.location or az_json(
            "group", "show", "--name", resource_group, "--query", "location"
        )
        if not location:
            parser.error("--location is required when the resource group location cannot be read.")

        validate_request(args.container_type, args.max_sessions, args.cooldown_seconds)

        pool = get_pool(resource_id)
        if pool:
            print(f"OK: session pool {name} already exists.")
        else:
            pool = create_pool(
                resource_id, location, args.container_type,
                args.max_sessions, args.cooldown_seconds, egress,
            )
            print(f"Created: session pool {name} in {location}")

        endpoint = assert_pool_ready(get_pool(resource_id))

        if has_role(principal_id, resource_id):
            print(f"OK: {EXECUTOR_ROLE} is already granted.")
        else:
            assign_role(principal_id, executor_role_id(subscription), resource_id)
            print(f"Granted: {EXECUTOR_ROLE} to {principal_id}")

        assert_role_granted(principal_id, resource_id)

        if not egress:
            print("Note: egress is disabled. pip install and outbound HTTP will fail inside sessions.")

        if args.write_settings and webapp:
            az(
                "webapp", "config", "appsettings", "set",
                "--resource-group", resource_group, "--name", webapp,
                "--settings", "Sandbox__Enabled=true",
                f"Sandbox__Endpoint={endpoint}", f"Sandbox__ApiVersion={API_VERSION}",
                "--output", "none",
            )
            print(f"Configured Web App: {webapp}")
        else:
            print("Set these app settings on the agent:")
            print("  Sandbox__Enabled=true")
            print(f"  Sandbox__Endpoint={endpoint}")
            print(f"  Sandbox__ApiVersion={API_VERSION}")
        return 0
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
