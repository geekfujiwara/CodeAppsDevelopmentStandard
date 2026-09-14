"""Build and validate the observed Standard external-trigger component contract."""

import re


GUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
TRIGGER_CONNECTION_TYPES = frozenset({"Office 365 Outlook"})
LOGICAL_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def _require_guid(name, value):
    if not isinstance(value, str) or not GUID_PATTERN.fullmatch(value):
        raise ValueError(f"{name} must be a GUID")
    return value


def validate_deployment_settings(
    bot_id, bot_schema, environment_id, connection_reference_names
):
    """Validate identifiers required before a trigger deployment mutates resources."""
    _require_guid("bot_id", bot_id)
    _require_guid("environment_id", environment_id)
    if not isinstance(bot_schema, str) or not LOGICAL_NAME_PATTERN.fullmatch(bot_schema):
        raise ValueError("bot_schema must be a logical name")
    for name, value in connection_reference_names.items():
        if not isinstance(value, str) or not LOGICAL_NAME_PATTERN.fullmatch(value):
            raise ValueError(f"{name} must be a connection-reference logical name")


def build_external_trigger_yaml(
    workflow_id, flow_api_id, environment_id, trigger_connection_type
):
    """Return validated YAML for the observed ExternalTriggerConfiguration shape."""
    _require_guid("workflow_id", workflow_id)
    _require_guid("flow_api_id", flow_api_id)
    _require_guid("environment_id", environment_id)
    if trigger_connection_type not in TRIGGER_CONNECTION_TYPES:
        raise ValueError("Unsupported trigger_connection_type")

    flow_url = (
        "/providers/Microsoft.ProcessSimple/environments/"
        f"{environment_id}/flows/{flow_api_id}"
    )
    return (
        "kind: ExternalTriggerConfiguration\n"
        "externalTriggerSource:\n"
        "  kind: WorkflowExternalTrigger\n"
        f"  flowId: {workflow_id}\n"
        "\n"
        "extensionData:\n"
        f"  flowName: {flow_api_id}\n"
        f"  flowUrl: {flow_url}\n"
        f"  triggerConnectionType: {trigger_connection_type}\n"
    )