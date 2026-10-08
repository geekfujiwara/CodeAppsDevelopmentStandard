"""Evaluate normal conversation turns queued by the shared Dataverse evaluation hub.

Each hub job targets exactly one ``agentkey``. This worker only claims jobs for its own key,
which lets several Autopilots share the same tables without scoring or completing one another's
work. Claims use the Dataverse row ETag so two live sessions of the same Autopilot cannot run the
same job concurrently.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from .dataverse import Dataverse, eval_agent_key, odata_literal

logger = logging.getLogger(__name__)

STATUS_PENDING, STATUS_RUNNING, STATUS_DONE, STATUS_FAILED = 1, 2, 3, 4
SCOPE_UNEVALUATED, SCOPE_ALL, SCOPE_PERIOD = 1, 2, 3
DEFAULT_POLL_SECONDS = 30
DEFAULT_STALE_MINUTES = 120
MAX_TEXT = 100_000

JUDGE_PROMPT = """あなたは AI エージェントの応答品質を審査する評価者です。
次の評価ルールだけに従い、1〜5 の整数で採点してください。

## 評価ルール
名前: {rule_name}
基準: {instruction}
目安: {guide}

## 質問
<query>
{query}
</query>

## 応答
<response>
{response}
</response>

## ツール呼び出し
<tool_calls>
{tool_calls}
</tool_calls>

JSON だけを返してください:
{{"score": 1, "reason": "日本語で理由", "evidence": [{{"kind": "response", "quote": "原文の短い引用", "note": "判断理由", "polarity": "positive"}}], "suggestions": [{{"title": "改善項目", "target": "system_prompt", "detail": "具体策", "example": "修正文例"}}]}}
"""


class EvaluationWorker:
    def __init__(
        self,
        *,
        judge: Callable[[str], Awaitable[str]],
        prefix: str | None = None,
        agent_key: str | None = None,
        poll_seconds: int | None = None,
        stale_minutes: int | None = None,
        dataverse: Dataverse | None = None,
    ) -> None:
        self._judge = judge
        self._prefix = (prefix or os.getenv("PUBLISHER_PREFIX", "")).strip()
        self._agent_key = (agent_key or eval_agent_key()).strip()
        self._poll = poll_seconds or int(os.getenv("EVALUATION_POLL_SECONDS", DEFAULT_POLL_SECONDS))
        self._stale_minutes = stale_minutes or int(
            os.getenv("EVALUATION_STALE_MINUTES", DEFAULT_STALE_MINUTES)
        )
        self._dataverse = dataverse or Dataverse()
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self._prefix and self._agent_key and self._dataverse.enabled)

    def start(self) -> None:
        if not self.enabled:
            logger.info(
                "EvaluationWorker disabled (needs DATAVERSE_URL, PUBLISHER_PREFIX, EVAL_AGENT_KEY)"
            )
            return
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None
        await self._dataverse.close()

    async def _loop(self) -> None:
        while True:
            try:
                await self.drain_once()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a hub outage must not stop the Autopilot
                logger.exception("EvaluationWorker poll failed; retrying")
            await asyncio.sleep(self._poll)

    async def drain_once(self) -> bool:
        async with self._lock:
            await self._recover_stale_jobs()
            job = await self._oldest_pending_job()
            if job is None:
                return False
            await self._run_job(job)
            return True

    async def _recover_stale_jobs(self) -> None:
        p, entity = self._prefix, f"{self._prefix}_evaljobs"
        stale_before = (
            datetime.now(timezone.utc) - timedelta(minutes=self._stale_minutes)
        ).isoformat()
        query = (
            f"{entity}?$select={p}_evaljobid,{p}_agentkeys,{p}_startedon"
            f"&$filter={p}_status eq {STATUS_RUNNING}"
            f" and {p}_agentkeys eq '{odata_literal(self._agent_key)}'"
            f" and {p}_startedon lt {stale_before}&$top=20"
        )
        for job in (await self._dataverse.get(query)).get("value", []):
            await self._dataverse.try_patch(
                entity,
                job[f"{p}_evaljobid"],
                {
                    f"{p}_status": STATUS_PENDING,
                    f"{p}_startedon": None,
                    f"{p}_message": "停止したワーカーのジョブを再キューしました",
                },
                etag=job.get("@odata.etag"),
            )

    async def _oldest_pending_job(self) -> dict | None:
        p, entity = self._prefix, f"{self._prefix}_evaljobs"
        query = (
            f"{entity}?$select={p}_evaljobid,{p}_agentkeys,{p}_scope,{p}_rulekeys,"
            f"{p}_fromdate,{p}_todate"
            f"&$filter={p}_status eq {STATUS_PENDING}"
            f" and {p}_agentkeys eq '{odata_literal(self._agent_key)}'"
            f"&$orderby={p}_requestedon asc&$top=1"
        )
        rows = (await self._dataverse.get(query)).get("value", [])
        if not rows:
            return None
        job = rows[0]
        claimed = await self._dataverse.try_patch(
            entity,
            job[f"{p}_evaljobid"],
            {
                f"{p}_status": STATUS_RUNNING,
                f"{p}_startedon": datetime.now(timezone.utc).isoformat(),
                f"{p}_message": f"{self._agent_key} が評価中",
            },
            etag=job.get("@odata.etag"),
        )
        return job if claimed else None

    async def _run_job(self, job: dict) -> None:
        p, entity = self._prefix, f"{self._prefix}_evaljobs"
        job_id = job[f"{p}_evaljobid"]
        try:
            rules = await self._rules(job.get(f"{p}_rulekeys") or "")
            turns = await self._turns(job)
            existing = await self._existing_pairs()
            scope = int(job.get(f"{p}_scope") or SCOPE_UNEVALUATED)
            pairs = [
                (turn, rule)
                for turn in turns
                for rule in rules
                if scope == SCOPE_ALL
                or (turn.get(f"{p}_name", ""), rule.get(f"{p}_rulekey", "")) not in existing
            ]
            await self._dataverse.patch(
                entity, job_id, {f"{p}_targetcount": len(pairs), f"{p}_donecount": 0}
            )
            done = 0
            for turn, rule in pairs:
                await self._score_turn(turn, rule, job_id)
                done += 1
                await self._dataverse.patch(
                    entity,
                    job_id,
                    {
                        f"{p}_donecount": done,
                        f"{p}_startedon": datetime.now(timezone.utc).isoformat(),
                    },
                )
            await self._dataverse.patch(
                entity,
                job_id,
                {
                    f"{p}_status": STATUS_DONE,
                    f"{p}_completedon": datetime.now(timezone.utc).isoformat(),
                    f"{p}_message": f"{done} 件の評価を完了",
                },
            )
        except Exception as exc:
            logger.exception("Evaluation job %s failed", job_id)
            await self._dataverse.patch(
                entity,
                job_id,
                {
                    f"{p}_status": STATUS_FAILED,
                    f"{p}_completedon": datetime.now(timezone.utc).isoformat(),
                    f"{p}_message": str(exc)[:4000],
                },
            )

    async def _rules(self, requested: str) -> list[dict]:
        p = self._prefix
        keys = {key.strip() for key in requested.split(",") if key.strip()}
        rows = (await self._dataverse.get(
            f"{p}_evalrules?$filter={p}_enabled eq true&$orderby={p}_sortorder asc"
        )).get("value", [])
        return [row for row in rows if not keys or row.get(f"{p}_rulekey") in keys]

    async def _turns(self, job: dict) -> list[dict]:
        p = self._prefix
        filters = [
            f"{p}_agentkey eq '{odata_literal(self._agent_key)}'",
            f"{p}_query ne null",
            f"{p}_mergedinto eq null",
        ]
        if int(job.get(f"{p}_scope") or SCOPE_UNEVALUATED) == SCOPE_PERIOD:
            if job.get(f"{p}_fromdate"):
                filters.append(f"{p}_occurredon ge {job[f'{p}_fromdate']}")
            if job.get(f"{p}_todate"):
                filters.append(f"{p}_occurredon le {job[f'{p}_todate']}")
        query = (
            f"{p}_evalturns?$select={p}_evalturnid,{p}_name,{p}_query,{p}_response,"
            f"{p}_toolcalls&$filter={' and '.join(filters)}&$orderby={p}_occurredon asc"
        )
        return (await self._dataverse.get(query)).get("value", [])

    async def _existing_pairs(self) -> set[tuple[str, str]]:
        p = self._prefix
        query = (
            f"{p}_evalresults?$select={p}_turnname,{p}_rulekey"
            f"&$filter={p}_agentkey eq '{odata_literal(self._agent_key)}'"
        )
        rows = (await self._dataverse.get(query)).get("value", [])
        return {(row.get(f"{p}_turnname", ""), row.get(f"{p}_rulekey", "")) for row in rows}

    async def _score_turn(self, turn: dict, rule: dict, run_id: str) -> None:
        p = self._prefix
        turn_name = turn.get(f"{p}_name") or ""
        rule_key = rule.get(f"{p}_rulekey") or ""
        prompt = JUDGE_PROMPT.format(
            rule_name=rule.get(f"{p}_name") or rule_key,
            instruction=rule.get(f"{p}_prompt") or "",
            guide=rule.get(f"{p}_scoreguide") or "5 = 申し分ない / 3 = 及第点 / 1 = 満たさない",
            query=(turn.get(f"{p}_query") or "")[:MAX_TEXT],
            response=(turn.get(f"{p}_response") or "")[:MAX_TEXT],
            tool_calls=(turn.get(f"{p}_toolcalls") or "")[:MAX_TEXT],
        )
        parsed = self._parse(await self._judge(prompt))
        record = {
            f"{p}_name": f"{self._agent_key}:{turn_name}:{rule_key}"[:200],
            f"{p}_agentkey": self._agent_key,
            f"{p}_turnname": turn_name,
            f"{p}_rulekey": rule_key,
            f"{p}_rulename": rule.get(f"{p}_name") or rule_key,
            f"{p}_score": parsed["score"],
            f"{p}_reason": str(parsed.get("reason") or "")[:4000],
            f"{p}_evidence": json.dumps(parsed.get("evidence") or [], ensure_ascii=False),
            f"{p}_suggestions": json.dumps(parsed.get("suggestions") or [], ensure_ascii=False),
            f"{p}_runid": run_id[:100],
            f"{p}_evaluatedon": datetime.now(timezone.utc).isoformat(),
        }
        entity = f"{p}_evalresults"
        query = (
            f"{entity}?$select={p}_evalresultid"
            f"&$filter={p}_agentkey eq '{odata_literal(self._agent_key)}'"
            f" and {p}_turnname eq '{odata_literal(turn_name)}'"
            f" and {p}_rulekey eq '{odata_literal(rule_key)}'&$top=1"
        )
        rows = (await self._dataverse.get(query)).get("value", [])
        if rows:
            await self._dataverse.patch(entity, rows[0][f"{p}_evalresultid"], record)
        else:
            await self._dataverse.post(entity, record)
        await self._mirror_legacy_score(turn, rule_key, parsed)

    async def _mirror_legacy_score(self, turn: dict, rule_key: str, parsed: dict) -> None:
        p = self._prefix
        columns = {
            "tool_call_accuracy": (f"{p}_toolcallaccuracy", f"{p}_toolcallaccuracyreason"),
            "task_adherence": (f"{p}_taskadherence", f"{p}_taskadherencereason"),
        }.get(rule_key)
        if columns:
            await self._dataverse.patch(
                f"{p}_evalturns",
                turn[f"{p}_evalturnid"],
                {
                    columns[0]: parsed["score"],
                    columns[1]: str(parsed.get("reason") or "")[:4000],
                    f"{p}_evaluatedon": datetime.now(timezone.utc).isoformat(),
                },
            )

    @staticmethod
    def _parse(text: str) -> dict:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("Evaluator did not return a JSON object")
        parsed = json.loads(text[start:end + 1])
        score = int(parsed.get("score", 0))
        if score < 1 or score > 5:
            raise ValueError(f"Evaluator score is outside 1..5: {score}")
        parsed["score"] = score
        return parsed
