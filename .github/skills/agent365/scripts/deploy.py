#!/usr/bin/env python3
"""Deploy a new Foundry agent version from a rendered manifest.

Reads a rendered agent manifest (see ``render.py``) and creates a new agent
version in the target Microsoft Foundry project using the ``azure-ai-projects``
SDK. On success the new version becomes the "latest" (unless the manifest marks
it as a draft), which the "always use latest" endpoint selector serves to Teams
and Microsoft 365 Copilot automatically — no portal step required.

Environment:
    FOUNDRY_PROJECT_ENDPOINT  Foundry project endpoint from the project
                              Overview page, e.g.
                              https://<account>.services.ai.azure.com/api/projects/<project>

Auth: ``DefaultAzureCredential`` — supports azure/login (OIDC) in CI, Azure CLI
locally, managed identity and environment credentials.

Usage:
    python scripts/deploy.py --agent my-agent
    python scripts/deploy.py --manifest agents/my-agent/agent.yaml
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml
from azure.ai.projects import AIProjectClient
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", help="Agent name (default: $AGENT_NAME).")
    parser.add_argument("--manifest", help="Rendered manifest (default: agents/<agent>/agent.yaml).")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))

    agent = args.agent or os.environ.get("AGENT_NAME")
    if not agent and not args.manifest:
        raise SystemExit("Provide --agent, set AGENT_NAME, or pass --manifest.")

    manifest_path = Path(args.manifest or f"agents/{agent}/agent.yaml")
    if not manifest_path.is_file():
        raise SystemExit(
            f"Manifest not found: {manifest_path}\n"
            "Run scripts/render.py first to produce it from the template."
        )

    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))

    agent_name = manifest.get("name")
    definition = manifest.get("definition")
    if not agent_name or not definition:
        raise SystemExit("Manifest must contain top-level 'name' and 'definition'.")

    endpoint = os.environ.get("FOUNDRY_PROJECT_ENDPOINT")
    if not endpoint:
        raise SystemExit("FOUNDRY_PROJECT_ENDPOINT is not set (see references/.env.example).")

    create_kwargs: dict[str, object] = {
        "agent_name": agent_name,
        "definition": definition,
        "description": manifest.get("description") or "",
        "draft": bool(manifest.get("draft", False)),
    }
    blueprint_reference = manifest.get("blueprint_reference")
    if blueprint_reference:
        create_kwargs["blueprint_reference"] = blueprint_reference

    try:
        with (
            DefaultAzureCredential() as credential,
            AIProjectClient(endpoint=endpoint, credential=credential, allow_preview=True) as client,
        ):
            version = client.agents.create_version(**create_kwargs)
            print(f"Deployed agent '{version.name}' version '{version.version}' (id: {version.id})")
            print("Active version selector 'always use latest' serves this version to Teams / M365.")
    except AzureError as exc:
        sys.stderr.write(f"Foundry request failed: {exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
