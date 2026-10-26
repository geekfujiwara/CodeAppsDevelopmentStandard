#!/usr/bin/env python3
"""Discover and verify first-stage context; only --execute persists non-secret values.

No hosted infrastructure is created. A new chat deployment additionally requires
--model, --model-version and --model-sku, using the live ARM model catalogue.
"""

from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import importlib
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import quote, urlsplit


ARM = "https://management.azure.com"
GRAPH = "https://graph.microsoft.com"
PP = "https://api.powerapps.com"
COGNITIVE_VERSION = "2026-05-01"  # Same project API as discover_foundry_context.py.
MODEL_VERSION = "2024-10-01"
JAPAN = ("japaneast", "japanwest")
OUTPUT_KEYS = (
    "AGENT_OWNER_ID", "AGENT_OWNER_UPN", "PP_AUTH_ACCOUNT", "AZURE_TENANT_ID",
    "TENANT_ID", "AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP", "AZURE_LOCATION",
    "FOUNDRY_ACCOUNT_NAME", "FOUNDRY_PROJECT_NAME", "FOUNDRY_PROJECT_ENDPOINT",
    "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT", "AZURE_CONTAINER_REGISTRY",
    "DATAVERSE_URL", "ENV_ID", "SOLUTION_NAME", "PUBLISHER_PREFIX", "PUBLISHER_NAME",
    "ORGANIZATION_INTERNAL_DOMAINS", "AZURE_AI_ACCOUNT", "AZURE_AI_PROJECT",
    "ACR_LOGIN_SERVER", "ACR_RESOURCE_GROUP", "EVALUATION_JUDGE_DEPLOYMENT", "FOUNDRY_TOOLBOX_ENDPOINT",
)
AUTH_KEYS = (
    "PP_AUTH_MODE", "PP_AUTH_EDGE_PROFILE", "PP_AUTH_ALLOW_INTERACTIVE",
    "PP_AUTH_RECORD_PATH", "PAC_AUTH_PROFILE",
)
ALIASES = ("AZURE_AI_ACCOUNT", "AZURE_AI_PROJECT", "AZURE_OPENAI_ACCOUNT",
           "AZURE_OPENAI_RESOURCE_GROUP")


class ContextError(RuntimeError):
    """An explicit selection or an existing prerequisite is required."""


def read_env(path: Path) -> dict[str, str]:
    """Read literal dotenv values, without interpolation or process-global mutation."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)", line)
        if not match:
            raise ContextError(f"{path.name}:{number}: expected KEY=VALUE.")
        key, value = match.groups()
        if value.startswith(('"', "'")):
            end = value.rfind(value[0])
            if end == 0 or (value[end + 1:].strip() and not value[end + 1:].lstrip().startswith("#")):
                raise ContextError(f"{path.name}:{number}: invalid quoted value.")
            value = value[1:end]
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].rstrip()
        if key in values and values[key] != value:
            raise ContextError(f"{path.name}:{number}: conflicting duplicate {key}.")
        values[key] = value
    return values


def configuration(path: Path) -> dict[str, str]:
    keys = (*OUTPUT_KEYS, *AUTH_KEYS, *ALIASES)
    values = {key: os.environ[key] for key in keys if os.environ.get(key)}
    # The explicitly selected file wins over inherited shell settings.
    values.update({key: value for key, value in read_env(path).items() if key in keys})
    for key, value in values.items():
        if "${" in value or "\n" in value or "\r" in value:
            raise ContextError(f"{key} contains an unresolved placeholder or newline.")
    if values.get("TENANT_ID") and values.get("AZURE_TENANT_ID"):
        verify("TENANT_ID", values["TENANT_ID"], values["AZURE_TENANT_ID"])
    for primary, alias in (("FOUNDRY_ACCOUNT_NAME", "AZURE_AI_ACCOUNT"),
                           ("FOUNDRY_PROJECT_NAME", "AZURE_AI_PROJECT")):
        if values.get(primary) and values.get(alias):
            verify(alias, values[alias], values[primary])
        elif values.get(alias):
            values[primary] = values[alias]
    return values


@contextmanager
def standard_auth(config: dict[str, str]):
    """Import the helper only after fixing its import-time configuration.

    Disable implicit dotenv discovery so an unrelated cwd .env cannot select a
    different tenant/cache. Restore the caller's environment even on failures.
    """
    keys = (*OUTPUT_KEYS, *AUTH_KEYS, "PYTHON_DOTENV_DISABLED")
    previous = {key: os.environ.get(key) for key in keys}
    old_path = list(sys.path)
    try:
        for key in keys:
            os.environ.pop(key, None)
        os.environ.update({key: value for key, value in config.items() if key in keys})
        os.environ["TENANT_ID"] = config.get("TENANT_ID") or config.get("AZURE_TENANT_ID", "")
        os.environ["PYTHON_DOTENV_DISABLED"] = "1"
        if config.get("PP_AUTH_MODE", "browser") != "browser":
            raise ContextError("PP_AUTH_MODE must be browser; device codes are not supported.")
        directory = next((parent / ".github" / "skills" / "standard" / "scripts"
                          for parent in Path(__file__).resolve().parents
                          if (parent / ".github" / "skills" / "standard" / "scripts" /
                              "auth_helper.py").is_file()), None)
        if directory is None:
            raise ContextError("Prerequisite: standard/scripts/auth_helper.py must exist in this repository.")
        if "auth_helper" in sys.modules:
            raise ContextError("auth_helper is already imported; run this CLI in a fresh Python process.")
        sys.path.insert(0, str(directory))
        yield importlib.import_module("auth_helper")
    finally:
        sys.path[:] = old_path
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def canonical(value: str) -> str:
    return value.strip().rstrip("/").casefold()


def verify(key: str, pinned: str | None, actual: str) -> str:
    if not actual:
        raise ContextError(f"Prerequisite: {key} was not returned by the metadata API.")
    if pinned and canonical(pinned) != canonical(actual):
        raise ContextError(f"Pinned {key}={pinned} does not match discovered {actual}.")
    return pinned or actual


def select(label: str, candidates: list[dict], predicate=None) -> dict:
    matches = [item for item in candidates if predicate is None or predicate(item)]
    if len(matches) == 1:
        return matches[0]
    listing = [
        {key: item[key] for key in ("id", "name", "displayName", "subscriptionId", "tenantId",
                                    "location", "uniquename", "version", "sku", "endpoint",
                                    "publisher", "prefix")
         if key in item}
        for item in candidates
    ]
    raise ContextError(
        f"{label}: {'ambiguous' if matches else 'missing or pinned target not found'}. "
        f"Set the corresponding .env value explicitly; no infrastructure was created. "
        f"Candidates: {json.dumps(listing, ensure_ascii=False)}"
    )


def token_identity(token: str) -> tuple[str, str]:
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return str(claims["tid"]), str(claims["oid"])
    except (ValueError, KeyError, IndexError, TypeError) as error:
        raise ContextError("Cannot verify delegated token tenant/account; no token was persisted.") from error


class Metadata:
    def __init__(self, helper, config: dict[str, str]):
        self.helper = helper
        self.config = config
        self.sessions: dict[str, object] = {}
        self.identity: tuple[str, str] | None = None

    def session(self, scope: str):
        if scope not in self.sessions:
            # The initial Graph request is task-authorized for cache-first browser
            # bootstrap. The standard helper still enforces CI/browser policy and
            # only authenticates if silent token acquisition requires it.
            initial_graph = self.identity is None and scope == GRAPH + "/.default"
            token = (self.helper.get_token(scope=scope, allow_interactive=True) if initial_graph
                     else self.helper.get_token(scope=scope))
            identity = token_identity(token)
            tenant = self.config.get("TENANT_ID") or self.config.get("AZURE_TENANT_ID")
            if tenant:
                verify("TENANT_ID" if self.config.get("TENANT_ID") else "AZURE_TENANT_ID", tenant, identity[0])
            if self.identity is not None and identity != self.identity:
                raise ContextError("Authentication crossed tenant/account boundaries; select one PP_AUTH profile.")
            self.identity = identity
            self.sessions[scope] = self.helper.get_session(scope=scope)
        return self.sessions[scope]

    def request(self, method: str, url: str, scope: str, **kwargs) -> dict:
        response = getattr(self.session(scope), method)(url, timeout=60, **kwargs)
        if not 200 <= response.status_code < 300:
            # Do not print server bodies, request headers or token-bearing errors.
            raise ContextError(f"Metadata API {method.upper()} failed: HTTP {response.status_code}, "
                               f"{urlsplit(url).netloc}{urlsplit(url).path}. "
                               "Verify access and existing prerequisites; no fallback login is attempted.")
        return response.json()

    def get(self, url: str, scope: str, version: str | None = None) -> dict:
        return self.request("get", url, scope, **({"params": {"api-version": version}} if version else {}))

    def listing(self, url: str, scope: str, version: str | None = None) -> list[dict]:
        result: list[dict] = []
        origin = urlsplit(url)
        seen: set[str] = set()
        while url:
            parsed = urlsplit(url)
            if parsed.scheme != "https" or parsed.netloc != origin.netloc or url in seen:
                raise ContextError("Unsafe or repeated metadata pagination link; stopped.")
            seen.add(url)
            page = self.get(url, scope, version)
            result.extend(page.get("value", []))
            url = page.get("nextLink") or page.get("@odata.nextLink")
            version = None
        return result


def name(resource: dict) -> str:
    return resource.get("name", "").rsplit("/", 1)[-1]


def group(resource: dict) -> str:
    parts = resource["id"].split("/")
    return parts[next(i for i, value in enumerate(parts) if value.casefold() == "resourcegroups") + 1]


def endpoint(resource: dict, kind: str) -> str:
    properties = resource.get("properties", {})
    endpoints = properties.get("endpoints", {})
    if kind == "project":
        candidates = [properties.get("endpoint"), endpoints.get("AI Foundry API"),
                      endpoints.get("AI Services API")]
    else:
        candidates = [endpoints.get("Azure OpenAI"), endpoints.get("OpenAI Language Model Instance API"),
                      properties.get("endpoint") if resource.get("kind") == "OpenAI" else None]
    for value in candidates:
        if value:
            parsed = urlsplit(value)
            if (parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password
                    or parsed.query or parsed.fragment):
                raise ContextError("API returned an unsafe service endpoint.")
            return value.rstrip("/")
    return ""


def enabled(value) -> bool:
    return value is True or str(value).casefold() == "true"


def chat_model(model: dict) -> bool:
    capabilities = {key.casefold(): value for key, value in model.get("capabilities", {}).items()}
    return (enabled(capabilities.get("chatcompletion")) or enabled(capabilities.get("chatcompletions"))) and (
        "inference" not in capabilities or enabled(capabilities["inference"]))


def past(value: str | None) -> bool:
    if not value:
        return False
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(
            tzinfo=timezone.utc) <= datetime.now(timezone.utc)
    except ValueError:
        return True  # Unverifiable retirement dates must not authorize new deployments.


def version_key(model: dict) -> tuple:
    # Prefer the publisher's creation timestamp, then natural exact-version order.
    return (model.get("systemData", {}).get("createdAt", ""),
            tuple((1, int(part)) if part.isdigit() else (0, part)
                  for part in re.split(r"(\d+)", model.get("version", ""))))


def model_candidates(entries: list[dict], location: str) -> list[dict]:
    """ARM Models_List schema: Model.model is AccountModel, with nested skus.

    https://learn.microsoft.com/rest/api/aiservices/accountmanagement/models/list
    ?view=rest-aiservices-accountmanagement-2024-10-01
    """
    candidates = []
    for entry in entries:
        model = entry.get("model", {})
        if not chat_model(model) or not model.get("name") or not model.get("version"):
            continue
        if model.get("format") != "OpenAI":
            continue  # The downstream Copilot SDK uses the Azure OpenAI endpoint.
        if model.get("maxCapacity") is not None and model["maxCapacity"] <= 0:
            continue
        if str(model.get("lifecycleStatus", "")).casefold() in ("deprecated", "deprecating"):
            continue
        if past(model.get("deprecation", {}).get("inference")):
            continue
        for sku in model.get("skus", []):
            capacity = sku.get("capacity", {})
            minimum = max(1, capacity.get("minimum", 1))
            chosen = capacity.get("default", minimum)
            if not sku.get("name") or capacity.get("maximum", chosen) < chosen or chosen < minimum:
                continue
            if past(sku.get("deprecationDate")):
                continue
            if capacity.get("allowedValues") and chosen not in capacity["allowedValues"]:
                continue
            if (chosen - minimum) % max(1, capacity.get("step", 1)):
                continue
            candidates.append({
                "name": model["name"], "version": model["version"], "format": model["format"],
                "sku": sku["name"], "location": location, "capacity": chosen,
                "_order": version_key(model),
            })
    newest: dict[tuple, tuple] = {}
    for candidate in candidates:
        key = (candidate["name"], candidate["sku"])
        newest[key] = max(newest.get(key, candidate["_order"]), candidate["_order"])
    for candidate in candidates:
        candidate["latest"] = candidate.pop("_order") == newest[(candidate["name"], candidate["sku"])]
    return sorted(candidates, key=lambda item: (not item["latest"], item["name"], item["version"], item["sku"]))


def discover_identity(api: Metadata, config: dict[str, str]) -> tuple[dict[str, str], str]:
    values: dict[str, str] = {}

    def put(key: str, actual: str):
        values[key] = verify(key, config.get(key), actual)

    graph_scope = GRAPH + "/.default"
    arm_scope = ARM + "/.default"
    me = api.get(GRAPH + "/v1.0/me?$select=id,userPrincipalName,mail", graph_scope)
    organizations = api.listing(GRAPH + "/v1.0/organization?$select=id,verifiedDomains", graph_scope)
    organization = select("TENANT_ID (Graph organization)", organizations)
    tenant = organization["id"]
    if api.identity and (canonical(tenant), canonical(me["id"])) != tuple(map(canonical, api.identity)):
        raise ContextError("Graph /me and organization do not match the authenticated tenant/account.")
    put("TENANT_ID", tenant)
    put("AZURE_TENANT_ID", tenant)
    put("AGENT_OWNER_ID", me["id"])
    put("AGENT_OWNER_UPN", me["userPrincipalName"])
    put("PP_AUTH_ACCOUNT", me["userPrincipalName"])
    domains = sorted({domain["name"].casefold() for domain in organization.get("verifiedDomains", [])
                      if domain.get("name")})
    pinned_domains = config.get("ORGANIZATION_INTERNAL_DOMAINS")
    if pinned_domains:
        requested = {item.strip().casefold() for item in pinned_domains.split(",") if item.strip()}
        if not requested or not requested.issubset(set(domains)):
            raise ContextError(f"ORGANIZATION_INTERNAL_DOMAINS not verified in tenant. Candidates: {domains}")
        values["ORGANIZATION_INTERNAL_DOMAINS"] = pinned_domains
    else:
        put("ORGANIZATION_INTERNAL_DOMAINS", ",".join(domains))

    subscriptions = api.listing(ARM + "/subscriptions", arm_scope, "2022-12-01")
    subscription = select("AZURE_SUBSCRIPTION_ID", subscriptions, lambda item:
                          canonical(item.get("tenantId", "")) == canonical(tenant)
                          and item.get("state", "Enabled") == "Enabled"
                          and (not config.get("AZURE_SUBSCRIPTION_ID") or
                               canonical(item["subscriptionId"]) == canonical(config["AZURE_SUBSCRIPTION_ID"])))
    put("AZURE_SUBSCRIPTION_ID", subscription["subscriptionId"])
    root = ARM + "/subscriptions/" + quote(subscription["subscriptionId"], safe="")
    return values, root


def discover(api: Metadata, config: dict[str, str], args: argparse.Namespace) -> dict:
    values, root = discover_identity(api, config)
    tenant = values["TENANT_ID"]
    arm_scope = ARM + "/.default"

    def put(key: str, actual: str):
        values[key] = verify(key, config.get(key), actual)

    accounts = api.listing(root + "/providers/Microsoft.CognitiveServices/accounts",
                           arm_scope, COGNITIVE_VERSION)
    foundry_accounts = [item for item in accounts if item.get("kind") == "AIServices"]
    def matching_account(item):
        return (
                     (not config.get("FOUNDRY_ACCOUNT_NAME") or
                      canonical(name(item)) == canonical(config["FOUNDRY_ACCOUNT_NAME"]))
                     and (not config.get("AZURE_RESOURCE_GROUP") or
                          canonical(group(item)) == canonical(config["AZURE_RESOURCE_GROUP"])))

    project_cache = {}
    if config.get("FOUNDRY_PROJECT_NAME") or config.get("FOUNDRY_PROJECT_ENDPOINT"):
        matches = []
        for item in foundry_accounts:
            if not matching_account(item):
                continue
            projects = api.listing(ARM + item["id"] + "/projects", arm_scope, COGNITIVE_VERSION)
            project_cache[item["id"]] = projects
            if any((not config.get("FOUNDRY_PROJECT_NAME") or
                    canonical(name(project)) == canonical(config["FOUNDRY_PROJECT_NAME"]))
                   and (not config.get("FOUNDRY_PROJECT_ENDPOINT") or
                        canonical(endpoint(project, "project")) ==
                        canonical(config["FOUNDRY_PROJECT_ENDPOINT"])) for project in projects):
                matches.append(item)
        account = select("FOUNDRY_ACCOUNT_NAME / FOUNDRY_PROJECT_NAME / FOUNDRY_PROJECT_ENDPOINT",
                         foundry_accounts, lambda item: item in matches)
    else:
        account = select("FOUNDRY_ACCOUNT_NAME / AZURE_RESOURCE_GROUP", foundry_accounts, matching_account)
    put("FOUNDRY_ACCOUNT_NAME", name(account))
    put("AZURE_AI_ACCOUNT", name(account))
    put("AZURE_RESOURCE_GROUP", group(account))
    put("AZURE_LOCATION", account["location"])
    account_root = ARM + account["id"]
    projects = project_cache.get(account["id"])
    if projects is None:
        projects = api.listing(account_root + "/projects", arm_scope, COGNITIVE_VERSION)
    project = select("FOUNDRY_PROJECT_NAME / FOUNDRY_PROJECT_ENDPOINT", projects, lambda item:
                     (not config.get("FOUNDRY_PROJECT_NAME") or
                      canonical(name(item)) == canonical(config["FOUNDRY_PROJECT_NAME"]))
                     and (not config.get("FOUNDRY_PROJECT_ENDPOINT") or
                          canonical(endpoint(item, "project")) == canonical(config["FOUNDRY_PROJECT_ENDPOINT"])))
    put("FOUNDRY_PROJECT_NAME", name(project))
    put("AZURE_AI_PROJECT", name(project))
    put("FOUNDRY_PROJECT_ENDPOINT", endpoint(project, "project"))
    toolbox_endpoints = {
        value.rstrip("/")
        for resource in (project, account)
        for key, value in resource.get("properties", {}).get("endpoints", {}).items()
        if "toolbox" in key.casefold() and isinstance(value, str) and value
    }
    gaps = [
        "BLOCKING before Hub deployment: orchestration must verify and reuse the existing shared "
        "AI teammate evaluationHub power.config.json/app configuration, or explicitly confirm no "
        "shared Hub exists before initializing one. Code Apps app discovery is not performed by "
        "these metadata APIs; do not silently create a duplicate Hub."
    ]
    if toolbox_endpoints:
        toolbox = select("FOUNDRY_TOOLBOX_ENDPOINT",
                         [{"endpoint": value} for value in sorted(toolbox_endpoints)],
                         lambda item: not config.get("FOUNDRY_TOOLBOX_ENDPOINT") or
                         canonical(item["endpoint"]) == canonical(config["FOUNDRY_TOOLBOX_ENDPOINT"]))
        # Apply the same endpoint safety rules as other service endpoints.
        put("FOUNDRY_TOOLBOX_ENDPOINT", endpoint({"properties": {"endpoint": toolbox["endpoint"]}}, "project"))
    elif config.get("FOUNDRY_TOOLBOX_ENDPOINT"):
        raise ContextError("Pinned FOUNDRY_TOOLBOX_ENDPOINT cannot be verified from the selected "
                           "project/account endpoints. Verify the toolbox prerequisite explicitly.")
    else:
        gaps.append("FOUNDRY_TOOLBOX_ENDPOINT was not exposed by project/account metadata; "
                    "web/code toolbox readiness is unverified. No endpoint was invented.")
    # Keep the existing hosted project region. Japan policy applies ONLY to a new model.
    registries = api.listing(root + "/providers/Microsoft.ContainerRegistry/registries",
                             arm_scope, "2023-07-01")
    registry_pin = config.get("AZURE_CONTAINER_REGISTRY")
    registry = select("AZURE_CONTAINER_REGISTRY / ACR_RESOURCE_GROUP", registries, lambda item:
                      ((canonical(registry_pin) in {canonical(name(item)), canonical(item["id"]),
                                                  canonical(item.get("properties", {}).get("loginServer", ""))}
                        if registry_pin else bool(config.get("ACR_LOGIN_SERVER")) or
                        canonical(group(item)) == canonical(config.get("ACR_RESOURCE_GROUP") or group(account)))
                       and (not config.get("ACR_LOGIN_SERVER") or canonical(config["ACR_LOGIN_SERVER"]) ==
                            canonical(item.get("properties", {}).get("loginServer", "")))
                       and (not config.get("ACR_RESOURCE_GROUP") or
                            canonical(config["ACR_RESOURCE_GROUP"]) == canonical(group(item)))))
    put("AZURE_CONTAINER_REGISTRY", registry_pin or name(registry))
    put("ACR_LOGIN_SERVER", registry.get("properties", {}).get("loginServer", ""))
    put("ACR_RESOURCE_GROUP", group(registry))
    if getattr(args, "new_foundation", False):
        verify("single resource group for ACR", group(account), group(registry))

    environments = api.listing(PP + "/providers/Microsoft.PowerApps/environments",
                               "https://service.powerapps.com/.default", "2016-11-01")

    def environment_url(item):
        return item.get("properties", {}).get("linkedEnvironmentMetadata", {}).get("instanceUrl", "")

    environments = [{**item, "endpoint": environment_url(item),
                     "displayName": item.get("properties", {}).get("displayName", "")}
                    for item in environments]
    environment = select("ENV_ID / DATAVERSE_URL", environments, lambda item:
                         bool(environment_url(item))
                         and (not config.get("ENV_ID") or canonical(item["name"]) == canonical(config["ENV_ID"]))
                         and (not config.get("DATAVERSE_URL") or
                              canonical(environment_url(item)) == canonical(config["DATAVERSE_URL"])))
    environment_tenant = environment.get("properties", {}).get("tenantId")
    if environment_tenant:
        verify("Power Platform tenantId", tenant, environment_tenant)
    put("ENV_ID", environment["name"])
    put("DATAVERSE_URL", environment_url(environment).rstrip("/"))
    dv_url = values["DATAVERSE_URL"].rstrip("/")
    parsed = urlsplit(dv_url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise ContextError("DATAVERSE_URL must be an HTTPS origin returned by environment metadata.")
    dv_scope = dv_url + "/.default"
    dv_root = dv_url + "/api/data/v9.2"
    solutions = api.listing(dv_root + "/solutions?$select=solutionid,uniquename,_publisherid_value"
                           "&$filter=ismanaged%20eq%20false%20and%20isvisible%20eq%20true", dv_scope)
    publishers = api.listing(dv_root + "/publishers?$select=publisherid,uniquename,customizationprefix", dv_scope)
    publishers_by_id = {item["publisherid"]: item for item in publishers}
    solutions = [{**item,
                  "publisher": publishers_by_id.get(item.get("_publisherid_value"), {}).get("uniquename", ""),
                  "prefix": publishers_by_id.get(item.get("_publisherid_value"), {}).get("customizationprefix", "")}
                 for item in solutions]

    def usable_solution(item):
        publisher = publishers_by_id.get(item.get("_publisherid_value"), {})
        return ((canonical(item["uniquename"]) == canonical(config["SOLUTION_NAME"])
                 if config.get("SOLUTION_NAME") else item["uniquename"] not in ("Active", "Default"))
                and all(not config.get(key) or canonical(config[key]) == canonical(publisher.get(field, ""))
                        for key, field in (("PUBLISHER_NAME", "uniquename"),
                                           ("PUBLISHER_PREFIX", "customizationprefix"))))

    solution = select("SOLUTION_NAME / PUBLISHER_NAME / PUBLISHER_PREFIX", solutions, usable_solution)
    publisher = publishers_by_id.get(solution["_publisherid_value"], {})
    put("SOLUTION_NAME", solution["uniquename"])
    put("PUBLISHER_NAME", publisher.get("uniquename", ""))
    put("PUBLISHER_PREFIX", publisher.get("customizationprefix", ""))
    model_accounts = [account] if getattr(args, "new_foundation", False) else accounts
    if getattr(args, "new_foundation", False):
        if not config.get("FOUNDRY_ACCOUNT_NAME") or not config.get("AZURE_RESOURCE_GROUP"):
            raise ContextError("New-foundation discovery requires the verified provisioned account and resource group.")
        for key, actual in (("AZURE_OPENAI_ACCOUNT", name(account)),
                            ("AZURE_OPENAI_RESOURCE_GROUP", group(account))):
            if config.get(key):
                verify(key, config[key], actual)
    deployment, candidates = discover_model(api, model_accounts, root, config, args)
    if deployment:
        put("AZURE_OPENAI_ENDPOINT", deployment["endpoint"])
        put("AZURE_OPENAI_DEPLOYMENT", deployment["name"])
        put("EVALUATION_JUDGE_DEPLOYMENT", deployment["judge"])
    return {"values": values, "model_candidates": candidates,
            "model_deployment": deployment.get("create") if deployment else None,
            "status": "ready" if deployment else "model-selection-required", "gaps": gaps}


def discover_model(api: Metadata, accounts: list[dict], root: str, config: dict[str, str],
                   args: argparse.Namespace) -> tuple[dict | None, list[dict]]:
    scope = ARM + "/.default"
    model_accounts = [item for item in accounts if item.get("kind") in ("OpenAI", "AIServices")
                      and endpoint(item, "openai")]
    pinned_endpoint = config.get("AZURE_OPENAI_ENDPOINT")
    scoped = [item for item in model_accounts
              if (not pinned_endpoint or canonical(endpoint(item, "openai")) == canonical(pinned_endpoint))
              and (not config.get("AZURE_OPENAI_ACCOUNT") or
                   canonical(name(item)) == canonical(config["AZURE_OPENAI_ACCOUNT"]))
              and (not config.get("AZURE_OPENAI_RESOURCE_GROUP") or
                   canonical(group(item)) == canonical(config["AZURE_OPENAI_RESOURCE_GROUP"]))]
    if not scoped and (pinned_endpoint or config.get("AZURE_OPENAI_ACCOUNT")):
        select("AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_ACCOUNT", model_accounts, lambda item: False)
    existing = []
    verified_chat = []
    all_deployments = []
    for account in scoped:
        account_root = ARM + account["id"]
        deployments = api.listing(account_root + "/deployments", scope, MODEL_VERSION)
        catalogue = api.listing(account_root + "/models", scope, MODEL_VERSION) if deployments else []
        for deployment in deployments:
            model = deployment.get("properties", {}).get("model", {})
            record = {"name": name(deployment), "endpoint": endpoint(account, "openai"),
                      "id": deployment["id"], "version": model.get("version", ""),
                      "model": model.get("name"), "sku": deployment.get("sku", {}).get("name")}
            all_deployments.append(record)
            metadata = next((item.get("model", item) for item in catalogue
                             if all(item.get("model", item).get(key) == model.get(key)
                                    for key in ("name", "version", "format"))), {})
            if not chat_model(metadata) or model.get("format") != "OpenAI":
                continue
            if deployment.get("properties", {}).get("provisioningState") != "Succeeded":
                continue
            verified_chat.append(record)
            if config.get("AZURE_OPENAI_DEPLOYMENT") and canonical(name(deployment)) != canonical(
                    config["AZURE_OPENAI_DEPLOYMENT"]):
                continue
            existing.append(record)

    def with_judge(selected):
        judge = config.get("EVALUATION_JUDGE_DEPLOYMENT")
        if judge and canonical(judge) != canonical(selected["name"]):
            select("EVALUATION_JUDGE_DEPLOYMENT", verified_chat, lambda item:
                   canonical(item["name"]) == canonical(judge)
                   and canonical(item["endpoint"]) == canonical(selected["endpoint"]))
        return {**selected, "judge": judge or selected["name"]}

    if existing:
        deployment = select("AZURE_OPENAI_DEPLOYMENT / AZURE_OPENAI_ENDPOINT", existing)
        for requested, field in ((args.model, "model"), (args.model_version, "version"), (args.model_sku, "sku")):
            if requested:
                verify(f"existing deployment {field}", requested, deployment.get(field, ""))
        return with_judge(deployment), []
    pinned_name = config.get("AZURE_OPENAI_DEPLOYMENT")
    if pinned_name and any(canonical(item["name"]) == canonical(pinned_name) for item in all_deployments):
        raise ContextError(f"Pinned deployment is not a verified successful chat model. Candidates: "
                           f"{json.dumps(all_deployments)}")
    locations = (args.model_location,) if args.model_location else JAPAN
    candidates = []
    for location in locations:
        entries = api.listing(root + "/providers/Microsoft.CognitiveServices/locations/" +
                              quote(location, safe="") + "/models", scope, MODEL_VERSION)
        candidates.extend(model_candidates(entries, location))
    if not candidates:
        raise ContextError("Prerequisite: no deployable chat-capable OpenAI model/SKU was returned by the "
                           f"live location catalogue for {', '.join(locations)}. No infrastructure was created.")
    if not all((args.model, args.model_version, args.model_sku)):
        return None, candidates
    requested = [item for item in candidates
                 if (item["name"], item["version"], item["sku"]) ==
                 (args.model, args.model_version, args.model_sku)]
    if not requested:
        raise ContextError("Explicit model/version/SKU is not deployable chat metadata. Candidates: "
                           + json.dumps(candidates))
    # Prefer Japan East, then Japan West, without relocating the hosted project.
    for location in locations:
        offered = [item for item in requested if item["location"] == location]
        available_accounts = [item for item in scoped if canonical(item["location"]) == canonical(location)]
        if not offered or not available_accounts:
            continue
        account = select("New model AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_ACCOUNT",
                         available_accounts)
        chosen = offered[0]
        deployment_name = pinned_name or args.model
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}", deployment_name):
            raise ContextError("Set AZURE_OPENAI_DEPLOYMENT to a valid deployment name (1-64 characters).")
        target = ARM + account["id"] + "/deployments/" + quote(deployment_name, safe="")
        # Never replace a deployment, including an embedding/image deployment.
        if any(canonical(item["id"]) == canonical(target.removeprefix(ARM)) for item in all_deployments):
            raise ContextError(f"Deployment {deployment_name} already exists; refusing an implicit replacement.")
        create = {"url": target, "api_version": MODEL_VERSION, "body": {
            "sku": {"name": chosen["sku"], "capacity": chosen["capacity"]},
            "properties": {"model": {key: chosen[key] for key in ("format", "name", "version")}}}}
        return with_judge({"name": deployment_name, "endpoint": endpoint(account, "openai"),
                           "create": create}), candidates
    raise ContextError("Prerequisite: an existing Azure OpenAI-capable account in the selected model region "
                       f"is required ({', '.join(locations)}). No account/project/registry was created or moved. "
                       f"Account candidates: {json.dumps([{'name': name(item), 'location': item['location'], 'endpoint': endpoint(item, 'openai')} for item in scoped])}. "
                       f"Model candidates: {json.dumps(candidates)}")


def create_model(api: Metadata, create: dict) -> None:
    """Create an explicitly selected model and verify the final ARM read-back."""
    url = create["url"]
    scope = ARM + "/.default"
    # Recheck immediately before PUT; ARM PUT would otherwise replace an existing deployment.
    response = api.session(scope).get(url, params={"api-version": create["api_version"]}, timeout=60)
    if response.status_code != 404:
        raise ContextError("New model target is no longer absent (or absence cannot be verified); refusing PUT.")
    api.request("put", url, scope, params={"api-version": create["api_version"]}, json=create["body"])
    deadline = time.monotonic() + 600
    while True:
        resource = api.get(url, scope, create["api_version"])
        state = resource.get("properties", {}).get("provisioningState")
        if state == "Succeeded":
            actual = resource.get("properties", {}).get("model", {})
            expected = create["body"]["properties"]["model"]
            if any(actual.get(key) != value for key, value in expected.items()) or (
                    resource.get("sku", {}).get("name") != create["body"]["sku"]["name"]):
                raise ContextError("Created deployment read-back differs from the explicitly selected model/SKU.")
            return
        if state in ("Failed", "Canceled", "Cancelled") or time.monotonic() >= deadline:
            raise ContextError("Model provisioning failed or timed out; .env was not written. Inspect the deployment.")
        time.sleep(5)


def interactive_consent(config: dict[str, str], execute: bool) -> bool:
    """Only execution authorizes saving continuing consent, never CI.

    Saved consent is consumed by standard auth_preferences, which requires an
    explicit Edge profile directory. Do not guess a profile just to save consent.
    Initial Graph bootstrap remains task-authorized even without that preference.
    """
    ci = any(os.environ.get(key, "").casefold() not in ("", "0", "false")
             for key in ("CI", "GITHUB_ACTIONS", "TF_BUILD"))
    return bool(execute and not ci and config.get("PP_AUTH_MODE", "browser") == "browser"
                and re.fullmatch(r"Default|Profile \d+", config.get("PP_AUTH_EDGE_PROFILE", "")))


def persist(path: Path, values: dict[str, str], original: str | None, *,
            allow_interactive_consent: bool = False, approved_edge_profile: str = "",
            resource_group_mode: str = "") -> None:
    """Preserve all existing lines (including secrets); append verified public context only."""
    current = path.read_text(encoding="utf-8-sig") if path.exists() else None
    if current != original:
        raise ContextError("The .env changed during discovery; refusing to overwrite concurrent edits.")
    existing = read_env(path)
    lines = (current or "").splitlines(keepends=True)
    added = []
    public_values = dict(values)
    if resource_group_mode:
        if resource_group_mode not in ("new", "existing"):
            raise ContextError("Cannot persist an unconfirmed resource group mode.")
        public_values["AZURE_RESOURCE_GROUP_MODE"] = resource_group_mode
    if allow_interactive_consent:
        owner = public_values.get("PP_AUTH_ACCOUNT", "")
        if (not re.fullmatch(r"[^@\s]+@[^@\s]+", owner)
                or not re.fullmatch(r"Default|Profile \d+", approved_edge_profile)):
            raise ContextError("Cannot save browser consent without a verified PP_AUTH_ACCOUNT "
                               "and an existing approved Edge profile preference.")
        public_values["PP_AUTH_ALLOW_INTERACTIVE"] = "true"
        public_values["PP_AUTH_EDGE_PROFILE"] = approved_edge_profile
    for key, value in public_values.items():
        consent = key == "PP_AUTH_ALLOW_INTERACTIVE" and allow_interactive_consent and value == "true"
        profile = key == "PP_AUTH_EDGE_PROFILE" and allow_interactive_consent and value == approved_edge_profile
        group_choice = key == "AZURE_RESOURCE_GROUP_MODE" and value == resource_group_mode
        if ((key not in OUTPUT_KEYS and not consent and not profile and not group_choice)
                or not value or any(char in value for char in "\r\n\x00")):
            raise ContextError("Refusing to persist an unexpected context key or invalid value.")
        if existing.get(key) and not consent:
            verify(key, existing[key], value)
            continue
        # Empty pinned entries are intentionally unresolved, and may be filled.
        pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=")
        encoded = json.dumps(value, ensure_ascii=False)
        matching = [index for index, line in enumerate(lines) if pattern.match(line)]
        if matching:
            for index in matching:
                lines[index] = f"{key}={encoded}\n"
        else:
            added.append(f"{key}={encoded}\n")
    text = "".join(lines)
    if added and text and not text.endswith(("\n", "\r")):
        text += "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    # A sibling file, not a shared temporary directory, keeps replacement atomic.
    pending = path.with_name(path.name + ".first-stage-pending")
    descriptor = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
            stream.write(text + "".join(added))
        if path.exists() and path.read_text(encoding="utf-8-sig") != original:
            raise ContextError("The .env changed before persistence; refusing replacement.")
        pending.replace(path)
    finally:
        pending.unlink(missing_ok=True)


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--execute", action="store_true", help="Persist verified context; deploy only an explicitly selected model.")
    parser.add_argument("--new-foundation", action="store_true",
                        help="Confine model discovery/deployment to the newly provisioned Foundry account and one resource group.")
    parser.add_argument("--model")
    parser.add_argument("--model-version")
    parser.add_argument("--model-sku")
    parser.add_argument("--model-location", help="New model region only; default Japan East, then Japan West.")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        original = args.env.read_text(encoding="utf-8-sig") if args.env.exists() else None
        config = configuration(args.env)
        with standard_auth(config) as helper:
            api = Metadata(helper, config)
            plan = discover(api, config, args)
            save_consent = interactive_consent(config, args.execute)
            plan["authentication"] = {
                "initial_graph": "cache-first; task-authorized browser interaction; standard CI policy applies",
                "persist_interactive_consent": save_consent,
            }
            if args.execute and not save_consent:
                plan["gaps"].append(
                    "Continuing browser consent was not saved: CI or an absent/invalid "
                    "PP_AUTH_EDGE_PROFILE prevents storing PP_AUTH_ALLOW_INTERACTIVE=true. "
                    "The initial Graph token request remains cache-first and task-authorized; "
                    "no browser profile was guessed.")
            print(json.dumps({"mode": "execute" if args.execute else "dry-run", **plan},
                             ensure_ascii=False, indent=2))
            if plan["status"] != "ready":
                raise ContextError("No existing chat deployment was selected. Choose a live candidate with "
                                   "--model NAME --model-version VERSION --model-sku SKU "
                                   "(--model-location REGION optional), then use --execute. "
                                   "No .env or Azure resource was changed.")
            if args.execute:
                if plan["model_deployment"]:
                    create_model(api, plan["model_deployment"])
                persist(args.env, plan["values"], original, allow_interactive_consent=save_consent,
                        approved_edge_profile=config.get("PP_AUTH_EDGE_PROFILE", ""))
        return 0
    except ContextError as error:
        print(f"STOP: {error}", file=sys.stderr)
        return 2
    except Exception as error:
        # SDK/transport exception messages can contain URLs, claims or credentials.
        print(f"STOP: {type(error).__name__}; discovery/authentication failed. "
              "Check the standard PP_AUTH browser profile and API permissions. No tokens were written.",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
