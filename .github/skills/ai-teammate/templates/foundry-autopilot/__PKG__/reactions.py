"""Emoji reactions on the requester's Teams message, as the teammate itself.

Reacting is what a colleague does in chat: 👀 the moment they have read it, then 👍 / ❤️ / 🎉 when
the content calls for it. Graph ``chatMessage: setReaction`` takes a delegated token only
(``ChatMessage.Send``), so the reaction comes from the agentic user, never from an app identity.

Only the message that started this turn can be reacted to, only in Teams chats, and only with the
emoji below: text inside a mail or a document cannot steer the tool at someone else's message.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote

import httpx
from copilot import Tool, define_tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

TOOL_NAME = "react_to_message"
READ_REACTION = "👀"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
CHAT_MESSAGE_SEND = "https://graph.microsoft.com/ChatMessage.Send"
REACTIONS = {
    "👍": "賛成・了解・いい話",
    "❤️": "嬉しい・ありがたい",
    "😆": "面白い",
    "🎉": "お祝い・達成",
    "🙏": "お願い・感謝",
    "😮": "驚き",
    "😢": "残念・悲しい",
}

TokenProvider = Callable[[str], Awaitable[Optional[str]]]


def enabled() -> bool:
    return (os.getenv("REACTIONS_ENABLED") or "").strip().lower() == "true"


def target(activity: Any) -> tuple[str, str] | None:
    """(chat id, message id) of the Teams chat message behind this turn, or None."""
    if not str(getattr(activity, "channel_id", "") or "").startswith("msteams"):
        return None
    if getattr(activity, "type", "") != "message":
        return None
    conversation = getattr(activity, "conversation", None)
    # Channel posts need the team and channel ids; the teammate is reached in chats.
    if (getattr(conversation, "conversation_type", "") or "") == "channel":
        return None
    chat_id = getattr(conversation, "id", "") or ""
    message_id = getattr(activity, "id", "") or ""
    return (chat_id, message_id) if chat_id and message_id else None


async def set_reaction(activity: Any, graph_token: TokenProvider, emoji: str) -> bool:
    ids = target(activity)
    if ids is None or (emoji != READ_REACTION and emoji not in REACTIONS):
        return False
    token = await graph_token(CHAT_MESSAGE_SEND)
    if not token:
        logger.info("No Graph token for reactions (grant ChatMessage.Send to the instance)")
        return False
    chat_id, message_id = ids
    url = f"{GRAPH_BASE}/chats/{quote(chat_id, safe='')}/messages/{quote(message_id, safe='')}/setReaction"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            url, headers={"Authorization": f"Bearer {token}"}, json={"reactionType": emoji}
        )
    if response.status_code >= 400:
        logger.warning("setReaction %s returned %s: %s", emoji, response.status_code, response.text[:200])
        return False
    return True


async def mark_read(activity: Any, graph_token: TokenProvider) -> None:
    """👀 as soon as the message arrives; never allowed to delay or fail the turn."""
    try:
        await set_reaction(activity, graph_token, READ_REACTION)
    except Exception:  # noqa: BLE001
        logger.warning("Could not mark the message as read", exc_info=True)


class ReactParams(BaseModel):
    emoji: str = Field(
        description="One of: " + ", ".join(f"{e} ({meaning})" for e, meaning in REACTIONS.items())
    )


def build_reaction_tool(*, activity: Any, graph_token: TokenProvider) -> Tool | None:
    if target(activity) is None:
        return None
    used: list[str] = []

    async def handler(params: ReactParams, _invocation: Any) -> str:
        emoji = params.emoji.strip()
        if emoji not in REACTIONS:
            return f"Use one of: {' '.join(REACTIONS)}."
        if used:
            return "You already reacted to this message. Do not react again; just answer."
        if not await set_reaction(activity, graph_token, emoji):
            return "The reaction could not be added. Carry on without it and do not mention it."
        used.append(emoji)
        return f"Reacted with {emoji}. Do not mention the reaction in your answer."

    return define_tool(
        TOOL_NAME,
        description=(
            "React with one emoji to the message the user just sent in this Teams chat, the way a "
            "colleague would. Use it only when the content clearly calls for it (good news, thanks, "
            "a success, something funny, sad news). At most once per message."
        ),
        handler=handler,
        params_type=ReactParams,
        skip_permission=True,
    )
