"""Mirror each turn into the evaluation hub's ``<prefix>_evalturns`` table.

Same row shape as the self-hosted ``EvaluationDataverse.cs``, so the hub (AI チームメイト評価Hub)
shows Foundry-hosted teammates next to the others without a separate import. Scores stay empty:
the evaluator fills them in later against the same row name.

Written with the agent's own identity (``setup_agent_dataverse_user.py`` grants it the hub tables).
A dashboard row is never worth failing a turn over, so every error is logged and swallowed.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Sequence

from .dataverse import Dataverse, eval_agent_key

logger = logging.getLogger(__name__)

MAX_TEXT = 100_000


def enabled() -> bool:
    return (os.getenv("EVAL_SYNC_TO_DATAVERSE") or "true").strip().lower() != "false"


def source_of(activity: Any) -> str:
    """The hub's source labels: chat / mailbox / schedule."""
    if getattr(activity, "type", "") == "event":
        return "schedule"
    channel = str(getattr(activity, "channel_id", "") or "")
    return "mailbox" if channel.startswith(("email", "agents:email")) else "chat"


def tool_calls_json(names: Sequence[str]) -> str:
    calls = []
    for name in names:
        # MCP tools arrive as "<server>-<tool>"; the hub groups calls by server.
        server, _, tool = name.partition("-") if "-" in name else ("", "", name)
        calls.append({"name": tool or name, "server": server} if server else {"name": name})
    return json.dumps(calls, ensure_ascii=False)


class TurnMirror:
    def __init__(self, dataverse: Dataverse | None = None) -> None:
        self._dataverse = dataverse or Dataverse()
        self._prefix = (os.getenv("PUBLISHER_PREFIX") or "").strip()
        self._agent_key = eval_agent_key()

    @property
    def enabled(self) -> bool:
        return enabled() and bool(self._prefix and self._agent_key and self._dataverse.enabled)

    def row(self, *, query: str, response: str, tool_calls: Sequence[str], actor: str, source: str,
            occurred_on: datetime | None = None) -> dict[str, Any]:
        p = self._prefix
        when = (occurred_on or datetime.now(timezone.utc)).astimezone(timezone.utc)
        return {
            f"{p}_name": "turn-" + when.isoformat(),
            f"{p}_agentkey": self._agent_key,
            f"{p}_occurredon": when.isoformat(),
            f"{p}_actor": actor,
            f"{p}_source": source,
            f"{p}_query": query[:MAX_TEXT],
            f"{p}_response": response[:MAX_TEXT],
            f"{p}_toolcalls": tool_calls_json(tool_calls),
            f"{p}_toolcount": len(tool_calls),
        }

    async def record(self, **kwargs: Any) -> None:
        if not self.enabled:
            return
        try:
            await self._dataverse.post(f"{self._prefix}_evalturns", self.row(**kwargs))
        except Exception:  # noqa: BLE001
            logger.warning("Could not mirror the turn to the evaluation hub", exc_info=True)

    async def close(self) -> None:
        await self._dataverse.close()
