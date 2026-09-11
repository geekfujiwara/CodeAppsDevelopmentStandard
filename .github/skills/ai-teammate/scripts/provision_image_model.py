#!/usr/bin/env python3
"""Validate and provision an Azure OpenAI image deployment without guessing versions."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def run_az(*arguments: str) -> object:
    executable = shutil.which("az")
    if executable is None:
        raise RuntimeError("Azure CLI executable 'az' was not found on PATH.")
    result = subprocess.run(
        [executable, *arguments, "--output", "json"],
        capture_output=True,
        text=True,
        shell=False,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return json.loads(result.stdout) if result.stdout.strip() else None


def model_details(entry: dict[str, object]) -> tuple[str | None, str | None, str]:
    value = entry.get("model")
    model = value if isinstance(value, dict) else entry
    return (
        model.get("name") if isinstance(model.get("name"), str) else None,
        model.get("version") if isinstance(model.get("version"), str) else None,
        model.get("format") if isinstance(model.get("format"), str) else "OpenAI",
    )


def available_versions(resource_group: str, account: str, requested: str) -> list[tuple[str, str]]:
    entries = run_az(
        "cognitiveservices", "account", "list-models",
        "--resource-group", resource_group,
        "--name", account,
    ) or []
    found: set[tuple[str, str]] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name, version, model_format = model_details(entry)
        if name == requested and version:
            found.add((version, model_format))
    return sorted(found, reverse=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", default=".env")
    parser.add_argument("--resource-group", help="Defaults to AZURE_OPENAI_RESOURCE_GROUP or AZURE_RESOURCE_GROUP.")
    parser.add_argument("--account", help="Defaults to AZURE_OPENAI_ACCOUNT.")
    parser.add_argument("--model", help="Defaults to IMAGE_GENERATION_MODEL.")
    parser.add_argument("--model-version", help="Exact version. Defaults to the newest offered version.")
    parser.add_argument("--deployment", help="Defaults to IMAGE_GENERATION_DEPLOYMENT or the model name.")
    parser.add_argument("--sku", help="Defaults to IMAGE_GENERATION_SKU or GlobalStandard.")
    parser.add_argument("--capacity", type=int, help="Defaults to IMAGE_GENERATION_CAPACITY or 1.")
    parser.add_argument("--check", action="store_true", help="Verify only; never create or update a deployment.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env(Path(args.env))
    resource_group = (
        args.resource_group
        or os.environ.get("AZURE_OPENAI_RESOURCE_GROUP")
        or os.environ.get("AZURE_RESOURCE_GROUP")
    )
    account = args.account or os.environ.get("AZURE_OPENAI_ACCOUNT")
    model = args.model or os.environ.get("IMAGE_GENERATION_MODEL")
    deployment = args.deployment or os.environ.get("IMAGE_GENERATION_DEPLOYMENT") or model
    sku = args.sku or os.environ.get("IMAGE_GENERATION_SKU") or "GlobalStandard"
    capacity = args.capacity or int(os.environ.get("IMAGE_GENERATION_CAPACITY", "1"))
    if not all((resource_group, account, model, deployment)):
        raise ValueError("resource group, account, model, and deployment are required (arguments or .env).")
    if capacity < 1:
        raise ValueError("capacity must be at least 1.")

    versions = available_versions(resource_group, account, model)
    if not versions:
        print(f"Model '{model}' is not offered by account '{account}'. No deployment was changed.", file=sys.stderr)
        return 2

    selected_version = args.model_version or versions[0][0]
    matches = [entry for entry in versions if entry[0] == selected_version]
    if not matches:
        offered = ", ".join(version for version, _ in versions)
        print(
            f"Model '{model}' version '{selected_version}' is unavailable. Offered versions: {offered}. "
            "No deployment was changed.",
            file=sys.stderr,
        )
        return 2
    model_format = matches[0][1]

    try:
        existing = run_az(
            "cognitiveservices", "account", "deployment", "show",
            "--resource-group", resource_group,
            "--name", account,
            "--deployment-name", deployment,
        )
    except RuntimeError as error:
        if "notfound" not in str(error).replace(" ", "").lower():
            raise
        existing = None

    if isinstance(existing, dict):
        properties = existing.get("properties") if isinstance(existing.get("properties"), dict) else {}
        current = properties.get("model") if isinstance(properties.get("model"), dict) else {}
        current_sku = existing.get("sku") if isinstance(existing.get("sku"), dict) else {}
        actual = (current.get("name"), current.get("version"), current_sku.get("name"))
        expected = (model, selected_version, sku)
        if actual != expected:
            print(
                f"Deployment '{deployment}' exists as {actual}; expected {expected}. "
                "Refusing an implicit model replacement.",
                file=sys.stderr,
            )
            return 3
        print(f"OK: {deployment} -> {model} {selected_version} ({sku})")
        return 0

    if args.check:
        print(f"Deployment '{deployment}' does not exist. No deployment was changed.", file=sys.stderr)
        return 4

    created = run_az(
        "cognitiveservices", "account", "deployment", "create",
        "--resource-group", resource_group,
        "--name", account,
        "--deployment-name", deployment,
        "--model-name", model,
        "--model-version", selected_version,
        "--model-format", model_format,
        "--sku-name", sku,
        "--sku-capacity", str(capacity),
    )
    created_value = created if isinstance(created, dict) else {}
    properties = created_value.get("properties") if isinstance(created_value.get("properties"), dict) else {}
    deployed_model = properties.get("model") if isinstance(properties.get("model"), dict) else {}
    created_sku = created_value.get("sku") if isinstance(created_value.get("sku"), dict) else {}
    print(
        f"Created: {deployment} -> {deployed_model.get('name')} {deployed_model.get('version')} "
        f"({created_sku.get('name')}, capacity {created_sku.get('capacity')})"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)