import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import apply_routing_strategy as strategy


class RoutingStrategyTests(unittest.TestCase):
    def setUp(self):
        self.target = str(UUID(int=1))
        self.old = str(UUID(int=2))
        self.blueprint = {"groups": [{"code": "PSN", "name": "Personal"}]}
        self.groups = [{"id": self.target, "displayName": "Personal"}]
        self.policy = {"id": str(UUID(int=3)), "name": "routing", "ruleSets": [{"id": "EnvironmentRouting", "inputs": {
            "Portals": ["PowerApps"], "RoutingRules": [{"Name": "one", "EnvironmentGroup": self.old, "SecurityGroups": [], "Priority": 1},
            {"Name": "two", "EnvironmentGroup": str(UUID(int=0)), "SecurityGroups": [self.old], "Priority": 2}]}}]}
        self.settings = {"powerPlatform": {"governance": {strategy.TARGET_KEY: self.old, "enableDefaultEnvironmentRouting": True}}, "other": False}
        self.plan = strategy.build_plan(self.blueprint, self.groups, [], self.policy, self.settings)

    def test_all_targets_change_without_audience_or_portal_expansion(self):
        expected = copy.deepcopy(self.policy)
        for rule in expected["ruleSets"][0]["inputs"]["RoutingRules"]:
            rule["EnvironmentGroup"] = self.target
        self.assertEqual(self.plan["modernPlanned"], expected)
        self.assertEqual(self.policy["ruleSets"][0]["inputs"]["RoutingRules"][0]["EnvironmentGroup"], self.old)
        self.assertTrue(self.plan["requiresConsent"])

    def test_missing_target_stops(self):
        with self.assertRaises(ValueError):
            strategy.build_plan(self.blueprint, [], [], self.policy, self.settings)

    def test_routing_scan_generates_consent_plan(self):
        import generate_migration_plan
        markdown = generate_migration_plan.build({"readOnly": True, "routingRecommendation": self.plan}, self.blueprint, {})
        self.assertIn("Personal", markdown)
        self.assertIn("one", markdown)
        self.assertIn("two", markdown)
        self.assertIn("--expected-hash <APPROVED_HASH>", markdown)

    def test_general_apply_does_not_write_routing(self):
        import apply_environment_strategy as general
        blueprint = {"tenantSettings": {"powerPlatform.governance." + strategy.TARGET_KEY: {"label": "target", "expected": self.target}}}
        with patch.object(general, "get_tenant_settings", return_value=self.settings), patch.object(general, "list_groups", return_value=self.groups), patch.object(general, "save_tenant_settings") as save:
            self.assertEqual(general.apply_tenant_settings(blueprint, True), 0)
        save.assert_not_called()

    def test_noop_does_not_write(self):
        updated = copy.deepcopy(self.settings)
        updated["powerPlatform"]["governance"][strategy.TARGET_KEY] = self.target
        plan = strategy.build_plan(self.blueprint, self.groups, [], self.plan["modernPlanned"], updated)
        bap_session = Mock()
        with patch.object(strategy, "scan_routing", return_value=plan), patch.object(strategy, "apply_retarget") as modern:
            strategy.apply_plan("tenant", self.blueprint, plan, strategy.plan_hash(plan), Mock(), bap_session, Mock())
        modern.assert_not_called()
        bap_session.post.assert_not_called()

    def test_stale_plan_stops_before_writes(self):
        pp_session, bap_session = Mock(), Mock()
        with patch.object(strategy, "scan_routing", return_value={}):
            with self.assertRaises(ValueError):
                strategy.apply_plan("tenant", self.blueprint, self.plan, strategy.plan_hash(self.plan), pp_session, bap_session, Mock())
        pp_session.patch.assert_not_called()
        bap_session.post.assert_not_called()

    def test_apply_preserves_other_legacy_settings_and_membership(self):
        updated = copy.deepcopy(self.settings)
        updated["powerPlatform"]["governance"][strategy.TARGET_KEY] = self.target
        after = strategy.build_plan(self.blueprint, self.groups, [], self.plan["modernPlanned"], updated)
        bap_session = Mock()
        with patch.object(strategy, "scan_routing", side_effect=[self.plan, after]), patch.object(strategy, "read_settings", return_value=self.settings), patch.object(strategy, "apply_retarget") as modern:
            result = strategy.apply_plan("tenant", self.blueprint, self.plan, strategy.plan_hash(self.plan), Mock(), bap_session, Mock())
        self.assertTrue(result["otherSettingsPreserved"])
        modern.assert_called_once()
        self.assertEqual(bap_session.post.call_args.kwargs["json"], {"powerPlatform": {"governance": {strategy.TARGET_KEY: self.target}}})

    def test_modern_failure_stops_legacy_write(self):
        bap_session = Mock()
        with patch.object(strategy, "scan_routing", return_value=self.plan), patch.object(strategy, "apply_retarget", side_effect=ValueError("readback")):
            with self.assertRaises(ValueError):
                strategy.apply_plan("tenant", self.blueprint, self.plan, strategy.plan_hash(self.plan), Mock(), bap_session, Mock())
        bap_session.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()