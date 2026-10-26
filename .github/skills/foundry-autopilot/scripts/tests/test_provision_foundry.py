"""New/public Foundry bootstrap tests; all Azure traffic is mocked."""

from contextlib import contextmanager, redirect_stderr, redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import provision_foundry as infra
from test_prepare_first_stage import fixture, jwt, Response, Transport, ROOT


class InfrastructureTransport(Transport):
    def __init__(self):
        super().__init__(fixture())
        self.data[ROOT + "/providers/Microsoft.Authorization/roleDefinitions"] = {"value": [{
            "id": "/subscriptions/sub-one/providers/Microsoft.Authorization/roleDefinitions/foundry-user",
            "properties": {"roleName": "Foundry User"},
        }]}
        self.state = "Succeeded"
        self.project_endpoint = "https://created.services.ai.azure.com/api/projects/teammate"
        self.on_group_creation = None

    def get(self, url, **kwargs):
        self.calls.append(("get", url, kwargs))
        resource = self.data.get(url, Response(status=404))
        return resource if isinstance(resource, Response) else Response(resource)

    def put(self, url, **kwargs):
        self.calls.append(("put", url, kwargs))
        body = deepcopy(kwargs["json"])
        if "/providers/Microsoft.Resources/deployments/" not in url:
            self.data[url] = body
            if self.on_group_creation:
                self.on_group_creation()
            return Response(body)
        parameters = {key: item["value"] for key, item in body["properties"]["parameters"].items()}
        group_root = url.split("/providers/Microsoft.Resources/")[0]
        targets = infra.resource_targets(
            ROOT, group_root.rsplit("/", 1)[1], parameters["accountName"],
            parameters["projectName"], parameters["registryName"],
        )
        for kind, (target, _) in targets.items():
            if kind == "group":
                continue
            resource = {
                "id": target.removeprefix(infra.ARM),
                "kind": "AIServices", "location": parameters["location"],
                "tags": {infra.TAG: parameters["bootstrapId"]},
                "properties": {
                    "provisioningState": "Succeeded", "publicNetworkAccess": "Enabled",
                    "adminUserEnabled": False, "disableLocalAuth": True,
                    "allowProjectManagement": True, "networkAcls": {"defaultAction": "Allow"},
                    "loginServer": "created.azurecr.io",
                },
            }
            if kind == "project":
                resource["properties"]["endpoints"] = {"AI Foundry API": self.project_endpoint}
            self.data[target] = resource
        self.data[url] = {"properties": {"provisioningState": self.state,
                                        "error": {"code": "RequestDisallowedByPolicy"}}}
        return Response(self.data[url])


class ProvisionFoundryTests(unittest.TestCase):
    def setUp(self):
        self.transport = InfrastructureTransport()
        self.helper = MagicMock()
        self.helper.get_token.return_value = jwt()
        self.helper.get_session.return_value = self.transport
        self.api = infra.Metadata(self.helper, {})

    def plan(self, config=None, execute=False, agent="sample-colleague", group_mode="new"):
        return infra.provision(self.api, config or {}, agent, infra.TEMPLATE,
                               group_mode=group_mode, execute=execute)

    def writes(self):
        return [(url, kwargs) for method, url, kwargs in self.transport.calls if method == "put"]

    def test_dry_run_is_read_only_and_defaults_to_new_japan_public_foundation(self):
        result = self.plan()
        self.assertEqual(result["mode"], "new-public")
        self.assertEqual(result["location"], "japaneast")
        self.assertEqual(set(result["create"]),
                         {"group", "account", "project", "registry", "workspace", "insights"})
        self.assertEqual(self.writes(), [])
        self.assertNotIn("values", result)

    def test_create_and_readback_do_not_invent_endpoints_or_use_other_logins(self):
        result = self.plan(execute=True)
        self.assertEqual(result["values"]["FOUNDRY_PROJECT_ENDPOINT"], self.transport.project_endpoint)
        self.assertEqual(result["values"]["ACR_LOGIN_SERVER"], "created.azurecr.io")
        self.assertEqual(result["values"]["AZURE_AI_ACCOUNT"], result["values"]["FOUNDRY_ACCOUNT_NAME"])
        self.assertEqual(len(self.writes()), 2)
        body = self.writes()[1][1]["json"]["properties"]
        self.assertEqual(body["mode"], "Incremental")
        self.helper.authenticate.assert_not_called()
        self.assertNotIn(jwt(), json.dumps(result))

    def test_template_is_public_keyless_and_has_no_private_network_infrastructure(self):
        template = json.loads(infra.TEMPLATE.read_text())
        resources = {item["type"]: item for item in template["resources"]
                     if item["type"] != "Microsoft.Authorization/roleAssignments"}
        account = resources["Microsoft.CognitiveServices/accounts"]["properties"]
        self.assertEqual(account["publicNetworkAccess"], "Enabled")
        self.assertTrue(account["disableLocalAuth"])
        self.assertTrue(account["allowProjectManagement"])
        registry = resources["Microsoft.ContainerRegistry/registries"]["properties"]
        self.assertFalse(registry["adminUserEnabled"])
        self.assertEqual(registry["publicNetworkAccess"], "Enabled")
        self.assertFalse(any("Microsoft.Network/" in kind for kind in resources))
        self.assertIn("Microsoft.CognitiveServices/accounts/projects/connections", resources)
        roles = [item for item in template["resources"]
                 if item["type"] == "Microsoft.Authorization/roleAssignments"]
        self.assertEqual(len(roles), 4)
        self.assertEqual(len(template["variables"]["monitoringRoles"]), 3)
        self.assertIn("a97b65f3-24c7-4388-baec-2e87135dc908", json.dumps(roles))
        self.assertNotIn("listKeys", json.dumps(template))

    def test_owned_foundation_can_be_redeployed_without_new_names(self):
        first = self.plan(execute=True)
        self.transport.calls.clear()
        second = self.plan(first["values"], execute=True)
        self.assertEqual(second["resources"], first["resources"])
        self.assertEqual(second["create"], [])
        self.assertEqual(len(self.writes()), 1)

    def test_foreign_existing_account_is_not_adopted_or_overwritten(self):
        result = self.plan(execute=True)
        account = infra.ARM + result["resources"]["account"]
        self.transport.data[account]["tags"] = {}
        self.transport.calls.clear()
        with self.assertRaisesRegex(infra.ContextError, "not owned"):
            self.plan(execute=True)
        self.assertEqual(self.writes(), [])

    def test_existing_group_is_confirmed_but_only_new_resources_are_deployed_inside_it(self):
        group_url = ROOT + "/resourceGroups/confirmed-rg"
        original = {"location": "westus", "tags": {"unrelated": "keep"}}
        self.transport.data[group_url] = original
        result = self.plan({"AZURE_RESOURCE_GROUP": "confirmed-rg"},
                           group_mode="existing", execute=True)
        self.assertEqual(self.transport.data[group_url], original)
        self.assertEqual(len(self.writes()), 1)
        self.assertEqual(result["resource_group_mode"], "existing")
        self.assertTrue(all("/resourceGroups/confirmed-rg" in resource
                            for resource in result["resources"].values()))

    def test_new_group_cannot_adopt_an_existing_group_and_existing_cannot_create_missing(self):
        group_url = ROOT + "/resourceGroups/confirmed-rg"
        with self.assertRaisesRegex(infra.ContextError, "required"):
            self.plan(group_mode="existing", execute=True)
        with self.assertRaisesRegex(infra.ContextError, "not found"):
            self.plan({"AZURE_RESOURCE_GROUP": "confirmed-rg"}, group_mode="existing", execute=True)
        self.transport.data[group_url] = {"location": "japaneast", "tags": {}}
        with self.assertRaisesRegex(infra.ContextError, "already exists"):
            self.plan({"AZURE_RESOURCE_GROUP": "confirmed-rg"}, execute=True)
        self.assertEqual(self.writes(), [])

    def test_unconfirmed_group_mode_never_contacts_azure(self):
        with self.assertRaisesRegex(infra.ContextError, "Confirm"):
            self.plan(group_mode="", execute=True)
        self.assertEqual(self.transport.calls, [])

    def test_acr_and_models_cannot_use_other_groups_or_existing_accounts(self):
        for config in ({"ACR_RESOURCE_GROUP": "other-rg"},
                       {"AZURE_OPENAI_RESOURCE_GROUP": "other-rg"},
                       {"AZURE_OPENAI_ACCOUNT": "existing-model-account"},
                       {"AZURE_OPENAI_ENDPOINT": "https://other.openai.azure.com"}):
            with self.subTest(config=config), self.assertRaises(infra.ContextError):
                self.plan(config, execute=True)
        self.assertEqual(self.writes(), [])

    def test_owned_security_drift_is_not_automatically_weakened(self):
        for kind, key, value in (
            ("account", "publicNetworkAccess", "Disabled"),
            ("account", "disableLocalAuth", False),
            ("account", "networkAcls", {"defaultAction": "Deny"}),
            ("registry", "adminUserEnabled", True),
            ("registry", "publicNetworkAccess", "Disabled"),
        ):
            with self.subTest(kind=kind, key=key):
                result = self.plan(execute=True)
                target = infra.ARM + result["resources"][kind]
                original = deepcopy(self.transport.data[target])
                self.transport.data[target]["properties"][key] = value
                self.transport.calls.clear()
                with self.assertRaises(infra.ContextError):
                    self.plan(execute=True)
                self.assertEqual(self.writes(), [])
                self.transport.data[target] = original

    def test_forbidden_read_is_not_treated_as_missing(self):
        result = self.plan()
        self.transport.data[infra.ARM + result["resources"]["account"]] = Response(status=403)
        with self.assertRaisesRegex(infra.ContextError, "HTTP 403"):
            self.plan(execute=True)
        self.assertEqual(self.writes(), [])

    def test_policy_failure_is_explicit_and_never_switches_to_private_or_other_hosting(self):
        self.transport.state = "Failed"
        with self.assertRaisesRegex(infra.ContextError, "RequestDisallowedByPolicy"):
            self.plan(execute=True)
        self.assertEqual(len(self.writes()), 2)

    def test_polling_is_bounded_and_does_not_report_timeout_as_success(self):
        self.transport.state = "Running"
        with patch.object(infra.time, "sleep") as sleep:
            with self.assertRaisesRegex(infra.ContextError, "timed out"):
                self.plan(execute=True)
        self.assertEqual(sleep.call_count, 119)

    def test_missing_role_is_detected_before_resource_creation(self):
        self.transport.data[ROOT + "/providers/Microsoft.Authorization/roleDefinitions"] = {"value": []}
        with self.assertRaisesRegex(infra.ContextError, "role definition"):
            self.plan(execute=True)
        self.assertEqual(self.writes(), [])

    def test_concurrent_resource_appearance_is_rechecked_before_deployment(self):
        result = self.plan()
        account = infra.ARM + result["resources"]["account"]
        self.transport.on_group_creation = lambda: self.transport.data.update({
            account: {"tags": {}, "location": "japaneast"}
        })
        with self.assertRaisesRegex(infra.ContextError, "not owned"):
            self.plan(execute=True)
        self.assertEqual(len(self.writes()), 1)

    def test_missing_endpoint_after_deployment_is_not_success(self):
        self.transport.project_endpoint = ""
        with self.assertRaisesRegex(infra.ContextError, "endpoint"):
            self.plan(execute=True)

    def test_location_and_pinned_endpoint_mismatches_stop_before_writes(self):
        result = self.plan(execute=True)
        for config in ({"AZURE_LOCATION": "eastus2"},
                       {"FOUNDRY_PROJECT_ENDPOINT": "https://other.services.ai.azure.com/api/projects/other"},
                       {"ACR_LOGIN_SERVER": "other.azurecr.io"}):
            self.transport.calls.clear()
            with self.subTest(config=config), self.assertRaises(infra.ContextError):
                self.plan(config, execute=True)
            self.assertEqual(self.writes(), [])
        self.assertEqual(result["values"]["AZURE_LOCATION"], "japaneast")

    def test_invalid_names_stop_before_writes_and_long_default_registry_is_valid(self):
        for agent in ("../other", "Bad Name", "x", ""):
            with self.subTest(agent=agent), self.assertRaises(infra.ContextError):
                self.plan(agent=agent, execute=True)
        self.assertEqual(self.writes(), [])
        self.assertLessEqual(len(self.plan(agent="a" * 40)["resources"]["registry"].rsplit("/", 1)[1]), 50)

    def test_cli_preserves_unrelated_secret_and_only_persists_verified_context(self):
        @contextmanager
        def auth(config):
            yield self.helper

        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("# preserved\nUNRELATED_SECRET=never-log-this\n", encoding="utf-8")
            output = io.StringIO()
            with patch.object(infra, "standard_auth", auth), redirect_stdout(output):
                self.assertEqual(infra.main(["--env", str(env), "--agent-name", "sample-colleague",
                                             "--resource-group-mode", "new", "--execute"]), 0)
            self.assertIn("UNRELATED_SECRET=never-log-this", env.read_text())
            self.assertIn("FOUNDRY_PROJECT_ENDPOINT", env.read_text())
            self.assertIn('AZURE_RESOURCE_GROUP_MODE="new"', env.read_text())
            self.assertNotIn("never-log-this", output.getvalue())

    def test_cli_does_not_override_a_saved_group_choice_or_authenticate_without_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            for saved in ("", "AZURE_RESOURCE_GROUP_MODE=existing\n"):
                env.write_text(saved, encoding="utf-8")
                arguments = ["--env", str(env), "--agent-name", "sample-colleague", "--execute"]
                if saved:
                    arguments += ["--resource-group-mode", "new"]
                with patch.object(infra, "standard_auth") as auth, redirect_stderr(io.StringIO()):
                    self.assertEqual(infra.main(arguments), 2)
                auth.assert_not_called()
                self.assertEqual(env.read_text(), saved)


if __name__ == "__main__":
    unittest.main()
