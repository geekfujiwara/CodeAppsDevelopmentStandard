#!/usr/bin/env python3
"""Read the agent's traces out of Application Insights, non-interactively.

Why this exists instead of ``az monitor``:

* ``az monitor app-insights query`` fails with ``BadArgumentError`` against a
  workspace-based Application Insights resource, which is the only kind the
  portal creates now.
* ``az monitor log-analytics query`` needs the ``log-analytics`` extension and
  **prompts** to install it, so an automated run hangs forever.

Both are avoided by calling the Log Analytics REST API with ``az rest``.

Usage:
    python scripts/query_agent_logs.py --minutes 30
    python scripts/query_agent_logs.py --contains "Received" --rows 20
    python scripts/query_agent_logs.py --kql "AppExceptions | take 5"
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

LOG_ANALYTICS = "https://api.loganalytics.io"
INSIGHTS_API_VERSION = "2020-02-02"
ARM = "https://management.azure.com"

# Startup and token chatter that buries the lines worth reading.
NOISE = ("HTTP response headers", "MSAL")


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
        raise SystemExit(f"az {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def az_json(*args: str):
    out = az(*args, "-o", "json")
    return json.loads(out) if out else None


def workspace_of(subscription: str, group: str, name: str) -> str:
    """The workspace id the traces actually land in, not the Insights resource."""
    resource_id = (
        f"/subscriptions/{subscription}/resourceGroups/{group}"
        f"/providers/Microsoft.Insights/components/{name}"
    )
    component = az_json(
        "rest", "--method", "GET",
        "--url", f"{ARM}{resource_id}?api-version={INSIGHTS_API_VERSION}",
    )
    workspace = (component or {}).get("properties", {}).get("WorkspaceResourceId")
    if not workspace:
        raise SystemExit(
            f"{name} is classic (no workspace). Use --workspace-id to name one explicitly."
        )
    return workspace


def run_query(workspace_resource_id: str, kql: str) -> list[list]:
    guid = az_json(
        "rest", "--method", "GET",
        "--url", f"{ARM}{workspace_resource_id}?api-version=2022-10-01",
    )["properties"]["customerId"]

    body = Path("_kql_body.json")
    body.write_text(json.dumps({"query": kql}), encoding="utf-8")
    try:
        answer = az_json(
            "rest", "--method", "POST",
            "--url", f"{LOG_ANALYTICS}/v1/workspaces/{guid}/query",
            "--resource", LOG_ANALYTICS,
            "--headers", "Content-Type=application/json",
            "--body", f"@{body}",
        )
    finally:
        body.unlink(missing_ok=True)

    return answer["tables"][0]["rows"] if answer.get("tables") else []


def main() -> int:
    load_env(Path(".env"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minutes", type=int, default=60, help="How far back to look.")
    parser.add_argument("--contains", help="Only lines containing this text.")
    parser.add_argument("--rows", type=int, default=40, help="Maximum lines to print.")
    parser.add_argument("--kql", help="Run this query instead of the trace tail.")
    parser.add_argument("--insights-name", default=os.environ.get("AGENT_INSIGHTS_NAME"),
                        help="Defaults to <AGENT_WEBAPP_NAME>-insights.")
    parser.add_argument("--resource-group", default=os.environ.get("AZURE_RESOURCE_GROUP"))
    parser.add_argument("--subscription", default=os.environ.get("AZURE_SUBSCRIPTION_ID"))
    parser.add_argument("--workspace-id", help="Log Analytics workspace resource id.")
    args = parser.parse_args()

    name = args.insights_name or (
        f"{os.environ['AGENT_WEBAPP_NAME']}-insights" if os.environ.get("AGENT_WEBAPP_NAME") else None
    )
    if not args.workspace_id and not (name and args.resource_group and args.subscription):
        parser.error("Need --workspace-id, or --insights-name/--resource-group/--subscription.")

    workspace = args.workspace_id or workspace_of(args.subscription, args.resource_group, name)

    if args.kql:
        kql = args.kql
    else:
        filters = [f"| where Message !has '{noise}'" for noise in NOISE]
        if args.contains:
            filters.append(f"| where Message contains '{args.contains}'")
        kql = (
            f"AppTraces | where TimeGenerated > ago({args.minutes}m) "
            + " ".join(filters)
            + f" | project TimeGenerated, Message | order by TimeGenerated desc | take {args.rows}"
        )

    rows = run_query(workspace, kql)
    print(f"rows: {len(rows)}")
    for row in rows:
        print(" | ".join("" if cell is None else str(cell) for cell in row))
    return 0


if __name__ == "__main__":
    sys.exit(main())
