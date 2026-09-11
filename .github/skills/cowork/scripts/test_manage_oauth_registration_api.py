from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "manage_oauth_registration_api.py"
SPEC = importlib.util.spec_from_file_location("manage_oauth_registration_api", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ManageOauthRegistrationApiTests(unittest.TestCase):
    def test_validate_payload_rejects_unknown_field(self):
        with self.assertRaisesRegex(SystemExit, "未確認"):
            MODULE.validate_payload({"unexpected": True}, creating=False)

    def test_validate_payload_requires_specific_app_id(self):
        with self.assertRaisesRegex(SystemExit, "m365AppId"):
            MODULE.validate_payload({"applicableToApps": "SpecificApp"}, creating=False)

    def test_redact_hides_nested_secret(self):
        value = {"clientSecret": "secret-value", "nested": [{"token": "token-value"}]}

        result = MODULE.redact(value)

        self.assertEqual(result["clientSecret"], "<redacted>")
        self.assertEqual(result["nested"][0]["token"], "<redacted>")

    def test_registration_id_accepts_both_observed_response_shapes(self):
        self.assertEqual(MODULE.registration_id({"oAuthConfigId": "direct"}), "direct")
        self.assertEqual(
            MODULE.registration_id({"configurationRegistrationId": {"oAuthConfigId": "nested"}}),
            "nested",
        )

    def test_region_and_hash_are_deterministic(self):
        self.assertTrue(MODULE.api_base("EMEA").endswith("cosmicprodemea"))
        first = MODULE.canonical_hash({"method": "POST", "path": "/example"})
        second = MODULE.canonical_hash({"path": "/example", "method": "POST"})

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()