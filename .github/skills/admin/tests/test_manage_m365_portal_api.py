import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "manage_m365_portal_api.py"
SPEC = importlib.util.spec_from_file_location("manage_m365_portal_api", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ManageM365PortalApiTests(unittest.TestCase):
    def payload_file(self, payload):
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        with handle:
            json.dump(payload, handle)
        self.addCleanup(Path(handle.name).unlink, missing_ok=True)
        return handle.name

    def test_frontier_plan_uses_fixed_endpoint(self):
        args = argparse.Namespace(
            operation="frontier-access",
            payload_file=self.payload_file({"frontierPolicy": 1, "audienceStatus": "PartiallyEnrolled"}),
            bot_id=None,
            environment_id=None,
        )
        plan = MODULE.build_plan(args)
        self.assertEqual("/admin/api/settings/company/frontier/access", plan["path"])
        self.assertEqual("/admin/api/settings/company/frontier/access", plan["readBack"])

    def test_unknown_frontier_field_is_rejected(self):
        with self.assertRaises(SystemExit):
            MODULE.validate_payload(
                "frontier-access",
                {"frontierPolicy": 1, "audienceStatus": "PartiallyEnrolled", "url": "https://example.com"},
            )

    def test_agent_plan_requires_inventory_ids(self):
        args = argparse.Namespace(
            operation="agent-availability",
            payload_file=self.payload_file(
                {"Locale": "en-US", "Market": "US", "WorkloadManagementList": [], "SendEmailToUsers": False}
            ),
            bot_id=None,
            environment_id=None,
        )
        with self.assertRaises(SystemExit):
            MODULE.build_plan(args)

    def test_hash_is_order_independent(self):
        self.assertEqual(MODULE.canonical_hash({"a": 1, "b": 2}), MODULE.canonical_hash({"b": 2, "a": 1}))


if __name__ == "__main__":
    unittest.main()
