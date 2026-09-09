import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from delete_environment_group import inventory, validate_target
import delete_environment_group as deletion


class DeleteGroupTests(unittest.TestCase):
    def setUp(self):
        self.groups = [{"id": "group-id", "displayName": "Obsolete"}]
        self.settings = {"powerPlatform": {"governance": {
            "enableDefaultEnvironmentRouting": True,
            "environmentRoutingTargetEnvironmentGroupId": "other-group",
        }}}

    def test_empty_unrouted_group(self):
        self.assertEqual(validate_target(self.groups, [], self.settings, "group-id", "Obsolete"), self.groups[0])

    def test_name_and_routing_are_required(self):
        for name, settings in [("Different", self.settings), ("Obsolete", {})]:
            with self.assertRaises(ValueError):
                validate_target(self.groups, [], settings, "group-id", name)

    def test_members_and_routing_block(self):
        environments = [{"name": "member", "properties": {"parentEnvironmentGroup": {"id": "group-id"}}}]
        with self.assertRaises(ValueError):
            validate_target(self.groups, environments, self.settings, "group-id", "Obsolete")
        self.settings["powerPlatform"]["governance"]["environmentRoutingTargetEnvironmentGroupId"] = "group-id"
        with self.assertRaises(ValueError):
            validate_target(self.groups, [], self.settings, "group-id", "Obsolete")

    def test_pagination_and_no_cross_host_credentials(self):
        session = Mock()
        session.get.side_effect = [Mock(json=lambda: {"value": [1], "nextLink": "/next"}), Mock(json=lambda: {"value": [2]})]
        self.assertEqual(inventory(session, "https://example.com/start"), [1, 2])
        session.get.side_effect = [Mock(json=lambda: {"value": [], "nextLink": "https://other.example/next"})]
        with self.assertRaises(ValueError):
            inventory(session, "https://example.com/start")

    def test_incomplete_inventory_stops(self):
        session = Mock()
        session.get.return_value.json.return_value = {}
        with self.assertRaises(ValueError):
            inventory(session, "https://example.com/start")


class ApiLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.group_id = str(UUID(int=1))
        self.policy_id = str(UUID(int=2))
        self.tenant_id = str(UUID(int=3))
        self.plan = {"policies": [{"id": self.policy_id, "ruleSets": []}], "environmentMemberships": [], "otherGroupIds": []}
        self.cleared = {**self.plan, "policies": []}
        self.session = Mock()
        self.session.delete.return_value.status_code = 204
        self.session.get.return_value.status_code = 404
        self.records = []

    def execute(self, expected_hash=None):
        return deletion.delete_via_api(self.session, Mock(), self.tenant_id, self.group_id, "Obsolete", self.plan, expected_hash or deletion.plan_hash(self.plan), self.records.append)

    def test_shared_policy_blocks(self):
        owner = {"type": "EnvironmentGroup", "id": self.group_id}
        deletion.require_exclusive_policies(self.plan["policies"], {self.policy_id: [owner]}, self.group_id)
        for others in [[], [owner, {"type": "Tenant", "id": self.tenant_id}], [owner, {"type": "Environment", "id": "member"}]]:
            with self.assertRaises(ValueError):
                deletion.require_exclusive_policies(self.plan["policies"], {self.policy_id: others}, self.group_id)

    def test_exact_api_order_and_verification(self):
        with patch.object(deletion, "preflight", side_effect=[self.plan, self.cleared]), patch.object(deletion, "inventory", return_value=[]), patch.object(deletion, "policy_inventory", return_value=({}, {})):
            result = self.execute()
        self.assertTrue(result["groupAbsent"])
        self.assertEqual([item["stage"] for item in self.records if item["phase"] == "response"], ["detach-policy", "delete-exclusive-policy", "delete-group"])
        self.assertIn(f"/{self.policy_id}/environmentGroups/{self.group_id}/assignments?", self.session.delete.call_args_list[0].args[0])
        self.assertTrue(self.session.delete.call_args_list[-1].args[0].endswith(f"/environmentmanagement/environmentGroups/{self.group_id}?api-version=1"))

    def test_stale_plan_never_deletes(self):
        with patch.object(deletion, "preflight", return_value=self.cleared):
            with self.assertRaises(ValueError):
                self.execute()
        self.session.delete.assert_not_called()

    def test_partial_failure_stops_and_records_stage(self):
        self.session.delete.side_effect = [Mock(status_code=204), Mock(status_code=403)]
        with patch.object(deletion, "preflight", return_value=self.plan), patch.object(deletion, "inventory", return_value=[]), patch.object(deletion, "policy_inventory", return_value=({}, {})):
            with self.assertRaises(ValueError):
                self.execute()
        self.assertEqual(self.session.delete.call_count, 2)
        self.assertEqual(self.records[-1]["httpStatus"], 403)

    def test_network_failure_preserves_attempt_without_retry(self):
        self.session.delete.side_effect = TimeoutError("unknown outcome")
        with patch.object(deletion, "preflight", return_value=self.plan):
            with self.assertRaises(TimeoutError):
                self.execute()
        self.assertEqual(self.session.delete.call_count, 1)
        self.assertEqual(self.records[-1]["phase"], "request")
        self.assertEqual(self.records[-1]["stage"], "detach-policy")

    def test_reassignment_after_detach_blocks_policy_delete(self):
        with patch.object(deletion, "preflight", return_value=self.plan), patch.object(deletion, "inventory", return_value=[]), patch.object(deletion, "policy_inventory", return_value=({}, {self.policy_id: [{"type": "Tenant", "id": self.tenant_id}]})):
            with self.assertRaises(ValueError):
                self.execute()
        self.assertEqual(self.session.delete.call_count, 1)

    def test_unverified_policy_delete_blocks_group_delete(self):
        self.session.get.return_value.status_code = 200
        with patch.object(deletion, "preflight", return_value=self.plan), patch.object(deletion, "inventory", return_value=[]), patch.object(deletion, "policy_inventory", return_value=({}, {})):
            with self.assertRaises(ValueError):
                self.execute()
        self.assertEqual(self.session.delete.call_count, 2)


if __name__ == "__main__":
    unittest.main()