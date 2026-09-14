import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from update_agent import tool_kind


class UpdateAgentTests(unittest.TestCase):
    def test_recognizes_mcp_tool(self):
        self.assertEqual(tool_kind("kind: McpTool\nauthMode: Invoker"), "McpTool")

    def test_recognizes_connector_tool(self):
        self.assertEqual(
            tool_kind("kind: ConnectorTool\nauthMode: Invoker"), "ConnectorTool"
        )

    def test_ignores_nested_or_unrelated_kind(self):
        self.assertIsNone(tool_kind("description: kind: McpTool\nkind: InlineAgentSkill"))


if __name__ == "__main__":
    unittest.main()