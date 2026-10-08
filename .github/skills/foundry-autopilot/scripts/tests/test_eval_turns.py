"""eval_turns.py: the row the hub reads for Foundry-hosted teammates."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

PKG_DIR = Path(__file__).resolve().parents[2] / "templates" / "foundry-autopilot" / "__PKG__"


class FakeDataverse:
    enabled = True

    def __init__(self) -> None:
        self.posts: list[tuple[str, dict]] = []

    async def post(self, entity_set: str, record: dict) -> None:
        self.posts.append((entity_set, record))

    async def close(self) -> None:
        return None


def load():
    package = types.ModuleType("et_pkg")
    package.__path__ = [str(PKG_DIR)]
    dataverse = types.ModuleType("et_pkg.dataverse")
    dataverse.Dataverse = FakeDataverse
    dataverse.eval_agent_key = lambda: os.getenv("EVAL_AGENT_KEY", "")
    sys.modules["et_pkg"] = package
    sys.modules["et_pkg.dataverse"] = dataverse
    spec = importlib.util.spec_from_file_location("et_pkg.eval_turns", PKG_DIR / "eval_turns.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class TurnMirrorTests(unittest.TestCase):
    def test_a_turn_becomes_one_hub_row_under_this_teammate(self) -> None:
        module = load()
        with patch.dict(os.environ, {"PUBLISHER_PREFIX": "p", "EVAL_AGENT_KEY": "kai"}):
            mirror = module.TurnMirror()
            asyncio.run(mirror.record(
                query="q", response="a", tool_calls=["foundry_toolbox-web_search", "react_to_message"],
                actor="User", source="chat", occurred_on=datetime(2026, 9, 26, 1, 2, 3, tzinfo=timezone.utc),
            ))

        entity_set, row = mirror._dataverse.posts[0]
        self.assertEqual(entity_set, "p_evalturns")
        self.assertEqual(row["p_agentkey"], "kai")
        self.assertEqual(row["p_name"], "turn-2026-09-26T01:02:03+00:00")
        self.assertEqual(row["p_toolcount"], 2)
        self.assertEqual(json.loads(row["p_toolcalls"])[0], {"name": "web_search", "server": "foundry_toolbox"})

    def test_sources_match_the_hub_labels(self) -> None:
        module = load()
        self.assertEqual(module.source_of(types.SimpleNamespace(type="event", channel_id="msteams")), "schedule")
        self.assertEqual(module.source_of(types.SimpleNamespace(type="message", channel_id="agents:email")), "mailbox")
        self.assertEqual(module.source_of(types.SimpleNamespace(type="message", channel_id="msteams")), "chat")

    def test_nothing_is_written_without_an_agent_key(self) -> None:
        module = load()
        with patch.dict(os.environ, {"PUBLISHER_PREFIX": "p", "EVAL_AGENT_KEY": ""}):
            self.assertFalse(module.TurnMirror().enabled)


if __name__ == "__main__":
    unittest.main()
