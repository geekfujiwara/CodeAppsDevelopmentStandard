"""Guard the Teams-reach-out gate used by the Foundry Autopilot template.

The teammate only receives the Teams MCP server when the turn asks it to reach
someone else. The first version matched English words only, so a Japanese
"チャットで聞いて" silently dropped the tool and scheduling stalled: the agent
could propose times but never confirm them with the other person.
"""

import ast
import re
import unittest
from pathlib import Path

TEMPLATE = (
    Path(__file__).resolve().parents[2]
    / "templates"
    / "foundry-autopilot"
    / "__PKG__"
    / "teammate_agent.py"
)


def _constants() -> dict[str, str]:
    values: dict[str, str] = {}
    for node in ast.parse(TEMPLATE.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "").startswith("_TEAMS_"):
            values[node.targets[0].id] = ast.literal_eval(node.value)
    return values


def is_outbound(message: str) -> bool:
    values = _constants()
    action, target = values["_TEAMS_ACTION"], values["_TEAMS_TARGET"]
    return bool(
        re.search(rf"{action}.{{0,80}}{target}", message, re.IGNORECASE)
        or re.search(rf"{target}.{{0,80}}{action}", message, re.IGNORECASE)
    )


class OutboundTeamsRequestTests(unittest.TestCase):
    def test_japanese_requests_reach_the_teams_tool(self):
        for message in (
            "佐藤さんにチャットで空いているか聞いて",
            "打ち合わせの候補を出して、本人にチャットで確認してほしい",
            "チームのチャネルに投稿して",
            "山田さんに Teams で連絡して",
            "その内容をメッセージで伝えておいて",
        ):
            with self.subTest(message=message):
                self.assertTrue(is_outbound(message))

    def test_english_requests_still_match(self):
        for message in ("send a message to the team chat", "post this in the channel"):
            with self.subTest(message=message):
                self.assertTrue(is_outbound(message))

    def test_ordinary_turns_keep_the_tool_out(self):
        for message in ("今週の予定を教えて", "来週の空き時間を探して", "猫の絵を描いて"):
            with self.subTest(message=message):
                self.assertFalse(is_outbound(message))

    def test_template_calls_the_gate_instead_of_hardcoding_false(self):
        source = TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("include_teams=include_teams", source)
        self.assertIn("is_outbound_teams_request(message)", source)


if __name__ == "__main__":
    unittest.main()
