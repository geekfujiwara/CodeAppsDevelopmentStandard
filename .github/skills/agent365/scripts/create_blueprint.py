#!/usr/bin/env python3
"""Create or inspect Foundry managed agent identity blueprints.

Blueprints are not exposed through the ``azure-ai-projects`` operation groups,
so this script calls the project data-plane REST API through the authenticated
client (``AIProjectClient.send_request``) — still SDK-based, no portal
automation.

A blueprint created here uses ``lifecycle: Manual`` so it can be shared across
multiple agents. Auto-lifecycle blueprints (created implicitly by an agent) are
owned by that agent and cannot be referenced by another one.

NOTE: this is the *Foundry managed identity* blueprint. It is unrelated to the
Agent 365 agent identity blueprint created with ``a365 setup blueprint``.

Usage:
    python scripts/create_blueprint.py --name my-agent
    python scripts/create_blueprint.py --list
    python scripts/create_blueprint.py --name my-agent --show
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.core.exceptions import AzureError
from azure.core.rest import HttpRequest
from azure.identity import DefaultAzureCredential

ROUTE = "/managedAgentIdentityBlueprints"
API_VERSION = "v1"


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


def summarize(blueprint: dict) -> str:
    identity = blueprint.get("agentIdentityBlueprint", {})
    return (
        f"{blueprint.get('blueprintName')}  "
        f"lifecycle={blueprint.get('lifecycle')}  "
        f"state={identity.get('provisioningState')}  "
        f"owner={blueprint.get('owningAgentId', '-')}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="Blueprint name to create or show (default: $BLUEPRINT_ID).")
    parser.add_argument("--list", action="store_true", help="List existing blueprints.")
    parser.add_argument("--show", action="store_true", help="Show the blueprint instead of creating it.")
    parser.add_argument("--lifecycle", choices=("Manual", "Auto"), default="Manual")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))

    name = args.name or os.environ.get("BLUEPRINT_ID")
    if not name and not args.list:
        parser.error("Provide --name, set BLUEPRINT_ID, or use --list.")

    endpoint = os.environ.get("FOUNDRY_PROJECT_ENDPOINT")
    if not endpoint:
        raise SystemExit("FOUNDRY_PROJECT_ENDPOINT is not set (see references/.env.example).")

    params = {"api-version": API_VERSION}

    try:
        with (
            DefaultAzureCredential() as credential,
            AIProjectClient(endpoint=endpoint, credential=credential, allow_preview=True) as client,
        ):
            if args.list:
                response = client.send_request(HttpRequest("GET", ROUTE, params=params))
                response.raise_for_status()
                for blueprint in response.json().get("value", []):
                    print(summarize(blueprint))
                return 0

            path = f"{ROUTE}/{name}"

            if args.show:
                response = client.send_request(HttpRequest("GET", path, params=params))
                response.raise_for_status()
                print(json.dumps(response.json(), indent=2, ensure_ascii=False))
                return 0

            body = {
                "agentIdentityBlueprint": {"kind": "AgentBlueprint", "type": "System"},
                "lifecycle": args.lifecycle,
            }
            response = client.send_request(HttpRequest("PUT", path, params=params, json=body))
            response.raise_for_status()
            blueprint = response.json()
            print(f"Created blueprint: {summarize(blueprint)}")
            print(f"  blueprintId: {blueprint.get('blueprintId')}")
            print(
                "Reference it with: python scripts/create_instance.py "
                f"--name <agent> --mode blueprint --blueprint-id {blueprint.get('blueprintName')}"
            )
    except AzureError as exc:
        sys.stderr.write(f"Foundry request failed: {exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
