import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import set_environment_routing as routing


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.source = str(UUID(int=1))
        self.target = str(UUID(int=2))
        self.policy = {"id": str(UUID(int=3)), "name": "routing", "ruleSets": [
            {"id": "Other", "inputs": {"keep": True}},
            {"id": "EnvironmentRouting", "version": "1.0", "inputs": {
                "Portals": ["PowerApps"], "RoutingRules": [
                    {"Name": "makers", "SecurityGroups": [], "EnvironmentGroup": self.source, "Priority": 1},
                    {"Name": "other", "SecurityGroups": [], "EnvironmentGroup": self.target, "Priority": 2}
                ]}}
        ]}

    def test_only_target_changes(self):
        before = copy.deepcopy(self.policy)
        result = routing.plan_retarget(self.policy, "makers", self.source, self.target)
        expected = copy.deepcopy(before)
        expected["ruleSets"][1]["inputs"]["RoutingRules"][0]["EnvironmentGroup"] = self.target
        self.assertEqual(result, expected)
        self.assertEqual(self.policy, before)

    def test_wrong_source_or_name_stops(self):
        for name, source in [("missing", self.source), ("makers", self.target)]:
            with self.assertRaises(ValueError):
                routing.plan_retarget(self.policy, name, source, self.target)

    def test_ambiguous_policy_and_priority_stop(self):
        with self.assertRaises(ValueError):
            routing.routing_policy([self.policy, self.policy])
        self.policy["ruleSets"][1]["inputs"]["RoutingRules"][1]["Priority"] = 1
        with self.assertRaises(ValueError):
            routing.routing_policy([self.policy])

    def test_modern_rule_reference(self):
        self.assertEqual(routing.group_references(self.policy, self.source), ["makers"])

    def test_delete_only_named_rule(self):
        before = copy.deepcopy(self.policy)
        planned = routing.plan_delete_rule(self.policy, "other", self.target)
        expected = copy.deepcopy(before)
        expected["ruleSets"][1]["inputs"]["RoutingRules"].pop()
        self.assertEqual(planned, expected)
        self.assertEqual(self.policy, before)

    def test_delete_preserves_remaining_order(self):
        planned = routing.plan_delete_rule(self.policy, "makers", self.source)
        self.assertEqual(routing.routing_inputs(planned)["RoutingRules"], [{"Name": "other", "SecurityGroups": [], "EnvironmentGroup": self.target, "Priority": 1}])
        with self.assertRaises(ValueError):
            routing.plan_delete_rule(planned, "other", self.target)
        with self.assertRaises(ValueError):
            routing.plan_delete_rule(self.policy, "other", self.source)

    def test_detach_group_preserves_rule_and_other_settings(self):
        none_id = str(UUID(int=0))
        self.assertEqual(routing.resolve_target_group([], none_id)["id"], none_id)
        planned = routing.plan_retarget(self.policy, "makers", self.source, none_id)
        expected = copy.deepcopy(self.policy)
        expected["ruleSets"][1]["inputs"]["RoutingRules"][0]["EnvironmentGroup"] = none_id
        self.assertEqual(planned, expected)
        self.assertEqual(routing.group_references(planned, self.source), [])
        with self.assertRaises(ValueError):
            routing.resolve_target_group([], self.target)

    def test_stale_plan_does_not_write(self):
        session = Mock()
        planned = routing.plan_retarget(self.policy, "makers", self.source, self.target)
        with patch.object(routing, "read_routing_policy", return_value=planned):
            with self.assertRaises(ValueError):
                routing.apply_retarget(session, self.source, self.policy, planned, routing.fingerprint(self.policy))
        session.patch.assert_not_called()

    def test_patch_and_exact_readback(self):
        session = Mock()
        planned = routing.plan_retarget(self.policy, "makers", self.source, self.target)
        with patch.object(routing, "read_routing_policy", side_effect=[self.policy, planned]):
            routing.apply_retarget(session, self.source, self.policy, planned, routing.fingerprint(self.policy))
        self.assertEqual(session.patch.call_args.kwargs["json"], planned)

    def test_readback_mismatch_stops(self):
        planned = routing.plan_retarget(self.policy, "makers", self.source, self.target)
        with patch.object(routing, "read_routing_policy", return_value=self.policy):
            with self.assertRaises(ValueError):
                routing.apply_retarget(Mock(), self.source, self.policy, planned, routing.fingerprint(self.policy))

    def test_server_timestamp_is_not_configuration_drift(self):
        planned = routing.plan_retarget(self.policy, "makers", self.source, str(UUID(int=0)))
        actual = copy.deepcopy(planned)
        actual["ruleSets"][1]["lastModifiedDate"] = "2026-01-01T00:00:00Z"
        with patch.object(routing, "read_routing_policy", side_effect=[self.policy, actual]):
            routing.apply_retarget(Mock(), self.source, self.policy, planned, routing.fingerprint(self.policy))
        actual["ruleSets"][1]["inputs"]["Portals"] = []
        self.assertNotEqual(routing.configuration_payload(actual), routing.configuration_payload(planned))


if __name__ == "__main__":
    unittest.main()