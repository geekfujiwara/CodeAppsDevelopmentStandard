"""Schedules on the agent's own endpoints (feature block B11).

Invocations route (``/invocations``), reached with an Entra token:

* ``{"type": "schedule_tick"}`` from the Azure Logic App timer: claims due schedules and, for each,
  posts a ``schedule_run`` event to the agent's Activity route in the stored conversation.
* ``{"type": "schedule_op", ...}`` from the agent's own chat turns: create, list, delete, redeem.
  Every read and write of the store happens here because Activity sessions see a different store.

Activity route, ``schedule_run`` event: the session is bound to the teammate's instance identity,
which is what may post as the teammate (an Invocations session cannot - troubleshooting #88). The
event carries only a schedule id and a single-use token; the schedule itself comes from the store.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from aiohttp.web import Application, Request, Response, json_response
from microsoft_agents.activity import Activity, ChannelAccount

from .schedules import (
    OP_TYPE, RUN_EVENT, TICK_TYPE, handle_op, post_run_event, run_due, scheduled_message,
    stop_own_session,
)

logger = logging.getLogger(__name__)

ROUTE = "/invocations"
# Keep the op session warm briefly for follow-up calls (create then list), then release it.
OP_IDLE_SECONDS = 60


def register_schedule_routes(app: Application, host: Any) -> None:
    running: dict[str, asyncio.Task | None] = {"tick": None, "release": None}

    async def token(scope: str) -> str:
        return (await host.agent_instance._credential.get_token(scope)).token

    async def release_later() -> None:
        await asyncio.sleep(OP_IDLE_SECONDS)
        try:
            await stop_own_session(token)
        except Exception:
            logger.exception("Could not stop the schedule op session")

    async def tick() -> None:
        try:
            await run_due(host.agent_instance.schedule_book, lambda s: post_run_event(s, token))
        except Exception:
            logger.exception("Schedule tick failed")
        finally:
            try:
                await stop_own_session(token)
            except Exception:
                logger.exception("Could not stop the tick session")

    async def invocations(request: Request) -> Response:
        try:
            body = await request.json()
        except Exception:
            body = {}
        kind = body.get("type") if isinstance(body, dict) else None
        if kind not in (TICK_TYPE, OP_TYPE):
            return json_response({"error": "unsupported type"}, status=400)
        agent = host.agent_instance
        if agent is None or getattr(agent, "schedule_book", None) is None:
            return json_response({"error": "schedules are not enabled"}, status=409)
        if kind == OP_TYPE:
            result, status = await handle_op(agent.schedule_book, body)
            if running["release"] is not None:
                running["release"].cancel()
            running["release"] = asyncio.create_task(release_later())
            return json_response(result, status=status)
        current = running["tick"]
        if current is not None and not current.done():
            return json_response({"status": "busy"}, status=202)
        # A Logic App HTTP action gives up after 120 s, so the tick answers first and works after.
        running["tick"] = asyncio.create_task(tick())
        return json_response({"status": "accepted"}, status=202)

    async def on_run_event(context, _state) -> None:
        activity = context.activity
        if getattr(activity, "name", "") != RUN_EVENT:
            return
        agent = host.agent_instance
        if agent is None or getattr(agent, "schedule_client", None) is None:
            return
        value = activity.value if isinstance(activity.value, dict) else {}
        schedule = await agent.schedule_client.redeem(
            str(value.get("schedule_id") or ""), str(value.get("run_token") or "")
        )
        conversation = (schedule or {}).get("reference", {}).get("conversation") or {}
        if not schedule or conversation.get("id") != getattr(activity.conversation, "id", None):
            logger.warning("Ignored a schedule_run event that did not redeem")
            return
        message = scheduled_message(schedule)
        activity.from_property = ChannelAccount.model_validate(schedule["reference"].get("user") or {})
        activity.text = message
        activity.local_timezone = schedule["timezone"]
        logger.info("Running schedule %s", schedule["id"])
        reply = await agent.process_user_message(message, host.agent_app.auth, host.auth_handler_name, context)
        await context.send_activity(Activity(type="message", text=reply, text_format="markdown"))

    handler_config = {"auth_handlers": [host.auth_handler_name]} if host.auth_handler_name else {}
    host.agent_app.activity("event", **handler_config)(on_run_event)
    app.router.add_post(ROUTE, invocations)
