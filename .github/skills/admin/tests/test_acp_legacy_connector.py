import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import set_acp_connector as acp
import migrate_dlp_to_acp as migrate
import remove_group_acp_connector as remove
from add_group_acp_connector import build_plan as add_plan

LEGACY = "shared_commondataservice"
CURRENT = "shared_commondataserviceforapps"


def policy(*connectors):
    return {"id": "policy", "name": "Default Policy Name", "ruleSets": [
        {"id": "ConnectorManagement", "lastModifiedDate": "2026-01-01T00:00:00Z", "inputs": {"AllowedConnectorList": [
            {"AllowedConnector": acp.CONNECTOR_PREFIX + name, "AllowedActionsMode": "AllAllowed",
             "AllowedConnectionTypesMode": "AllAllowed"} for name in connectors]}},
        {"id": "CodeAppsFeature", "inputs": {"PowerApps_AllowCodeApps": True}}]}


class LegacyConnectorGateTests(unittest.TestCase):
    def test_profile_marks_legacy_and_keeps_current(self):
        self.assertIn(LEGACY, acp.denied_connectors())
        self.assertNotIn(CURRENT, acp.denied_connectors())

    def test_incremental_add_rejects_legacy_only(self):
        rule = {"inputs": {"AllowedConnectorList": []}}
        with self.assertRaises(ValueError):
            acp.add_connectors(rule, [LEGACY])
        self.assertEqual(rule["inputs"]["AllowedConnectorList"], [])
        self.assertEqual(acp.add_connectors(rule, [CURRENT]), [CURRENT])

    def test_group_add_helper_rejects_legacy_and_reports_existing(self):
        with self.assertRaises(ValueError):
            add_plan("group", policy(CURRENT), [], LEGACY)
        plan = add_plan("group", policy(CURRENT, LEGACY), [], "shared_agentnode")
        self.assertEqual(plan["deniedExisting"], [LEGACY])

    def test_patch_rejects_any_final_list_holding_legacy(self):
        with patch.object(acp, "_request") as request:
            with self.assertRaises(ValueError):
                acp.patch_policy("policy", policy(CURRENT, LEGACY), copy.deepcopy(policy(CURRENT, LEGACY)["ruleSets"][0]))
            request.assert_not_called()
            acp.patch_policy("policy", policy(CURRENT), copy.deepcopy(policy(CURRENT)["ruleSets"][0]))
            request.assert_called_once()

    def test_patch_keeps_every_other_group_rule(self):
        current = policy(CURRENT)
        with patch.object(acp, "_request") as request:
            acp.patch_policy("policy", current, copy.deepcopy(current["ruleSets"][0]))
        body = request.call_args[0][2]
        self.assertEqual([rule["id"] for rule in body["ruleSets"]], ["ConnectorManagement", "CodeAppsFeature"])
        self.assertEqual(body["ruleSets"][1], current["ruleSets"][1])
        self.assertNotIn("lastModifiedDate", body["ruleSets"][0])

    def test_patch_initializes_missing_rule_without_dropping_others(self):
        existing = policy(CURRENT)
        existing["ruleSets"] = [rule for rule in existing["ruleSets"] if rule["id"] != acp.RULE_SET_ID]
        existing["ruleSets"].append({"id": "AdvancedConnectorPoliciesOnly", "inputs": {"Enabled": True}})
        with patch.object(acp, "_request") as request:
            acp.patch_policy("policy", existing, {"id": acp.RULE_SET_ID, "version": "1.0",
                                                  "inputs": {"AllowedConnectorList": []}})
        body = request.call_args[0][2]
        self.assertEqual([rule["id"] for rule in body["ruleSets"]],
                         ["CodeAppsFeature", "AdvancedConnectorPoliciesOnly", acp.RULE_SET_ID])

    def test_dlp_migration_drops_legacy(self):
        report = {"_classification": {LEGACY: "General", CURRENT: "General"}, "_display": {}, "customConnectors": []}
        self.assertEqual(migrate.target_allow_set(report, {"General"}, False, False), {CURRENT})


class RemoveGroupConnectorTests(unittest.TestCase):
    def test_removes_only_the_target_and_keeps_other_rules(self):
        original = policy("shared_a", LEGACY, CURRENT)
        source = copy.deepcopy(original)
        plan = remove.build_plan("group", source, [{"id": "env", "name": "Env"}], LEGACY)
        self.assertEqual(source, original)
        self.assertEqual(plan["beforeCount"], 3)
        self.assertEqual(plan["afterCount"], 2)
        self.assertEqual(plan["removed"][0]["AllowedConnector"], acp.CONNECTOR_PREFIX + LEGACY)
        rule = plan["planned"]["ruleSets"][0]
        self.assertEqual(acp.allowed_ids(rule), {"shared_a", CURRENT})
        self.assertNotIn("lastModifiedDate", rule)
        self.assertEqual(plan["planned"]["ruleSets"][1], original["ruleSets"][1])

    def test_missing_entry_stops_before_any_write(self):
        with self.assertRaises(ValueError):
            remove.build_plan("group", policy(CURRENT), [], LEGACY)

    def test_hash_covers_membership(self):
        first = remove.build_plan("group", policy(LEGACY), [{"id": "a", "name": "A"}], LEGACY)
        second = remove.build_plan("group", policy(LEGACY), [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}], LEGACY)
        self.assertNotEqual(remove.fingerprint(first), remove.fingerprint(second))


if __name__ == "__main__":
    unittest.main()
