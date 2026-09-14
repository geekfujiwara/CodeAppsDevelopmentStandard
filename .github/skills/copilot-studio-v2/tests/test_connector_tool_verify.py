import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from connector_tool_verify import parse_component_data, verify_connector_tool


CONNECTOR = "/providers/Microsoft.PowerApps/apis/shared_office365"
REFERENCE = "sample_agent.cr.shared_office365.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def row(data, componenttype=9):
    return {"componenttype": componenttype, "data": data}


class ConnectorToolVerifyTests(unittest.TestCase):
    def test_parses_observed_yaml_like_data(self):
        dialog = parse_component_data(
            "kind: ConnectorTool\n"
            "authMode: Invoker\n"
            f"connectionReference: {REFERENCE}\n"
            f"connectorId: {CONNECTOR}\n"
            "operationId: GetEmailsV3\n"
        )
        self.assertEqual(dialog["kind"], "ConnectorTool")

    def test_verifies_one_exact_connector_tool(self):
        data = json.dumps({
            "$kind": "ConnectorTool",
            "authMode": "Invoker",
            "connectionReference": REFERENCE,
            "connectorId": CONNECTOR,
            "operationId": "GetEmailsV3",
        })
        match = verify_connector_tool(
            [row(data)],
            connector_id=CONNECTOR,
            operation_id="GetEmailsV3",
            connection_reference=REFERENCE,
        )
        self.assertEqual(match["componenttype"], 9)

    def test_rejects_maker_auth(self):
        data = {
            "kind": "ConnectorTool",
            "authMode": "Maker",
            "connectionReference": REFERENCE,
            "connectorId": CONNECTOR,
            "operationId": "GetEmailsV3",
        }
        with self.assertRaisesRegex(ValueError, "found 0"):
            verify_connector_tool(
                [row(data)], connector_id=CONNECTOR, operation_id="GetEmailsV3"
            )

    def test_rejects_duplicate_matches(self):
        data = {
            "kind": "ConnectorTool",
            "authMode": "Invoker",
            "connectionReference": REFERENCE,
            "connectorId": CONNECTOR,
            "operationId": "GetEmailsV3",
        }
        with self.assertRaisesRegex(ValueError, "found 2"):
            verify_connector_tool(
                [row(data), row(data)], connector_id=CONNECTOR, operation_id="GetEmailsV3"
            )

    def test_rejects_wrong_component_type(self):
        data = {
            "kind": "ConnectorTool",
            "authMode": "Invoker",
            "connectionReference": REFERENCE,
            "connectorId": CONNECTOR,
            "operationId": "GetEmailsV3",
        }
        with self.assertRaisesRegex(ValueError, "found 0"):
            verify_connector_tool(
                [row(data, componenttype=14)],
                connector_id=CONNECTOR,
                operation_id="GetEmailsV3",
            )


if __name__ == "__main__":
    unittest.main()