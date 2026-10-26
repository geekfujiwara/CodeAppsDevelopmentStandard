"""First-stage discovery tests. All cloud/authentication traffic is mocked."""

from __future__ import annotations

import base64
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from copy import deepcopy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sys
import unittest
from unittest.mock import MagicMock, patch
import uuid


SCRIPT = Path(__file__).resolve().parents[1] / "prepare_first_stage.py"
SPEC = importlib.util.spec_from_file_location("prepare_first_stage", SCRIPT)
stage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stage)

ROOT = stage.ARM + "/subscriptions/sub-one"
ACCOUNT_ID = "/subscriptions/sub-one/resourceGroups/host-rg/providers/Microsoft.CognitiveServices/accounts/host"
MODEL_ID = "/subscriptions/sub-one/resourceGroups/model-rg/providers/Microsoft.CognitiveServices/accounts/chat"
PROJECT_ENDPOINT = "https://host.services.ai.azure.com/api/projects/project"
OPENAI_ENDPOINT = "https://chat.openai.azure.com"
DV = "https://<org>.crm.dynamics.com"
SOLUTION_URL = (DV + "/api/data/v9.2/solutions?$select=solutionid,uniquename,_publisherid_value"
                "&$filter=ismanaged%20eq%20false%20and%20isvisible%20eq%20true")
PUBLISHER_URL = DV + "/api/data/v9.2/publishers?$select=publisherid,uniquename,customizationprefix"
ENVIRONMENTS_URL = stage.PP + "/providers/Microsoft.PowerApps/environments"
ACCOUNTS_URL = ROOT + "/providers/Microsoft.CognitiveServices/accounts"
REGISTRIES_URL = ROOT + "/providers/Microsoft.ContainerRegistry/registries"


def jwt(tenant="tenant-one", owner="owner-one"):
    payload = base64.urlsafe_b64encode(json.dumps({"tid": tenant, "oid": owner}).encode()).decode().rstrip("=")
    return "header." + payload + ".not-a-real-token"


def model(name="chat-model", version="2026-10-01", **updates):
    value = {
        "format": "OpenAI", "name": name, "version": version,
        "capabilities": {"chatCompletion": "true", "inference": "true"},
        "lifecycleStatus": "GenerallyAvailable",
        "systemData": {"createdAt": version + "T00:00:00Z"},
        "skus": [{"name": "GlobalStandard", "capacity": {"minimum": 1, "maximum": 10, "default": 1}}],
    }
    value.update(updates)
    return {"kind": "OpenAI", "skuName": "S0", "model": value}


def deployment(name="brain", state="Succeeded", model_entry=None):
    return {
        "name": name, "id": MODEL_ID + "/deployments/" + name,
        "sku": {"name": "GlobalStandard", "capacity": 1},
        "properties": {"provisioningState": state,
                       "model": {key: (model_entry or model())["model"][key]
                                 for key in ("format", "name", "version")}},
    }


def fixture():
    return {
        stage.GRAPH + "/v1.0/me?$select=id,userPrincipalName,mail":
            {"id": "owner-one", "userPrincipalName": "owner@example.com", "mail": "owner@example.com"},
        stage.GRAPH + "/v1.0/organization?$select=id,verifiedDomains":
            {"value": [{"id": "tenant-one", "verifiedDomains": [{"name": "example.com"},
                                                               {"name": "example.onmicrosoft.com"}]}]},
        stage.ARM + "/subscriptions":
            {"value": [{"subscriptionId": "sub-one", "tenantId": "tenant-one",
                        "displayName": "Development", "state": "Enabled"}]},
        ACCOUNTS_URL: {"value": [
            {"id": ACCOUNT_ID, "name": "host", "kind": "AIServices", "location": "eastus2",
             "properties": {"allowProjectManagement": True}},
            {"id": MODEL_ID, "name": "chat", "kind": "OpenAI", "location": "japaneast",
             "properties": {"endpoint": OPENAI_ENDPOINT}},
        ]},
        stage.ARM + ACCOUNT_ID + "/projects": {"value": [
            {"id": ACCOUNT_ID + "/projects/project", "name": "host/project", "location": "eastus2",
             "properties": {"endpoints": {"AI Foundry API": PROJECT_ENDPOINT}}},
        ]},
        REGISTRIES_URL: {"value": [
            {"name": "registry", "id": "/subscriptions/sub-one/resourceGroups/host-rg/providers/"
                                    "Microsoft.ContainerRegistry/registries/registry",
             "properties": {"loginServer": "registry.azurecr.io"}},
        ]},
        ENVIRONMENTS_URL: {"value": [
            {"name": "environment-one", "properties": {"tenantId": "tenant-one", "displayName": "Sandbox",
             "linkedEnvironmentMetadata": {"instanceUrl": DV}}},
        ]},
        SOLUTION_URL: {"value": [
            {"solutionid": "solution-one", "uniquename": "AgentSolution", "_publisherid_value": "publisher-one"},
        ]},
        PUBLISHER_URL: {"value": [
            {"publisherid": "publisher-one", "uniquename": "AgentPublisher", "customizationprefix": "agent"},
        ]},
        stage.ARM + MODEL_ID + "/deployments": {"value": [deployment()]},
        stage.ARM + MODEL_ID + "/models": {"value": [model()]},
        ROOT + "/providers/Microsoft.CognitiveServices/locations/japaneast/models": {"value": [model()]},
        ROOT + "/providers/Microsoft.CognitiveServices/locations/japanwest/models": {"value": [model()]},
    }


class Response:
    def __init__(self, data=None, status=200):
        self.data = data or {}
        self.status_code = status

    def json(self):
        return deepcopy(self.data)


class Transport:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(("get", url, kwargs))
        if url not in self.data:
            raise AssertionError("Unexpected mocked URL: " + url)
        response = self.data[url]
        return response if isinstance(response, Response) else Response(response)

    def put(self, url, **kwargs):
        self.calls.append(("put", url, kwargs))
        body = deepcopy(kwargs["json"])
        body["properties"]["provisioningState"] = "Succeeded"
        self.data[url] = body
        return Response(body)


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture()
        self.transport = Transport(self.data)
        self.helper = MagicMock()
        self.helper.get_token.return_value = jwt()
        self.helper.get_session.return_value = self.transport
        self.config = {}
        self.args = stage.parse_args(["--env", ".env"])

    def discover(self):
        return stage.discover(stage.Metadata(self.helper, self.config), self.config, self.args)

    def no_existing_model(self):
        self.data[stage.ARM + MODEL_ID + "/deployments"] = {"value": []}

    def explicit_model(self):
        self.args.model = "chat-model"
        self.args.model_version = "2026-10-01"
        self.args.model_sku = "GlobalStandard"

    def test_complete_discovery_reuses_existing_and_keeps_host_region(self):
        result = self.discover()
        self.assertEqual(result["status"], "ready")
        self.assertEqual(set(result["values"]), set(stage.OUTPUT_KEYS) - {"FOUNDRY_TOOLBOX_ENDPOINT"})
        values = result["values"]
        self.assertEqual(values["AZURE_LOCATION"], "eastus2")
        self.assertEqual(values["AZURE_OPENAI_DEPLOYMENT"], "brain")
        self.assertEqual(values["AGENT_OWNER_UPN"], "owner@example.com")
        self.assertEqual(values["SOLUTION_NAME"], "AgentSolution")
        self.assertEqual(values["PUBLISHER_PREFIX"], "agent")
        self.assertEqual(values["AZURE_CONTAINER_REGISTRY"], "registry")
        self.assertEqual(values["AZURE_AI_ACCOUNT"], "host")
        self.assertEqual(values["AZURE_AI_PROJECT"], "project")
        self.assertEqual(values["ACR_LOGIN_SERVER"], "registry.azurecr.io")
        self.assertEqual(values["ACR_RESOURCE_GROUP"], "host-rg")
        self.assertEqual(values["EVALUATION_JUDGE_DEPLOYMENT"], "brain")
        self.assertTrue(any("BLOCKING before Hub deployment" in gap for gap in result["gaps"]))
        self.assertIsNone(result["model_deployment"])
        self.assertFalse(any("/locations/" in url for _, url, _ in self.transport.calls))
        self.assertFalse(any(method != "get" for method, _, _ in self.transport.calls))
        self.assertNotIn(jwt(), json.dumps(result))
        self.helper.authenticate.assert_not_called()

    def setup_new_foundation(self):
        self.args.new_foundation = True
        self.config = {"FOUNDRY_ACCOUNT_NAME": "host", "AZURE_RESOURCE_GROUP": "host-rg"}
        host = self.data[ACCOUNTS_URL]["value"][0]
        host["location"] = "japaneast"
        host["properties"]["endpoints"] = {"Azure OpenAI": "https://host.openai.azure.com"}
        self.data[stage.ARM + ACCOUNT_ID + "/deployments"] = {"value": []}

    def test_new_foundation_never_uses_another_accounts_existing_chat_model(self):
        self.setup_new_foundation()
        result = self.discover()
        self.assertEqual(result["status"], "model-selection-required")
        self.assertFalse(any(MODEL_ID + "/deployments" in url for _, url, _ in self.transport.calls))

    def test_new_foundation_model_is_created_in_the_same_group_and_account(self):
        self.setup_new_foundation()
        self.explicit_model()
        result = self.discover()
        self.assertTrue(result["model_deployment"]["url"].startswith(stage.ARM + ACCOUNT_ID + "/deployments/"))
        self.assertEqual(result["values"]["AZURE_OPENAI_ENDPOINT"], "https://host.openai.azure.com")
        self.assertEqual(result["values"]["AZURE_RESOURCE_GROUP"], "host-rg")

    def test_new_foundation_rejects_acr_in_another_group(self):
        self.setup_new_foundation()
        self.data[REGISTRIES_URL]["value"][0]["id"] = (
            "/subscriptions/sub-one/resourceGroups/other-rg/providers/Microsoft.ContainerRegistry/registries/registry")
        self.config["ACR_RESOURCE_GROUP"] = "other-rg"
        with self.assertRaisesRegex(stage.ContextError, "single resource group"):
            self.discover()

    def test_tenant_alias_and_owner_pins_are_verified(self):
        for key in ("TENANT_ID", "AZURE_TENANT_ID", "AGENT_OWNER_ID", "AGENT_OWNER_UPN", "PP_AUTH_ACCOUNT"):
            with self.subTest(key=key):
                self.config = {key: "wrong"}
                with self.assertRaisesRegex(stage.ContextError, key):
                    self.discover()

    def test_graph_org_identity_must_match_token(self):
        self.data[stage.GRAPH + "/v1.0/organization?$select=id,verifiedDomains"]["value"][0]["id"] = "other"
        with self.assertRaisesRegex(stage.ContextError, "do not match"):
            self.discover()

    def test_cross_tenant_subscriptions_never_selected(self):
        self.data[stage.ARM + "/subscriptions"]["value"].append(
            {"subscriptionId": "other", "tenantId": "other-tenant", "displayName": "Other tenant"})
        self.assertEqual(self.discover()["values"]["AZURE_SUBSCRIPTION_ID"], "sub-one")
        self.config = {"AZURE_SUBSCRIPTION_ID": "other"}
        with self.assertRaisesRegex(stage.ContextError, "other-tenant"):
            self.discover()

    def test_ambiguous_subscriptions_report_concrete_candidates(self):
        self.data[stage.ARM + "/subscriptions"]["value"].append(
            {"subscriptionId": "sub-two", "tenantId": "tenant-one", "displayName": "Production"})
        with self.assertRaisesRegex(stage.ContextError, "sub-two"):
            self.discover()
        self.config = {"AZURE_SUBSCRIPTION_ID": "sub-one"}
        self.assertEqual(self.discover()["status"], "ready")

    def test_disabled_subscription_not_used(self):
        self.data[stage.ARM + "/subscriptions"]["value"][0]["state"] = "Disabled"
        with self.assertRaisesRegex(stage.ContextError, "AZURE_SUBSCRIPTION_ID"):
            self.discover()

    def test_ambiguous_foundry_accounts_stop_but_existing_project_pin_narrows(self):
        second = deepcopy(self.data[ACCOUNTS_URL]["value"][0])
        second["name"] = "host-two"
        second["id"] = ACCOUNT_ID + "-two"
        self.data[ACCOUNTS_URL]["value"].append(second)
        self.data[stage.ARM + second["id"] + "/projects"] = {"value": []}
        with self.assertRaisesRegex(stage.ContextError, "host-two"):
            self.discover()
        self.config = {"FOUNDRY_PROJECT_ENDPOINT": PROJECT_ENDPOINT}
        self.assertEqual(self.discover()["values"]["FOUNDRY_ACCOUNT_NAME"], "host")

    def test_missing_foundry_is_explicit_prerequisite(self):
        self.data[ACCOUNTS_URL]["value"] = []
        with self.assertRaisesRegex(stage.ContextError, "no infrastructure was created"):
            self.discover()
        self.assertFalse(any(method == "put" for method, _, _ in self.transport.calls))

    def test_resource_group_and_location_pins_verified(self):
        for key in ("AZURE_RESOURCE_GROUP", "AZURE_LOCATION"):
            with self.subTest(key=key):
                self.config = {key: "wrong"}
                with self.assertRaisesRegex(stage.ContextError, key):
                    self.discover()

    def test_project_ambiguity_and_pinned_endpoint(self):
        second = deepcopy(self.data[stage.ARM + ACCOUNT_ID + "/projects"]["value"][0])
        second["name"] = "host/project-two"
        second["id"] += "-two"
        second["properties"]["endpoints"]["AI Foundry API"] += "-two"
        self.data[stage.ARM + ACCOUNT_ID + "/projects"]["value"].append(second)
        with self.assertRaisesRegex(stage.ContextError, "project-two"):
            self.discover()
        self.config = {"FOUNDRY_PROJECT_ENDPOINT": PROJECT_ENDPOINT}
        self.assertEqual(self.discover()["values"]["FOUNDRY_PROJECT_NAME"], "project")

    def test_missing_project_endpoint_not_invented(self):
        self.data[stage.ARM + ACCOUNT_ID + "/projects"]["value"][0]["properties"] = {}
        with self.assertRaisesRegex(stage.ContextError, "FOUNDRY_PROJECT_ENDPOINT"):
            self.discover()

    def test_registry_ambiguity_and_pinned_login_server(self):
        second = deepcopy(self.data[REGISTRIES_URL]["value"][0])
        second["name"] = "second-registry"
        second["id"] += "-two"
        second["properties"]["loginServer"] = "second.azurecr.io"
        self.data[REGISTRIES_URL]["value"].append(second)
        with self.assertRaisesRegex(stage.ContextError, "second-registry"):
            self.discover()
        self.config = {"AZURE_CONTAINER_REGISTRY": "registry.azurecr.io"}
        self.assertEqual(self.discover()["values"]["AZURE_CONTAINER_REGISTRY"], "registry.azurecr.io")

    def test_missing_registry_stops_without_creation(self):
        self.data[REGISTRIES_URL]["value"] = []
        with self.assertRaisesRegex(stage.ContextError, "AZURE_CONTAINER_REGISTRY"):
            self.discover()

    def test_registry_login_server_pin_can_select_another_resource_group(self):
        self.data[REGISTRIES_URL]["value"][0]["id"] = (
            self.data[REGISTRIES_URL]["value"][0]["id"].replace("host-rg", "shared-rg"))
        self.config = {"ACR_LOGIN_SERVER": "registry.azurecr.io"}
        values = self.discover()["values"]
        self.assertEqual(values["ACR_LOGIN_SERVER"], "registry.azurecr.io")
        self.assertEqual(values["ACR_RESOURCE_GROUP"], "shared-rg")
        self.config["ACR_RESOURCE_GROUP"] = "shared-rg"
        self.assertEqual(self.discover()["values"]["ACR_RESOURCE_GROUP"], "shared-rg")
        self.config["ACR_RESOURCE_GROUP"] = "wrong-rg"
        with self.assertRaises(stage.ContextError):
            self.discover()
        self.config.pop("ACR_RESOURCE_GROUP")
        self.config["ACR_LOGIN_SERVER"] = "wrong.azurecr.io"
        with self.assertRaisesRegex(stage.ContextError, "AZURE_CONTAINER_REGISTRY"):
            self.discover()

    def test_registry_resource_group_pin_can_select_and_verify_shared_registry(self):
        self.data[REGISTRIES_URL]["value"][0]["id"] = (
            self.data[REGISTRIES_URL]["value"][0]["id"].replace("host-rg", "shared-rg"))
        self.config = {"ACR_RESOURCE_GROUP": "shared-rg"}
        values = self.discover()["values"]
        self.assertEqual(values["AZURE_RESOURCE_GROUP"], "host-rg")
        self.assertEqual(values["ACR_RESOURCE_GROUP"], "shared-rg")
        self.config["ACR_RESOURCE_GROUP"] = "wrong-rg"
        with self.assertRaisesRegex(stage.ContextError, "ACR_RESOURCE_GROUP"):
            self.discover()

    def test_observed_toolbox_endpoint_is_discovered_and_pin_verified(self):
        toolbox = "https://<account>.services.ai.azure.com/toolboxes/<toolbox>"
        self.data[stage.ARM + ACCOUNT_ID + "/projects"]["value"][0]["properties"]["endpoints"][
            "Toolbox API"] = toolbox
        self.assertEqual(self.discover()["values"]["FOUNDRY_TOOLBOX_ENDPOINT"], toolbox)
        self.config = {"FOUNDRY_TOOLBOX_ENDPOINT": toolbox + "-wrong"}
        with self.assertRaisesRegex(stage.ContextError, "FOUNDRY_TOOLBOX_ENDPOINT"):
            self.discover()

    def test_toolbox_endpoint_is_not_invented_and_missing_pinned_endpoint_stops(self):
        result = self.discover()
        self.assertNotIn("FOUNDRY_TOOLBOX_ENDPOINT", result["values"])
        self.assertTrue(any("toolbox readiness is unverified" in gap for gap in result["gaps"]))
        self.config = {"FOUNDRY_TOOLBOX_ENDPOINT": "https://example.com"}
        with self.assertRaisesRegex(stage.ContextError, "cannot be verified"):
            self.discover()

    def test_environment_selection_pins_and_candidates(self):
        second = deepcopy(self.data[ENVIRONMENTS_URL]["value"][0])
        second["name"] = "environment-two"
        second["properties"]["linkedEnvironmentMetadata"]["instanceUrl"] = "https://<other-org>.crm.dynamics.com"
        self.data[ENVIRONMENTS_URL]["value"].append(second)
        with self.assertRaisesRegex(stage.ContextError, "<other-org>.crm.dynamics.com"):
            self.discover()
        self.config = {"DATAVERSE_URL": DV + "/"}
        self.assertEqual(self.discover()["values"]["ENV_ID"], "environment-one")
        self.config["ENV_ID"] = "environment-two"
        with self.assertRaisesRegex(stage.ContextError, "ENV_ID"):
            self.discover()

    def test_environment_with_other_tenant_rejected(self):
        self.data[ENVIRONMENTS_URL]["value"][0]["properties"]["tenantId"] = "other"
        with self.assertRaisesRegex(stage.ContextError, "tenantId"):
            self.discover()

    def test_environments_without_dataverse_not_chosen(self):
        self.data[ENVIRONMENTS_URL]["value"][0]["properties"]["linkedEnvironmentMetadata"] = {}
        with self.assertRaisesRegex(stage.ContextError, "DATAVERSE_URL"):
            self.discover()

    def test_environment_url_must_be_an_origin_not_a_path(self):
        self.data[ENVIRONMENTS_URL]["value"][0]["properties"]["linkedEnvironmentMetadata"]["instanceUrl"] = (
            DV + "/unexpected-path")
        with self.assertRaisesRegex(stage.ContextError, "HTTPS origin"):
            self.discover()

    def test_solution_ambiguity_reports_publisher_and_prefix(self):
        self.data[SOLUTION_URL]["value"].append(
            {"solutionid": "two", "uniquename": "OtherSolution", "_publisherid_value": "publisher-one"})
        with self.assertRaisesRegex(stage.ContextError, "AgentPublisher"):
            self.discover()
        self.config = {"SOLUTION_NAME": "AgentSolution", "PUBLISHER_NAME": "AgentPublisher",
                       "PUBLISHER_PREFIX": "agent"}
        self.assertEqual(self.discover()["values"]["SOLUTION_NAME"], "AgentSolution")

    def test_default_solution_is_not_implicitly_selected(self):
        self.data[SOLUTION_URL]["value"][0]["uniquename"] = "Default"
        with self.assertRaisesRegex(stage.ContextError, "SOLUTION_NAME"):
            self.discover()

    def test_publisher_pin_verified_not_replaced(self):
        self.config = {"PUBLISHER_PREFIX": "wrong"}
        with self.assertRaisesRegex(stage.ContextError, "PUBLISHER_PREFIX"):
            self.discover()

    def test_verified_domain_subset_preserved(self):
        self.config = {"ORGANIZATION_INTERNAL_DOMAINS": "EXAMPLE.COM"}
        self.assertEqual(self.discover()["values"]["ORGANIZATION_INTERNAL_DOMAINS"], "EXAMPLE.COM")
        self.config["ORGANIZATION_INTERNAL_DOMAINS"] = "external.test"
        with self.assertRaisesRegex(stage.ContextError, "not verified"):
            self.discover()

    def test_missing_verified_domains_not_guessed_from_upn(self):
        self.data[stage.GRAPH + "/v1.0/organization?$select=id,verifiedDomains"]["value"][0]["verifiedDomains"] = []
        with self.assertRaisesRegex(stage.ContextError, "ORGANIZATION_INTERNAL_DOMAINS"):
            self.discover()

    def test_existing_non_japan_model_reused_even_when_retired_in_catalogue(self):
        self.data[ACCOUNTS_URL]["value"][1]["location"] = "swedencentral"
        self.data[stage.ARM + MODEL_ID + "/models"]["value"][0]["model"]["lifecycleStatus"] = "Deprecated"
        self.assertEqual(self.discover()["values"]["AZURE_OPENAI_DEPLOYMENT"], "brain")

    def test_multiple_chat_models_require_endpoint_or_deployment_pin(self):
        self.data[stage.ARM + MODEL_ID + "/deployments"]["value"].append(deployment("another"))
        with self.assertRaisesRegex(stage.ContextError, "another"):
            self.discover()
        self.config = {"AZURE_OPENAI_DEPLOYMENT": "brain"}
        self.assertEqual(self.discover()["status"], "ready")

    def test_pinned_model_endpoint_verified(self):
        self.config = {"AZURE_OPENAI_ENDPOINT": "https://wrong.openai.azure.com"}
        with self.assertRaisesRegex(stage.ContextError, "AZURE_OPENAI_ENDPOINT"):
            self.discover()

    def test_pinned_embedding_deployment_is_not_reused_or_replaced(self):
        self.data[stage.ARM + MODEL_ID + "/models"]["value"][0]["model"]["capabilities"] = {"embeddings": "true"}
        self.config = {"AZURE_OPENAI_DEPLOYMENT": "brain"}
        with self.assertRaisesRegex(stage.ContextError, "not a verified successful chat model"):
            self.discover()

    def test_pinned_failed_deployment_is_not_reused(self):
        self.data[stage.ARM + MODEL_ID + "/deployments"]["value"][0]["properties"]["provisioningState"] = "Failed"
        self.config = {"AZURE_OPENAI_DEPLOYMENT": "brain"}
        with self.assertRaisesRegex(stage.ContextError, "successful chat model"):
            self.discover()

    def test_explicit_selection_cannot_replace_existing_model(self):
        self.explicit_model()
        self.args.model_version = "different-version"
        with self.assertRaisesRegex(stage.ContextError, "existing deployment version"):
            self.discover()

    def test_existing_judge_deployment_preserved_and_verified_on_same_endpoint(self):
        self.data[stage.ARM + MODEL_ID + "/deployments"]["value"].append(deployment("judge"))
        self.config = {"AZURE_OPENAI_DEPLOYMENT": "brain", "EVALUATION_JUDGE_DEPLOYMENT": "judge"}
        self.assertEqual(self.discover()["values"]["EVALUATION_JUDGE_DEPLOYMENT"], "judge")
        self.config["EVALUATION_JUDGE_DEPLOYMENT"] = "missing-judge"
        with self.assertRaisesRegex(stage.ContextError, "EVALUATION_JUDGE_DEPLOYMENT"):
            self.discover()

    def test_no_model_queries_live_japan_location_catalogue_and_exposes_candidates(self):
        self.no_existing_model()
        result = self.discover()
        self.assertEqual(result["status"], "model-selection-required")
        self.assertEqual({item["location"] for item in result["model_candidates"]}, set(stage.JAPAN))
        self.assertIsNone(result["model_deployment"])
        self.assertNotIn("AZURE_OPENAI_DEPLOYMENT", result["values"])
        for method, url, kwargs in self.transport.calls:
            if "/locations/" in url:
                self.assertEqual(kwargs["params"]["api-version"], stage.MODEL_VERSION)
        self.assertFalse(any(method == "put" for method, _, _ in self.transport.calls))

    def test_partial_selection_does_not_authorize_model_creation(self):
        self.no_existing_model()
        self.args.model = "chat-model"
        self.assertIsNone(self.discover()["model_deployment"])

    def test_new_model_plan_is_explicit_and_host_location_not_moved(self):
        self.no_existing_model()
        self.explicit_model()
        result = self.discover()
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["values"]["AZURE_LOCATION"], "eastus2")
        self.assertEqual(result["values"]["AZURE_OPENAI_DEPLOYMENT"], "chat-model")
        create = result["model_deployment"]
        self.assertEqual(create["body"]["properties"]["model"]["version"], "2026-10-01")
        self.assertEqual(create["body"]["sku"], {"name": "GlobalStandard", "capacity": 1})
        self.assertIn(MODEL_ID, create["url"])
        self.assertFalse(any(method == "put" for method, _, _ in self.transport.calls))

    def test_japan_west_fallback_does_not_move_hosted_project(self):
        self.no_existing_model()
        self.explicit_model()
        self.data[ACCOUNTS_URL]["value"][1]["location"] = "japanwest"
        self.assertEqual(self.discover()["values"]["AZURE_LOCATION"], "eastus2")

    def test_missing_japan_account_does_not_create_speculative_infrastructure(self):
        self.no_existing_model()
        self.explicit_model()
        self.data[ACCOUNTS_URL]["value"][1]["location"] = "eastus2"
        with self.assertRaisesRegex(stage.ContextError, "No account/project/registry was created or moved"):
            self.discover()

    def test_explicit_non_japan_model_region_honored(self):
        self.no_existing_model()
        self.explicit_model()
        self.args.model_location = "swedencentral"
        self.data[ACCOUNTS_URL]["value"][1]["location"] = "swedencentral"
        self.data[ROOT + "/providers/Microsoft.CognitiveServices/locations/swedencentral/models"] = {"value": [model()]}
        self.assertEqual(self.discover()["status"], "ready")

    def test_nonexistent_explicit_model_rejected_with_real_candidates(self):
        self.no_existing_model()
        self.explicit_model()
        self.args.model = "invented-latest-model"
        with self.assertRaisesRegex(stage.ContextError, "chat-model"):
            self.discover()

    def test_empty_model_catalogue_reports_prerequisite(self):
        self.no_existing_model()
        for location in stage.JAPAN:
            self.data[ROOT + "/providers/Microsoft.CognitiveServices/locations/" + location + "/models"] = {"value": []}
        with self.assertRaisesRegex(stage.ContextError, "no deployable chat-capable"):
            self.discover()

    def test_existing_non_chat_name_collision_never_overwritten(self):
        self.data[stage.ARM + MODEL_ID + "/models"]["value"][0]["model"]["capabilities"] = {"embeddings": "true"}
        self.data[stage.ARM + MODEL_ID + "/deployments"]["value"][0]["name"] = "chat-model"
        self.data[stage.ARM + MODEL_ID + "/deployments"]["value"][0]["id"] = MODEL_ID + "/deployments/chat-model"
        self.explicit_model()
        with self.assertRaisesRegex(stage.ContextError, "refusing an implicit replacement"):
            self.discover()


class ModelMetadataTests(unittest.TestCase):
    def test_actual_nested_schema_not_wrapper_sku(self):
        result = stage.model_candidates([model()], "japaneast")
        self.assertEqual(result[0]["sku"], "GlobalStandard")
        self.assertEqual(result[0]["capacity"], 1)
        self.assertTrue(result[0]["latest"])

    def test_latest_is_per_model_and_sku_using_metadata_not_static_name(self):
        old = model(version="2026-01-01")
        recent = model(version="2026-10-01")
        result = stage.model_candidates([old, recent, model(name="different-model")], "japaneast")
        self.assertEqual({item["name"] for item in result if item["latest"]}, {"chat-model", "different-model"})
        self.assertFalse(next(item for item in result if item["version"] == "2026-01-01")["latest"])

    def test_natural_versions_handle_9_and_10_without_metadata_dates(self):
        result = stage.model_candidates([model(version="9", systemData={}),
                                         model(version="10", systemData={})], "japaneast")
        self.assertEqual(next(item["version"] for item in result if item["latest"]), "10")

    def test_no_chat_no_inference_deprecated_retired_and_no_capacity_filtered(self):
        variants = [
            model(capabilities={"completion": "true"}),
            model(capabilities={"chatCompletion": "true", "inference": "false"}),
            model(lifecycleStatus="Deprecated"),
            model(lifecycleStatus="Deprecating"),
            model(deprecation={"inference": "2000-01-01T00:00:00Z"}),
            model(deprecation={"inference": "invalid"}),
            model(skus=[]),
            model(skus=[{"name": "GlobalStandard", "capacity": {"minimum": 1, "maximum": 0}}]),
            model(skus=[{"name": "GlobalStandard", "deprecationDate": "2000-01-01T00:00:00Z"}]),
            model(format="Other"),
            model(maxCapacity=0),
            model(version=""),
        ]
        for entry in variants:
            with self.subTest(entry=entry):
                self.assertEqual(stage.model_candidates([entry], "japaneast"), [])

    def test_capacity_allowed_values_and_step_respected(self):
        for capacity in ({"minimum": 2, "default": 3, "step": 2},
                         {"minimum": 1, "default": 3, "allowedValues": [1, 2]}):
            with self.subTest(capacity=capacity):
                entry = model(skus=[{"name": "Standard", "capacity": capacity}])
                self.assertEqual(stage.model_candidates([entry], "japaneast"), [])

    def test_real_capability_booleans_and_future_retirement_supported(self):
        entry = model(capabilities={"ChatCompletion": True, "inference": True},
                      deprecation={"inference": "2999-01-01T00:00:00Z"})
        self.assertEqual(len(stage.model_candidates([entry], "japaneast")), 1)


class MetadataTransportTests(unittest.TestCase):
    def setUp(self):
        self.helper = MagicMock()
        self.helper.get_token.return_value = jwt()
        self.transport = Transport({})
        self.helper.get_session.return_value = self.transport
        self.api = stage.Metadata(self.helper, {})

    def test_tokens_not_output_or_returned_and_helper_sessions_reused(self):
        self.transport.data[stage.ARM + "/items"] = {"value": []}
        self.api.listing(stage.ARM + "/items", stage.ARM + "/.default", "version")
        self.api.listing(stage.ARM + "/items", stage.ARM + "/.default", "version")
        self.helper.get_token.assert_called_once_with(scope=stage.ARM + "/.default")
        self.helper.get_session.assert_called_once_with(scope=stage.ARM + "/.default")
        self.helper.authenticate.assert_not_called()

    def test_initial_graph_bootstrap_is_cache_first_and_task_authorized_once(self):
        self.transport.data[stage.GRAPH + "/me"] = {"id": "owner-one"}
        self.transport.data[stage.ARM + "/items"] = {"value": []}
        self.api.get(stage.GRAPH + "/me", stage.GRAPH + "/.default")
        self.api.get(stage.GRAPH + "/me", stage.GRAPH + "/.default")
        self.api.get(stage.ARM + "/items", stage.ARM + "/.default")
        self.assertEqual(self.helper.get_token.call_args_list[0].kwargs,
                         {"scope": stage.GRAPH + "/.default", "allow_interactive": True})
        self.assertEqual(self.helper.get_token.call_args_list[1].kwargs,
                         {"scope": stage.ARM + "/.default"})
        self.assertEqual(self.helper.get_token.call_count, 2)
        self.helper.authenticate.assert_not_called()

    def test_token_scope_cannot_switch_account_or_tenant(self):
        for identity in (jwt(owner="other-owner"), jwt(tenant="other-tenant")):
            with self.subTest(identity=identity):
                self.api = stage.Metadata(self.helper, {})
                self.helper.get_token.side_effect = [jwt(), identity]
                self.api.session(stage.GRAPH + "/.default")
                with self.assertRaisesRegex(stage.ContextError, "boundaries"):
                    self.api.session(stage.ARM + "/.default")

    def test_pagination_arm_and_odata(self):
        for link in ("nextLink", "@odata.nextLink"):
            with self.subTest(link=link):
                self.transport.data = {
                    stage.ARM + "/one": {"value": [{"name": "one"}], link: stage.ARM + "/two?skip=2"},
                    stage.ARM + "/two?skip=2": {"value": [{"name": "two"}]},
                }
                items = self.api.listing(stage.ARM + "/one", stage.ARM + "/.default", "version")
                self.assertEqual(len(items), 2)
                self.assertNotIn("params", self.transport.calls[-1][2])

    def test_unsafe_pagination_and_cycles_rejected_without_forwarding_token(self):
        for next_link in ("https://attacker.test/steal", "http://management.azure.com/two",
                          stage.ARM + "/one"):
            with self.subTest(next_link=next_link):
                self.transport.data[stage.ARM + "/one"] = {"value": [], "nextLink": next_link}
                self.transport.calls.clear()
                with self.assertRaisesRegex(stage.ContextError, "pagination"):
                    self.api.listing(stage.ARM + "/one", stage.ARM + "/.default")
                self.assertEqual(len(self.transport.calls), 1)

    def test_http_errors_do_not_leak_response_body(self):
        self.transport.data[stage.ARM + "/one"] = Response({"access_token": "never-print-this"}, 403)
        with self.assertRaisesRegex(stage.ContextError, "HTTP 403") as result:
            self.api.get(stage.ARM + "/one", stage.ARM + "/.default")
        self.assertNotIn("never-print-this", str(result.exception))

    def test_invalid_token_identity_fails_closed(self):
        for token in ("opaque", "a.e30.b", "a.###.b"):
            with self.subTest(token=token):
                with self.assertRaises(stage.ContextError):
                    stage.token_identity(token)


class FileAndCliTests(unittest.TestCase):
    def setUp(self):
        # Deliberately use a project-local directory, never the shared OS temp directory.
        self.directory = Path.cwd() / (".first-stage-tests-" + uuid.uuid4().hex)
        self.directory.mkdir()
        self.path = self.directory / ".env"
        self.addCleanup(shutil.rmtree, self.directory)

    def write(self, text):
        self.path.write_text(text, encoding="utf-8")
        return text

    def test_dotenv_literal_export_comment_quotes_and_no_global_mutation(self):
        self.write("# note\nexport TENANT_ID='tenant-one' # comment\nAZURE_LOCATION=japaneast # comment\n"
                   'PUBLISHER_NAME="Publisher Name"\n')
        with patch.dict(os.environ, {"TENANT_ID": "inherited"}, clear=True):
            config = stage.configuration(self.path)
            self.assertEqual(config["TENANT_ID"], "tenant-one")
            self.assertEqual(config["AZURE_LOCATION"], "japaneast")
            self.assertEqual(config["PUBLISHER_NAME"], "Publisher Name")
            self.assertEqual(os.environ["TENANT_ID"], "inherited")

    def test_conflicting_aliases_duplicate_placeholders_and_malformed_values_stop(self):
        for text in ("TENANT_ID=a\nAZURE_TENANT_ID=b\n",
                     "FOUNDRY_ACCOUNT_NAME=a\nAZURE_AI_ACCOUNT=b\n",
                     "ENV_ID=a\nENV_ID=b\n",
                     "ENV_ID=${UNRESOLVED}\n",
                     "ENV_ID='unclosed\n",
                     "not an assignment\n"):
            with self.subTest(text=text):
                self.write(text)
                with patch.dict(os.environ, {}, clear=True), self.assertRaises(stage.ContextError):
                    stage.configuration(self.path)

    def test_foundry_aliases_are_reused(self):
        self.write("AZURE_AI_ACCOUNT=host\nAZURE_AI_PROJECT=project\n")
        with patch.dict(os.environ, {}, clear=True):
            config = stage.configuration(self.path)
        self.assertEqual(config["FOUNDRY_ACCOUNT_NAME"], "host")
        self.assertEqual(config["FOUNDRY_PROJECT_NAME"], "project")

    def test_persistence_preserves_secrets_comments_and_pins(self):
        original = self.write("# comment\nSECRET=local-only\nAZURE_LOCATION='EastUS2' # preserve\nENV_ID=\n")
        stage.persist(self.path, {"AZURE_LOCATION": "EastUS2", "ENV_ID": "environment-one",
                                  "SOLUTION_NAME": "AgentSolution"}, original)
        text = self.path.read_text(encoding="utf-8")
        self.assertIn("SECRET=local-only\n", text)
        self.assertIn("AZURE_LOCATION='EastUS2' # preserve\n", text)
        self.assertEqual(stage.read_env(self.path)["ENV_ID"], "environment-one")
        self.assertFalse(self.path.with_name(".env.first-stage-pending").exists())

    def test_persistence_is_idempotent_and_does_not_serialize_tokens(self):
        original = self.write("SECRET=local-only\n")
        values = {"TENANT_ID": "tenant-one", "AGENT_OWNER_UPN": "owner@example.com"}
        stage.persist(self.path, values, original)
        once = self.path.read_text(encoding="utf-8")
        stage.persist(self.path, values, once)
        self.assertEqual(self.path.read_text(encoding="utf-8"), once)
        self.assertNotIn("access_token", once)

    def test_persistence_rejects_secret_keys_newlines_and_conflicting_pins(self):
        original = self.write("ENV_ID=original\n")
        for values in ({"ACCESS_TOKEN": "secret"}, {"ENV_ID": "other"}, {"ENV_ID": "bad\nline"}):
            with self.subTest(values=values), self.assertRaises(stage.ContextError):
                stage.persist(self.path, values, original)
            self.assertEqual(self.path.read_text(encoding="utf-8"), original)

    def test_concurrent_file_edit_is_not_overwritten(self):
        original = self.write("ENV_ID=one\n")
        self.write("ENV_ID=two\n")
        with self.assertRaisesRegex(stage.ContextError, "changed during"):
            stage.persist(self.path, {"TENANT_ID": "tenant-one"}, original)
        self.assertEqual(self.path.read_text(encoding="utf-8"), "ENV_ID=two\n")

    def test_new_file_and_parent_can_be_created_after_verification(self):
        target = self.directory / "child" / ".env"
        stage.persist(target, {"TENANT_ID": "tenant-one"}, None)
        self.assertEqual(stage.read_env(target), {"TENANT_ID": "tenant-one"})

    def mocked_auth(self, helper):
        @contextmanager
        def auth(config):
            yield helper
        return auth

    def run_main(self, data=None, extra=(), token=None):
        transport = Transport(data if data is not None else fixture())
        helper = MagicMock()
        helper.get_token.return_value = token or jwt()
        helper.get_session.return_value = transport
        output, error = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {}, clear=True), patch.object(
                stage, "standard_auth", self.mocked_auth(helper)), redirect_stdout(output), redirect_stderr(error):
            code = stage.main(["--env", str(self.path), *extra])
        return code, output.getvalue(), error.getvalue(), transport

    def test_default_cli_is_read_only_plan(self):
        original = self.write("# file\nSECRET=local-only\n")
        code, output, error, transport = self.run_main()
        self.assertEqual(code, 0, error)
        self.assertEqual(json.loads(output)["mode"], "dry-run")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)
        self.assertNotIn("local-only", output)
        self.assertFalse(any(method == "put" for method, _, _ in transport.calls))

    def test_execute_writes_discovered_nonsecret_values(self):
        code, output, error, transport = self.run_main(extra=("--execute",))
        self.assertEqual(code, 0, error)
        self.assertEqual(set(stage.read_env(self.path)), set(stage.OUTPUT_KEYS) - {"FOUNDRY_TOOLBOX_ENDPOINT"})
        self.assertNotIn(jwt(), self.path.read_text(encoding="utf-8"))
        self.assertNotIn(jwt(), output)
        self.assertFalse(any(method == "put" for method, _, _ in transport.calls))

    def test_execute_authorizes_continuing_browser_consent_with_existing_profile(self):
        self.write("PP_AUTH_EDGE_PROFILE='Profile 2'\nPP_AUTH_ALLOW_INTERACTIVE=false\n")
        code, output, error, _ = self.run_main(extra=("--execute",))
        self.assertEqual(code, 0, error)
        values = stage.read_env(self.path)
        self.assertEqual(values["PP_AUTH_ALLOW_INTERACTIVE"], "true")
        self.assertEqual(values["PP_AUTH_ACCOUNT"], "owner@example.com")
        self.assertEqual(values["PP_AUTH_EDGE_PROFILE"], "Profile 2")
        self.assertTrue(json.loads(output)["authentication"]["persist_interactive_consent"])

    def test_dry_run_with_profile_does_not_persist_consent(self):
        original = self.write("PP_AUTH_EDGE_PROFILE=Default\nPP_AUTH_ALLOW_INTERACTIVE=false\n")
        code, output, error, _ = self.run_main()
        self.assertEqual(code, 0, error)
        self.assertFalse(json.loads(output)["authentication"]["persist_interactive_consent"])
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)

    def test_execute_without_profile_reports_gap_and_does_not_invent_profile(self):
        code, output, error, _ = self.run_main(extra=("--execute",))
        self.assertEqual(code, 0, error)
        self.assertFalse(json.loads(output)["authentication"]["persist_interactive_consent"])
        self.assertTrue(any("Continuing browser consent was not saved" in gap
                            for gap in json.loads(output)["gaps"]))
        values = stage.read_env(self.path)
        self.assertNotIn("PP_AUTH_EDGE_PROFILE", values)
        self.assertNotIn("PP_AUTH_ALLOW_INTERACTIVE", values)

    def test_consent_saving_honors_ci_and_requires_execute_and_profile(self):
        config = {"PP_AUTH_EDGE_PROFILE": "Default", "PP_AUTH_MODE": "browser"}
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(stage.interactive_consent(config, True))
            self.assertFalse(stage.interactive_consent(config, False))
            self.assertFalse(stage.interactive_consent({}, True))
            self.assertFalse(stage.interactive_consent({"PP_AUTH_EDGE_PROFILE": "guessed"}, True))
        for variable in ("CI", "GITHUB_ACTIONS", "TF_BUILD"):
            with self.subTest(variable=variable), patch.dict(os.environ, {variable: "true"}, clear=True):
                self.assertFalse(stage.interactive_consent(config, True))

    def test_consent_does_not_allow_overwriting_pinned_account_or_profile(self):
        original = self.write("PP_AUTH_ACCOUNT=pinned@example.com\nPP_AUTH_EDGE_PROFILE=Default\n")
        with self.assertRaises(stage.ContextError):
            stage.persist(self.path, {"PP_AUTH_ACCOUNT": "other@example.com"}, original,
                          allow_interactive_consent=True, approved_edge_profile="Default")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)
        with self.assertRaises(stage.ContextError):
            stage.persist(self.path, {"PP_AUTH_ACCOUNT": "pinned@example.com"}, original,
                          allow_interactive_consent=True, approved_edge_profile="Profile 2")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)

    def test_execute_missing_model_stops_nonzero_and_does_not_partially_write(self):
        data = fixture()
        data[stage.ARM + MODEL_ID + "/deployments"] = {"value": []}
        original = self.write("# unchanged\n")
        code, output, error, transport = self.run_main(data, ("--execute",))
        self.assertEqual(code, 2)
        self.assertEqual(json.loads(output)["status"], "model-selection-required")
        self.assertIn("--model NAME --model-version VERSION --model-sku SKU", error)
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)
        self.assertFalse(any(method == "put" for method, _, _ in transport.calls))

    def test_explicit_model_dry_run_does_not_put_or_write(self):
        data = fixture()
        data[stage.ARM + MODEL_ID + "/deployments"] = {"value": []}
        flags = ("--model", "chat-model", "--model-version", "2026-10-01", "--model-sku", "GlobalStandard")
        code, output, error, transport = self.run_main(data, flags)
        self.assertEqual(code, 0, error)
        self.assertIsNotNone(json.loads(output)["model_deployment"])
        self.assertFalse(self.path.exists())
        self.assertFalse(any(method == "put" for method, _, _ in transport.calls))

    def test_execute_explicit_model_put_and_readback_before_persistence(self):
        data = fixture()
        data[stage.ARM + MODEL_ID + "/deployments"] = {"value": []}
        data[stage.ARM + MODEL_ID + "/deployments/chat-model"] = Response({}, 404)
        flags = ("--execute", "--model", "chat-model", "--model-version", "2026-10-01",
                 "--model-sku", "GlobalStandard")
        code, output, error, transport = self.run_main(data, flags)
        self.assertEqual(code, 0, error)
        self.assertEqual(stage.read_env(self.path)["AZURE_OPENAI_DEPLOYMENT"], "chat-model")
        writes = [(url, kwargs) for method, url, kwargs in transport.calls if method == "put"]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0][1]["json"]["properties"]["model"]["version"], "2026-10-01")

    def test_ambiguous_cli_stops_nonzero_and_reports_candidates(self):
        data = fixture()
        data[ENVIRONMENTS_URL]["value"].append(
            {"name": "second-env", "properties": {"linkedEnvironmentMetadata": {
                "instanceUrl": "https://<second-org>.crm.dynamics.com"}}})
        code, output, error, _ = self.run_main(data, ("--execute",))
        self.assertEqual(code, 2)
        self.assertIn("second-env", error)
        self.assertFalse(self.path.exists())

    def test_unexpected_auth_errors_sanitized_no_token_or_secret_output(self):
        output, error = io.StringIO(), io.StringIO()
        with (patch.dict(os.environ, {}, clear=True),
              patch.object(stage, "standard_auth", side_effect=RuntimeError("secret=do-not-log")),
              redirect_stdout(output), redirect_stderr(error)):
            code = stage.main(["--env", str(self.path)])
        self.assertEqual(code, 1)
        self.assertNotIn("do-not-log", output.getvalue() + error.getvalue())
        self.assertFalse(self.path.exists())

    def test_auth_import_occurs_after_explicit_env_and_is_restored(self):
        seen = {}

        def load(module):
            seen.update({key: os.environ.get(key) for key in ("TENANT_ID", "DATAVERSE_URL",
                        "PP_AUTH_ACCOUNT", "PYTHON_DOTENV_DISABLED", "PAC_AUTH_PROFILE")})
            return object()

        with patch.dict(os.environ, {"TENANT_ID": "shell-tenant", "DATAVERSE_URL": "shell-url",
                                     "PAC_AUTH_PROFILE": "unrelated"}, clear=True), patch.dict(
                sys.modules), patch.object(stage.importlib, "import_module", side_effect=load):
            sys.modules.pop("auth_helper", None)
            with stage.standard_auth({"AZURE_TENANT_ID": "file-tenant", "PP_AUTH_ACCOUNT": "owner@example.com"}):
                pass
            self.assertEqual(os.environ["TENANT_ID"], "shell-tenant")
            self.assertEqual(os.environ["DATAVERSE_URL"], "shell-url")
        self.assertEqual(seen["TENANT_ID"], "file-tenant")
        self.assertIsNone(seen["DATAVERSE_URL"])
        self.assertEqual(seen["PP_AUTH_ACCOUNT"], "owner@example.com")
        self.assertEqual(seen["PYTHON_DOTENV_DISABLED"], "1")
        self.assertIsNone(seen["PAC_AUTH_PROFILE"])

    def test_no_reconfiguration_of_already_imported_auth_helper(self):
        with patch.dict(sys.modules, {"auth_helper": object()}):
            with self.assertRaisesRegex(stage.ContextError, "fresh Python process"):
                with stage.standard_auth({}):
                    self.fail("Must not reuse helper imported with unrelated config")


class CreateModelTests(unittest.TestCase):
    def setUp(self):
        self.url = stage.ARM + MODEL_ID + "/deployments/new"
        self.create = {"url": self.url, "api_version": stage.MODEL_VERSION, "body": {
            "sku": {"name": "GlobalStandard", "capacity": 1},
            "properties": {"model": {"format": "OpenAI", "name": "chat-model", "version": "2026-10-01"}}}}
        self.transport = Transport({self.url: Response({}, 404)})
        self.helper = MagicMock()
        self.helper.get_token.return_value = jwt()
        self.helper.get_session.return_value = self.transport
        self.api = stage.Metadata(self.helper, {})

    def test_creation_requires_verified_absence(self):
        for status in (200, 403, 500):
            with self.subTest(status=status):
                self.transport.data[self.url] = Response({}, status)
                with self.assertRaisesRegex(stage.ContextError, "refusing PUT"):
                    stage.create_model(self.api, self.create)
        self.assertFalse(any(method == "put" for method, _, _ in self.transport.calls))

    def test_create_and_readback(self):
        stage.create_model(self.api, self.create)
        self.assertEqual([method for method, _, _ in self.transport.calls], ["get", "put", "get"])

    def test_creation_failure_no_silent_success(self):
        with patch.object(self.api, "request", return_value={}), patch.object(
                self.api, "get", return_value={"properties": {"provisioningState": "Failed"}}):
            with self.assertRaisesRegex(stage.ContextError, "failed or timed out"):
                stage.create_model(self.api, self.create)

    def test_creation_readback_must_match_exact_model_and_sku(self):
        for field in ("version", "sku"):
            with self.subTest(field=field):
                actual = deepcopy(self.create["body"])
                actual["properties"]["provisioningState"] = "Succeeded"
                if field == "sku":
                    actual["sku"]["name"] = "Standard"
                else:
                    actual["properties"]["model"]["version"] = "other"
                with patch.object(self.api, "request", return_value={}), patch.object(
                        self.api, "get", return_value=actual), self.assertRaisesRegex(
                            stage.ContextError, "read-back differs"):
                    stage.create_model(self.api, self.create)

    def test_pending_creation_polls_bounded_then_verifies(self):
        actual = deepcopy(self.create["body"])
        actual["properties"]["provisioningState"] = "Succeeded"
        with patch.object(self.api, "request", return_value={}), patch.object(
                self.api, "get", side_effect=[{"properties": {"provisioningState": "Creating"}}, actual]), patch.object(
                stage.time, "sleep") as sleep:
            stage.create_model(self.api, self.create)
        sleep.assert_called_once_with(5)


if __name__ == "__main__":
    unittest.main()
