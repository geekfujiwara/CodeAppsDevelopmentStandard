"""Run queued regression / evaluation cases from the shared evaluation hub.

The messaging endpoint only accepts Bot Framework traffic signed for this agent, so no test
runner can call the teammate directly. Cases are queued as ``<prefix>_evaltestresult`` rows
instead and this worker picks up the rows carrying *its own* agent key. A teammate that is down
simply leaves its rows in "waiting", which keeps the comparison against the teammates that are
up intact.

Turns executed here have no delegated user token - there is no signed-in caller - so the agent
runs against its own identity. Tools that need a user's delegated permission are therefore not
exercised; the written summary says so, so a green run is not mistaken for full coverage.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

from .dataverse import Dataverse, odata_literal

logger = logging.getLogger(__name__)

STATUS_WAITING, STATUS_RUNNING, STATUS_DONE, STATUS_FAILED = 1, 2, 3, 4
DEFAULT_POLL_SECONDS = 15
MAX_BATCH = 5


class TestWorker:
    def __init__(
        self,
        *,
        run_turn,
        prefix: str | None = None,
        agent_key: str | None = None,
        poll_seconds: int | None = None,
    ) -> None:
        self._run_turn = run_turn
        self._prefix = (prefix or os.getenv("PUBLISHER_PREFIX", "")).strip()
        self._agent_key = (agent_key or os.getenv("AGENT_NAME", "")).strip()
        self._poll = poll_seconds or int(os.getenv("EVAL_POLL_SECONDS", DEFAULT_POLL_SECONDS))
        self._dataverse = Dataverse()
        self._task: asyncio.Task | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._prefix and self._agent_key and self._dataverse.enabled)

    def start(self) -> None:
        if not self.enabled:
            logger.info("TestWorker disabled (needs DATAVERSE_URL, PUBLISHER_PREFIX, AGENT_NAME)")
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
            except Exception:  # noqa: BLE001 - a hub outage must not stop the agent
                logger.exception("TestWorker poll failed; retrying")
            await asyncio.sleep(self._poll)

    async def drain_once(self) -> int:
        prefix, entity_set = self._prefix, f"{self._prefix}_evaltestresults"
        query = (
            f"{entity_set}?$select={prefix}_evaltestresultid,{prefix}_prompt,{prefix}_runname"
            f"&$filter={prefix}_agentkey eq '{odata_literal(self._agent_key)}'"
            f" and {prefix}_status eq {STATUS_WAITING}"
            f"&$orderby=createdon asc&$top={MAX_BATCH}"
        )
        rows = (await self._dataverse.get(query)).get("value", [])
        for row in rows:
            await self._run_case(entity_set, row)
        return len(rows)

    async def _run_case(self, entity_set: str, row: dict) -> None:
        prefix = self._prefix
        row_id = row[f"{prefix}_evaltestresultid"]
        prompt = row.get(f"{prefix}_prompt") or ""
        run_name = row.get(f"{prefix}_runname") or "regression"
        started = time.monotonic()

        await self._dataverse.patch(
            entity_set,
            row_id,
            {
                f"{prefix}_status": STATUS_RUNNING,
                f"{prefix}_startedon": datetime.now(timezone.utc).isoformat(),
            },
        )
        try:
            answer, tool_calls = await self._run_turn(
                conversation_id=f"eval:{run_name}:{row_id}", message=prompt
            )
            update = {
                f"{prefix}_status": STATUS_DONE,
                f"{prefix}_response": (answer or "")[:1_000_000],
                f"{prefix}_toolcalls": ", ".join(tool_calls)[:1_000_000],
                f"{prefix}_autosummary": (
                    "委任トークンなしで実行（利用者の権限が要るツールは未検証）"
                ),
            }
        except Exception as exc:  # noqa: BLE001 - a failed case is data, not a crash
            logger.exception("Evaluation case %s failed", row_id)
            update = {f"{prefix}_status": STATUS_FAILED, f"{prefix}_error": str(exc)[:4000]}

        update[f"{prefix}_durationms"] = int((time.monotonic() - started) * 1000)
        update[f"{prefix}_completedon"] = datetime.now(timezone.utc).isoformat()
        await self._dataverse.patch(entity_set, row_id, update)
        logger.info("Evaluation case %s finished (%s)", row_id, update[f"{prefix}_status"])
