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

    def test_lifecycle_plan_uses_fixed_endpoint(self):
        args = argparse.Namespace(
            operation="agent-lifecycle",
            payload_file=self.payload_file(
                {
                    "Locale": "en-US",
                    "ContentMarket": "US",
                    "WorkloadManagementList": [
                        {"ProductID": "00000000-0000-0000-0000-000000000000", "Command": "DEPLOY"}
                    ],
                    "UserAssignmentDetails": {
                        "Members": [],
                        "DeployToEveryone": False,
                        "UserAssignmentCategory": "SpecificUsers",
                    },
                    "DeploymentRolloutType": "FullRollout",
                    "SendEmailToUsers": False,
                }
            ),
            bot_id=None,
            environment_id=None,
        )
        plan = MODULE.build_plan(args)
        self.assertEqual("/fd/addins/api/apps", plan["path"])
        self.assertEqual("/fd/addins/api/agents", plan["readBack"])

    def test_lifecycle_rejects_unobserved_command(self):
        with self.assertRaises(SystemExit):
            MODULE.validate_payload(
                "agent-lifecycle",
                {
                    "Locale": "en-US",
                    "ContentMarket": "US",
                    "WorkloadManagementList": [
                        {"ProductID": "00000000-0000-0000-0000-000000000000", "Command": "DeleteEverything"}
                    ],
                    "UserAssignmentDetails": {
                        "Members": [],
                        "DeployToEveryone": False,
                        "UserAssignmentCategory": "SpecificUsers",
                    },
                    "DeploymentRolloutType": "FullRollout",
                    "SendEmailToUsers": False,
                },
            )

    def test_publish_plan_uses_actionable_apps_endpoint(self):
        args = argparse.Namespace(
            operation="agent-publish",
            payload_file=self.payload_file(
                {"Apps": [{"AppId": "T_example", "Command": "APPROVE", "Workload": "SharedAgent"}]}
            ),
            bot_id=None,
            environment_id=None,
            workload=None,
        )
        plan = MODULE.build_plan(args)
        self.assertEqual("/fd/addins/api/v2/actionableApps", plan["path"])

    def test_permission_approval_uses_workload_query(self):
        args = argparse.Namespace(
            operation="agent-permission-approve",
            payload_file=self.payload_file({"requestIds": ["request-example"]}),
            bot_id=None,
            environment_id=None,
            workload="SharedAgent",
        )
        plan = MODULE.build_plan(args)
        self.assertEqual("/fd/addins/api/agentActions/approve", plan["path"])
        self.assertEqual({"workload": "SharedAgent"}, plan["query"])

    def test_hash_is_order_independent(self):
        self.assertEqual(MODULE.canonical_hash({"a": 1, "b": 2}), MODULE.canonical_hash({"b": 2, "a": 1}))


if __name__ == "__main__":
    unittest.main()
