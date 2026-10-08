"""TestWorker.drain_all: the B11 tick session stops itself, so it must finish queued cases first."""

from __future__ import annotations

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parents[2] / "templates" / "foundry-autopilot" / "__PKG__"


class FakeDataverse:
    enabled = True

    def __init__(self) -> None:
        self.waiting = ["r1", "r2", "r3"]
        self.patches: list[tuple[str, int]] = []
        self.bodies: dict[str, dict] = {}

    async def get(self, query: str) -> dict:
        if "_evalrules" in query:
            return {"value": [{"p_name": "正確さ", "p_prompt": "正しいか"}, {"p_name": "丁寧さ", "p_prompt": "丁寧か"}]}
        batch, self.waiting = self.waiting[:2], self.waiting[2:]
        return {"value": [{"p_evaltestresultid": row, "p_prompt": "hi"} for row in batch]}

    async def patch(self, _entity_set: str, row_id: str, body: dict) -> None:
        self.patches.append((row_id, body["p_status"]))
        self.bodies[row_id] = body

    async def close(self) -> None:
        return None


def load_test_worker():
    package = types.ModuleType("tw_pkg")
    package.__path__ = [str(PKG_DIR)]
    dataverse = types.ModuleType("tw_pkg.dataverse")
    dataverse.Dataverse = FakeDataverse
    dataverse.eval_agent_key = lambda: "agent"
    dataverse.odata_literal = lambda value: value
    sys.modules["tw_pkg"] = package
    sys.modules["tw_pkg.dataverse"] = dataverse
    spec = importlib.util.spec_from_file_location("tw_pkg.test_worker", PKG_DIR / "test_worker.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class DrainAllTests(unittest.TestCase):
    def test_every_waiting_case_finishes_before_returning(self) -> None:
        module = load_test_worker()

        async def run_turn(**_kwargs):
            return "ok", []

        worker = module.TestWorker(run_turn=run_turn, prefix="p", agent_key="agent")
        done = asyncio.run(worker.drain_all())

        self.assertEqual(done, 3)
        finished = [row for row, status in worker._dataverse.patches if status == module.STATUS_DONE]
        self.assertEqual(finished, ["r1", "r2", "r3"])

    def test_answers_are_scored_with_the_hub_rules(self) -> None:
        # Without a score every case that asks for minScore fails (troubleshooting #97).
        module = load_test_worker()

        async def run_turn(**_kwargs):
            return "ok", []

        scores = iter(['{"score": 4, "reason": "a"}', '```json\n{"score": 2, "reason": "b"}\n```'] * 3)

        async def judge(_prompt: str) -> str:
            return next(scores)

        worker = module.TestWorker(run_turn=run_turn, judge=judge, prefix="p", agent_key="agent")
        asyncio.run(worker.drain_all())

        body = worker._dataverse.bodies["r1"]
        self.assertEqual(body["p_autoscore"], 3.0)
        self.assertIn("正確さ: 4 / 5", body["p_autosummary"])

    def test_a_filtered_request_is_judged_without_its_text(self) -> None:
        module = load_test_worker()
        seen: list[str] = []

        async def judge(prompt: str) -> str:
            seen.append(prompt)
            if "<request>\nhi\n</request>" in prompt:
                raise RuntimeError("Error code: 400 - {'code': 'content_filter'}")
            return '{"score": 5, "reason": "ok"}'

        worker = module.TestWorker(run_turn=None, judge=judge, prefix="p", agent_key="agent")
        score, _ = asyncio.run(worker._score("hi", "blocked", ["web_search"]))

        self.assertEqual(score, 5.0)
        self.assertIn(module.FILTERED_REQUEST, seen[-1])
        self.assertIn("web_search", seen[-1])


if __name__ == "__main__":
    unittest.main()
