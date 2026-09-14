import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from mcp_tool_plan import assert_expected, build_plan, canonical_hash


def synthetic_guid(digit):
    return "-".join((digit * 8, digit * 4, digit * 4, digit * 4, digit * 12))


ENVIRONMENT_ID = synthetic_guid("1")
BOT_ID = synthetic_guid("2")
CONNECTOR = "/providers/Microsoft.PowerApps/apis/shared_microsoftlearndocsmcpserver"
REFERENCE = "sample_agent.cr.shared_microsoftlearn.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def capture():
    return {
        "method": "PUT",
        "url": (
            f"https://example.gateway.prod.island.powerapps.com/api/botmanagement/v1/"
            f"environments/{ENVIRONMENT_ID}/bots/{BOT_ID}/content/botcomponents"
            "?includeWorkflows=true"
        ),
        "status": 200,
        "body": {
            "botComponentChanges": [{
                "$kind": "BotComponentInsert",
                "component": {
                    "$kind": "DialogComponent",
                    "schemaName": "sample_agent.tool.learn",
                    "displayName": "Microsoft Learn Docs MCP Server",
                    "dialog": {
                        "$kind": "McpTool",
                        "connectorId": CONNECTOR,
                        "operationId": "microsoft_docs_search",
                        "connectionReference": REFERENCE,
                        "authMode": "Invoker",
                    },
                },
            }],
            "connectionReferenceChanges": [{
                "$kind": "ConnectionReferenceInsert",
                "connectionReference": {
                    "$kind": "ConnectionReference",
                    "connectorId": CONNECTOR,
                    "connectionId": "a" * 32,
                    "connectionReferenceLogicalName": REFERENCE,
                },
            }],
            "bot": {"cdsBotId": BOT_ID},
        },
    }


class McpToolPlanTests(unittest.TestCase):
    def test_builds_replay_plan_from_observed_contract(self):
        plan = build_plan(capture())
        self.assertEqual(plan["operation"], "add-mcp-tool")
        self.assertEqual(plan["readBack"]["operationId"], "microsoft_docs_search")

    def test_hash_is_canonical(self):
        plan = build_plan(capture())
        reordered = dict(reversed(list(plan.items())))
        self.assertEqual(canonical_hash(plan), canonical_hash(reordered))

    def test_rejects_connector_mismatch(self):
        value = capture()
        value["body"]["connectionReferenceChanges"][0]["connectionReference"]["connectorId"] = (
            "/providers/Microsoft.PowerApps/apis/shared_other"
        )
        with self.assertRaisesRegex(ValueError, "Connector IDs do not match"):
            build_plan(value)

    def test_rejects_bot_mismatch(self):
        value = capture()
        value["body"]["bot"]["cdsBotId"] = synthetic_guid("3")
        with self.assertRaisesRegex(ValueError, "Payload bot does not match"):
            build_plan(value)

    def test_rejects_schema_drift(self):
        value = capture()
        value["body"]["botComponentChanges"][0]["component"]["dialog"]["$kind"] = "OtherTool"
        with self.assertRaisesRegex(ValueError, "Expected an McpTool or ConnectorTool"):
            build_plan(value)

    def test_builds_connector_tool_plan_from_captured_contract(self):
        value = capture()
        dialog = value["body"]["botComponentChanges"][0]["component"]["dialog"]
        dialog["$kind"] = "ConnectorTool"
        dialog["connectorId"] = "/providers/Microsoft.PowerApps/apis/shared_office365"
        dialog["operationId"] = "GetEmailsV3"
        connection = value["body"]["connectionReferenceChanges"][0]["connectionReference"]
        connection["connectorId"] = dialog["connectorId"]
        plan = build_plan(value)
        self.assertEqual(plan["operation"], "add-connector-tool")
        self.assertEqual(plan["readBack"]["kind"], "ConnectorTool")

    def test_rejects_unrelated_changes(self):
        value = capture()
        value["body"]["cloudFlowDefinitionChanges"] = [{"$kind": "CloudFlowInsert"}]
        with self.assertRaisesRegex(ValueError, "unrelated changes"):
            build_plan(value)

    def test_rejects_unobserved_gateway(self):
        value = capture()
        value["url"] = value["url"].replace(
            "example.gateway.prod.island.powerapps.com", "example.invalid"
        )
        with self.assertRaisesRegex(ValueError, "Unexpected Copilot Studio gateway URL"):
            build_plan(value)

    def test_rejects_configured_target_mismatch(self):
        plan = build_plan(capture())
        with self.assertRaisesRegex(ValueError, "configured expectation"):
            assert_expected(plan, {"operationId": "different_operation"})


if __name__ == "__main__":
    unittest.main()