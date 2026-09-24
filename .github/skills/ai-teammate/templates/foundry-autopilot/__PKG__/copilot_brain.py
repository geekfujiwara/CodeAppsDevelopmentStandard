"""GitHub Copilot SDK brain for the Foundry-hosted teammate.

The Copilot SDK runs the full agentic loop (planning, tool iteration, context compaction) and
reaches the tenant's own Foundry model deployment through its BYOK Azure provider, so no extra
model quota is needed. Agent 365 MCP servers are handed over as remote HTTP servers carrying the
caller's delegated bearer token, which keeps every action inside the user's own permissions.

Skills are loaded from directories shipped with the container. Host discovery is never enabled:
an agent must not inherit whatever SKILL.md happens to sit on the machine it runs on.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from typing import Any, Awaitable, Callable, Sequence

from copilot import CopilotClient, PermissionHandler, ProviderConfig, SessionEventType, ToolSet

logger = logging.getLogger(__name__)

# The SDK session id doubles as the provider prompt_cache_key, which is capped at 64 characters,
# so long Teams / M365 Copilot conversation ids are hashed instead of passed through.
_SESSION_ID_PREFIX = "conv-"
_TURN_TIMEOUT_SECONDS = 600

ProgressSink = Callable[[str], Awaitable[None]]


class BrainError(RuntimeError):
    """A turn that failed for a known reason.

    The raw SDK payload never reaches the conversation: pasted into the chat it
    becomes history the model reads back later as proof the feature is broken.
    """

    def __init__(self, kind: str, detail: Any) -> None:
        super().__init__(kind)
        self.kind = kind
        self.detail = detail


def _classify_session_error(detail: Any) -> str:
    values = detail if isinstance(detail, dict) else {}
    if values.get("error_type") == "rate_limit" or values.get("status_code") == 429:
        return "rate_limit"
    return "unknown"


class CopilotBrain:
    """Runs one turn through the Copilot SDK against the Foundry model."""

    def __init__(
        self,
        *,
        project_endpoint: str,
        model: str,
        skill_directories: Sequence[str] = (),
        custom_tools: Sequence[Any] = (),
        turn_timeout_seconds: int = _TURN_TIMEOUT_SECONDS,
    ) -> None:
        self._project_endpoint = project_endpoint
        self._model = model
        self._skill_directories = [str(path) for path in skill_directories]
        self._custom_tools = list(custom_tools)
        self._turn_timeout_seconds = turn_timeout_seconds
        self._client: CopilotClient | None = None
        self._sessions: dict[str, tuple[Any, str]] = {}
        # The SDK session handles one turn at a time; Teams can deliver activities in bursts,
        # which would otherwise deadlock waiting for idle.
        self._lock = asyncio.Lock()
        self.last_tool_calls: list[str] = []

    async def close(self) -> None:
        for session, _ in self._sessions.values():
            try:
                await session.abort()
            except Exception:  # noqa: BLE001 - best effort during shutdown
                pass
        self._sessions.clear()
        if self._client is not None:
            try:
                await self._client.stop()
            except Exception:  # noqa: BLE001 - best effort during shutdown
                pass
            self._client = None

    async def ask(
        self,
        *,
        conversation_id: str,
        instructions: str,
        message: str,
        bearer_token: str,
        mcp_servers: dict[str, dict[str, Any]],
        tools: Sequence[Any] = (),
        on_progress: ProgressSink | None = None,
    ) -> str:
        async with self._lock:
            session = await self._session_for(
                conversation_id=conversation_id,
                instructions=instructions,
                bearer_token=bearer_token,
                mcp_servers=mcp_servers,
                tools=tools,
            )
            self.last_tool_calls = []
            try:
                return await asyncio.wait_for(
                    self._run_turn(session, message, on_progress),
                    timeout=self._turn_timeout_seconds,
                )
            except asyncio.TimeoutError:
                logger.warning("Copilot SDK turn timed out; dropping the session")
                await self._drop(conversation_id)
                raise
            except Exception:
                await self._drop(conversation_id)
                raise

    async def _session_for(
        self,
        *,
        conversation_id: str,
        instructions: str,
        bearer_token: str,
        mcp_servers: dict[str, dict[str, Any]],
        tools: Sequence[Any] = (),
    ):
        if self._client is None:
            self._client = CopilotClient()
            await self._client.start()
            logger.info("Copilot SDK runtime started")

        # Tools built per turn (they capture the conversation) come first; tools handed to the
        # constructor are the ones that need no turn context.
        custom_tools = [*tools, *self._custom_tools]
        available = ToolSet().add_builtin("*").add_mcp("*")
        for tool in custom_tools:
            available = available.add_custom(getattr(tool, "name", ""))

        options: dict[str, Any] = dict(
            provider=ProviderConfig(
                type="azure",
                base_url=self._project_endpoint,
                wire_api="responses",
                bearer_token=bearer_token,
            ),
            model=self._model,
            mcp_servers=mcp_servers or None,
            available_tools=available,
            system_message={"mode": "replace", "content": instructions},
            on_permission_request=PermissionHandler.approve_all,
            streaming=False,
        )
        if custom_tools:
            options["tools"] = custom_tools
        if self._skill_directories:
            options["enable_skills"] = True
            options["skill_directories"] = self._skill_directories

        fingerprint = _fingerprint(
            bearer_token,
            instructions,
            mcp_servers,
            [getattr(tool, "name", "") for tool in custom_tools],
        )
        cached = self._sessions.get(conversation_id)
        if cached is not None and cached[1] == fingerprint:
            return cached[0]
        if cached is not None:
            # Delegated tokens rotate roughly hourly; a stale session would keep calling the
            # model and the MCP servers with an expired bearer token.
            await self._drop(conversation_id)

        session_id = _session_id(conversation_id)
        try:
            session = await self._client.resume_session(session_id, **options)
            logger.info("Resumed Copilot session %s", session_id)
        except Exception:  # noqa: BLE001 - no session to resume on the first turn
            session = await self._client.create_session(session_id=session_id, **options)
            logger.info("Created Copilot session %s", session_id)
        self._sessions[conversation_id] = (session, fingerprint)
        return session

    async def _drop(self, conversation_id: str) -> None:
        entry = self._sessions.pop(conversation_id, None)
        if entry is None:
            return
        try:
            await entry[0].abort()
        except Exception:  # noqa: BLE001 - best effort
            pass

    async def _run_turn(self, session, message: str, on_progress: ProgressSink | None = None) -> str:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        reporter = _ProgressReporter(on_progress)

        def _on_event(event):
            # The SDK raises events from its reader thread.
            loop.call_soon_threadsafe(queue.put_nowait, event)

        unsubscribe = session.on(_on_event)
        answer = ""
        try:
            await session.send(message)
            while True:
                event = await queue.get()
                if event.type == SessionEventType.ASSISTANT_MESSAGE:
                    answer = getattr(event.data, "content", "") or answer
                elif event.type == SessionEventType.ASSISTANT_INTENT:
                    # The model's own words about what it is doing - better than any template.
                    await reporter.send(getattr(event.data, "intent", "") or "")
                elif event.type == SessionEventType.TOOL_EXECUTION_START:
                    name = getattr(event.data, "tool_name", "") or "(unknown)"
                    self.last_tool_calls.append(name)
                    logger.info("Copilot SDK tool: %s", name)
                    await reporter.send(_describe_tool_call(event.data))
                elif event.type in (SessionEventType.SESSION_IDLE, SessionEventType.ASSISTANT_IDLE):
                    break
                elif event.type == SessionEventType.SESSION_ERROR:
                    detail = getattr(event.data, "__dict__", event.data)
                    logger.error("Copilot SDK session error: %s", detail)
                    raise BrainError(_classify_session_error(detail), detail)
        finally:
            try:
                unsubscribe()
            except Exception:  # noqa: BLE001 - best effort
                pass
        return answer.strip()


class _ProgressReporter:
    """Forwards live session events to the conversation without ever breaking the turn."""

    MAX_UPDATES = 12

    def __init__(self, sink: ProgressSink | None) -> None:
        self._sink = sink
        self._sent: set[str] = set()

    async def send(self, text: str) -> None:
        text = (text or "").strip()
        if not self._sink or not text or text in self._sent:
            return
        if len(self._sent) >= self.MAX_UPDATES:
            return
        self._sent.add(text)
        try:
            await self._sink(text)
        except Exception:  # noqa: BLE001 - a failed progress note must not fail the turn
            logger.debug("Progress update could not be delivered", exc_info=True)


# One concrete value out of the arguments turns "searching" into "searching for what".
# "prompt" is deliberately absent: it is the model's own long English rewrite, which would
# show up in the wrong language and drown the line.
_DETAIL_KEYS = (
    "query",
    "command",
    "search_query",
    "subject",
    "question",
    "path",
    "file_path",
    "url",
    "name",
)


def _describe_tool_call(data: Any) -> str:
    tool = getattr(data, "mcp_tool_name", "") or getattr(data, "tool_name", "") or "tool"
    server = getattr(data, "mcp_server_name", "") or ""
    label = f"{_friendly_server(server)}: {tool}" if server else tool

    arguments = getattr(data, "arguments", None)
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except Exception:  # noqa: BLE001 - not every runtime sends JSON
            arguments = None
    detail = ""
    if isinstance(arguments, dict):
        for key in _DETAIL_KEYS:
            value = arguments.get(key)
            if isinstance(value, str) and value.strip():
                detail = value.strip()
                break
    if len(detail) > 140:
        detail = detail[:137] + "..."
    return f"🔧 {label} — {detail}" if detail else f"🔧 {label}"


def _friendly_server(server: str) -> str:
    """``mcp_MailToolsServer`` -> ``MailTools``. Internal names are not user-facing."""
    return server.removeprefix("mcp_").removesuffix("Server") or server


def mcp_servers_from_responses_tools(tools: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Reshape Responses-API ``{"type": "mcp", ...}`` tools into SDK server configs."""
    servers: dict[str, dict[str, Any]] = {}
    for tool in tools:
        if tool.get("type") != "mcp":
            continue
        url, label = tool.get("server_url"), tool.get("server_label")
        if not url or not label:
            continue
        server: dict[str, Any] = {"type": "http", "url": url}
        if tool.get("headers"):
            server["headers"] = tool["headers"]
        if tool.get("server_description"):
            server["display_name"] = tool["server_description"]
        servers[label] = server
    return servers


def _session_id(conversation_id: str) -> str:
    if not conversation_id:
        return f"{_SESSION_ID_PREFIX}{uuid.uuid4().hex}"
    return f"{_SESSION_ID_PREFIX}{hashlib.sha256(conversation_id.encode('utf-8')).hexdigest()[:32]}"


def _fingerprint(
    bearer_token: str,
    instructions: str,
    mcp_servers: dict[str, dict[str, Any]],
    tool_names: list[str],
) -> str:
    payload = json.dumps(
        [bearer_token, instructions, mcp_servers, sorted(tool_names)], sort_keys=True, default=str
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
