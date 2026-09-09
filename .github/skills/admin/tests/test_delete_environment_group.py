import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from delete_environment_group import inventory, validate_target


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


if __name__ == "__main__":
    unittest.main()