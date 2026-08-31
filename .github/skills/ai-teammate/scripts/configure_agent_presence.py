#!/usr/bin/env python3
"""Configure a self-hosted Agent 365 agent's Teams presence heartbeat.

Grants Microsoft Graph ``Presence.ReadWrite.All`` to the App Service UAMI,
resolves the target agentic user, and optionally writes the non-secret runtime
settings used by ``PresenceWorker`` to an Azure Web App.

Requires an administrator allowed to create app role assignments. Do not create
an ai-teammate-specific login cache; use the standard auth_helper cache for
delegated tokens and an existing Azure CLI context only for Azure CLI operations.

Usage:
    python scripts/configure_agent_presence.py --managed-identity-client-id <guid> --agent-user-id <guid>
    python scripts/configure_agent_presence.py --agent-user-upn agent@contoso.onmicrosoft.com --check
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

GRAPH = "https://graph.microsoft.com/v1.0"
GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000"
PRESENCE_ROLE = "Presence.ReadWrite.All"


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


def one(items: list[dict], label: str) -> dict:
    if not items:
        raise SystemExit(f"{label} not found.")
    if len(items) > 1:
        raise SystemExit(f"Multiple {label} matches; use an exact ID.")
    return items[0]


def resolve_managed_identity(client_id: str) -> dict:
    return one(
        az_json(
            "ad", "sp", "list", "--filter", f"appId eq '{client_id}'",
            "--query", "[].{id:id,appId:appId,displayName:displayName}",
        ) or [],
        "managed identity service principal",
    )


def resolve_agent_user(user_id: str | None, upn: str | None) -> dict:
    identifier = user_id or upn
    if not identifier:
        raise SystemExit("Agent user ID or UPN is required.")
    user = az_json(
        "rest", "--method", "GET", "--uri",
        f"https://graph.microsoft.com/beta/users/{identifier}",
    )
    if not user or user.get("@odata.type") != "#microsoft.graph.agentUser":
        raise SystemExit("The target user exists but is not an Agent 365 agentUser.")
    return user


def resolve_presence_role() -> tuple[str, str]:
    graph_sp = az_json("ad", "sp", "show", "--id", GRAPH_APP_ID)
    roles = [role for role in graph_sp.get("appRoles", []) if role.get("value") == PRESENCE_ROLE]
    role = one(roles, PRESENCE_ROLE)
    if "Application" not in role.get("allowedMemberTypes", []):
        raise SystemExit(f"{PRESENCE_ROLE} is not available as an application permission.")
    return graph_sp["id"], role["id"]


def assignments(principal_id: str) -> list[dict]:
    result = az_json(
        "rest", "--method", "GET", "--uri",
        f"{GRAPH}/servicePrincipals/{principal_id}/appRoleAssignments",
    ) or {}
    return result.get("value", [])


def grant(principal_id: str, resource_id: str, role_id: str) -> None:
    body = {"principalId": principal_id, "resourceId": resource_id, "appRoleId": role_id}
    path: str | None = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="ascii", delete=False) as handle:
            json.dump(body, handle)
            path = handle.name
        az(
            "rest", "--method", "POST", "--uri",
            f"{GRAPH}/servicePrincipals/{principal_id}/appRoleAssignments",
            "--headers", "Content-Type=application/json", "--body", f"@{path}",
            "--output", "none",
        )
    finally:
        if path:
            Path(path).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--managed-identity-client-id")
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--agent-user-id")
    target.add_argument("--agent-user-upn")
    parser.add_argument("--resource-group")
    parser.add_argument("--webapp")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    client_id = args.managed_identity_client_id or os.environ.get("AZURE_BOT_MSA_APP_ID")
    user_id = args.agent_user_id or (None if args.agent_user_upn else os.environ.get("A365_AGENT_USER_ID"))
    upn = args.agent_user_upn
    resource_group = args.resource_group or os.environ.get("AZURE_RESOURCE_GROUP")
    webapp = args.webapp or os.environ.get("AGENT_WEBAPP_NAME")
    if not client_id:
        parser.error("--managed-identity-client-id is required (or set AZURE_BOT_MSA_APP_ID).")

    try:
        identity = resolve_managed_identity(client_id)
        user = resolve_agent_user(user_id, upn)
        resource_id, role_id = resolve_presence_role()
        existing = next(
            (item for item in assignments(identity["id"]) if item.get("appRoleId") == role_id),
            None,
        )
        print(f"managed identity : {identity['displayName']} ({identity['appId']})")
        print(f"agentic user    : {user['displayName']} <{user['userPrincipalName']}>")

        if not existing:
            if args.check:
                print(f"MISSING: Graph application permission {PRESENCE_ROLE}.")
                return 1
            grant(identity["id"], resource_id, role_id)
            print(f"Granted: {PRESENCE_ROLE}")
        else:
            print(f"OK: {PRESENCE_ROLE} is already granted.")

        if resource_group and webapp and not args.check:
            az(
                "webapp", "config", "appsettings", "set",
                "--resource-group", resource_group, "--name", webapp,
                "--settings", "Presence__Enabled=true",
                f"Agentic__UserId={user['id']}", f"Presence__SessionId={client_id}",
                "--output", "none",
            )
            print(f"Configured Web App: {webapp}")
        elif not args.check:
            print("Web App settings not changed; provide --resource-group and --webapp to configure them.")
        return 0
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())