#!/usr/bin/env python3
"""Grant the Agent 365 agent *instance* service principal consent to the
Messaging Bot API, so a self-hosted agent can reply to agentic-user chats.

Without this grant the Agents SDK acquires the FMI token successfully but the
follow-up call fails with::

    AADSTS65001: The user or administrator has not consented to use the
    application with ID '<agentInstanceAppId>' named '<instance display name>'

and the agent stays silent in Teams.

A different error is emitted at the same time and must be ignored::

    AADSTS82001: Agentic application '<blueprintAppId>' is not permitted to
    request app-only tokens for resource '5a807f24-...'

Agentic applications cannot obtain app-only tokens by design; the SDK simply
tries and fails. Granting permissions to the blueprint does not help.

The instance id can be read from the App Service log line ``FMI Path: <guid>``
or from ``az ad sp list --display-name "<instance name>"``.

Requires Microsoft Graph ``DelegatedPermissionGrant.ReadWrite.All`` (or an
administrator role such as Privileged Role Administrator / Global
Administrator). Do not create an ai-teammate-specific login cache; use the
standard auth_helper cache for delegated tokens and an existing Azure CLI
context only for Azure CLI operations.

Usage:
    python scripts/grant_agent_instance_consent.py --instance-id <guid>
    python scripts/grant_agent_instance_consent.py --instance-name "Contoso Agent A"
    python scripts/grant_agent_instance_consent.py --instance-id <guid> --check
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

# Well-known first-party application that fronts the Agent 365 activity protocol.
MESSAGING_BOT_API_APP_ID = "5a807f24-c9de-44ee-a3a7-329e88a00ffc"
# The only delegated scope this resource publishes (it exposes no app roles).
MESSAGING_BOT_API_SCOPE = "AgentData.ReadWrite"
GRAPH = "https://graph.microsoft.com/v1.0"


def load_env(path: Path) -> None:
    """Load KEY=VALUE pairs from a .env file without overriding real env vars."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def az(*args: str) -> str:
    """Run an az command and return stdout, raising with stderr on failure."""
    result = subprocess.run(
        ["az", *args], capture_output=True, text=True, shell=(os.name == "nt")
    )
    if result.returncode != 0:
        raise RuntimeError(f"az {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def az_json(*args: str):
    out = az(*args, "-o", "json")
    return json.loads(out) if out else None


def graph_get(url: str):
    return az_json("rest", "--method", "GET", "--uri", url)


def resolve_instance_sp(instance_id: str | None, instance_name: str | None) -> dict:
    """Find the service principal of the agent instance (agentic user)."""
    if instance_id:
        sps = az_json(
            "ad", "sp", "list", "--filter", f"appId eq '{instance_id}'",
            "--query", "[].{id:id,appId:appId,displayName:displayName}",
        )
    else:
        sps = az_json(
            "ad", "sp", "list", "--display-name", instance_name,
            "--query", "[].{id:id,appId:appId,displayName:displayName}",
        )
    sps = sps or []
    if not sps:
        raise SystemExit(
            "Agent instance service principal not found. Create the instance in the "
            "Microsoft 365 admin center first, then retry."
        )
    if len(sps) > 1:
        listing = "\n".join(f"  {s['appId']}  {s['displayName']}" for s in sps)
        raise SystemExit(f"Multiple matches; rerun with --instance-id:\n{listing}")
    return sps[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--instance-id", help="Agent instance appId (GUID). Defaults to $A365_AGENT_INSTANCE_ID.")
    group.add_argument("--instance-name", help="Agent instance display name, e.g. 'Contoso Agent A'.")
    parser.add_argument("--check", action="store_true", help="Only report the current grant state.")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    instance_id = args.instance_id or (None if args.instance_name else os.environ.get("A365_AGENT_INSTANCE_ID"))
    if not instance_id and not args.instance_name:
        parser.error("--instance-id or --instance-name is required (or set A365_AGENT_INSTANCE_ID).")

    try:
        instance = resolve_instance_sp(instance_id, args.instance_name)
        resource = az_json(
            "ad", "sp", "show", "--id", MESSAGING_BOT_API_APP_ID,
            "--query", "{id:id,displayName:displayName}",
        )
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

    client_id, resource_id = instance["id"], resource["id"]
    print(f"instance : {instance['displayName']} ({instance['appId']})")
    print(f"resource : {resource['displayName']} ({MESSAGING_BOT_API_APP_ID})")

    grants = (graph_get(f"{GRAPH}/servicePrincipals/{client_id}/oauth2PermissionGrants") or {}).get("value", [])
    existing = next((g for g in grants if g.get("resourceId") == resource_id), None)
    if existing and MESSAGING_BOT_API_SCOPE in (existing.get("scope") or ""):
        print(f"OK: '{MESSAGING_BOT_API_SCOPE}' is already granted (consentType={existing['consentType']}).")
        return 0
    if args.check:
        print(f"MISSING: '{MESSAGING_BOT_API_SCOPE}' is not granted. Rerun without --check to grant it.")
        return 1

    body = {
        "clientId": client_id,
        "consentType": "AllPrincipals",
        "resourceId": resource_id,
        "scope": MESSAGING_BOT_API_SCOPE,
    }
    # az rest --body reads a file with @ syntax; inline JSON is unreliable on Windows shells.
    body_path = Path("_grant_body.json")
    body_path.write_text(json.dumps(body), encoding="ascii")
    try:
        az("rest", "--method", "POST", "--uri", f"{GRAPH}/oauth2PermissionGrants",
           "--headers", "Content-Type=application/json", "--body", f"@{body_path}", "-o", "none")
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1
    finally:
        body_path.unlink(missing_ok=True)

    print(f"Granted '{MESSAGING_BOT_API_SCOPE}' (AllPrincipals).")
    print("Restart the App Service to drop the cached MSAL failures:")
    print("  az webapp restart -g <resource-group> -n <app-name>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
