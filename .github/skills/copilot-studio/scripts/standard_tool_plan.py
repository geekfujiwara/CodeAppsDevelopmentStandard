"""Validate a captured Standard agent MCP save and create an approval plan."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse


CONTRACT = "copilot-studio-standard-mcp-tool/2026-09-14"
CONNECTOR_ID = re.compile(r"^/providers/Microsoft\.PowerApps/apis/shared_[a-z0-9]+$")
GUID = re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
CONNECTION_ID = re.compile(r"^[0-9a-fA-F]{32}$")
GATEWAY_HOST = re.compile(r"^[a-z0-9.-]+\.gateway\.prod\.island\.powerapps\.com$")
PATH = re.compile(
    r"^/api/botmanagement/v1/environments/([0-9a-fA-F-]{36})/"
    r"bots/([0-9a-fA-F-]{36})/content/botcomponents$"
)
EMPTY_CHANGE_KEYS = (
    "cloudFlowDefinitionChanges",
    "connectorDefinitionChanges",
    "environmentVariableChanges",
    "aIPluginOperationChanges",
    "componentCollectionChanges",
    "dataverseTableSearchChanges",
    "dataverseTableSearchEntityConfigurationChanges",
    "dataverseTableSearchGlossaryConfigurationChanges",
    "dataverseTableSearchEntityColumnSynonymChanges",
    "aIModelChanges",
    "connectedAgentDefinitionChanges",
)


def canonical_hash(value: dict) -> str:
    normalized = json.loads(json.dumps(value))
    payload = normalized.get("payload", {})
    payload["changeToken"] = "<runtime-change-token>"
    changes = payload.get("connectionReferenceChanges", [])
    if len(changes) == 1 and isinstance(changes[0].get("connectionReference"), dict):
        changes[0]["connectionReference"]["id"] = "<runtime-connection-reference-id>"
    raw = json.dumps(normalized, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def _single_insert(changes: object, kind: str, label: str) -> dict:
    if not isinstance(changes, list) or len(changes) != 1:
        raise ValueError(f"{label} must contain exactly one item")
    item = changes[0]
    if not isinstance(item, dict) or item.get("$kind") != kind:
        raise ValueError(f"{label} must be {kind}")
    return item


def build_plan(capture: dict) -> dict:
    if capture.get("method") != "PUT" or capture.get("status") not in (None, 200):
        raise ValueError("Only the observed PUT contract is allowed")

    parsed = urlparse(capture.get("url", ""))
    match = PATH.fullmatch(parsed.path)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not GATEWAY_HOST.fullmatch(parsed.hostname)
        or parsed.query
        or not match
    ):
        raise ValueError("Unexpected Copilot Studio Standard gateway URL")
    environment_id, bot_id = match.groups()
    if not GUID.fullmatch(environment_id) or not GUID.fullmatch(bot_id):
        raise ValueError("Invalid environment or bot ID")

    payload = capture.get("body")
    if not isinstance(payload, dict):
        raise ValueError("Capture body must be an object")
    if not isinstance(payload.get("changeToken"), str) or not payload["changeToken"]:
        raise ValueError("A non-empty changeToken is required")
    for key in EMPTY_CHANGE_KEYS:
        if payload.get(key, []) != []:
            raise ValueError(f"Capture contains unrelated changes: {key}")

    component_change = _single_insert(
        payload.get("botComponentChanges"), "BotComponentInsert", "botComponentChanges"
    )
    component = component_change.get("component")
    dialog = component.get("dialog") if isinstance(component, dict) else None
    action = dialog.get("action") if isinstance(dialog, dict) else None
    operation = action.get("operationDetails") if isinstance(action, dict) else None
    connection_properties = action.get("connectionProperties") if isinstance(action, dict) else None
    if not isinstance(component, dict) or component.get("$kind") != "DialogComponent":
        raise ValueError("Expected a DialogComponent")
    if not isinstance(dialog, dict) or dialog.get("$kind") != "TaskDialog":
        raise ValueError("Expected a Standard TaskDialog")
    if not isinstance(action, dict) or action.get("$kind") != "InvokeExternalAgentTaskAction":
        raise ValueError("Expected InvokeExternalAgentTaskAction")
    if not isinstance(operation, dict) or operation.get("$kind") != "ModelContextProtocolMetadata":
        raise ValueError("Expected ModelContextProtocolMetadata")
    if operation.get("knownTools") != []:
        raise ValueError("Initial MCP knownTools must be empty")
    if not isinstance(connection_properties, dict) or (
        connection_properties.get("$kind") != "ConnectionProperties"
        or connection_properties.get("mode") != "Invoker"
    ):
        raise ValueError("Only Invoker connection mode is allowed")

    connection_change = _single_insert(
        payload.get("connectionReferenceChanges"),
        "ConnectionReferenceInsert",
        "connectionReferenceChanges",
    )
    connection = connection_change.get("connectionReference")
    if not isinstance(connection, dict) or connection.get("$kind") != "ConnectionReference":
        raise ValueError("Expected a ConnectionReference")
    if not GUID.fullmatch(str(connection.get("id", ""))):
        raise ValueError("ConnectionReference id must be a runtime GUID")

    connector_id = connection.get("connectorId")
    connection_id = connection.get("connectionId")
    reference = action.get("connectionReference")
    operation_id = operation.get("operationId")
    if not isinstance(connector_id, str) or not CONNECTOR_ID.fullmatch(connector_id):
        raise ValueError("Invalid connectorId")
    if not isinstance(connection_id, str) or not CONNECTION_ID.fullmatch(connection_id):
        raise ValueError("Invalid connectionId")
    if connection.get("connectionReferenceLogicalName") != reference:
        raise ValueError("Connection references do not match")
    if not isinstance(operation_id, str) or not operation_id:
        raise ValueError("operationId is required")
    if not isinstance(component.get("schemaName"), str) or not component["schemaName"]:
        raise ValueError("component schemaName is required")

    return {
        "contract": CONTRACT,
        "operation": "add-standard-mcp-tool",
        "origin": f"{parsed.scheme}://{parsed.netloc}",
        "method": "PUT",
        "path": parsed.path,
        "environmentId": environment_id,
        "botId": bot_id,
        "connectorId": connector_id,
        "operationId": operation_id,
        "connectionId": connection_id,
        "connectionReference": reference,
        "componentSchemaName": component["schemaName"],
        "componentDisplayName": component.get("displayName"),
        "payload": payload,
        "readBack": {
            "componentType": 9,
            "dialogKind": "TaskDialog",
            "actionKind": "InvokeExternalAgentTaskAction",
            "operationDetailsKind": "ModelContextProtocolMetadata",
            "operationId": operation_id,
            "connectionReference": reference,
        },
    }


def assert_expected(plan: dict, expected: dict[str, str]) -> None:
    for plan_key, expected_value in expected.items():
        if expected_value and str(plan.get(plan_key, "")).lower() != expected_value.lower():
            raise ValueError(f"Captured {plan_key} does not match the configured expectation")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", type=Path)
    parser.add_argument("--plan-file", type=Path, required=True)
    args = parser.parse_args()

    capture = json.loads(args.capture.read_text(encoding="utf-8"))
    plan = build_plan(capture)
    assert_expected(plan, {
        "connectorId": os.getenv("TOOL_CONNECTOR_ID", "").strip(),
        "operationId": os.getenv("TOOL_OPERATION_ID", "").strip(),
        "componentDisplayName": os.getenv("TOOL_DISPLAY_NAME", "").strip(),
        "botId": os.getenv("AGENT_BOTID", "").strip(),
        "environmentId": os.getenv("BAP_ENVIRONMENT_ID", "").strip(),
    })
    args.plan_file.parent.mkdir(parents=True, exist_ok=True)
    args.plan_file.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "status": "dry-run",
        "planFile": str(args.plan_file),
        "expectedHash": canonical_hash(plan),
    }))


if __name__ == "__main__":
    main()