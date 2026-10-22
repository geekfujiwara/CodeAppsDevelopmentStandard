import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

from azure.core.credentials import AccessToken
from azure.core.exceptions import ClientAuthenticationError
from azure.identity import AuthenticationRecord, AuthenticationRequiredError


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/auth_helper.py"


class AuthCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.record_path = Path(self.directory.name) / "auth_record.json"
        with patch.dict(os.environ, {
            "PP_AUTH_RECORD_PATH": str(self.record_path),
            "TENANT_ID": "tenant-example",
            "DATAVERSE_URL": "https://example.crm.dynamics.com",
            "PAC_AUTH_PROFILE": "",
        }):
            spec = importlib.util.spec_from_file_location("auth_cache_test_subject", SCRIPT)
            self.subject = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.subject)
        self.subject._credentials.clear()
        self.subject._inmemory_tokens.clear()
        self.credential = Mock()
        self.credential.get_token.return_value = AccessToken("test-access-token", int(time.time()) + 3600)
        self.credential.authenticate.return_value = self.record()

    def record(self, client_id="client-example", tenant_id="tenant-example"):
        return AuthenticationRecord(
            authority="login.microsoftonline.com",
            client_id=client_id,
            home_account_id="account-example",
            tenant_id=tenant_id,
            username="maker@example.com",
        )

    def test_memory_cache_avoids_reacquisition(self):
        with patch.object(self.subject, "_ensure_credential", return_value=self.credential):
            self.subject.get_token()
            self.subject.get_token()
        self.credential.get_token.assert_called_once()
        self.credential.authenticate.assert_not_called()

    def test_expiring_token_is_refreshed_silently(self):
        self.subject._inmemory_tokens[(self.subject._DEFAULT_SCOPE, "")] = ("expired", time.time() + 30)
        with patch.object(self.subject, "_ensure_credential", return_value=self.credential):
            self.assertEqual(self.subject.get_token(), "test-access-token")
        self.credential.get_token.assert_called_once()
        self.credential.authenticate.assert_not_called()

    def test_explicit_setup_uses_existing_cache_before_browser(self):
        with patch.object(self.subject, "_ensure_credential", return_value=self.credential):
            self.subject.get_token(allow_interactive=True)
        self.credential.get_token.assert_called_once()
        self.credential.authenticate.assert_not_called()

    def test_disabling_persistence_emits_a_warning(self):
        with patch.dict(os.environ, {"PP_NO_PERSISTENT_CACHE": "1"}), \
             patch.object(self.subject, "_instantiate_credential", return_value=self.credential) as build, \
             patch("sys.stderr") as stderr:
            self.subject._build_credential()
        self.assertNotIn("cache_persistence_options", build.call_args.args[0])
        self.assertIn("PP_NO_PERSISTENT_CACHE", "".join(call.args[0] for call in stderr.write.call_args_list))

    def test_authentication_required_does_not_open_browser_by_default(self):
        error = AuthenticationRequiredError(["scope"])
        self.credential.get_token.side_effect = error
        with patch.object(self.subject, "_ensure_credential", return_value=self.credential):
            with self.assertRaises(AuthenticationRequiredError):
                self.subject.get_token()
        self.credential.authenticate.assert_not_called()

    def test_explicit_browser_setup_preserves_claims_and_client_cache(self):
        self.credential.get_token.side_effect = [
            AuthenticationRequiredError(["scope"], claims="claims-example"),
            AccessToken("new-access-token", int(time.time()) + 3600),
        ]
        with patch.object(self.subject, "_ensure_credential", return_value=self.credential):
            self.subject.get_token("scope", "client-example", allow_interactive=True)
        self.credential.authenticate.assert_called_once_with(scopes=["scope"], claims="claims-example")
        saved = self.subject._auth_record_path_for("client-example")
        self.assertEqual(AuthenticationRecord.deserialize(saved.read_text()).client_id, "client-example")

    def test_authentication_errors_do_not_discard_persistence_or_retry(self):
        for error in (ClientAuthenticationError(message="policy denied"), TypeError("cache failure")):
            with self.subTest(error=type(error).__name__):
                self.credential.get_token.side_effect = error
                with patch.object(self.subject, "_ensure_credential", return_value=self.credential), \
                     patch.object(self.subject, "_instantiate_credential") as rebuild:
                    with self.assertRaises(type(error)):
                        self.subject.get_token(allow_interactive=True)
                rebuild.assert_not_called()
                self.credential.authenticate.assert_not_called()

    def test_sdk_credential_reuses_the_same_instance(self):
        with patch.object(self.subject, "_instantiate_credential", return_value=self.credential):
            self.assertIs(self.subject.get_credential(), self.subject.get_credential())

    def test_new_process_configuration_loads_existing_encrypted_cache(self):
        self.subject._save_auth_record(self.record())
        with patch.object(self.subject, "_instantiate_credential", return_value=self.credential) as build:
            self.subject._build_credential()
        options = build.call_args.args[0]
        self.assertTrue(options["disable_automatic_authentication"])
        self.assertFalse(options["cache_persistence_options"].allow_unencrypted_storage)
        self.assertEqual(options["cache_persistence_options"].name, "power_platform_token_cache_v3")
        self.assertEqual(options["authentication_record"].username, "maker@example.com")

    def test_invalid_or_wrong_identity_record_is_preserved_and_rejected(self):
        for contents in (
            "invalid-json",
            self.record(tenant_id="other-tenant").serialize(),
            self.record(client_id="other-client").serialize(),
        ):
            with self.subTest(contents=contents[:20]):
                path = self.subject._auth_record_path_for("client-example")
                path.write_text(contents)
                with self.assertRaises((RuntimeError, ValueError)):
                    self.subject._build_credential("client-example")
                self.assertEqual(path.read_text(), contents)

    def test_auth_record_replacement_is_atomic(self):
        self.subject._save_auth_record(self.record())
        original = self.record_path.read_text()
        with patch.object(self.subject.os, "replace", side_effect=OSError("write interrupted")):
            with self.assertRaises(OSError):
                self.subject._save_auth_record(self.record(client_id="new-client"))
        self.assertEqual(self.record_path.read_text(), original)
        self.assertEqual(list(self.record_path.parent.iterdir()), [self.record_path])


if __name__ == "__main__":
    unittest.main()
