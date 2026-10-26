#!/usr/bin/env python3
"""Create a dedicated public, Entra-authenticated Foundry foundation; plan unless --execute."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import quote

from prepare_first_stage import (
    ARM, ContextError, Metadata, configuration, discover_identity, endpoint, persist,
    read_env, standard_auth, verify,
)


SCOPE = ARM + "/.default"
DEPLOYMENT_VERSION = "2022-09-01"
GROUP_VERSION = "2022-09-01"
TAG = "aiTeammateBootstrap"
TEMPLATE = Path(__file__).resolve().parents[1] / "templates/foundry-public/azuredeploy.json"


def resource_targets(root: str, group: str, account: str, project: str, registry: str) -> dict:
    base = root + "/resourceGroups/" + quote(group, safe="")
    account_id = base + "/providers/Microsoft.CognitiveServices/accounts/" + account
    return {
        "group": (base, GROUP_VERSION),
        "account": (account_id, "2025-09-01"),
        "project": (account_id + "/projects/" + project, "2026-03-01"),
        "registry": (base + "/providers/Microsoft.ContainerRegistry/registries/" + registry, "2023-07-01"),
        "workspace": (base + "/providers/Microsoft.OperationalInsights/workspaces/" + account + "-logs", "2023-09-01"),
        "insights": (base + "/providers/Microsoft.Insights/components/" + account + "-insights", "2020-02-02"),
    }


def read_resource(api: Metadata, url: str, version: str) -> dict | None:
    response = api.session(SCOPE).get(url, params={"api-version": version}, timeout=60)
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise ContextError(f"Cannot verify resource absence/readiness: HTTP {response.status_code}. "
                           "No public/private policy change or alternate login is attempted.")
    return response.json()


def verify_resource(kind: str, resource: dict, bootstrap_id: str, location: str) -> None:
    if kind == "group":
        return
    if resource.get("tags", {}).get(TAG) != bootstrap_id:
        raise ContextError(f"Existing {kind} is not owned by this bootstrap. "
                           "Choose a new resource name; existing Azure resources cannot be adopted.")
    verify(f"{kind} location", location, resource.get("location", ""))
    properties = resource.get("properties", {})
    if kind == "account":
        if (resource.get("kind") != "AIServices"
                or properties.get("publicNetworkAccess") != "Enabled"
                or properties.get("disableLocalAuth") is not True
                or properties.get("allowProjectManagement") is not True
                or properties.get("networkAcls", {}).get("defaultAction", "Allow") != "Allow"):
            raise ContextError("Foundry is not public + Entra-only + project-enabled; refusing to change its security settings.")
    if kind == "registry":
        if properties.get("publicNetworkAccess") != "Enabled" or properties.get("adminUserEnabled") is not False:
            raise ContextError("Registry is not public + admin-disabled; refusing a security setting change.")


def provision(api: Metadata, config: dict[str, str], agent: str, template_path: Path, *,
              group_mode: str, execute: bool = False) -> dict:
    if group_mode not in ("new", "existing"):
        raise ContextError("Confirm resource group mode (new/existing) before provisioning.")
    if group_mode == "existing" and not config.get("AZURE_RESOURCE_GROUP"):
        raise ContextError("An explicitly confirmed existing resource group name is required.")
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,39}", agent):
        raise ContextError("agent-name must be 2-40 lowercase letters/digits/hyphens, starting with a letter.")
    identity, root = discover_identity(api, config)
    seed = hashlib.sha256(
        f"{identity['AZURE_SUBSCRIPTION_ID']}:{identity['AGENT_OWNER_ID']}:{agent}".encode()
    ).hexdigest()[:10]
    bootstrap_id = agent + "-" + seed
    group = config.get("AZURE_RESOURCE_GROUP") or "rg-" + bootstrap_id
    account = config.get("FOUNDRY_ACCOUNT_NAME") or "ft-" + bootstrap_id
    project = config.get("FOUNDRY_PROJECT_NAME") or agent
    registry = config.get("AZURE_CONTAINER_REGISTRY") or "acr" + agent.replace("-", "")[:37] + seed
    location = config.get("AZURE_LOCATION") or "japaneast"
    for key, value, pattern in (
        ("AZURE_RESOURCE_GROUP", group, r"[A-Za-z0-9_.()-]{1,90}"),
        ("FOUNDRY_ACCOUNT_NAME", account, r"[a-zA-Z0-9][a-zA-Z0-9-]{1,63}"),
        ("FOUNDRY_PROJECT_NAME", project, r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}"),
        ("AZURE_CONTAINER_REGISTRY", registry, r"[a-zA-Z0-9]{5,50}"),
        ("AZURE_LOCATION", location, r"[a-z0-9]+"),
    ):
        if not re.fullmatch(pattern, value):
            raise ContextError(f"{key} is not a valid new-resource name/location. No writes performed.")
    for key, actual in (("ACR_RESOURCE_GROUP", group), ("AZURE_OPENAI_RESOURCE_GROUP", group),
                        ("AZURE_OPENAI_ACCOUNT", account)):
        if config.get(key):
            verify(key, config[key], actual)
    targets = resource_targets(root, group, account, project, registry)
    resources = {}
    for kind, (url, version) in targets.items():
        resource = read_resource(api, url, version)
        if resource:
            verify_resource(kind, resource, bootstrap_id, location)
        resources[kind] = resource
    if group_mode == "existing" and resources["group"] is None:
        raise ContextError("The confirmed existing resource group was not found; no group was created.")
    if group_mode == "new" and resources["group"]:
        existing_group = resources["group"]
        if existing_group.get("tags", {}).get(TAG) != bootstrap_id:
            raise ContextError("The confirmed new resource group already exists and is not owned by this bootstrap.")
        verify("new resource group location", location, existing_group.get("location", ""))
    # Pinned endpoint metadata must be checked before any write, not overwritten after deployment.
    for key, kind, field in (("FOUNDRY_PROJECT_ENDPOINT", "project", "project"),
                             ("AZURE_OPENAI_ENDPOINT", "account", "openai"),
                             ("ACR_LOGIN_SERVER", "registry", "registry")):
        if config.get(key):
            resource = resources[kind]
            if not resource:
                raise ContextError(f"Pinned {key} cannot be verified for the planned new resource.")
            actual = (resource.get("properties", {}).get("loginServer", "") if field == "registry"
                      else endpoint(resource, field))
            verify(key, config[key], actual)
    definitions = api.listing(root + "/providers/Microsoft.Authorization/roleDefinitions",
                              SCOPE, "2022-04-01")
    role = next((item for role_name in ("Foundry User", "Azure AI User")
                 for item in definitions if item.get("properties", {}).get("roleName") == role_name), None)
    if not role:
        raise ContextError("Foundry User / Azure AI User role definition is unavailable; no infrastructure created.")
    parameters = {
        "location": location, "accountName": account, "projectName": project,
        "registryName": registry, "bootstrapId": bootstrap_id,
        "ownerObjectId": identity["AGENT_OWNER_ID"], "ownerRoleDefinitionId": role["id"],
    }
    template = json.loads(template_path.read_text(encoding="utf-8"))
    plan = {"mode": "new-public", "resource_group_mode": group_mode, "location": location,
            "resources": {kind: url.removeprefix(ARM) for kind, (url, _) in targets.items()},
            "create": [kind for kind, resource in resources.items() if resource is None]}
    if not execute:
        return plan
    if resources["group"] is None:
        api.request("put", targets["group"][0], SCOPE,
                    params={"api-version": GROUP_VERSION},
                    json={"location": location, "tags": {TAG: bootstrap_id}})
    # Revalidate immediately before ARM's incremental deployment can update existing resources.
    for kind, (url, version) in targets.items():
        resource = read_resource(api, url, version)
        if resource:
            verify_resource(kind, resource, bootstrap_id, location)
        if kind == "group":
            if resource is None:
                raise ContextError("Confirmed resource group disappeared before deployment.")
            if group_mode == "new" and resource.get("tags", {}).get(TAG) != bootstrap_id:
                raise ContextError("Resource group ownership changed before deployment.")
    deployment = targets["group"][0] + "/providers/Microsoft.Resources/deployments/teammate-" + seed
    api.request("put", deployment, SCOPE, params={"api-version": DEPLOYMENT_VERSION}, json={
        "properties": {"mode": "Incremental", "template": template,
                       "parameters": {key: {"value": value} for key, value in parameters.items()}}
    })
    for attempt in range(120):
        result = api.get(deployment, SCOPE, DEPLOYMENT_VERSION)
        state = result.get("properties", {}).get("provisioningState")
        if state == "Succeeded":
            break
        if state in ("Failed", "Canceled"):
            code = result.get("properties", {}).get("error", {}).get("code", "Unknown")
            raise ContextError(f"Foundry infrastructure deployment {state} ({code}). "
                               "Inspect ARM deployment operations; policy/RBAC/network settings were not bypassed.")
        if attempt == 119:
            raise ContextError("Foundry infrastructure deployment timed out; inspect ARM and rerun. Not complete.")
        time.sleep(10)
    for kind, (url, version) in targets.items():
        resource = read_resource(api, url, version)
        if not resource:
            raise ContextError(f"Deployment succeeded but {kind} read-back is missing.")
        verify_resource(kind, resource, bootstrap_id, location)
        if kind != "group" and resource.get("properties", {}).get("provisioningState") != "Succeeded":
            raise ContextError(f"{kind} provisioning is not Succeeded after deployment.")
        resources[kind] = resource
    project_endpoint = endpoint(resources["project"], "project")
    registry_server = resources["registry"].get("properties", {}).get("loginServer", "")
    if not project_endpoint or not registry_server:
        raise ContextError("Foundry project endpoint / ACR login server was not returned; no endpoint invented.")
    plan["values"] = {
        **identity, "AZURE_RESOURCE_GROUP": group, "AZURE_LOCATION": location,
        "FOUNDRY_ACCOUNT_NAME": account, "FOUNDRY_PROJECT_NAME": project,
        "AZURE_AI_ACCOUNT": account, "AZURE_AI_PROJECT": project,
        "FOUNDRY_PROJECT_ENDPOINT": project_endpoint,
        "AZURE_CONTAINER_REGISTRY": registry, "ACR_RESOURCE_GROUP": group,
        "ACR_LOGIN_SERVER": registry_server,
    }
    return plan


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--agent-name", help="Defaults to AGENT_NAME in the selected .env")
    parser.add_argument("--resource-group-mode", choices=("new", "existing"),
                        help="Confirmed choice; defaults to AZURE_RESOURCE_GROUP_MODE in the selected .env")
    parser.add_argument("--template", type=Path, default=TEMPLATE)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    try:
        original = args.env.read_text(encoding="utf-8-sig") if args.env.exists() else None
        config = configuration(args.env)
        literal = read_env(args.env)
        group_mode = args.resource_group_mode or literal.get("AZURE_RESOURCE_GROUP_MODE", "")
        if group_mode not in ("new", "existing"):
            raise ContextError("Confirm resource group mode (new/existing) before provisioning.")
        if literal.get("AZURE_RESOURCE_GROUP_MODE"):
            verify("AZURE_RESOURCE_GROUP_MODE", literal["AZURE_RESOURCE_GROUP_MODE"], group_mode)
        with standard_auth(config) as helper:
            agent = args.agent_name or literal.get("AGENT_NAME", "")
            plan = provision(Metadata(helper, config), config, agent,
                             args.template, group_mode=group_mode, execute=args.execute)
            if args.execute:
                persist(args.env, plan["values"], original, resource_group_mode=group_mode)
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0
    except (ContextError, OSError, ValueError) as error:
        print(f"STOP: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
