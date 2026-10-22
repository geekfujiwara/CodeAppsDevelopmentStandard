import importlib
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import auth_preferences as prefs


def load_auth():
    with patch("dotenv.load_dotenv"), patch.object(Path, "home", return_value=Path.cwd()), \
         patch.object(Path, "exists", return_value=False):
        return importlib.import_module("auth_helper")


class AuthPreferenceTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def approved(self):
        return patch.dict(os.environ, {
            "PP_AUTH_ALLOW_INTERACTIVE": "true", "PP_AUTH_ACCOUNT": "maker@example.com",
            "PP_AUTH_EDGE_PROFILE": "Profile 2",
        })

    def test_default_is_silent(self):
        self.assertFalse(prefs.interactive_allowed())
        self.assertTrue(prefs.interactive_allowed(True))

    def test_saved_permission_and_revocation(self):
        with self.approved():
            self.assertTrue(prefs.interactive_allowed())
            os.environ["PP_AUTH_ALLOW_INTERACTIVE"] = "false"
            self.assertFalse(prefs.interactive_allowed())

    def test_ci_disallows_even_explicit_interaction(self):
        for key in ("CI", "GITHUB_ACTIONS", "TF_BUILD"):
            with self.subTest(key=key), self.approved(), patch.dict(os.environ, {key: "true"}):
                self.assertFalse(prefs.interactive_allowed(True))

    def test_device_code_and_invalid_settings_fail(self):
        for values in ({"PP_AUTH_MODE": "device-code"}, {"PP_AUTH_ALLOW_INTERACTIVE": "yes"},
                       {"PP_AUTH_ALLOW_INTERACTIVE": "true"}):
            with patch.dict(os.environ, values), self.assertRaises(ValueError):
                prefs.interactive_allowed()

    def test_profile_is_directory_not_shell_or_display_name(self):
        for profile in ("Work", "../Profile 2", 'Profile 2" --incognito', ""):
            with self.assertRaises(ValueError):
                prefs.validate_preferences("maker@example.com", profile)

    def test_no_profile_leaves_browser_unchanged(self):
        with patch.object(prefs.webbrowser, "register") as register:
            prefs.configure_python_browser()
            register.assert_not_called()

    def test_missing_profile_never_uses_alternative(self):
        with self.approved(), patch.dict(os.environ, {"LOCALAPPDATA": str(Path.cwd())}), \
             patch.object(prefs.Path, "is_dir", return_value=False), \
             patch.object(prefs.webbrowser, "register") as register, self.assertRaises(ValueError):
            prefs.configure_python_browser()
        register.assert_not_called()

    @unittest.skipUnless(os.name == "nt", "Windows Edge launcher")
    def test_edge_launch_has_separate_profile_and_url_arguments(self):
        with self.approved(), patch.dict(os.environ, {"LOCALAPPDATA": str(Path.cwd())}), \
             patch.object(prefs.Path, "is_dir", return_value=True), \
             patch.object(prefs.Path, "is_file", return_value=True), \
             patch.object(prefs.webbrowser, "register") as register, \
             patch.object(prefs.subprocess, "Popen") as launch:
            prefs.configure_python_browser()
            browser = register.call_args.args[2]
            browser.open("https://login.example.invalid/")
            self.assertEqual(launch.call_args.args[0][1:],
                             ["--profile-directory=Profile 2", "https://login.example.invalid/"])
            self.assertTrue(register.call_args.kwargs["preferred"])

    def test_python_silent_success_does_not_open_browser(self):
        auth = load_auth()
        credential = Mock()
        credential.get_token.return_value = Mock(token="test-token", expires_on=9999999999)
        with self.approved(), patch.object(auth, "_inmemory_tokens", {}), \
             patch.object(auth, "_ensure_credential", return_value=credential), \
             patch.object(auth, "PAC_AUTH_PROFILE", ""), patch.object(auth, "authenticate") as authenticate:
            self.assertEqual(auth.get_token("https://example.invalid/.default"), "test-token")
            authenticate.assert_not_called()

    def test_python_saved_permission_recovers_and_preserves_claims(self):
        auth = load_auth()
        credential = Mock()
        credential.get_token.side_effect = [
            auth.AuthenticationRequiredError(["scope"], claims="required-claims"),
            Mock(token="test-token", expires_on=9999999999),
        ]
        with self.approved(), patch.object(auth, "_inmemory_tokens", {}), \
             patch.object(auth, "_ensure_credential", return_value=credential), \
             patch.object(auth, "PAC_AUTH_PROFILE", ""), patch.object(auth, "authenticate") as authenticate:
            self.assertEqual(auth.get_token("scope"), "test-token")
            authenticate.assert_called_once_with("scope", client_id=None, claims="required-claims")

    def test_python_no_permission_preserves_auth_required_error(self):
        auth = load_auth()
        credential = Mock()
        credential.get_token.side_effect = auth.AuthenticationRequiredError(["scope"])
        with patch.object(auth, "_inmemory_tokens", {}), \
             patch.object(auth, "_ensure_credential", return_value=credential), \
             patch.object(auth, "PAC_AUTH_PROFILE", ""), patch.object(auth, "authenticate") as authenticate, \
             self.assertRaises(auth.AuthenticationRequiredError):
            auth.get_token("scope")
        authenticate.assert_not_called()

    def test_python_cache_account_mismatch_stops_before_credential_creation(self):
        auth = load_auth()
        path = Mock()
        path.exists.return_value = True
        path.read_text.return_value = "serialized-test-record"
        record = Mock(tenant_id="tenant", client_id="client", username="other@example.com")
        with self.approved(), patch.object(auth, "TENANT_ID", "tenant"), \
             patch.object(auth, "_auth_record_path_for", return_value=path), \
             patch.object(auth.AuthenticationRecord, "deserialize", return_value=record), \
             patch.object(auth, "_instantiate_credential") as instantiate, self.assertRaises(ValueError):
            auth._build_credential()
        instantiate.assert_not_called()

    def test_python_cache_remains_encrypted_and_sdk_automatic_auth_disabled(self):
        auth = load_auth()
        path = Mock()
        path.exists.return_value = False
        with self.approved(), patch.object(auth, "_auth_record_path_for", return_value=path), \
             patch.object(auth, "TokenCachePersistenceOptions") as cache, \
             patch.object(auth, "_instantiate_credential") as instantiate:
            auth._build_credential()
        self.assertFalse(cache.call_args.kwargs["allow_unencrypted_storage"])
        self.assertTrue(instantiate.call_args.args[0]["disable_automatic_authentication"])
        self.assertEqual(instantiate.call_args.args[0]["login_hint"], "maker@example.com")

    def test_first_signin_instructions_save_preferences_before_authentication(self):
        references = Path(__file__).resolve().parents[1] / "references"
        for name in ("quickstart.md", "interactive-setup.md"):
            with self.subTest(document=name):
                text = (references / name).read_text(encoding="utf-8")
                environment = text.index("--no-auth")
                save = text.index("scripts/auth_preferences.py")
                authenticate = text.index("scripts/setup_environment.py --auth-only")
                self.assertLess(environment, save)
                self.assertLess(save, authenticate)


if __name__ == "__main__":
    unittest.main()
