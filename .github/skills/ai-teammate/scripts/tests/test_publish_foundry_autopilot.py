"""Unit tests for publish_foundry_autopilot.py without Azure or Graph calls."""

from __future__ import annotations

import importlib.util
import sys
import unittest
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


class ImageDeploymentPreflightTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
