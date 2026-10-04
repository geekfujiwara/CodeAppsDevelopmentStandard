"""Power Automate definition checks that run before deployment."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _walk(value: Any, path: str = "$"):
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            yield child_path, key, child
            yield from _walk(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, f"{path}[{index}]")


def assert_base64_content_contract(definition: dict[str, Any]) -> None:
    """Reject contentBase64 fields that pass a runtime body without encoding it."""
    errors: list[str] = []
    for path, key, value in _walk(definition):
        if key != "contentBase64":
            continue
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{path}: contentBase64 must be a non-empty string")
            continue
        expression = value.strip()
        if expression.startswith("@"):
            normalized = expression.replace(" ", "").lower()
            if not normalized.startswith("@base64("):
                errors.append(f"{path}: runtime contentBase64 values must use @base64(...)")
    if errors:
        raise ValueError("Invalid flow binary-content contract:\n" + "\n".join(errors))


def assert_flat_dataverse_item_parameters(definition: dict[str, Any]) -> None:
    """Reject nested item objects for Dataverse CreateRecord and UpdateRecord."""
    errors: list[str] = []
    for path, _, value in _walk(definition):
        if not isinstance(value, dict):
            continue
        inputs = value.get("inputs")
        if not isinstance(inputs, dict):
            continue
        host = inputs.get("host")
        parameters = inputs.get("parameters")
        if not isinstance(host, dict) or not isinstance(parameters, dict):
            continue
        api_id = host.get("apiId")
        operation_id = host.get("operationId")
        if (
            not isinstance(api_id, str)
            or not api_id.lower().endswith("/shared_commondataserviceforapps")
            or operation_id not in {"CreateRecord", "UpdateRecord"}
        ):
            continue
        item = parameters.get("item")
        if isinstance(item, dict):
            flat_keys = ", ".join(f"item/{key}" for key in item) or "item/<column>"
            errors.append(
                f"{path}.inputs.parameters.item: use flat parameter keys instead "
                f"({flat_keys})"
            )
    if errors:
        raise ValueError("Invalid Dataverse record parameters:\n" + "\n".join(errors))


def assert_required_dataverse_columns(
    available: dict[str, set[str]],
    required: dict[str, set[str]],
) -> None:
    """Reject a flow deployment when referenced Dataverse columns are absent."""
    errors: list[str] = []
    for table, expected in required.items():
        missing = sorted(expected - available.get(table, set()))
        if missing:
            errors.append(f"{table}: {', '.join(missing)}")
    if errors:
        raise ValueError("Missing Dataverse columns:\n" + "\n".join(errors))


def require_navigation_property(rows: list[dict[str, Any]], context: str) -> str:
    """Return a Dataverse navigation property or fail before flow deployment."""
    if not rows:
        raise ValueError(f"Dataverse navigation property not found: {context}")
    value = rows[0].get("ReferencingEntityNavigationPropertyName")
    if not isinstance(value, str) or not value:
        raise ValueError(f"Invalid Dataverse navigation property: {context}")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a Power Automate workflow definition JSON file")
    parser.add_argument("definition", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.definition.read_text(encoding="utf-8"))
    definition = payload.get("properties", {}).get("definition", payload)
    if not isinstance(definition, dict):
        raise SystemExit("Workflow definition must be a JSON object")
    assert_base64_content_contract(definition)
    assert_flat_dataverse_item_parameters(definition)
    print("OK: flow definition validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
