import copy
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
STANDARD_SCRIPTS = SCRIPTS.parents[1] / "standard" / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(STANDARD_SCRIPTS))
SPEC = importlib.util.spec_from_file_location(
    "register_wrap_application", SCRIPTS / "register_wrap_application.py"
)
wrap = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = wrap
SPEC.loader.exec_module(wrap)


class RegisterWrapApplicationTests(unittest.TestCase):
    def setUp(self):
        self.tenant_id = "00000000-0000-" + "4000-8000-000000000001"
        self.plan = wrap.build_plan(self.tenant_id, "Sample mobile app")

    def test_builds_observed_wrap_contract(self):
        body = self.plan["body"]
        self.assertEqual(body["signInAudience"], "AzureADMultipleOrgs")
        self.assertEqual(body["publicClient"]["redirectUris"], wrap.REDIRECT_URIS)
        self.assertEqual(len(body["requiredResourceAccess"]), 6)
        self.assertEqual(sum(len(item["resourceAccess"]) for item in body["requiredResourceAccess"]), 11)

    def test_rejects_permission_drift(self):
        changed = copy.deepcopy(self.plan)
        changed["body"]["requiredResourceAccess"][0]["resourceAccess"] = []
        with self.assertRaisesRegex(ValueError, "observed Wrap contract"):
            wrap.validate_plan(changed)

    def test_rejects_redirect_drift(self):
        changed = copy.deepcopy(self.plan)
        changed["body"]["publicClient"]["redirectUris"].append("https://example.com")
        with self.assertRaisesRegex(ValueError, "observed Wrap contract"):
            wrap.validate_plan(changed)

    def test_rejects_target_drift(self):
        changed = copy.deepcopy(self.plan)
        changed["origin"] = "https://example.com"
        with self.assertRaisesRegex(ValueError, "Graph target"):
            wrap.validate_plan(changed)

    def test_accepts_exact_approved_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(wrap.canonical_json(self.plan), encoding="utf-8")
            loaded = wrap.load_approved_plan(path, wrap.canonical_hash(self.plan))
            self.assertEqual(loaded, self.plan)

    def test_rejects_unapproved_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(wrap.canonical_json(self.plan), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "approval hash"):
                wrap.load_approved_plan(path, "0" * 64)

    def test_readback_allows_only_order_changes(self):
        actual = copy.deepcopy(self.plan["body"])
        actual["publicClient"]["redirectUris"].reverse()
        actual["requiredResourceAccess"].reverse()
        actual["requiredResourceAccess"][0]["resourceAccess"].reverse()
        wrap.verify_readback(self.plan, actual)

    def test_rejects_readback_drift(self):
        actual = copy.deepcopy(self.plan["body"])
        actual["signInAudience"] = "AzureADMyOrg"
        with self.assertRaisesRegex(ValueError, "read-back differs"):
            wrap.verify_readback(self.plan, actual)

    def test_builds_bound_cleanup_plan(self):
        registration = {
            "objectId": "00000000-0000-" + "4000-8000-000000000002",
            "clientId": "00000000-0000-" + "4000-8000-000000000003",
            "displayName": self.plan["body"]["displayName"],
        }
        cleanup = wrap.build_cleanup_plan(self.plan, registration)
        self.assertEqual(cleanup["path"], f"/v1.0/applications/{registration['objectId']}")
        wrap.validate_cleanup_plan(cleanup)

    def test_rejects_cleanup_identity_drift(self):
        registration = {
            "objectId": "00000000-0000-" + "4000-8000-000000000002",
            "clientId": "00000000-0000-" + "4000-8000-000000000003",
            "displayName": "Other application",
        }
        with self.assertRaisesRegex(ValueError, "does not match"):
            wrap.build_cleanup_plan(self.plan, registration)


if __name__ == "__main__":
    unittest.main()