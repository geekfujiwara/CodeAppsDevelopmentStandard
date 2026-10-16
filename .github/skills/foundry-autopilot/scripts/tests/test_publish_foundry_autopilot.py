"""Unit tests for publish_foundry_autopilot.py without Azure or Graph calls."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "publish_foundry_autopilot.py"

_spec = importlib.util.spec_from_file_location("publish_foundry_autopilot", SCRIPT_PATH)
publish = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = publish
assert _spec.loader is not None
_spec.loader.exec_module(publish)

BASE_ENV = {
    "AZURE_OPENAI_DEPLOYMENT": "gpt-chat-latest",
    "ACR_LOGIN_SERVER": "example.azurecr.io",
    "AGENT_IMAGE_NAME": "teammate",
    "AZURE_SUBSCRIPTION_ID": "00000000-0000-0000-0000-000000000000",
    "AZURE_RESOURCE_GROUP": "rg-test",
    "AZURE_AI_ACCOUNT": "acct-test",
    "AZURE_AI_PROJECT": "proj-test",
}


class VersionBodyTests(unittest.TestCase):
    """The container only registers generate_image when it sees IMAGE_MODEL_DEPLOYMENT."""

    def env_vars(self, extra: dict[str, str]) -> dict:
        with patch.dict(publish.os.environ, {**BASE_ENV, **extra}, clear=True):
            body = publish.build_version_body()
        return body["definition"]["environment_variables"]

    def test_image_deployment_is_passed_to_the_container(self) -> None:
        env_vars = self.env_vars({"IMAGE_MODEL_DEPLOYMENT": "gpt-image-2"})

        self.assertEqual(env_vars["IMAGE_MODEL_DEPLOYMENT"], "gpt-image-2")

    def test_image_deployment_is_omitted_when_unset(self) -> None:
        env_vars = self.env_vars({})

        self.assertNotIn("IMAGE_MODEL_DEPLOYMENT", env_vars)

    def test_blank_image_deployment_is_omitted(self) -> None:
        env_vars = self.env_vars({"IMAGE_MODEL_DEPLOYMENT": "   "})

        self.assertNotIn("IMAGE_MODEL_DEPLOYMENT", env_vars)


class ActivityProtocolVersionTests(unittest.TestCase):
    """The declared version decides which container path the gateway posts to (troubleshooting #93)."""

    def detect(self, host_source: str) -> str:
        import tempfile

        with tempfile.TemporaryDirectory() as root:
            package = Path(root) / "src" / "agent"
            package.mkdir(parents=True)
            (package / "host_agent_server.py").write_text(host_source, encoding="utf-8")
            return publish.detect_activity_protocol_version(Path(root))

    def test_activity_messages_route_means_2_0_0(self) -> None:
        self.assertEqual(self.detect('app.router.add_post("/activity/messages", entry_point)'), "2.0.0")

    def test_api_messages_route_means_v1(self) -> None:
        self.assertEqual(self.detect('app.router.add_post("/api/messages", entry_point)'), "v1")

    def test_version_body_uses_the_chosen_version(self) -> None:
        with patch.dict(publish.os.environ, {**BASE_ENV, "ACTIVITY_PROTOCOL_VERSION": "2.0.0"}, clear=True):
            protocols = publish.build_version_body()["definition"]["container_protocol_versions"]

        self.assertEqual(protocols[0], {"protocol": "activity_protocol", "version": "2.0.0"})


class AutopilotPublishBodyTests(unittest.TestCase):
    """A publish without the agent user template lands as an ordinary agent (troubleshooting #91)."""

    PUBLISH_ENV = {
        "DEVELOPER_NAME": "Team", "DEVELOPER_WEBSITE_URL": "https://example.com",
        "DEVELOPER_PRIVACY_URL": "https://example.com/p", "DEVELOPER_TERMS_URL": "https://example.com/t",
    }
    BLUEPRINT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    def body(self, blueprint: str) -> dict:
        with patch.dict(publish.os.environ, self.PUBLISH_ENV, clear=True):
            return publish.build_publish_body("Kai", [], "1.0.0", blueprint)

    def test_template_carries_the_version_blueprint(self) -> None:
        body = self.body(self.BLUEPRINT)
        self.assertTrue(body["useAgenticUserTemplate"])
        self.assertEqual(body["agenticUserTemplate"]["AgentIdentityBlueprintId"], self.BLUEPRINT)
        publish.assert_autopilot_body(body, self.BLUEPRINT)

    def test_missing_or_placeholder_blueprint_is_refused(self) -> None:
        for blueprint in ("", " ", "<blueprint client id of the new version>", "not-a-guid",
                          "00000000-0000-0000-0000-000000000000"):
            with self.assertRaises(SystemExit):
                publish.assert_autopilot_body(self.body(blueprint), blueprint)

    def test_flags_must_be_boolean_true_not_truthy(self) -> None:
        for flag in ("publishAsAutopilot", "useAgenticUserTemplate"):
            for value in (None, False, "true", "false", 1):
                with self.subTest(flag=flag, value=value):
                    body = self.body(self.BLUEPRINT)
                    body[flag] = value
                    with self.assertRaises(SystemExit):
                        publish.assert_autopilot_body(body, self.BLUEPRINT)

    def test_every_template_field_is_required(self) -> None:
        for field in self.body(self.BLUEPRINT)["agenticUserTemplate"]:
            with self.subTest(field=field):
                body = self.body(self.BLUEPRINT)
                del body["agenticUserTemplate"][field]
                with self.assertRaises(SystemExit):
                    publish.assert_autopilot_body(body, self.BLUEPRINT)

    def test_template_from_another_version_is_refused(self) -> None:
        with self.assertRaises(SystemExit):
            publish.assert_autopilot_body(
                self.body(self.BLUEPRINT), "11111111-2222-3333-4444-555555555555"
            )

    def test_non_object_template_is_refused(self) -> None:
        for template in (None, [], "template"):
            body = self.body(self.BLUEPRINT)
            body["agenticUserTemplate"] = template
            with self.assertRaises(SystemExit):
                publish.assert_autopilot_body(body, self.BLUEPRINT)


class FoundryRequestTests(unittest.TestCase):
    def test_preview_header_and_template_body_reach_the_transport(self) -> None:
        blueprint = AutopilotPublishBodyTests.BLUEPRINT
        with patch.dict(publish.os.environ, AutopilotPublishBodyTests.PUBLISH_ENV, clear=True):
            body = publish.build_publish_body("Teammate", [], "1.0.0", blueprint)
        response = Mock(ok=True, content=b"{}", status_code=200)
        response.json.return_value = {"teamsAppId": "app", "titleId": "title"}
        with patch.object(publish.auth_helper, "get_token", return_value="test-token"):
            with patch.object(publish.requests, "request", return_value=response) as request:
                publish.foundry_request("POST", "https://example.com/agents/teammate/microsoft365/publish", body)
        self.assertEqual(request.call_args.kwargs["headers"]["Foundry-Features"], "DigitalWorker=V1Preview")
        publish.assert_autopilot_body(request.call_args.kwargs["json"], blueprint)

    def test_request_errors_preserve_status_for_fail_closed_lookup(self) -> None:
        response = Mock(ok=False, status_code=403, text="denied")
        with patch.object(publish.auth_helper, "get_token", return_value="test-token"):
            with patch.object(publish.requests, "request", return_value=response):
                with self.assertRaises(publish.FoundryRequestError) as caught:
                    publish.foundry_request("GET", "https://example.com/agents/teammate/versions")
        self.assertEqual(caught.exception.status_code, 403)


class AutopilotDeploymentFlowTests(unittest.TestCase):
    BLUEPRINT = AutopilotPublishBodyTests.BLUEPRINT

    def setUp(self) -> None:
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(
            publish.os.environ,
            {**BASE_ENV, **AutopilotPublishBodyTests.PUBLISH_ENV, "AGENT_NAME": "teammate",
             "FOUNDRY_PROJECT_ENDPOINT": "https://example.services.ai.azure.com/api/projects/project"},
            clear=True,
        ))
        self.stack.enter_context(patch.object(publish, "load_env"))
        self.preflight = self.stack.enter_context(patch.object(publish, "preflight", return_value=[]))
        self.stack.enter_context(patch.object(publish, "enable_instance_identity"))
        self.roles = self.stack.enter_context(patch.object(publish, "grant_instance_roles"))
        self.evaluation = self.stack.enter_context(patch.object(publish, "configure_foundry_evaluation"))
        self.persist = self.stack.enter_context(patch.object(publish, "write_env_value"))
        self.stack.enter_context(patch.object(publish, "recycle_stale_sessions"))
        self.stack.enter_context(patch.object(
            publish.requests, "request", side_effect=AssertionError("no network in unit tests")
        ))
        self.created = {
            "version": "2", "status": "active", "blueprint": {"client_id": self.BLUEPRINT},
            "instance_identity": {"client_id": "identity", "principal_id": "principal"},
        }
        self.existing = {"data": [{"version": "1"}]}
        self.published = {"teamsAppId": "teams-app", "titleId": "title"}
        self.request = self.stack.enter_context(patch.object(
            publish, "foundry_request", side_effect=self.respond
        ))

    def respond(self, method: str, url: str, body: dict | None = None) -> dict:
        if method == "GET" and "/versions?" in url:
            return self.existing
        if method == "POST" and "/versions?" in url:
            return self.created
        if method == "POST" and "/microsoft365/publish?" in url:
            return self.published
        if method == "GET" and "/versions/" in url:
            return self.created
        if method == "GET":
            return {"agent_endpoint": {"authorization_schemes": [{"type": "BotServiceRbac"}]}}
        raise AssertionError(f"Unexpected request: {method} {url}")

    def run_main(self, *args: str) -> int:
        with patch.object(sys, "argv", [str(SCRIPT_PATH), "--env", "test.env", *args]):
            return publish.main()

    def writes(self) -> list:
        return [call for call in self.request.call_args_list if call.args[0] != "GET"]

    def test_normal_execution_always_creates_and_publishes_autopilot(self) -> None:
        self.assertEqual(self.run_main("--execute"), 0)
        version_call, publish_call = self.writes()
        publish.assert_autopilot_version_body(version_call.args[2])
        publish.assert_autopilot_body(publish_call.args[2], self.BLUEPRINT)
        self.assertIn("/microsoft365/publish?", publish_call.args[1])

    def test_tampered_version_is_blocked_before_writes(self) -> None:
        with patch.object(publish, "build_version_body", return_value={"digital_worker_type": "ordinary"}):
            with self.assertRaises(SystemExit):
                self.run_main("--execute")
        self.assertEqual(self.writes(), [])

    def test_missing_blueprint_stops_before_roles_and_publish(self) -> None:
        self.created["blueprint"] = {}
        with self.assertRaises(SystemExit):
            self.run_main("--execute")
        self.assertEqual(len(self.writes()), 1)
        self.roles.assert_not_called()
        self.evaluation.assert_not_called()
        self.persist.assert_not_called()

    def test_active_polled_version_supplies_the_blueprint(self) -> None:
        pending = {"version": "2", "status": "creating"}
        original = self.respond
        self.request.side_effect = lambda method, url, body=None: (
            pending if method == "POST" and "/versions?" in url else original(method, url, body)
        )
        self.assertEqual(self.run_main("--execute"), 0)
        publish.assert_autopilot_body(self.writes()[-1].args[2], self.BLUEPRINT)

    def test_tampered_publish_is_blocked_before_publish_request(self) -> None:
        with patch.object(publish, "build_publish_body", return_value={"publishAsAutopilot": True}):
            with self.assertRaises(SystemExit):
                self.run_main("--execute")
        self.assertEqual(len(self.writes()), 1)

    def test_container_only_requires_explicit_existing_template_confirmation(self) -> None:
        with self.assertRaises(SystemExit):
            self.run_main("--execute", "--container-only")
        self.preflight.assert_not_called()
        self.assertEqual(self.writes(), [])

    def test_container_only_cannot_be_the_first_deployment(self) -> None:
        self.existing = {"data": []}
        self.assertEqual(
            self.run_main("--execute", "--container-only", "--confirm-existing-template"), 1
        )
        self.assertEqual(self.writes(), [])

    def test_confirmed_existing_template_can_update_container_without_publish(self) -> None:
        self.assertEqual(
            self.run_main("--execute", "--container-only", "--confirm-existing-template"), 0
        )
        self.assertEqual(len(self.writes()), 1)
        publish.assert_autopilot_version_body(self.writes()[0].args[2])

    def test_missing_publish_identifiers_does_not_persist_app_version(self) -> None:
        self.published = {}
        with self.assertRaises(SystemExit):
            self.run_main("--execute")
        self.assertFalse(any(call.args[1] == "TEAMS_APP_VERSION" for call in self.persist.call_args_list))

    def test_check_and_dry_run_never_write(self) -> None:
        self.assertEqual(self.run_main("--check"), 0)
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.writes(), [])

    def test_lookup_permission_failure_is_not_treated_as_first_deployment(self) -> None:
        self.request.side_effect = publish.FoundryRequestError("GET", "url", 403, "denied")
        with self.assertRaises(publish.FoundryRequestError):
            self.run_main("--execute")
        self.assertEqual(self.writes(), [])

    def test_lookup_not_found_allows_initial_full_publish(self) -> None:
        original = self.respond
        def respond(method: str, url: str, body: dict | None = None) -> dict:
            if method == "GET" and "/versions?" in url:
                raise publish.FoundryRequestError(method, url, 404, "not found")
            return original(method, url, body)
        self.request.side_effect = respond
        self.assertEqual(self.run_main("--execute"), 0)
        self.assertEqual(len(self.writes()), 2)


class PreflightLicenseTests(unittest.TestCase):
    """The Autopilot agent user gets Frontier for Autopilot after hire, not an Agent 365 seat."""

    def test_preflight_does_not_check_agent_365_seats(self) -> None:
        env = {
            **BASE_ENV,
            "FOUNDRY_PROJECT_ENDPOINT": "https://example.services.ai.azure.com/api/projects/project",
            "AGENT_NAME": "teammate",
        }
        with patch.dict(publish.os.environ, env, clear=True):
            with patch.object(publish, "build_permission_scopes", return_value=[]):
                with patch.object(publish, "assert_image_deployment_exists"):
                    with patch.object(
                        publish, "graph_get", side_effect=AssertionError("preflight must not query licenses")
                    ) as graph_get:
                        publish.preflight("Kai")

        graph_get.assert_not_called()
    """A missing deployment must stop the publish, not surface as a refusal in Teams."""

    def run_check(self, status: int, payload: dict | None = None) -> None:
        response = Mock()
        response.status_code = status
        response.ok = 200 <= status < 300
        response.text = ""
        response.json.return_value = payload or {}
        with patch.dict(publish.os.environ, {**BASE_ENV, "IMAGE_MODEL_DEPLOYMENT": "gpt-image-2"}, clear=True):
            with patch.object(publish.auth_helper, "get_token", return_value="token"):
                with patch.object(publish.requests, "get", return_value=response):
                    publish.assert_image_deployment_exists()

    def test_missing_deployment_raises(self) -> None:
        with self.assertRaises(publish.PreflightError) as caught:
            self.run_check(404)

        self.assertIn("provision_image_model.py", str(caught.exception))

    def test_unfinished_deployment_raises(self) -> None:
        with self.assertRaises(publish.PreflightError):
            self.run_check(200, {"properties": {"provisioningState": "Creating"}})

    def test_succeeded_deployment_passes(self) -> None:
        self.run_check(
            200, {"properties": {"provisioningState": "Succeeded", "model": {"name": "gpt-image-2"}}}
        )

    def test_unset_deployment_skips_the_call(self) -> None:
        with patch.dict(publish.os.environ, BASE_ENV, clear=True):
            with patch.object(publish.requests, "get", side_effect=AssertionError("must not call ARM")):
                publish.assert_image_deployment_exists()


class InstanceRoleTests(unittest.TestCase):
    """The image API is served by the account, so the project-scoped grant is not enough."""

    def granted_scopes(self, extra: dict[str, str]) -> tuple[list[tuple[str, str]], str]:
        calls: list[tuple[str, str]] = []
        with patch.dict(publish.os.environ, {**BASE_ENV, **extra}, clear=True):
            with patch.object(publish, "grant_role", side_effect=lambda _p, role, scope: calls.append((role, scope))):
                publish.grant_instance_roles("principal")
            account = publish.account_scope()
        return calls, account

    def test_account_scope_is_granted_for_image_generation(self) -> None:
        calls, account = self.granted_scopes({"IMAGE_MODEL_DEPLOYMENT": "gpt-image-2"})

        self.assertIn(("Foundry User", account), calls)

    def test_account_scope_is_skipped_without_image_generation(self) -> None:
        calls, account = self.granted_scopes({})

        self.assertEqual([scope for _role, scope in calls], [f"{account}/projects/proj-test"])


class FoundryEvaluationAutoconfigurationTests(unittest.TestCase):
    def test_publish_invokes_scheduled_evaluation_setup(self) -> None:
        env_path = Path("publish.env")
        completed = Mock(returncode=0)

        with patch.object(publish.subprocess, "run", return_value=completed) as run:
            publish.configure_foundry_evaluation(env_path)

        command = run.call_args.args[0]
        self.assertIn(str(Path(publish.__file__).with_name("setup_foundry_evaluation.py")), command)
        self.assertIn("--execute", command)
        self.assertEqual(command[command.index("--mode") + 1], "scheduled")
        self.assertEqual(command[command.index("--env") + 1], str(env_path))

    def test_publish_fails_when_evaluation_setup_fails(self) -> None:
        with patch.object(publish.subprocess, "run", return_value=Mock(returncode=1)):
            with self.assertRaises(publish.PreflightError):
                publish.configure_foundry_evaluation(Path("publish.env"))


if __name__ == "__main__":
    unittest.main()
