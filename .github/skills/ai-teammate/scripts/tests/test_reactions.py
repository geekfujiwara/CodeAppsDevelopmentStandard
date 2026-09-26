"""reactions.py: which message may be reacted to, and with what."""

from __future__ import annotations

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[2] / "templates" / "foundry-autopilot" / "__PKG__" / "reactions.py"
sys.modules.setdefault("copilot", types.SimpleNamespace(Tool=object, define_tool=lambda *a, **k: None))
spec = importlib.util.spec_from_file_location("reactions_under_test", MODULE)
reactions = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(reactions)
    LOADED = True
except Exception:  # pydantic / httpx missing in the test environment
    LOADED = False


def activity(channel="msteams", kind="message", conversation_type="personal", chat="19:chat-under-test", mid="1700"):
    conversation = types.SimpleNamespace(id=chat, conversation_type=conversation_type)
    return types.SimpleNamespace(channel_id=channel, type=kind, conversation=conversation, id=mid)


@unittest.skipUnless(LOADED, "pydantic / httpx not installed")
class ReactionTargetTests(unittest.TestCase):
    def test_a_teams_chat_message_is_a_target(self) -> None:
        self.assertEqual(reactions.target(activity()), ("19:chat-under-test", "1700"))

    def test_mail_scheduled_events_and_channel_posts_are_not(self) -> None:
        self.assertIsNone(reactions.target(activity(channel="agents:email")))
        self.assertIsNone(reactions.target(activity(kind="event")))
        self.assertIsNone(reactions.target(activity(conversation_type="channel")))

    def test_an_emoji_outside_the_list_never_asks_for_a_token(self) -> None:
        asked: list[str] = []

        async def token(scope: str):
            asked.append(scope)
            return "t"

        self.assertFalse(asyncio.run(reactions.set_reaction(activity(), token, "🖕")))
        self.assertEqual(asked, [])


if __name__ == "__main__":
    unittest.main()
