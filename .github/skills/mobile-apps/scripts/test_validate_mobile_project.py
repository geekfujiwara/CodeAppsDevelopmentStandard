from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("validate_mobile_project.py")
SPEC = importlib.util.spec_from_file_location("validate_mobile_project", MODULE_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class OfflineRuntimeClaimTests(unittest.TestCase):
    def test_rejects_explicit_supported_flag(self) -> None:
        self.assertTrue(VALIDATOR.claims_offline_runtime_support("const offlineReady = true"))
        self.assertTrue(VALIDATOR.claims_offline_runtime_support("const isOfflineReady = true"))
        self.assertTrue(VALIDATOR.claims_offline_runtime_support("'offlineSupported': true"))

    def test_allows_explicit_unsupported_flag(self) -> None:
        self.assertFalse(VALIDATOR.claims_offline_runtime_support("const isOfflineReady = false"))
        self.assertFalse(VALIDATOR.claims_offline_runtime_support("'offlineComplete': false"))

    def test_allows_unsupported_documentation(self) -> None:
        self.assertFalse(VALIDATOR.claims_offline_runtime_support("offline mode is not yet supported"))


if __name__ == "__main__":
    unittest.main()
