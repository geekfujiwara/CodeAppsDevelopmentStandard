#!/usr/bin/env python3
"""Grant Microsoft Graph *delegated* scopes to the Agent 365 agent instance
service principal, so the self-hosted app can call Graph as the agentic user.

Use this when a capability is not reachable through the Work IQ MCP server.
Work IQ enforces its own Rego path allowlist on top of Entra consent, and
``/chats`` is not on it, so Teams chat creation and posting have to go straight
to Graph with a delegated token for the agent itself::

    User.Read Chat.Create Chat.Read ChatMessage.Send

Application (app-only) permissions are not an alternative: app-only chat
posting requires ``Teamwork.Migrate.All`` (a protected API) and the message
would not appear as coming from the agent.

Other capabilities need extra delegated scopes on the same grant:

* ``Mail.Send`` -- replying to mail as HTML via ``POST /me/messages/{id}/reply``.
  Work IQ's reply action only carries a plain-text comment, which kills links,
  so the reply is sent through Graph instead. ``Mail.ReadWrite`` is not enough.
* ``Files.ReadWrite`` -- listing and sharing files the agent produced (B14).

Pass them together with the defaults, for example::

    --scopes "User.Read Chat.Create Chat.Read ChatMessage.Send Mail.Send Files.ReadWrite"

The grant is per *instance*, exactly like grant_agent_instance_consent.py, so
it has to be repeated whenever the agent instance is recreated. An existing
grant for the same (client, resource) pair is merged rather than replaced --
Entra allows only one row per pair, and POSTing a second one fails.

Requires Microsoft Graph ``DelegatedPermissionGrant.ReadWrite.All`` (or an
administrator role such as Privileged Role Administrator / Global
Administrator). Uses the Azure CLI login, so run ``az login`` first.

Usage:
    python scripts/grant_agent_graph_scopes.py --instance-id <guid>
    python scripts/grant_agent_graph_scopes.py --instance-name "Contoso Agent A" \
        --scopes "User.Read Chat.Create Chat.Read ChatMessage.Send"
    python scripts/grant_agent_graph_scopes.py --instance-id <guid> --check
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

# Microsoft Graph. Same appId in every tenant; the objectId differs per tenant.
GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000"
GRAPH = "https://graph.microsoft.com/v1.0"
# Enough to create a chat and post into it as the agent itself.
DEFAULT_SCOPES = "User.Read Chat.Create Chat.Read ChatMessage.Send"


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


def graph_write(method: str, url: str, body: dict) -> None:
    """POST/PATCH JSON to Graph. az reads the body from a file (@) because
    inline JSON quoting is unreliable on Windows shells."""
    body_path = Path("_grant_body.json")
    body_path.write_text(json.dumps(body), encoding="ascii")
    try:
        az("rest", "--method", method, "--uri", url,
           "--headers", "Content-Type=application/json",
           "--body", f"@{body_path}", "-o", "none")
    finally:
        body_path.unlink(missing_ok=True)


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


def assert_scopes_published(resource_object_id: str, wanted: list[str]) -> None:
    """Fail before writing if a scope is not published by Graph as a delegated
    permission. A typo is otherwise accepted by the grant API and only shows up
    later as a silent 403 at runtime."""
    published = {
        s["value"]
        for s in (graph_get(
            f"{GRAPH}/servicePrincipals/{resource_object_id}"
            "?$select=oauth2PermissionScopes"
        ) or {}).get("oauth2PermissionScopes", [])
    }
    unknown = [s for s in wanted if s not in published]
    if unknown:
        raise SystemExit(
            "Not delegated permissions published by Microsoft Graph: "
            + ", ".join(unknown)
            + "\nCheck the spelling; application (app-only) roles cannot be granted here."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--instance-id", help="Agent instance appId (GUID). Defaults to $A365_AGENT_INSTANCE_ID.")
    group.add_argument("--instance-name", help="Agent instance display name, e.g. 'Contoso Agent A'.")
    parser.add_argument("--scopes", default=DEFAULT_SCOPES,
                        help=f"Space-separated delegated Graph scopes. Default: '{DEFAULT_SCOPES}'.")
    parser.add_argument("--check", action="store_true", help="Only report the current grant state.")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    instance_id = args.instance_id or (None if args.instance_name else os.environ.get("A365_AGENT_INSTANCE_ID"))
    if not instance_id and not args.instance_name:
        parser.error("--instance-id or --instance-name is required (or set A365_AGENT_INSTANCE_ID).")

    wanted = sorted({s for s in args.scopes.split() if s})
    if not wanted:
        parser.error("--scopes must list at least one delegated permission.")

    try:
        instance = resolve_instance_sp(instance_id, args.instance_name)
        resource = az_json(
            "ad", "sp", "show", "--id", GRAPH_APP_ID,
            "--query", "{id:id,displayName:displayName}",
        )
        assert_scopes_published(resource["id"], wanted)
    except (RuntimeError, SystemExit) as exc:
        print(exc, file=sys.stderr)
        return 1

    client_id, resource_id = instance["id"], resource["id"]
    print(f"instance : {instance['displayName']} ({instance['appId']})")
    print(f"resource : {resource['displayName']} ({GRAPH_APP_ID})")
    print(f"scopes   : {' '.join(wanted)}")

    grants = (graph_get(f"{GRAPH}/servicePrincipals/{client_id}/oauth2PermissionGrants") or {}).get("value", [])
    existing = next((g for g in grants if g.get("resourceId") == resource_id), None)
    current = set((existing.get("scope") or "").split()) if existing else set()
    missing = [s for s in wanted if s not in current]

    if not missing:
        print(f"OK: already granted ({' '.join(sorted(current))}).")
        return 0
    if args.check:
        print(f"MISSING: {' '.join(missing)}. Rerun without --check to grant them.")
        return 1

    merged = " ".join(sorted(current | set(wanted)))
    try:
        if existing:
            # Entra keeps one grant row per (client, resource); a second POST is rejected.
            graph_write("PATCH", f"{GRAPH}/oauth2PermissionGrants/{existing['id']}", {"scope": merged})
        else:
            graph_write("POST", f"{GRAPH}/oauth2PermissionGrants", {
                "clientId": client_id,
                "consentType": "AllPrincipals",
                "resourceId": resource_id,
                "scope": merged,
            })
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

    print(f"Granted (AllPrincipals): {merged}")
    print("Restart the App Service so cached tokens are re-issued with the new scopes:")
    print("  az webapp restart -g <resource-group> -n <app-name>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
