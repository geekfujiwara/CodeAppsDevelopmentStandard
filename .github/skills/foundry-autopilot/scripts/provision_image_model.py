#!/usr/bin/env python3
"""Validate and provision an Azure OpenAI image deployment without guessing versions."""

from __future__ import annotations

import argparse
import json
import importlib
import os
import shutil
import subprocess
import sys
import time
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


def run_arm(*arguments: str) -> object:
    """Transport for the initial stage; legacy callers may still explicitly use Azure CLI."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
    auth = importlib.import_module("auth_helper")
    options = {arguments[index]: arguments[index + 1] for index in range(len(arguments) - 1)
               if arguments[index].startswith("--")}
    subscription = os.environ.get("AZURE_SUBSCRIPTION_ID")
    if not subscription:
        raise ValueError("AZURE_SUBSCRIPTION_ID is required for shared authentication.")
    base = (f"https://management.azure.com/subscriptions/{subscription}/resourceGroups/"
            f"{options['--resource-group']}/providers/Microsoft.CognitiveServices/accounts/{options['--name']}")
    session = auth.get_session("https://management.azure.com/.default")
    api = "?api-version=2024-10-01"
    if arguments[2] == "list-models":
        response = session.get(f"{base}/models{api}", timeout=60)
        response.raise_for_status()
        body = response.json()
        if body.get("nextLink"):
            raise RuntimeError("Image model catalogue is paginated; refusing an incomplete candidate list.")
        return body["value"]
    endpoint = f"{base}/deployments/{options['--deployment-name']}{api}"
    if arguments[3] == "show":
        response = session.get(endpoint, timeout=60)
        if response.status_code == 404:
            raise RuntimeError("ResourceNotFound")
        response.raise_for_status()
        return response.json()
    if arguments[3] != "create":
        raise ValueError("Unsupported image deployment operation.")
    body = {
        "sku": {"name": options["--sku-name"], "capacity": int(options["--sku-capacity"])},
        "properties": {"model": {"name": options["--model-name"], "version": options["--model-version"],
                                 "format": options["--model-format"]}},
    }
    response = session.put(endpoint, json=body, timeout=120)
    response.raise_for_status()
    for _ in range(120):
        response = session.get(endpoint, timeout=60)
        response.raise_for_status()
        deployed = response.json()
        state = deployed.get("properties", {}).get("provisioningState")
        if state == "Succeeded":
            return deployed
        if state in {"Failed", "Canceled"}:
            raise RuntimeError(f"Image model provisioning {state}.")
        time.sleep(5)
    raise TimeoutError("Image model provisioning did not finish within 10 minutes.")


def available_versions(resource_group: str, account: str, requested: str, transport=None) -> list[tuple[str, str]]:
    entries = (transport or run_az)(
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
    parser.add_argument("--account", help="Defaults to AZURE_OPENAI_ACCOUNT or AZURE_AI_ACCOUNT.")
    parser.add_argument("--model", help="Defaults to IMAGE_GENERATION_MODEL.")
    parser.add_argument("--model-version", help="Exact version. Defaults to the newest offered version.")
    parser.add_argument(
        "--deployment",
        help="Defaults to IMAGE_GENERATION_DEPLOYMENT, IMAGE_MODEL_DEPLOYMENT, or the model name.",
    )
    parser.add_argument("--sku", help="Defaults to IMAGE_GENERATION_SKU or GlobalStandard.")
    parser.add_argument("--capacity", type=int, help="Defaults to IMAGE_GENERATION_CAPACITY or 1.")
    parser.add_argument("--check", action="store_true", help="Verify only; never create or update a deployment.")
    parser.add_argument("--execute", action="store_true", help="Explicit apply (legacy default also applies).")
    parser.add_argument("--shared-auth", action="store_true", help="Use auth_helper ARM calls instead of Azure CLI.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env(Path(args.env))
    transport = run_arm if getattr(args, "shared_auth", False) else run_az
    resource_group = (
        args.resource_group
        or os.environ.get("AZURE_OPENAI_RESOURCE_GROUP")
        or os.environ.get("AZURE_RESOURCE_GROUP")
    )
    account = args.account or os.environ.get("AZURE_OPENAI_ACCOUNT") or os.environ.get("AZURE_AI_ACCOUNT")
    model = args.model or os.environ.get("IMAGE_GENERATION_MODEL")
    deployment = (
        args.deployment
        or os.environ.get("IMAGE_GENERATION_DEPLOYMENT")
        or os.environ.get("IMAGE_MODEL_DEPLOYMENT")
        or model
    )
    sku = args.sku or os.environ.get("IMAGE_GENERATION_SKU") or "GlobalStandard"
    capacity = args.capacity or int(os.environ.get("IMAGE_GENERATION_CAPACITY", "1"))
    existing_version = None
    if getattr(args, "shared_auth", False) and resource_group and account and not model:
        if deployment:
            try:
                current = transport("cognitiveservices", "account", "deployment", "show",
                                    "--resource-group", resource_group, "--name", account,
                                    "--deployment-name", deployment)
            except RuntimeError as error:
                if "resourcenotfound" not in str(error).lower():
                    raise
                current = None
            if isinstance(current, dict):
                current_model = current.get("properties", {}).get("model", {})
                model, existing_version = current_model.get("name"), current_model.get("version")
                if not args.sku and not os.environ.get("IMAGE_GENERATION_SKU"):
                    sku = current.get("sku", {}).get("name") or sku
        if not model:
            offered = transport("cognitiveservices", "account", "list-models",
                                "--resource-group", resource_group, "--name", account)
            candidates = []
            for entry in offered:
                details = entry.get("model", entry)
                capabilities = details.get("capabilities") or {}
                if (str(capabilities.get("imageGeneration", "")).lower() == "true"
                        or str(details.get("name", "")).startswith("gpt-image")):
                    candidates.append({"model": details.get("name"), "version": details.get("version"),
                                       "skus": details.get("skus", [])})
            print(json.dumps({"status": "image-model-selection-required", "account": account,
                              "candidates": candidates}, ensure_ascii=False, indent=2))
            print("Choose an offered image model/version/SKU and record IMAGE_GENERATION_MODEL, "
                  "IMAGE_GENERATION_MODEL_VERSION, IMAGE_GENERATION_SKU and IMAGE_MODEL_DEPLOYMENT in .env.",
                  file=sys.stderr)
            return 2
    if not all((resource_group, account, model, deployment)):
        raise ValueError("resource group, account, model, and deployment are required (arguments or .env).")
    if capacity < 1:
        raise ValueError("capacity must be at least 1.")

    versions = available_versions(resource_group, account, model, transport)
    if not versions:
        print(f"Model '{model}' is not offered by account '{account}'. No deployment was changed.", file=sys.stderr)
        return 2

    selected_version = (args.model_version or os.environ.get("IMAGE_GENERATION_MODEL_VERSION")
                        or existing_version or versions[0][0])
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
        existing = transport(
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

    created = transport(
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
    if (deployed_model.get("name"), deployed_model.get("version"), created_sku.get("name")) != (model, selected_version, sku):
        print("Created image deployment does not match the selected model/version/SKU. Verification failed.",
              file=sys.stderr)
        return 3
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