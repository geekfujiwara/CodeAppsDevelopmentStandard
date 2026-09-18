"""Publish the skills shipped with this container to the evaluation hub.

Skills only exist as files inside the agent, so without this sync the hub's "skills" page stays
empty forever and nobody can tell which teammate knows which procedure. Rows are keyed on
(agent key, skill key) so a redeploy updates in place; a renamed skill leaves the old row behind
on purpose, as an audit trail of what the teammate used to know.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from .dataverse import Dataverse, odata_literal

logger = logging.getLogger(__name__)

FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
BODY_MAX = 1_000_000
SUMMARY_MAX = 4_000


def parse_skill(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    title = path.parent.name
    summary = ""
    match = FRONT_MATTER.match(text)
    if match:
        for line in match.group(1).splitlines():
            key, _, value = line.partition(":")
            value = value.strip().strip('"').strip("'")
            if key.strip() == "name" and value:
                title = value
            elif key.strip() == "description" and value:
                summary = value
    if not summary:
        body = FRONT_MATTER.sub("", text).strip()
        summary = next((line.strip() for line in body.splitlines() if line.strip()), "")
    return {
        "key": path.parent.name,
        "title": title[:200],
        "summary": summary[:SUMMARY_MAX],
        "body": text[:BODY_MAX],
    }


class SkillSync:
    def __init__(
        self,
        *,
        directories: list[Path],
        prefix: str | None = None,
        agent_key: str | None = None,
        interval_minutes: int | None = None,
    ) -> None:
        self._directories = directories
        self._prefix = (prefix or os.getenv("PUBLISHER_PREFIX", "")).strip()
        self._agent_key = (agent_key or os.getenv("AGENT_NAME", "")).strip()
        self._interval = (interval_minutes or int(os.getenv("SKILLS_SYNC_MINUTES", "30"))) * 60
        self._dataverse = Dataverse()
        self._task: asyncio.Task | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._prefix and self._agent_key and self._dataverse.enabled)

    def start(self) -> None:
        if not self.enabled:
            logger.info("SkillSync disabled (needs DATAVERSE_URL, PUBLISHER_PREFIX, AGENT_NAME)")
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
                await self.sync_once()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a hub outage must not stop the agent
                logger.exception("SkillSync failed; retrying on the next interval")
            await asyncio.sleep(self._interval)

    async def sync_once(self) -> int:
        prefix, entity_set = self._prefix, f"{self._prefix}_skills"
        written = 0
        for directory in self._directories:
            for entry in sorted(Path(directory).glob("*/SKILL.md")):
                skill = parse_skill(entry)
                skill_key = f"{self._agent_key}:{skill['key']}"
                record = {
                    f"{prefix}_name": skill["title"],
                    f"{prefix}_skillkey": skill_key[:200],
                    f"{prefix}_agentkey": self._agent_key,
                    f"{prefix}_title": skill["title"],
                    f"{prefix}_summary": skill["summary"],
                    f"{prefix}_body": skill["body"],
                    f"{prefix}_builtin": True,
                    f"{prefix}_syncedon": datetime.now(timezone.utc).isoformat(),
                }
                query = (
                    f"{entity_set}?$select={prefix}_skillid"
                    f"&$filter={prefix}_skillkey eq '{odata_literal(skill_key)}'"
                )
                rows = (await self._dataverse.get(query)).get("value", [])
                if rows:
                    await self._dataverse.patch(entity_set, rows[0][f"{prefix}_skillid"], record)
                else:
                    await self._dataverse.post(entity_set, record)
                written += 1
        logger.info("SkillSync wrote %d skill(s) for %s", written, self._agent_key)
        return written


def content_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
