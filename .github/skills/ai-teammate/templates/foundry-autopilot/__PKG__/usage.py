"""Who is using the teammate and what it costs (feature block B15), kept entirely in Azure.

Every turn writes one ``Usage turn`` trace to Application Insights with the caller, the token
counts the Copilot SDK reported (``assistant.usage``) and the cost at the configured unit prices.
The ``usage_report`` tool reads those traces back through the Log Analytics query API with the
agent's own managed identity (Log Analytics Reader on the workspace). Nothing is stored in the
container, so the numbers survive the session being stopped or recycled.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable

import httpx
from copilot import Tool, define_tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

TOOL_NAME = "usage_report"
TRACE_MESSAGE = "Usage turn"
QUERY_SCOPE = "https://api.loganalytics.io/.default"
MAX_DAYS = 90

TokenProvider = Callable[[str], Awaitable[str]]


def _price(name: str) -> float | None:
    value = (os.getenv(name) or "").strip()
    try:
        return float(value) if value else None
    except ValueError:
        return None


def cost_usd(usage: dict[str, Any]) -> float | None:
    """Cost at the configured prices per million tokens, or None when prices are not set."""
    price_in, price_out = _price("USAGE_PRICE_INPUT_PER_1M"), _price("USAGE_PRICE_OUTPUT_PER_1M")
    if price_in is None or price_out is None:
        return None
    price_cached = _price("USAGE_PRICE_CACHED_PER_1M")
    cached = int(usage.get("cache_read_tokens") or 0)
    fresh = max(int(usage.get("input_tokens") or 0) - cached, 0)
    total = fresh * price_in + int(usage.get("output_tokens") or 0) * price_out
    total += cached * (price_cached if price_cached is not None else price_in)
    return round(total / 1_000_000, 6)


def record_turn(*, user_id: str, user_name: str, channel: str, usage: dict[str, Any],
                tool_calls: list[str], duration_ms: int) -> None:
    """One trace per turn; its custom dimensions are what the report queries."""
    cost = cost_usd(usage)
    logger.info(
        TRACE_MESSAGE,
        extra={
            "usage.user_id": user_id,
            "usage.user_name": user_name,
            "usage.channel": channel,
            "usage.model": usage.get("model") or "",
            "usage.calls": int(usage.get("calls") or 0),
            "usage.input_tokens": int(usage.get("input_tokens") or 0),
            "usage.output_tokens": int(usage.get("output_tokens") or 0),
            "usage.cache_read_tokens": int(usage.get("cache_read_tokens") or 0),
            "usage.cost_usd": cost if cost is not None else -1,
            "usage.tool_calls": ",".join(tool_calls)[:2000],
            "usage.duration_ms": duration_ms,
        },
    )


class UsageReportParams(BaseModel):
    days: int = Field(default=30, description="How many days back to include (1-90).")
    scope: str = Field(default="me", description="'me' for the requester only, 'all' for everyone.")
    group_by: str = Field(default="user", description="'user' or 'day'.")


def build_query(*, days: int, group_by: str, user_id: str | None) -> str:
    days = min(max(days, 1), MAX_DAYS)
    key = "UserName" if group_by != "day" else "Day"
    where_user = f'| where UserId == "{user_id}"\n' if user_id else ""
    return (
        f"AppTraces\n| where TimeGenerated > ago({days}d)\n"
        f'| where Message == "{TRACE_MESSAGE}"\n'
        "| extend UserId = tostring(Properties['usage.user_id']),"
        " UserName = tostring(Properties['usage.user_name']),"
        " Day = format_datetime(TimeGenerated, 'yyyy-MM-dd'),"
        " In = toint(Properties['usage.input_tokens']),"
        " Out = toint(Properties['usage.output_tokens']),"
        " Cost = todouble(Properties['usage.cost_usd'])\n"
        f"{where_user}"
        f"| summarize Turns = count(), InputTokens = sum(In), OutputTokens = sum(Out),"
        f" CostUsd = sumif(Cost, Cost >= 0) by {key}\n"
        "| order by CostUsd desc, InputTokens desc"
    )


def build_usage_tool(*, token_provider: TokenProvider, user_id: str, allow_all: bool) -> Tool | None:
    workspace = (os.getenv("USAGE_WORKSPACE_ID") or "").strip()
    if not workspace:
        return None

    async def handler(params: UsageReportParams, _invocation: Any) -> str:
        everyone = params.scope == "all"
        if everyone and not allow_all:
            everyone = False
        query = build_query(days=params.days, group_by=params.group_by,
                            user_id=None if everyone else user_id)
        token = await token_provider(QUERY_SCOPE)
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"https://api.loganalytics.io/v1/workspaces/{workspace}/query",
                headers={"Authorization": f"Bearer {token}"},
                json={"query": query},
            )
        if response.status_code != 200:
            logger.warning("Usage query returned %s: %s", response.status_code, response.text[:300])
            return "The usage records could not be read just now. Tell the user and offer to try again."
        table = (response.json().get("tables") or [{}])[0]
        columns = [c["name"] for c in table.get("columns", [])]
        rows = table.get("rows", [])
        if not rows:
            return f"No usage was recorded in the last {params.days} day(s)."
        lines = [" | ".join(columns)] + [" | ".join(str(v) for v in row) for row in rows[:50]]
        note = "" if cost_usd({"input_tokens": 0, "output_tokens": 0}) is not None else (
            "\nNo unit prices are configured, so CostUsd is 0; report tokens only."
        )
        return (
            f"Usage for the last {params.days} day(s), "
            f"{'everyone' if everyone else 'the requester only'}:\n" + "\n".join(lines) + note +
            "\nPresent this as a short table in the user's language. Costs are estimates in USD "
            "at list price, not the invoice."
        )

    return define_tool(
        TOOL_NAME,
        description=(
            "Report how much the teammate has been used: turns, tokens and estimated cost, per "
            "person or per day. Use it when someone asks who uses you, how much, or what it costs."
        ),
        handler=handler,
        params_type=UsageReportParams,
        skip_permission=True,
    )
