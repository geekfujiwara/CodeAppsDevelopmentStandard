"""Validate a captured Copilot Studio MCP change-set and create an approval plan."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse


CONNECTOR_ID = re.compile(r"^/providers/Microsoft\.PowerApps/apis/shared_[a-z0-9]+$")
GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}$")
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
TOOL_CONTRACTS = {
    "McpTool": ("copilot-studio-v2-mcp-tool/2026-09-14", "add-mcp-tool"),
    "ConnectorTool": ("copilot-studio-v2-connector-tool/2026-09-14", "add-connector-tool"),
}


def canonical_hash(value: dict) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
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
        raise ValueError("Only the observed PUT 200 contract is allowed")

    parsed = urlparse(capture.get("url", ""))
    match = PATH.fullmatch(parsed.path)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not GATEWAY_HOST.fullmatch(parsed.hostname)
        or not match
    ):
        raise ValueError("Unexpected Copilot Studio gateway URL")
    if parse_qs(parsed.query) != {"includeWorkflows": ["true"]}:
        raise ValueError("Expected includeWorkflows=true only")

    environment_id, bot_id = match.groups()
    if not GUID.fullmatch(environment_id) or not GUID.fullmatch(bot_id):
        raise ValueError("Invalid environment or bot ID")

    payload = capture.get("body")
    if not isinstance(payload, dict):
        raise ValueError("Capture body must be an object")
    for key in EMPTY_CHANGE_KEYS:
        if payload.get(key, []) != []:
            raise ValueError(f"Capture contains unrelated changes: {key}")

    component_change = _single_insert(
        payload.get("botComponentChanges"), "BotComponentInsert", "botComponentChanges"
    )
    component = component_change.get("component")
    dialog = component.get("dialog") if isinstance(component, dict) else None
    if not isinstance(component, dict) or component.get("$kind") != "DialogComponent":
        raise ValueError("Expected a DialogComponent")
    dialog_kind = dialog.get("$kind") if isinstance(dialog, dict) else None
    if dialog_kind not in TOOL_CONTRACTS:
        raise ValueError("Expected an McpTool or ConnectorTool dialog")

    connection_change = _single_insert(
        payload.get("connectionReferenceChanges"),
        "ConnectionReferenceInsert",
        "connectionReferenceChanges",
    )
    connection = connection_change.get("connectionReference")
    if not isinstance(connection, dict) or connection.get("$kind") != "ConnectionReference":
        raise ValueError("Expected a ConnectionReference")

    connector_id = dialog.get("connectorId")
    connection_id = connection.get("connectionId")
    reference = dialog.get("connectionReference")
    if not isinstance(connector_id, str) or not CONNECTOR_ID.fullmatch(connector_id):
        raise ValueError("Invalid connectorId")
    if not isinstance(connection_id, str) or not CONNECTION_ID.fullmatch(connection_id):
        raise ValueError("Invalid connectionId")
    if connection.get("connectorId") != connector_id:
        raise ValueError("Connector IDs do not match")
    if connection.get("connectionReferenceLogicalName") != reference:
        raise ValueError("Connection references do not match")
    if dialog.get("authMode") != "Invoker":
        raise ValueError("Only Invoker authMode is allowed")
    if not isinstance(dialog.get("operationId"), str) or not dialog["operationId"]:
        raise ValueError("operationId is required")

    bot = payload.get("bot")
    if not isinstance(bot, dict) or bot.get("cdsBotId", "").lower() != bot_id.lower():
        raise ValueError("Payload bot does not match URL bot")

    contract, operation = TOOL_CONTRACTS[dialog_kind]
    plan = {
        "contract": contract,
        "operation": operation,
        "origin": f"{parsed.scheme}://{parsed.netloc}",
        "method": "PUT",
        "path": parsed.path,
        "query": {"includeWorkflows": "true"},
        "environmentId": environment_id,
        "botId": bot_id,
        "connectorId": connector_id,
        "operationId": dialog["operationId"],
        "connectionId": connection_id,
        "connectionReference": reference,
        "componentSchemaName": component.get("schemaName"),
        "componentDisplayName": component.get("displayName"),
        "payload": payload,
        "readBack": {
            "componentType": 9,
            "kind": dialog_kind,
            "connectorId": connector_id,
            "operationId": dialog["operationId"],
            "connectionReference": reference,
        },
    }
    return plan


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
        "connectorId": os.getenv("TOOL_CONNECTOR_ID", os.getenv("MCP_CONNECTOR_ID", "")).strip(),
        "operationId": os.getenv("TOOL_OPERATION_ID", os.getenv("MCP_OPERATION_ID", "")).strip(),
        "componentDisplayName": os.getenv("TOOL_DISPLAY_NAME", os.getenv("MCP_DISPLAY_NAME", "")).strip(),
        "botId": os.getenv("AGENT_BOTID", "").strip(),
        "environmentId": os.getenv("BAP_ENVIRONMENT_ID", "").strip(),
    })
    plan_hash = canonical_hash(plan)
    args.plan_file.parent.mkdir(parents=True, exist_ok=True)
    args.plan_file.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "dry-run", "planFile": str(args.plan_file), "expectedHash": plan_hash}))


if __name__ == "__main__":
    main()