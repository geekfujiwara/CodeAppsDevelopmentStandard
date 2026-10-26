"""ACR build uses shared authentication and never archives local credentials."""
from __future__ import annotations

import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import build_autopilot_image as builder


def response(payload, status=200):
    result = Mock(status_code=status, content=b"{}")
    result.json.return_value = payload
    return result


class BuildTests(unittest.TestCase):
    def test_context_excludes_env_auth_cache_and_private_keys(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            for name in ("main.py", ".env", ".env.production", ".a365-auth.json", "key.pem"):
                (source / name).write_text("placeholder", encoding="utf-8")
            builder.archive(source, root / "build.tar.gz")
            with tarfile.open(root / "build.tar.gz") as archive:
                self.assertEqual(archive.getnames(), ["main.py"])

    def test_success_requires_pushed_image_digest_and_never_sends_arm_token_to_sas(self):
        session = Mock()
        session.headers = {"Authorization": "Bearer placeholder", "Content-Type": "application/json"}
        session.post.side_effect = [
            response({"uploadUrl": "https://example.blob.core.windows.net/context?sig=placeholder",
                      "relativePath": "source/context.tar.gz"}),
            response({"properties": {"runId": "run-id"}}),
        ]
        session.get.return_value = response({"properties": {"status": "Succeeded", "outputImages": [
            {"repository": "agent", "tag": "test-tag", "digest": "sha256:placeholder"}]}})

        def upload(*args, **kwargs):
            self.assertNotIn("Authorization", session.headers)
            self.assertFalse(kwargs["allow_redirects"])
            return response({}, 201)

        session.put.side_effect = upload
        env = {"ACR_LOGIN_SERVER": "example.azurecr.io", "AZURE_SUBSCRIPTION_ID": "subscription",
               "AZURE_RESOURCE_GROUP": "foundry-rg", "ACR_RESOURCE_GROUP": "shared-rg", "AGENT_IMAGE_NAME": "agent"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "main.py").write_text("pass")
            self.assertEqual(builder.build(session, root, env, "test-tag"), "run-id")
        self.assertEqual(session.headers["Authorization"], "Bearer placeholder")
        self.assertIn("/resourceGroups/shared-rg/", session.post.call_args_list[0].args[0])
        self.assertEqual(session.post.call_args.kwargs["json"]["type"], "DockerBuildRequest")

    def test_upload_failure_restores_auth_header(self):
        session = Mock()
        session.headers = {"Authorization": "Bearer placeholder"}
        session.post.return_value = response({
            "uploadUrl": "https://example.blob.core.windows.net/context", "relativePath": "source/context.tar.gz"})
        session.put.return_value = response({}, 403)
        env = {"ACR_LOGIN_SERVER": "example.azurecr.io", "AZURE_SUBSCRIPTION_ID": "subscription",
               "AZURE_RESOURCE_GROUP": "rg-test", "AGENT_IMAGE_NAME": "agent"}
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                builder.build(session, Path(temporary), env, "tag")
        self.assertEqual(session.headers["Authorization"], "Bearer placeholder")
        self.assertEqual(session.post.call_count, 1)

    def test_empty_accepted_response_follows_registry_scoped_location(self):
        env = {"ACR_LOGIN_SERVER": "example.azurecr.io", "AZURE_SUBSCRIPTION_ID": "subscription",
               "AZURE_RESOURCE_GROUP": "rg-test", "AGENT_IMAGE_NAME": "agent"}
        session = Mock()
        session.headers = {}
        accepted = response({}, 202)
        accepted.content = b""
        accepted.headers = {"Location": f"{builder.ARM}/subscriptions/subscription/resourceGroups/rg-test/"
                            "providers/Microsoft.ContainerRegistry/registries/example/runs/build-id?api-version=2019-04-01"}
        session.post.side_effect = [
            response({"uploadUrl": "https://example.blob.core.windows.net/context", "relativePath": "source"}),
            accepted]
        session.put.return_value = response({}, 201)
        session.get.side_effect = [
            response({"properties": {"runId": "build-id"}}),
            response({"properties": {"status": "Succeeded", "outputImages": [
                {"repository": "agent", "tag": "tag", "digest": "sha256:placeholder"}]}})]
        with tempfile.TemporaryDirectory() as temporary, patch.object(builder.time, "sleep"):
            self.assertEqual(builder.build(session, Path(temporary), env, "tag"), "build-id")

    def test_success_without_matching_digest_is_not_success(self):
        session = Mock()
        session.headers = {}
        session.post.side_effect = [
            response({"uploadUrl": "https://example.blob.core.windows.net/context", "relativePath": "source"}),
            response({"properties": {"runId": "build-id"}})]
        session.put.return_value = response({}, 201)
        session.get.return_value = response({"properties": {"status": "Succeeded", "outputImages": []}})
        env = {"ACR_LOGIN_SERVER": "example.azurecr.io", "AZURE_SUBSCRIPTION_ID": "subscription",
               "AZURE_RESOURCE_GROUP": "rg-test", "AGENT_IMAGE_NAME": "agent"}
        with tempfile.TemporaryDirectory() as temporary, self.assertRaisesRegex(RuntimeError, "digest"):
            builder.build(session, Path(temporary), env, "tag")


if __name__ == "__main__":
    unittest.main()
