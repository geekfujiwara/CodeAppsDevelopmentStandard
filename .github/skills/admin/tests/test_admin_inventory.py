import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import apply_group_acp_strategy as strategy
import dlp_helper
import set_acp_connector as acp


class InventoryTests(unittest.TestCase):
    def test_catalog_pagination(self):
        with patch.object(dlp_helper, "_request", side_effect=[{"value": [1], "nextLink": "/next"}, {"value": [2]}]):
            self.assertEqual(dlp_helper.list_connector_catalog("environment"), [1, 2])

    def test_partial_catalog_stops(self):
        with patch.object(dlp_helper, "_request", return_value={}):
            with self.assertRaises(ValueError):
                dlp_helper.list_connector_catalog("environment")

    def test_assignments_fail_closed(self):
        for document in [None, {}, {"value": [{"policyId": "one"}, {"policyId": "two"}]}, {"value": [], "nextLink": "/next"}]:
            with patch.object(acp, "_request", return_value=document):
                with self.assertRaises(ValueError):
                    acp.assigned_policy_id("EnvironmentGroup", "group")

    def test_legacy_cli_rejects_writes_before_api(self):
        with patch.object(sys, "argv", ["set_acp_connector.py", "--apply"]), patch.object(acp, "_request") as request:
            with self.assertRaises(SystemExit):
                acp.main()
            request.assert_not_called()

    def test_standard_matrix_and_local_override(self):
        blueprint = json.loads(strategy.BLUEPRINT.read_text(encoding="utf-8"))
        expected = {"DEF": "block-all", "CTRL": "all-supported", "PSN": "microsoft-first-party", "CTZ": "microsoft-first-party", "COE": "microsoft-first-party"}
        for group in blueprint["groups"]:
            self.assertEqual(strategy.group_profile(group, blueprint, {}), expected[group["code"]])
        coe = next(group for group in blueprint["groups"] if group["code"] == "COE")
        self.assertEqual(strategy.group_profile(coe, blueprint, {"COE": "all-supported"}), "all-supported")
        self.assertEqual(strategy.group_profile(coe, blueprint, {}), "microsoft-first-party")
        default = next(group for group in blueprint["groups"] if group["code"] == "DEF")
        with self.assertRaises(ValueError):
            strategy.group_profile(default, blueprint, {"DEF": "all-supported"})


if __name__ == "__main__":
    unittest.main()