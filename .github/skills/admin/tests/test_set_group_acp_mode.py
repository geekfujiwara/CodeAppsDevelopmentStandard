import copy
import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
STANDARD_SCRIPTS = SCRIPTS.parents[1] / "standard" / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(STANDARD_SCRIPTS))
SPEC = importlib.util.spec_from_file_location("set_group_acp_mode", SCRIPTS / "set_group_acp_mode.py")
acp_mode = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = acp_mode
SPEC.loader.exec_module(acp_mode)


class SetGroupAcpModeTests(unittest.TestCase):
    def setUp(self):
        self.policy = {
            "id": "policy-placeholder",
            "name": "Group policy",
            "ruleSets": [
                {"id": "CodeAppsFeature", "version": "1.0", "inputs": {"Enabled": "False"}},
                {
                    "id": "AdvancedConnectorPoliciesOnly",
                    "version": "1.0",
                    "inputs": {"EnableAdvancedConnectorPoliciesOnly": "false"},
                },
            ],
        }
        self.environments = [
            {
                "name": "environment-placeholder",
                "properties": {
                    "displayName": "Development",
                    "parentEnvironmentGroup": {"id": "group-placeholder"},
                },
            }
        ]

    def test_builds_typed_acp_only_plan_and_preserves_other_rules(self):
        plan = acp_mode.build_plan("group-placeholder", self.policy, self.environments, True)
        rule = next(item for item in plan["planned"]["ruleSets"] if item["id"] == acp_mode.RULE_ID)
        self.assertIs(rule["inputs"][acp_mode.INPUT_KEY], True)
        self.assertIs(plan["planned"]["ruleSets"][0]["inputs"]["Enabled"], False)
        self.assertEqual(plan["members"][0]["name"], "Development")
        acp_mode.validate_plan(plan)

    def test_rejects_change_to_unrelated_rule(self):
        plan = acp_mode.build_plan("group-placeholder", self.policy, self.environments, True)
        changed = copy.deepcopy(plan)
        changed["planned"]["ruleSets"][0]["inputs"]["Enabled"] = True
        with self.assertRaisesRegex(ValueError, "outside ACP-only mode"):
            acp_mode.validate_plan(changed)

    def test_rejects_policy_identity_change(self):
        plan = acp_mode.build_plan("group-placeholder", self.policy, self.environments, True)
        plan["planned"]["id"] = "other-policy"
        with self.assertRaisesRegex(ValueError, "Policy identity changed"):
            acp_mode.validate_plan(plan)

    def test_requires_existing_policy(self):
        with self.assertRaisesRegex(ValueError, "must already have"):
            acp_mode.build_plan("group-placeholder", None, [], True)

    def test_readback_requires_exact_policy(self):
        plan = acp_mode.build_plan("group-placeholder", self.policy, self.environments, True)
        actual_policy = copy.deepcopy(plan["planned"])
        actual = acp_mode.build_plan(
            "group-placeholder", actual_policy, self.environments, True
        )
        acp_mode.verify_readback(plan, actual)

        actual["before"]["ruleSets"][0]["inputs"]["Enabled"] = True
        actual["planned"]["ruleSets"][0]["inputs"]["Enabled"] = True
        with self.assertRaisesRegex(ValueError, "does not match"):
            acp_mode.verify_readback(plan, actual)

    def test_readback_rejects_membership_change(self):
        plan = acp_mode.build_plan("group-placeholder", self.policy, self.environments, True)
        actual = acp_mode.build_plan(
            "group-placeholder", plan["planned"], [], True
        )
        with self.assertRaisesRegex(ValueError, "membership changed"):
            acp_mode.verify_readback(plan, actual)


if __name__ == "__main__":
    unittest.main()