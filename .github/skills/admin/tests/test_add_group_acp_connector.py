import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from add_group_acp_connector import build_plan


class AddGroupConnectorTests(unittest.TestCase):
    def test_preserves_existing_restrictions_and_other_rules(self):
        policy = {"id": "policy", "name": "test", "ruleSets": [
            {"id": "ConnectorManagement", "inputs": {"AllowedConnectorList": [
                {"AllowedConnector": "/apis/shared_existing", "AllowedActionsMode": "Restricted"}], "other": False}},
            {"id": "OtherRule", "inputs": {"enabled": True}}]}
        original = copy.deepcopy(policy)
        plan = build_plan("group", policy, [], "shared_agentnode")
        self.assertEqual(policy, original)
        self.assertEqual(plan["afterCount"], 2)
        self.assertEqual(plan["planned"]["ruleSets"][1], original["ruleSets"][1])
        self.assertEqual(plan["planned"]["ruleSets"][0]["inputs"]["AllowedConnectorList"][0], original["ruleSets"][0]["inputs"]["AllowedConnectorList"][0])
        self.assertFalse(build_plan("group", plan["planned"], [], "shared_agentnode")["added"])

    def test_missing_rule_stops(self):
        with self.assertRaises(ValueError):
            build_plan("group", {"id": "policy", "name": "test", "ruleSets": []}, [], "shared_agentnode")