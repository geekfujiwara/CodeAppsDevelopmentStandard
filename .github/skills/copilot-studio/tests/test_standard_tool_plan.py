import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "standard_tool_plan.py"
SPEC = importlib.util.spec_from_file_location("standard_tool_plan", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def guid(digit: str) -> str:
    return "-".join(digit * length for length in (8, 4, 4, 4, 12))


def capture() -> dict:
    environment_id = guid("1")
    bot_id = guid("2")
    connector_id = "/providers/Microsoft.PowerApps/apis/shared_a365outlookmailmcp"
    reference = "sample_agent.shared_a365outlookmailmcp." + "a" * 32
    component = {
        "schemaName": "sample_agent.action.MailMCP",
        "displayName": "Mail MCP - Mail (Preview)",
        "dialog": {
            "inputs": [],
            "outputs": [],
            "action": {
                "connectionReference": reference,
                "operationDetails": {
                    "knownTools": [],
                    "operationId": "mcp_MailTools",
                    "$kind": "ModelContextProtocolMetadata",
                },
                "$kind": "InvokeExternalAgentTaskAction",
                "connectionProperties": {"mode": "Invoker", "$kind": "ConnectionProperties"},
            },
            "$kind": "TaskDialog",
        },
        "$kind": "DialogComponent",
    }
    payload = {
        "botComponentChanges": [{"component": component, "$kind": "BotComponentInsert"}],
        "connectionReferenceChanges": [{
            "connectionReference": {
                "connectionReferenceLogicalName": reference,
                "id": guid("3"),
                "connectionId": "a" * 32,
                "connectorId": connector_id,
                "$kind": "ConnectionReference",
            },
            "$kind": "ConnectionReferenceInsert",
        }],
        "changeToken": "change-token",
    }
    for key in MODULE.EMPTY_CHANGE_KEYS:
        payload[key] = []
    return {
        "method": "PUT",
        "url": (
            "https://example.gateway.prod.island.powerapps.com/api/botmanagement/v1/"
            f"environments/{environment_id}/bots/{bot_id}/content/botcomponents"
        ),
        "body": payload,
    }


class StandardToolPlanTests(unittest.TestCase):
    def test_builds_standard_mcp_plan(self) -> None:
        plan = MODULE.build_plan(capture())
        self.assertEqual(plan["contract"], MODULE.CONTRACT)
        self.assertEqual(plan["operationId"], "mcp_MailTools")
        self.assertEqual(plan["readBack"]["actionKind"], "InvokeExternalAgentTaskAction")

    def test_rejects_contract_drift(self) -> None:
        cases = [
            (
                lambda value: value["body"].update({"cloudFlowDefinitionChanges": [{}]}),
                "unrelated",
            ),
            (
                lambda value: value["body"]["botComponentChanges"][0]["component"]["dialog"]
                ["action"]["connectionProperties"].update({"mode": "Maker"}),
                "Invoker",
            ),
            (lambda value: value["body"].update({"changeToken": ""}), "changeToken"),
        ]
        for mutate, message in cases:
            with self.subTest(message=message):
                value = copy.deepcopy(capture())
                mutate(value)
                with self.assertRaisesRegex(ValueError, message):
                    MODULE.build_plan(value)

    def test_rejects_query_parameters(self) -> None:
        value = capture()
        value["url"] += "?includeWorkflows=true"
        with self.assertRaisesRegex(ValueError, "gateway URL"):
            MODULE.build_plan(value)

    def test_approval_hash_ignores_only_runtime_values(self) -> None:
        first = MODULE.build_plan(capture())
        second_capture = copy.deepcopy(capture())
        second_capture["body"]["changeToken"] = "next-token"
        second_capture["body"]["connectionReferenceChanges"][0]["connectionReference"]["id"] = guid("4")
        second = MODULE.build_plan(second_capture)
        self.assertEqual(MODULE.canonical_hash(first), MODULE.canonical_hash(second))
        second["componentDisplayName"] = "Changed"
        self.assertNotEqual(MODULE.canonical_hash(first), MODULE.canonical_hash(second))


if __name__ == "__main__":
    unittest.main()