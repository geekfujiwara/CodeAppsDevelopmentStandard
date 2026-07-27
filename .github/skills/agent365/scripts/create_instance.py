#!/usr/bin/env python3
"""Create an agent instance from an Agent Template using the Foundry SDK.

Foundry exposes three ways to instantiate an agent from a template:

  manifest   Instantiate a published agent manifest (template) by id, passing
             template parameter values.
             -> ``agents.create_version_from_manifest``

  definition Create a standalone agent from the template definition. Use this
             when the source blueprint has ``Lifecycle=Auto`` and therefore
             cannot be shared across agents.
             -> ``agents.create_version``

  blueprint  Create a version bound to a managed-identity blueprint. Requires
             the blueprint to have ``Lifecycle=Manual``.
             -> ``agents.create_version(..., blueprint_reference=...)``

All identifiers come from arguments or ``.env`` — nothing is hardcoded.

Usage:
    python scripts/create_instance.py --name my-agent --mode blueprint --blueprint-id my-agent
    python scripts/create_instance.py --name my-agent-sales --template-id <manifest-id> \
        --parameter region=japaneast
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import yaml
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import ManagedAgentIdentityBlueprintReference
from azure.core.exceptions import AzureError
from azure.identity import DefaultAzureCredential


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


def parse_parameters(pairs: list[str]) -> dict[str, object]:
    """Parse ``key=value`` pairs; values are JSON-decoded when possible."""
    values: dict[str, object] = {}
    for pair in pairs:
        key, sep, raw = pair.partition("=")
        if not sep:
            raise SystemExit(f"Invalid --parameter '{pair}' (expected key=value).")
        try:
            values[key.strip()] = json.loads(raw)
        except json.JSONDecodeError:
            values[key.strip()] = raw
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="Name of the agent instance (default: $AGENT_NAME).")
    parser.add_argument("--mode", choices=("manifest", "definition", "blueprint"), default="blueprint")
    parser.add_argument("--template-id", help="Template/manifest id (default: $AGENT_TEMPLATE_ID).")
    parser.add_argument("--blueprint-id", help="Blueprint id (default: $BLUEPRINT_ID).")
    parser.add_argument("--definition", help="Rendered manifest (default: agents/<name>/agent.yaml).")
    parser.add_argument("--description")
    parser.add_argument("--parameter", action="append", default=[], metavar="KEY=VALUE",
                        help="Template parameter value; repeatable.")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))

    name = args.name or os.environ.get("AGENT_NAME")
    if not name:
        raise SystemExit("Provide --name or set AGENT_NAME.")

    endpoint = os.environ.get("FOUNDRY_PROJECT_ENDPOINT")
    if not endpoint:
        raise SystemExit("FOUNDRY_PROJECT_ENDPOINT is not set (see references/.env.example).")

    try:
        with (
            DefaultAzureCredential() as credential,
            AIProjectClient(endpoint=endpoint, credential=credential, allow_preview=True) as client,
        ):
            if args.mode == "manifest":
                template_id = args.template_id or os.environ.get("AGENT_TEMPLATE_ID")
                if not template_id:
                    raise SystemExit("Provide --template-id or set AGENT_TEMPLATE_ID.")
                version = client.agents.create_version_from_manifest(
                    agent_name=name,
                    manifest_id=template_id,
                    parameter_values=parse_parameters(args.parameter),
                    description=args.description,
                )
            else:
                definition_path = Path(args.definition or f"agents/{name}/agent.yaml")
                if not definition_path.is_file():
                    raise SystemExit(
                        f"Definition manifest not found: {definition_path}\n"
                        "Run scripts/render.py first to produce it from the template."
                    )
                manifest = yaml.safe_load(definition_path.read_text(encoding="utf-8"))
                definition = manifest.get("definition")
                if not definition:
                    raise SystemExit(f"{definition_path}: missing top-level 'definition'.")

                create_kwargs: dict[str, object] = {
                    "agent_name": name,
                    "definition": definition,
                    "description": args.description or manifest.get("description"),
                }
                if args.mode == "blueprint":
                    blueprint_id = args.blueprint_id or os.environ.get("BLUEPRINT_ID")
                    if not blueprint_id:
                        raise SystemExit("Provide --blueprint-id or set BLUEPRINT_ID.")
                    create_kwargs["blueprint_reference"] = ManagedAgentIdentityBlueprintReference(
                        blueprint_id=blueprint_id
                    )
                version = client.agents.create_version(**create_kwargs)

            print(f"Created agent instance '{version.name}' version '{version.version}' (id: {version.id})")

            agent = client.agents.get(agent_name=version.name)
            print(f"  name  : {agent.name}")
            print(f"  status: {getattr(agent, 'status', 'n/a')}")
            print("Copy the instance identity principal/client id into .env before rendering again.")
    except AzureError as exc:
        sys.stderr.write(f"Foundry request failed: {exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
