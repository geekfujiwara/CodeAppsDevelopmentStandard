"""EvaluationWorker keeps shared-hub jobs isolated by Autopilot and persists rule results."""

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
        self.queries: list[str] = []
        self.posts: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, str, dict]] = []
        self.claimed = True
        self.job_scope = 1
        self.has_existing_result = False

    async def get(self, query: str) -> dict:
        self.queries.append(query)
        if "_evaljobs" in query and "p_status eq 2" in query:
            return {"value": []}
        if "_evaljobs" in query:
            return {
                "value": [
                    {
                        "@odata.etag": 'W/"5"',
                        "p_evaljobid": "job-1",
                        "p_agentkeys": "alpha",
                        "p_scope": self.job_scope,
                        "p_rulekeys": "",
                    }
                ]
            }
        if "_evalrules" in query:
            return {
                "value": [
                    {
                        "p_rulekey": "task_adherence",
                        "p_name": "Task adherence",
                        "p_prompt": "Follow the request",
                    }
                ]
            }
        if "_evalturns" in query:
            return {
                "value": [
                    {
                        "p_evalturnid": "turn-id",
                        "p_name": "turn-1",
                        "p_query": "question",
                        "p_response": "answer",
                        "p_toolcalls": "[]",
                    }
                ]
            }
        if "_evalresults" in query:
            if self.has_existing_result and "p_turnname,p_rulekey" in query:
                return {"value": [{"p_turnname": "turn-1", "p_rulekey": "task_adherence"}]}
            return {"value": []}
        raise AssertionError(query)

    async def try_patch(self, entity_set: str, row_id: str, body: dict, *, etag: str | None) -> bool:
        self.patches.append((entity_set, row_id, body))
        self.last_etag = etag
        return self.claimed

    async def patch(self, entity_set: str, row_id: str, body: dict) -> None:
        self.patches.append((entity_set, row_id, body))

    async def post(self, entity_set: str, body: dict) -> dict:
        self.posts.append((entity_set, body))
        return {}

    async def close(self) -> None:
        return None


def load_worker():
    package = types.ModuleType("ew_pkg")
    package.__path__ = [str(PKG_DIR)]
    dataverse = types.ModuleType("ew_pkg.dataverse")
    dataverse.Dataverse = FakeDataverse
    dataverse.eval_agent_key = lambda: "alpha"
    dataverse.odata_literal = lambda value: value.replace("'", "''")
    sys.modules["ew_pkg"] = package
    sys.modules["ew_pkg.dataverse"] = dataverse
    spec = importlib.util.spec_from_file_location(
        "ew_pkg.evaluation_worker", PKG_DIR / "evaluation_worker.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class EvaluationWorkerTests(unittest.TestCase):
    def test_targeted_job_is_claimed_with_etag_and_scored(self) -> None:
        module = load_worker()

        async def judge(_prompt: str) -> str:
            return (
                '{"score": 4, "reason": "good",'
                '"evidence": [{"quote": "answer"}], "suggestions": []}'
            )

        store = FakeDataverse()
        worker = module.EvaluationWorker(
            judge=judge, prefix="p", agent_key="alpha", dataverse=store
        )
        self.assertTrue(asyncio.run(worker.drain_once()))

        job_query = next(query for query in store.queries if "_evaljobs" in query)
        self.assertIn("p_agentkeys eq 'alpha'", job_query)
        self.assertEqual(store.last_etag, 'W/"5"')
        self.assertEqual(store.posts[0][1]["p_agentkey"], "alpha")
        self.assertEqual(store.posts[0][1]["p_score"], 4)
        self.assertEqual(store.posts[0][1]["p_runid"], "job-1")
        terminal = [
            body
            for entity, row, body in store.patches
            if entity == "p_evaljobs" and row == "job-1" and body.get("p_status") == module.STATUS_DONE
        ]
        self.assertEqual(len(terminal), 1)

    def test_lost_claim_does_not_process_job(self) -> None:
        module = load_worker()

        async def judge(_prompt: str) -> str:
            raise AssertionError("must not judge after losing the ETag claim")

        store = FakeDataverse()
        store.claimed = False
        worker = module.EvaluationWorker(
            judge=judge, prefix="p", agent_key="alpha", dataverse=store
        )

        self.assertFalse(asyncio.run(worker.drain_once()))
        self.assertEqual(store.posts, [])

    def test_invalid_evaluator_json_marks_the_job_failed(self) -> None:
        module = load_worker()

        async def judge(_prompt: str) -> str:
            return "not json"

        store = FakeDataverse()
        worker = module.EvaluationWorker(
            judge=judge, prefix="p", agent_key="alpha", dataverse=store
        )
        asyncio.run(worker.drain_once())

        terminal = [
            body
            for entity, row, body in store.patches
            if entity == "p_evaljobs" and row == "job-1" and body.get("p_status") == module.STATUS_FAILED
        ]
        self.assertEqual(len(terminal), 1)
        self.assertIn("JSON", terminal[0]["p_message"])

    def test_only_own_stale_jobs_are_recovered(self) -> None:
        module = load_worker()
        store = FakeDataverse()

        async def stale_get(query: str) -> dict:
            store.queries.append(query)
            if "p_status eq 2" in query:
                return {
                    "value": [
                        {
                            "@odata.etag": 'W/"9"',
                            "p_evaljobid": "stale-job",
                            "p_agentkeys": "alpha",
                            "p_startedon": "2020-01-01T00:00:00Z",
                        }
                    ]
                }
            return {"value": []}

        store.get = stale_get
        worker = module.EvaluationWorker(
            judge=lambda _prompt: None,
            prefix="p",
            agent_key="alpha",
            dataverse=store,
            stale_minutes=5,
        )
        self.assertFalse(asyncio.run(worker.drain_once()))

        stale_query = next(query for query in store.queries if "p_status eq 2" in query)
        self.assertIn("p_agentkeys eq 'alpha'", stale_query)
        recovered = [
            body
            for entity, row, body in store.patches
            if entity == "p_evaljobs" and row == "stale-job"
        ]
        self.assertEqual(recovered[0]["p_status"], module.STATUS_PENDING)

    def test_period_scope_does_not_overwrite_an_existing_pair(self) -> None:
        module = load_worker()

        async def judge(_prompt: str) -> str:
            raise AssertionError("existing period result must not be rescored")

        store = FakeDataverse()
        store.job_scope = module.SCOPE_PERIOD
        store.has_existing_result = True
        worker = module.EvaluationWorker(
            judge=judge, prefix="p", agent_key="alpha", dataverse=store
        )

        self.assertTrue(asyncio.run(worker.drain_once()))
        self.assertEqual(store.posts, [])
        target_updates = [
            body
            for entity, row, body in store.patches
            if entity == "p_evaljobs" and row == "job-1" and "p_targetcount" in body
        ]
        self.assertEqual(target_updates[0]["p_targetcount"], 0)

    def test_drain_all_processes_every_waiting_job(self) -> None:
        module = load_worker()
        store = FakeDataverse()
        remaining = ["job-1", "job-2"]

        original_get = store.get

        async def queued_get(query: str) -> dict:
            if "_evaljobs" in query and "p_status eq 1" in query:
                if not remaining:
                    return {"value": []}
                job_id = remaining.pop(0)
                return {
                    "value": [
                        {
                            "@odata.etag": 'W/"5"',
                            "p_evaljobid": job_id,
                            "p_agentkeys": "alpha",
                            "p_scope": module.SCOPE_UNEVALUATED,
                            "p_rulekeys": "",
                        }
                    ]
                }
            return await original_get(query)

        store.get = queued_get

        async def judge(_prompt: str) -> str:
            return '{"score": 5, "reason": "ok"}'

        worker = module.EvaluationWorker(
            judge=judge, prefix="p", agent_key="alpha", dataverse=store
        )
        self.assertEqual(asyncio.run(worker.drain_all()), 2)


if __name__ == "__main__":
    unittest.main()
