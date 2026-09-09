import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import apply_acp_profile as profile


class GroupProfileTests(unittest.TestCase):
    def test_group_only(self):
        with patch.object(profile, "_environment_group_id", return_value="group"), patch.object(profile, "assigned_policy_id", return_value="policy") as assigned:
            self.assertEqual(profile.resolve_policy_targets("env")[0][1], "policy")
            assigned.assert_called_once_with("EnvironmentGroup", "group")
            with self.assertRaises(ValueError):
                profile.resolve_policy_targets("env", environment_only=True)
            with self.assertRaises(ValueError):
                profile.resolve_policy_targets("env", policy_id="environment-policy")

    def test_missing_group_stops(self):
        with patch.object(profile, "_environment_group_id", return_value=None), patch.object(profile, "assigned_policy_id") as assigned:
            with self.assertRaises(ValueError):
                profile.resolve_policy_targets("env")
            assigned.assert_not_called()

    def test_all_supported_excludes_legacy_and_keeps_custom(self):
        selected = profile.load_profile(profile.DEFAULT_PROFILE_FILE, "all-supported")
        catalog = [{"name": name, "properties": {"displayName": display}} for name, display in [
            ("shared_custom", "Custom MCP"), ("shared_thirdparty", "Third Party"),
            ("shared_commondataservice", "Microsoft Dataverse"), ("shared_old", "Example (Deprecated)"),
        ]]
        allowed = profile.resolve_catalog_set(selected, catalog)
        self.assertEqual(allowed, {"shared_custom", "shared_thirdparty", "shared_agentnode"})
        with self.assertRaises(ValueError):
            profile.resolve_catalog_set(selected, catalog, include=["shared_old"])

    def test_required_work_iq_missing_stops(self):
        with self.assertRaises(ValueError):
            profile.resolve_catalog_set(profile.load_profile(profile.DEFAULT_PROFILE_FILE, "microsoft-first-party"), [])

    def test_existing_action_and_connection_restrictions_survive(self):
        entry = {"AllowedConnector": profile.CONNECTOR_PREFIX + "shared_existing", "AllowedActionsMode": "AllowList", "AllowedActions": ["Read"], "AllowedConnectionTypesMode": "AllowList", "AllowedConnectionTypes": ["OAuth"]}
        document = {"name": "Test", "ruleSets": [{"id": "ConnectorManagement", "inputs": {"AllowedConnectorList": [copy.deepcopy(entry)]}}]}

        def save(policy_id, name, rule):
            document["ruleSets"][0] = copy.deepcopy(rule)

        with patch.object(profile, "get_policy", side_effect=lambda _: copy.deepcopy(document)), patch.object(profile, "patch_policy", side_effect=save):
            profile._process("group", "policy", {"shared_existing", "shared_new"}, {}, set(), False, 20, True)
        entries = document["ruleSets"][0]["inputs"]["AllowedConnectorList"]
        self.assertIn(entry, entries)

    def test_initialize_empty_rule_and_preserve_other_rules(self):
        document = {"name": "Test", "ruleSets": [{"id": "Other", "inputs": {"enabled": True}}]}

        def save(policy_id, name, rule):
            document["ruleSets"].append(copy.deepcopy(rule))

        with patch.object(profile, "get_policy", side_effect=lambda _: copy.deepcopy(document)), patch.object(profile, "patch_policy", side_effect=save) as write:
            self.assertFalse(profile._process("group", "policy", set(), {}, set(), False, 20, False))
            write.assert_not_called()
            self.assertTrue(profile._process("group", "policy", set(), {}, set(), False, 20, True))
            self.assertEqual(document["ruleSets"][0]["inputs"], {"enabled": True})
            self.assertEqual(profile.allowed_ids(profile.connector_rule_set(document)), set())


if __name__ == "__main__":
    unittest.main()