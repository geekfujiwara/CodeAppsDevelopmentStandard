"""Verify an observed Copilot Studio ConnectorTool through Dataverse read-back."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def parse_component_data(data: object) -> dict:
    if isinstance(data, dict):
        value = data
    elif isinstance(data, str):
        try:
            value = json.loads(data)
        except json.JSONDecodeError:
            value = dict(
                line.split(":", 1)
                for line in data.splitlines()
                if line and not line[0].isspace() and ":" in line
            )
            value = {key.strip(): item.strip() for key, item in value.items()}
    else:
        raise ValueError("ConnectorTool data must be JSON, YAML-like text, or an object")
    dialog = value.get("dialog", value)
    if not isinstance(dialog, dict):
        raise ValueError("ConnectorTool dialog must be an object")
    return dialog


def verify_connector_tool(
    rows: object,
    *,
    connector_id: str,
    operation_id: str,
    connection_reference: str = "",
) -> dict:
    if not isinstance(rows, list):
        raise ValueError("Dataverse read-back value must be an array")
    matches = []
    for row in rows:
        if not isinstance(row, dict) or row.get("componenttype") != 9:
            continue
        dialog = parse_component_data(row.get("data"))
        kind = dialog.get("$kind", dialog.get("kind"))
        reference = dialog.get("connectionReference")
        if (
            kind == "ConnectorTool"
            and dialog.get("connectorId") == connector_id
            and dialog.get("operationId") == operation_id
            and dialog.get("authMode") == "Invoker"
            and isinstance(reference, str)
            and reference
            and (not connection_reference or reference == connection_reference)
        ):
            matches.append(row)
    if len(matches) != 1:
        raise ValueError(f"Expected one exact ConnectorTool; found {len(matches)}")
    return matches[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--connector-id", required=True)
    parser.add_argument("--operation-id", required=True)
    parser.add_argument("--connection-reference", default="")
    parser.add_argument("--bot-id", default=os.getenv("AGENT_BOTID", "").strip())
    args = parser.parse_args()
    if not args.bot_id:
        parser.error("--bot-id or AGENT_BOTID is required")

    scripts = Path(__file__).resolve().parents[2] / "standard" / "scripts"
    sys.path.insert(0, str(scripts))
    from auth_helper import api_get

    query = (
        "botcomponents?$select=componenttype,data"
        f"&$filter=_parentbotid_value eq {args.bot_id} and componenttype eq 9"
    )
    rows = api_get(query).get("value")
    verify_connector_tool(
        rows,
        connector_id=args.connector_id,
        operation_id=args.operation_id,
        connection_reference=args.connection_reference,
    )
    print(json.dumps({
        "status": "verified",
        "kind": "ConnectorTool",
        "connectorId": args.connector_id,
        "operationId": args.operation_id,
        "authMode": "Invoker",
    }))


if __name__ == "__main__":
    main()