"""Scheduled work that survives the hosted session stopping (feature block B11).

A Foundry hosted session stops after its idle timeout, and everything in memory stops with it,
including the Copilot SDK's own in-process scheduler. So schedules live in the Foundry state store,
and an Azure Logic App calls the agent's Invocations endpoint on a timer. The tick runs whatever is
due as a proactive turn in the conversation the schedule was made in, then stops its own session so
the compute is released until the next tick.

Only Invocations sessions touch the store. A Teams (Activity) session is given a different store
under the same name, so the timer would never see what it wrote (troubleshooting #88); chat turns
therefore create, list and delete schedules by calling the agent's own Invocations endpoint.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import uuid
from datetime import date, datetime, time as dtime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional, Protocol
from zoneinfo import ZoneInfo

import httpx
from copilot import Tool, define_tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

STORE_NAME = "teammate-schedules"
TICK_TYPE = "schedule_tick"
OP_TYPE = "schedule_op"
RUN_EVENT = "schedule_run"
# A handed-over run must be redeemed soon; a replayed or late event finds nothing to run.
RUN_TOKEN_TTL = timedelta(minutes=15)
# Its own session id: sessions are isolated per caller, and this one is called by the agent itself.
OP_SESSION = "schedule-admin"
MAX_PER_OWNER = 10
REPEATS = ("once", "daily", "weekdays", "weekly")
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
TOOL_NAMES = ("create_schedule", "list_schedules", "delete_schedule")
FOUNDRY_SCOPE = "https://ai.azure.com/.default"
# The store expires idle items after 30 days by default; a weekly job must not vanish.
NEVER_EXPIRE = -1

TokenProvider = Callable[[str], Awaitable[str]]
TurnRunner = Callable[[dict[str, Any]], Awaitable[None]]


class ScheduleError(ValueError):
    """A request the model can fix by asking again with different arguments."""


class Conflict(Exception):
    """Another writer changed the row first."""


def enabled() -> bool:
    return (os.getenv("SCHEDULE_ENABLED") or "").strip().lower() == "true"


def parse_time(text: str) -> dtime:
    try:
        hour, minute = (int(part) for part in text.strip().split(":", 1))
        return dtime(hour, minute)
    except (ValueError, TypeError):
        raise ScheduleError(f"time must be HH:MM in 24-hour form, got {text!r}") from None


def parse_date(text: str) -> date | None:
    if not (text or "").strip():
        return None
    try:
        return date.fromisoformat(text.strip())
    except ValueError:
        raise ScheduleError(f"date must be YYYY-MM-DD, got {text!r}") from None


def parse_weekday(text: str) -> int | None:
    value = (text or "").strip().lower()[:3]
    if not value:
        return None
    if value not in WEEKDAYS:
        raise ScheduleError(f"weekday must be one of {', '.join(WEEKDAYS)}, got {text!r}")
    return WEEKDAYS.index(value)


def _matches(repeat: str, day: date, weekday: int | None) -> bool:
    if repeat == "weekdays":
        return day.weekday() < 5
    if repeat == "weekly":
        return day.weekday() == weekday
    return True


def next_run(
    repeat: str,
    at: dtime,
    zone: ZoneInfo,
    *,
    after: datetime,
    weekday: int | None = None,
    on: date | None = None,
) -> datetime | None:
    """The first run strictly after *after*, or None when a one-off time has already passed.

    Built from the local wall-clock time each day, so a 09:00 job stays at 09:00 across DST.
    """
    if repeat not in REPEATS:
        raise ScheduleError(f"repeat must be one of {', '.join(REPEATS)}")
    if repeat == "once":
        if on is None:
            raise ScheduleError("date is required for a one-off schedule")
        candidate = datetime.combine(on, at, tzinfo=zone)
        return candidate if candidate > after else None
    if repeat == "weekly" and weekday is None:
        raise ScheduleError("weekday is required for a weekly schedule")
    day = after.astimezone(zone).date()
    if on is not None and on > day:
        day = on
    for _ in range(8):
        candidate = datetime.combine(day, at, tzinfo=zone)
        if candidate > after and _matches(repeat, day, weekday):
            return candidate
        day += timedelta(days=1)
    return None


def _advance(schedule: dict[str, Any], now: datetime) -> str | None:
    if schedule["repeat"] == "once":
        return None
    following = next_run(
        schedule["repeat"],
        parse_time(schedule["time"]),
        ZoneInfo(schedule["timezone"]),
        after=now,
        weekday=schedule.get("weekday"),
    )
    return _utc(following) if following else None


def describe(schedule: dict[str, Any]) -> str:
    zone = ZoneInfo(schedule["timezone"])
    upcoming = schedule.get("next_run")
    when = (
        datetime.fromisoformat(upcoming).astimezone(zone).strftime("%Y-%m-%d (%a) %H:%M")
        if upcoming else "(finished)"
    )
    repeat = schedule["repeat"]
    if repeat == "weekly" and schedule.get("weekday") is not None:
        repeat = f"weekly on {WEEKDAYS[schedule['weekday']]}"
    return (
        f"- id={schedule['id']} | {schedule['title']} | {repeat} at {schedule['time']} "
        f"({schedule['timezone']}) | next: {when}"
    )


class Rows(Protocol):
    """Where schedules are kept: one row per schedule, optimistic concurrency by ETag."""

    async def put(self, key: str, value: dict[str, Any], etag: str | None = None) -> None: ...
    async def get(self, key: str) -> tuple[dict[str, Any], str] | None: ...
    async def delete(self, key: str) -> None: ...
    async def query(self, *, owner_id: str | None = None, due_before: str | None = None) -> list[tuple[dict[str, Any], str]]: ...
    async def close(self) -> None: ...


class StateStoreRows:
    """The Foundry state store, reached with the agent's own identity."""

    def __init__(self, credential: Any) -> None:
        self._credential = credential
        self._store: Any = None

    async def _get(self):
        if self._store is None:
            from azure.ai.agentserver.core.storage import FoundryStateStore

            self._store = await FoundryStateStore.get_or_create(
                STORE_NAME, self._credential, item_ttl_seconds=NEVER_EXPIRE,
                description="AI teammate schedules (B11)",
            )
        return self._store

    async def put(self, key: str, value: dict[str, Any], etag: str | None = None) -> None:
        from azure.ai.agentserver.core.storage import FoundryStoragePreconditionError

        try:
            await (await self._get()).set_item(key, value, if_match=etag)
        except FoundryStoragePreconditionError:
            raise Conflict(key) from None

    async def get(self, key: str) -> tuple[dict[str, Any], str] | None:
        item = await (await self._get()).get_item(key)
        return (item.value, item.etag) if item is not None else None

    async def delete(self, key: str) -> None:
        from azure.ai.agentserver.core.storage import FoundryStorageNotFoundError

        try:
            await (await self._get()).delete_item(key)
        except FoundryStorageNotFoundError:
            pass

    async def query(self, *, owner_id: str | None = None, due_before: str | None = None) -> list[tuple[dict[str, Any], str]]:
        store = await self._get()
        keys: list[str] = []
        after: str | None = None
        while True:
            page = await store.list_keys(limit=100, after=after, order="asc")
            keys += [entry.key for entry in page.keys]
            if not page.has_more or not page.last_id:
                break
            after = page.last_id
        rows = []
        for key in keys:
            found = await self.get(key)
            if found is None:
                continue
            value = found[0]
            if owner_id is not None and value.get("owner_id") != owner_id:
                continue
            if due_before is not None and (value.get("next_run") or "9999") > due_before:
                continue
            rows.append(found)
        return rows

    async def close(self) -> None:
        if self._store is not None:
            await self._store.aclose()
            self._store = None


class MemoryRows:
    """Same contract in memory, for tests and local runs."""

    def __init__(self) -> None:
        self._rows: dict[str, tuple[dict[str, Any], str]] = {}

    async def put(self, key: str, value: dict[str, Any], etag: str | None = None) -> None:
        if etag is not None and (key not in self._rows or self._rows[key][1] != etag):
            raise Conflict(key)
        self._rows[key] = (json.loads(json.dumps(value)), uuid.uuid4().hex)

    async def get(self, key: str) -> tuple[dict[str, Any], str] | None:
        return self._rows.get(key)

    async def delete(self, key: str) -> None:
        self._rows.pop(key, None)

    async def query(self, *, owner_id: str | None = None, due_before: str | None = None) -> list[tuple[dict[str, Any], str]]:
        return [
            (value, etag) for value, etag in self._rows.values()
            if (owner_id is None or value.get("owner_id") == owner_id)
            and (due_before is None or (value.get("next_run") or "9999") <= due_before)
        ]

    async def close(self) -> None:
        pass


def _utc(moment: datetime) -> str:
    # One fixed format, so timestamps compare correctly as strings.
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


class ScheduleBook:
    """Schedules shared by every Invocations session of this agent."""

    def __init__(self, rows: Rows) -> None:
        self._rows = rows

    @classmethod
    def from_env(cls, credential: Any) -> "ScheduleBook":
        return cls(StateStoreRows(credential))

    async def close(self) -> None:
        await self._rows.close()

    async def create(
        self,
        *,
        owner_id: str,
        owner_name: str,
        title: str,
        instruction: str,
        repeat: str,
        at: str,
        zone_name: str,
        reference: dict[str, Any],
        weekday: str = "",
        on: str = "",
        now: datetime | None = None,
    ) -> dict[str, Any]:
        if not owner_id:
            raise ScheduleError("the requester could not be identified, so nothing was scheduled")
        if not instruction.strip():
            raise ScheduleError("instruction must say what to do when the schedule runs")
        now = now or datetime.now(timezone.utc)
        zone = ZoneInfo(zone_name)
        first = next_run(
            repeat, parse_time(at), zone, after=now, weekday=parse_weekday(weekday), on=parse_date(on)
        )
        if first is None:
            raise ScheduleError("that time has already passed; pick a future date and time")
        if len(await self._rows.query(owner_id=owner_id)) >= MAX_PER_OWNER:
            raise ScheduleError(
                f"this person already has {MAX_PER_OWNER} schedules; delete one before adding another"
            )
        schedule = {
            "id": uuid.uuid4().hex[:12],
            "owner_id": owner_id,
            "owner_name": owner_name,
            "title": title.strip()[:80] or "Scheduled task",
            "instruction": instruction.strip()[:2000],
            "repeat": repeat,
            "time": parse_time(at).strftime("%H:%M"),
            "weekday": parse_weekday(weekday),
            "timezone": zone_name,
            "next_run": _utc(first),
            "created": _utc(now),
            "reference": reference,
            "last_run": None,
            "last_result": None,
        }
        await self._rows.put(schedule["id"], schedule)
        logger.info("Schedule %s created (%s at %s %s)", schedule["id"], repeat, schedule["time"], zone_name)
        return schedule

    async def list_for(self, owner_id: str) -> list[dict[str, Any]]:
        rows = await self._rows.query(owner_id=owner_id)
        return sorted((value for value, _ in rows), key=lambda s: s.get("next_run") or "9999")

    async def delete(self, owner_id: str, schedule_id: str) -> bool:
        found = await self._rows.get(schedule_id.strip())
        # Only the person who made it can remove it; someone else's id reads as "not found".
        if found is None or found[0].get("owner_id") != owner_id:
            return False
        await self._rows.delete(schedule_id.strip())
        return True

    async def claim_due(self, now: datetime | None = None) -> list[dict[str, Any]]:
        """Due schedules, each advanced to its next run and given a single-use run token.

        The ETag check makes two overlapping ticks run a job once: the loser's write fails.
        """
        now = now or datetime.now(timezone.utc)
        claimed: list[dict[str, Any]] = []
        for value, etag in await self._rows.query(due_before=_utc(now)):
            schedule = dict(value)
            schedule["next_run"] = _advance(schedule, now)
            schedule["run_token"] = secrets.token_urlsafe(24)
            schedule["run_token_expires"] = _utc(now + RUN_TOKEN_TTL)
            try:
                await self._rows.put(schedule["id"], schedule, etag=etag)
            except Conflict:
                logger.info("Schedule %s was claimed by another tick", schedule["id"])
                continue
            claimed.append(schedule)
        await self._purge_spent(now)
        return claimed

    async def _purge_spent(self, now: datetime) -> None:
        """One-off schedules whose run was never redeemed."""
        for value, _ in await self._rows.query():
            expires = value.get("run_token_expires")
            if not value.get("next_run") and (not expires or expires < _utc(now)):
                await self._rows.delete(value["id"])

    async def redeem(self, schedule_id: str, token: str, now: datetime | None = None) -> dict[str, Any] | None:
        """The schedule a run event may execute, once; None for a forged, replayed or late event."""
        now = now or datetime.now(timezone.utc)
        found = await self._rows.get(schedule_id)
        if found is None:
            return None
        schedule, etag = found
        expected = schedule.get("run_token") or ""
        if not expected or not secrets.compare_digest(expected, token or ""):
            return None
        if (schedule.get("run_token_expires") or "") < _utc(now):
            return None
        spent = {**schedule, "run_token": None, "run_token_expires": None}
        try:
            if schedule.get("next_run"):
                await self._rows.put(schedule_id, spent, etag=etag)
            else:
                await self._rows.delete(schedule_id)
        except Conflict:
            return None
        return spent

    async def finish(self, schedule: dict[str, Any], result: str, now: datetime | None = None) -> None:
        found = await self._rows.get(schedule["id"])
        if found is None:
            return
        await self._rows.put(
            schedule["id"],
            {**found[0], "last_run": _utc(now or datetime.now(timezone.utc)), "last_result": result},
        )


CREATE_FIELDS = ("owner_id", "owner_name", "title", "instruction", "repeat", "at", "zone_name",
                 "reference", "weekday", "on")


async def handle_op(book: ScheduleBook, body: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Serve a RemoteSchedules call inside an Invocations session."""
    op = body.get("op")
    args = body.get("args") if isinstance(body.get("args"), dict) else {}
    try:
        if op == "create":
            return {"schedule": await book.create(**{k: args[k] for k in CREATE_FIELDS if k in args})}, 200
        if op == "list":
            return {"schedules": await book.list_for(str(args.get("owner_id") or ""))}, 200
        if op == "delete":
            deleted = await book.delete(str(args.get("owner_id") or ""), str(args.get("schedule_id") or ""))
            return {"deleted": deleted}, 200
        if op == "redeem":
            schedule = await book.redeem(str(args.get("schedule_id") or ""), str(args.get("run_token") or ""))
            return {"schedule": schedule}, 200
    except (ScheduleError, TypeError) as error:
        return {"error": str(error), "error_kind": "schedule"}, 200
    return {"error": f"unknown op {op!r}"}, 400


class RemoteSchedules:
    """The ScheduleBook API for chat turns, served by the agent's own Invocations endpoint."""

    def __init__(self, token_provider: TokenProvider) -> None:
        self._token = token_provider

    async def _post(self, session: str, body: dict[str, Any], timeout: float) -> httpx.Response:
        endpoint = (os.getenv("FOUNDRY_PROJECT_ENDPOINT") or "").rstrip("/")
        agent = os.getenv("FOUNDRY_AGENT_NAME") or ""
        url = (f"{endpoint}/agents/{agent}/endpoint/protocols/invocations"
               f"?api-version=v1&agent_session_id={session}")
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(
                url, headers={"Authorization": f"Bearer {await self._token(FOUNDRY_SCOPE)}"}, json=body
            )

    async def _call(self, op: str, **args: Any) -> dict[str, Any]:
        response = await self._post(OP_SESSION, {"type": OP_TYPE, "op": op, "args": args}, 90)
        if response.status_code >= 400:
            raise RuntimeError(f"schedule {op} returned {response.status_code}: {response.text[:300]}")
        body = response.json()
        if body.get("error_kind") == "schedule":
            raise ScheduleError(body.get("error") or "rejected")
        return body

    async def redeem(self, schedule_id: str, run_token: str) -> dict[str, Any] | None:
        return (await self._call("redeem", schedule_id=schedule_id, run_token=run_token)).get("schedule")

    async def create(self, **kwargs: Any) -> dict[str, Any]:
        return (await self._call("create", **{k: v for k, v in kwargs.items() if k in CREATE_FIELDS}))["schedule"]

    async def list_for(self, owner_id: str) -> list[dict[str, Any]]:
        return (await self._call("list", owner_id=owner_id))["schedules"]

    async def delete(self, owner_id: str, schedule_id: str) -> bool:
        return bool((await self._call("delete", owner_id=owner_id, schedule_id=schedule_id))["deleted"])


async def run_due(book: ScheduleBook, run_turn: TurnRunner, now: datetime | None = None) -> dict[str, Any]:
    results = []
    for schedule in await book.claim_due(now):
        try:
            await run_turn(schedule)
            status = "handed_over"
        except Exception:  # noqa: BLE001 - one failing job must not stop the others
            logger.exception("Scheduled run %s failed", schedule["id"])
            status = "error"
        await book.finish(schedule, status, now)
        results.append({"id": schedule["id"], "status": status})
    logger.info("Schedule tick ran %d job(s)", len(results))
    return {"ran": len(results), "results": results}


def _token_object_id(token: str) -> str:
    import base64

    payload = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    return claims.get("oid", "")


async def post_run_event(schedule: dict[str, Any], token_provider: TokenProvider) -> None:
    """Wake the teammate in the stored conversation through its own Activity route.

    The Activity session is bound to the teammate's instance identity, which is what may post as
    the teammate; an Invocations session is not. The gateway admits an Entra caller that holds a
    Foundry role (BotServiceRbac) when Activity.From.AadObjectId is that caller, so the timer's
    agent identity signs the event, and the event carries only an id and a single-use token.
    """
    reference = schedule["reference"]
    endpoint = (os.getenv("FOUNDRY_PROJECT_ENDPOINT") or "").rstrip("/")
    agent = os.getenv("FOUNDRY_AGENT_NAME") or ""
    token = await token_provider(FOUNDRY_SCOPE)
    caller = _token_object_id(token)
    recipient = dict(reference.get("bot") or reference.get("agent") or {})
    blueprint = os.getenv("FOUNDRY_AGENT_BLUEPRINT_CLIENT_ID") or ""
    if blueprint:
        recipient.setdefault("agenticAppBlueprintId", blueprint)
    activity = {
        "type": "event",
        "name": RUN_EVENT,
        "id": uuid.uuid4().hex,
        "channelId": reference.get("channelId") or "msteams",
        "serviceUrl": reference.get("serviceUrl"),
        "conversation": reference.get("conversation"),
        "recipient": recipient,
        "from": {"id": f"8:orgid:{caller}", "aadObjectId": caller, "name": "schedule"},
        "value": {"schedule_id": schedule["id"], "run_token": schedule["run_token"]},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{endpoint}/agents/{agent}/endpoint/protocols/activityprotocol?api-version=v1",
            headers={"Authorization": f"Bearer {token}"},
            json=activity,
        )
    if response.status_code >= 400:
        raise RuntimeError(f"run event returned {response.status_code}: {response.text[:300]}")


async def stop_own_session(token_provider: TokenProvider) -> None:
    """Release this session's compute now instead of after the idle timeout."""
    session = os.getenv("FOUNDRY_AGENT_SESSION_ID")
    agent = os.getenv("FOUNDRY_AGENT_NAME")
    endpoint = (os.getenv("FOUNDRY_PROJECT_ENDPOINT") or "").rstrip("/")
    if not (session and agent and endpoint):
        return
    token = await token_provider(FOUNDRY_SCOPE)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{endpoint}/agents/{agent}/endpoint/sessions/{session}:stop?api-version=v1",
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        logger.warning("Could not stop session %s: %s %s", session, response.status_code, response.text[:300])


def scheduled_message(schedule: dict[str, Any]) -> str:
    return (
        f"# 定期実行: {schedule['title']}\n"
        f"{schedule['owner_name'] or '依頼者'}さんが前もって登録した作業を、予定の時刻になったので実行します。"
        "依頼者はいま不在で、あなたの返答はそのままこの会話に届きます。"
        "質問で終わらせず、できる範囲で完結させ、結果だけを簡潔に伝えてください。\n\n"
        f"{schedule['instruction']}"
    )


class CreateScheduleParams(BaseModel):
    title: str = Field(description="A short name the requester will recognise, e.g. '朝のメール要約'.")
    instruction: str = Field(
        description=(
            "What to do at each run, written so it makes sense on its own later, with no chat "
            "history: the sources to read, the period to cover and the shape of the result."
        )
    )
    repeat: str = Field(description="'once', 'daily', 'weekdays' (Mon-Fri) or 'weekly'.")
    time: str = Field(description="Local time of day in HH:MM (24-hour), in the requester's timezone.")
    date: str = Field(default="", description="YYYY-MM-DD. Required for 'once'; optional first day otherwise.")
    weekday: str = Field(default="", description="For 'weekly': mon, tue, wed, thu, fri, sat or sun.")


class DeleteScheduleParams(BaseModel):
    schedule_id: str = Field(description="The id shown by list_schedules.")


class ListSchedulesParams(BaseModel):
    pass


def build_schedule_tools(
    *,
    book: ScheduleBook,
    owner_id: str,
    owner_name: str,
    zone_name: str,
    reference: Optional[dict[str, Any]],
) -> list[Tool]:
    async def create(params: CreateScheduleParams, _invocation: Any) -> str:
        if not reference:
            return "Schedules can only be made from a Teams chat, because the results are posted back there. Tell the user."
        try:
            schedule = await book.create(
                owner_id=owner_id, owner_name=owner_name, title=params.title,
                instruction=params.instruction, repeat=params.repeat, at=params.time,
                zone_name=zone_name, reference=reference, weekday=params.weekday, on=params.date,
            )
        except ScheduleError as error:
            return f"Not scheduled: {error}."
        return (
            "Scheduled. The result will be posted in this chat at each run.\n" + describe(schedule)
            + "\nConfirm the title, the repeat and the next run time to the user in their language."
        )

    async def list_all(_params: ListSchedulesParams, _invocation: Any) -> str:
        schedules = await book.list_for(owner_id)
        if not schedules:
            return "This person has no schedules."
        return "Schedules of this person:\n" + "\n".join(describe(s) for s in schedules)

    async def delete(params: DeleteScheduleParams, _invocation: Any) -> str:
        if await book.delete(owner_id, params.schedule_id):
            return f"Deleted schedule {params.schedule_id}."
        return f"No schedule {params.schedule_id} belongs to this person. Call list_schedules to see their ids."

    return [
        define_tool(
            "create_schedule",
            description=(
                "Register work to run later on its own: once at a date and time, or every day, "
                "every weekday or every week. Use it when the requester asks for something to "
                "happen at a future time or regularly (毎朝, 毎週月曜, 明日の9時に ...)."
            ),
            handler=create, params_type=CreateScheduleParams, skip_permission=True,
        ),
        define_tool(
            "list_schedules",
            description="List the requester's own schedules with their ids and next run times.",
            handler=list_all, params_type=ListSchedulesParams, skip_permission=True,
        ),
        define_tool(
            "delete_schedule",
            description="Delete one of the requester's own schedules by id.",
            handler=delete, params_type=DeleteScheduleParams, skip_permission=True,
        ),
    ]
