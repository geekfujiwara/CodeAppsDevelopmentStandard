#!/usr/bin/env python3
"""Provision the self-hosted messaging endpoint for an Agent 365 agentic user.

Creates, idempotently:

1. a user-assigned managed identity (used as the Azure Bot identity),
2. an Azure Bot registration + the Microsoft Teams channel,
3. a Linux App Service plan + web app that hosts the Agents SDK application.

``az bot create`` is not used because it still targets a retired API version;
the bot is created with ``az rest --method PUT`` against api-version
2022-09-15. The Teams channel is also created with PUT because
``acceptedTerms`` is only persisted that way.

The messaging endpoint is the web app's ``/api/messages`` — NOT the Foundry
``activityprotocol`` URL. Foundry-hosted endpoints reject the Agent 365 token
with 401 (see references/self-hosted-agent.md).

Usage:
    python scripts/provision_selfhost.py --write .env
    python scripts/provision_selfhost.py --location westus2 --sku B1
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

BOT_API_VERSION = "2022-09-15"
ARM = "https://management.azure.com"


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
    result = subprocess.run(
        ["az", *args], capture_output=True, text=True, shell=(os.name == "nt")
    )
    if result.returncode != 0:
        raise RuntimeError(f"az {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def az_json(*args: str):
    out = az(*args, "-o", "json")
    return json.loads(out) if out else None


def arm_put(resource_id: str, api_version: str, body: dict) -> dict:
    body_path = Path("_arm_body.json")
    body_path.write_text(json.dumps(body), encoding="ascii")
    try:
        return az_json(
            "rest", "--method", "PUT",
            "--uri", f"{ARM}{resource_id}?api-version={api_version}",
            "--headers", "Content-Type=application/json",
            "--body", f"@{body_path}",
        )
    finally:
        body_path.unlink(missing_ok=True)


def update_env(path: Path, values: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    remaining = dict(values)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"
    lines.extend(f"{k}={v}" for k, v in remaining.items())
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="Base name for the resources. Defaults to $AGENT_NAME.")
    parser.add_argument("--resource-group", help="Defaults to $AZURE_RESOURCE_GROUP.")
    parser.add_argument("--subscription-id", help="Defaults to $AZURE_SUBSCRIPTION_ID.")
    parser.add_argument("--location", default="westus2", help="App Service region (default: westus2).")
    parser.add_argument("--sku", default="B1", help="App Service plan SKU (default: B1).")
    parser.add_argument("--runtime", default="DOTNETCORE:8.0", help="Linux runtime (default: DOTNETCORE:8.0).")
    parser.add_argument("--env", default=".env")
    parser.add_argument("--write", metavar="PATH", help="Write the resulting ids back to this .env file.")
    args = parser.parse_args()

    load_env(Path(args.env))
    name = args.name or os.environ.get("AGENT_NAME")
    rg = args.resource_group or os.environ.get("AZURE_RESOURCE_GROUP")
    sub = args.subscription_id or os.environ.get("AZURE_SUBSCRIPTION_ID")
    if not (name and rg and sub):
        parser.error("--name, --resource-group and --subscription-id are required (or set them in .env).")

    app_name = f"{name}-agent"
    plan_name = f"{name}-plan"
    try:
        print(f"[1/3] user-assigned managed identity: {name}")
        uami = az_json("identity", "create", "-g", rg, "-n", name, "-l", args.location)
        uami_client_id, uami_resource_id = uami["clientId"], uami["id"]

        print(f"[2/3] app service: {app_name} ({args.location}, {args.sku})")
        az("appservice", "plan", "create", "-g", rg, "-n", plan_name,
           "-l", args.location, "--is-linux", "--sku", args.sku, "-o", "none")
        webapp = az_json("webapp", "create", "-g", rg, "-p", plan_name, "-n", app_name,
                         "--runtime", args.runtime)
        host = webapp["defaultHostName"]
        endpoint = f"https://{host}/api/messages"
        az("webapp", "identity", "assign", "-g", rg, "-n", app_name,
           "--identities", uami_resource_id, "-o", "none")

        print(f"[3/3] azure bot: {name} -> {endpoint}")
        bot_id = f"/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.BotService/botServices/{name}"
        arm_put(bot_id, BOT_API_VERSION, {
            "location": "global",
            "kind": "azurebot",
            "sku": {"name": "F0"},
            "properties": {
                "displayName": name,
                "endpoint": endpoint,
                "msaAppType": "UserAssignedMSI",
                "msaAppId": uami_client_id,
                "msaAppMSIResourceId": uami_resource_id,
                "msaAppTenantId": os.environ.get("AZURE_TENANT_ID", ""),
            },
        })
        # acceptedTerms only sticks through PUT, not through `az bot msteams create`.
        arm_put(f"{bot_id}/channels/MsTeamsChannel", BOT_API_VERSION, {
            "location": "global",
            "properties": {"channelName": "MsTeamsChannel",
                           "properties": {"isEnabled": True, "acceptedTerms": True}},
        })
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

    result = {
        "AZURE_BOT_NAME": name,
        "AZURE_BOT_MSA_APP_ID": uami_client_id,
        "AGENT_WEBAPP_NAME": app_name,
        "AGENT_MESSAGING_ENDPOINT": endpoint,
    }
    print("\n" + "\n".join(f"{k}={v}" for k, v in result.items()))
    if args.write:
        update_env(Path(args.write), result)
        print(f"\nWrote {len(result)} values to {args.write}")
    print("\nNext: register this endpoint on the Agent 365 blueprint:")
    print(f"  a365 setup blueprint -n {name} --endpoint-only --messaging-endpoint {endpoint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
