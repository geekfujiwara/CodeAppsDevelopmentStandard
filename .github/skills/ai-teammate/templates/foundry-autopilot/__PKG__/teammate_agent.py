"""${AGENT_DISPLAY_NAME} - a Foundry-hosted AI teammate published as an M365 Autopilot.

Implements the quickstart's ``AgentInterface`` so it runs on the upstream activity-protocol host
without forking it. The brain is the GitHub Copilot SDK against this tenant's own Foundry model
deployment, which is why no separate model quota or API key exists anywhere in this container.

Three things run alongside the turn handler:
  * SkillSync   - publishes the SKILL.md bundles shipped here to the evaluation hub
  * TestWorker  - executes regression / evaluation cases queued in the hub
  * generate_image - optional (B17), only when IMAGE_MODEL_DEPLOYMENT is set
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

from azure.identity.aio import DefaultAzureCredential, ManagedIdentityCredential
from microsoft_agents.hosting.core import Authorization, TurnContext

from .agent_interface import AgentInterface
from .copilot_brain import CopilotBrain, mcp_servers_from_responses_tools

logger = logging.getLogger(__name__)

FOUNDRY_SCOPE = "https://ai.azure.com/.default"
MCP_SCOPE = "https://agent365.svc.cloud.microsoft/.default"
TEAMS_MCP_SERVER = "mcp_TeamsServer"
ONEDRIVE_MCP_SERVER = "mcp_ODSPRemoteServer"
PROMPT_FILE = "prompts/system.md"
SKILLS_DIRNAME = "skills"
PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
# The quickstart manifest still uses the lowercase legacy token.
PLACEHOLDER_ALIASES = {"organization": "AZURE_DEVOPS_ORGANIZATION"}


def _resolve_placeholders(server: dict[str, Any]) -> dict[str, Any] | None:
    """Fill ``{ENV_VAR}`` tokens from the environment, or drop the server if any is unset.

    A server left with a literal placeholder in its URL would be called on every turn and fail
    every time, so an unconfigured optional server is removed instead.
    """
    resolved = dict(server)
    for field in ("url", "tokenScope"):
        value = resolved.get(field)
        if not isinstance(value, str) or "{" not in value:
            continue
        for name in PLACEHOLDER.findall(value):
            env_name = PLACEHOLDER_ALIASES.get(name, name)
            replacement = os.getenv(env_name, "").strip().rstrip("/")
            if not replacement:
                logger.info(
                    "MCP server %s disabled (%s is not set)",
                    resolved.get("mcpServerName", "?"),
                    env_name,
                )
                return None
            value = value.replace(f"{{{name}}}", replacement)
        resolved[field] = value
    return resolved


class TeammateAgent(AgentInterface):
    def __init__(self) -> None:
        self._project_endpoint = (
            os.getenv("FOUNDRY_PROJECT_ENDPOINT") or os.getenv("AZURE_AI_PROJECT_ENDPOINT") or ""
        ).strip()
        self._deployment = (
            os.getenv("ModelDeployment") or os.getenv("AZURE_OPENAI_DEPLOYMENT") or ""
        ).strip()
        if not self._project_endpoint:
            raise ValueError("FOUNDRY_PROJECT_ENDPOINT (or AZURE_AI_PROJECT_ENDPOINT) is required")
        if not self._deployment:
            raise ValueError("ModelDeployment (or AZURE_OPENAI_DEPLOYMENT) is required")

        self._instance_client_id = os.getenv("FOUNDRY_AGENT_DEFAULT_INSTANCE_CLIENT_ID")
        self._credential = (
            ManagedIdentityCredential(client_id=self._instance_client_id)
            if self._instance_client_id
            else DefaultAzureCredential()
        )
        self._toolbox_endpoint = os.getenv("TOOLBOX_ENDPOINT", "").strip()
        self._root = Path(__file__).resolve().parent
        self._mcp_servers = self._load_mcp_servers()
        self._instructions = self._load_instructions()
        self._skill_dirs = [d for d in (self._root / SKILLS_DIRNAME, Path.cwd() / SKILLS_DIRNAME) if d.is_dir()]
        self._brain: CopilotBrain | None = None
        self._skill_sync = None
        self._test_worker = None

        logger.info(
            "Teammate ready (deployment=%s, mcp_servers=%d, toolbox=%s, skills=%d)",
            self._deployment,
            len(self._mcp_servers),
            bool(self._toolbox_endpoint),
            sum(len(list(d.glob("*/SKILL.md"))) for d in self._skill_dirs),
        )

    def _load_instructions(self) -> str:
        for candidate in (self._root / PROMPT_FILE, Path.cwd() / PROMPT_FILE):
            if candidate.is_file():
                return candidate.read_text(encoding="utf-8")
        return (
            f"あなたは {os.getenv('AGENT_DISPLAY_NAME', 'AI チームメイト')} です。"
            "同僚として誠実に、根拠を示して回答してください。"
        )

    def _load_mcp_servers(self) -> list[dict[str, Any]]:
        manifest = self._root / "ToolingManifest.json"
        if not manifest.is_file():
            logger.warning("ToolingManifest.json not found at %s", manifest)
            return []
        try:
            configured = json.loads(manifest.read_text(encoding="utf-8")).get("mcpServers") or []
        except Exception:  # noqa: BLE001
            logger.exception("Failed to parse ToolingManifest.json")
            return []

        servers: list[dict[str, Any]] = []
        for entry in configured:
            server = _resolve_placeholders(dict(entry))
            if server is None:
                continue
            servers.append(server)
        logger.info("Loaded %d MCP server(s) from ToolingManifest.json", len(servers))
        return servers

    async def initialize(self) -> None:
        self._brain = CopilotBrain(
            project_endpoint=self._project_endpoint,
            model=self._deployment,
            skill_directories=[str(d) for d in self._skill_dirs],
            custom_tools=self._build_custom_tools(),
        )
        from .skill_sync import SkillSync
        from .test_worker import TestWorker

        self._skill_sync = SkillSync(directories=self._skill_dirs)
        self._skill_sync.start()
        self._test_worker = TestWorker(run_turn=self._run_headless_turn)
        self._test_worker.start()
        logger.info("Agent initialized")

    async def cleanup(self) -> None:
        for component in (self._skill_sync, self._test_worker):
            if component is not None:
                await component.stop()
        if self._brain is not None:
            await self._brain.close()
        await self._credential.close()

    async def process_user_message(
        self,
        message: str,
        auth: Authorization,
        auth_handler_name: Optional[str],
        context: TurnContext,
    ) -> str:
        conversation_id = getattr(getattr(context, "activity", None), "conversation", None)
        conversation_id = getattr(conversation_id, "id", "") or ""
        tools = await self._build_mcp_tools(auth, auth_handler_name, context, include_teams=False)
        provider_token = await self._credential.get_token(FOUNDRY_SCOPE)
        assert self._brain is not None
        return await self._brain.ask(
            conversation_id=conversation_id,
            instructions=self._instructions,
            message=message,
            bearer_token=provider_token.token,
            mcp_servers=mcp_servers_from_responses_tools(tools),
        )

    async def _run_headless_turn(self, *, conversation_id: str, message: str):
        """Turn without a signed-in caller, used by the evaluation / regression worker."""
        tools = await self._build_mcp_tools(None, None, None, include_teams=False)
        provider_token = await self._credential.get_token(FOUNDRY_SCOPE)
        assert self._brain is not None
        answer = await self._brain.ask(
            conversation_id=conversation_id,
            instructions=self._instructions,
            message=message,
            bearer_token=provider_token.token,
            mcp_servers=mcp_servers_from_responses_tools(tools),
        )
        return answer, list(self._brain.last_tool_calls)

    async def _build_mcp_tools(
        self,
        auth: Authorization | None,
        auth_handler_name: Optional[str],
        context: TurnContext | None,
        *,
        include_teams: bool,
    ) -> list[dict[str, Any]]:
        tools: list[dict[str, Any]] = []
        token_cache: dict[str, str | None] = {}
        for server in self._mcp_servers:
            name = server.get("mcpServerName") or server.get("name") or ""
            url = server.get("url", "")
            if not url:
                continue
            # The Teams MCP server turns a direct reply into a second, duplicated message.
            if name == TEAMS_MCP_SERVER and not include_teams:
                continue
            scope = server.get("tokenScope") or MCP_SCOPE
            if scope not in token_cache:
                token_cache[scope] = await self._acquire_mcp_token(
                    auth, auth_handler_name, context, scope=scope
                )
            bearer = token_cache[scope]
            tool: dict[str, Any] = {
                "type": "mcp",
                "server_label": name,
                "server_url": url,
                "server_description": f"MCP server: {name}",
                "require_approval": "never",
            }
            if bearer:
                tool["headers"] = {"Authorization": f"Bearer {bearer}"}
            tools.append(tool)

        if self._toolbox_endpoint:
            toolbox_token = await self._credential.get_token(FOUNDRY_SCOPE)
            tools.append(
                {
                    "type": "mcp",
                    "server_label": "foundry_toolbox",
                    "server_url": self._toolbox_endpoint,
                    "server_description": "Foundry Toolbox (web search, code interpreter)",
                    "require_approval": "never",
                    "headers": {"Authorization": f"Bearer {toolbox_token.token}"},
                }
            )
        return tools

    async def _acquire_mcp_token(
        self,
        auth: Authorization | None,
        auth_handler_name: Optional[str],
        context: TurnContext | None,
        *,
        scope: str,
    ) -> Optional[str]:
        if auth is not None and auth_handler_name and context is not None:
            try:
                exchanged = await auth.exchange_token(
                    context, scopes=[scope], auth_handler_id=auth_handler_name
                )
                return getattr(exchanged, "token", None) or getattr(exchanged, "access_token", None)
            except Exception:  # noqa: BLE001
                logger.exception("Delegated MCP token exchange failed (scope=%s)", scope)
                return None
        # No signed-in caller (evaluation worker): fall back to the agent's own identity so the
        # teammate can still reach its own mailbox and files.
        try:
            token = await self._credential.get_token(scope)
            return token.token
        except Exception:  # noqa: BLE001
            logger.info("No app-only token for scope %s; that server will be unauthenticated", scope)
            return None

    def _build_custom_tools(self) -> list[Any]:
        deployment = os.getenv("IMAGE_MODEL_DEPLOYMENT", "").strip()
        if not deployment:
            return []
        from .image_tools import build_generate_image_tool

        endpoint = os.getenv("IMAGE_MODEL_ENDPOINT", "").strip() or self._project_endpoint

        async def token_provider() -> str:
            return (await self._credential.get_token(FOUNDRY_SCOPE)).token

        async def save_png(file_name: str, data: bytes) -> str:
            from .onedrive import upload_png

            return await upload_png(
                file_name=file_name,
                data=data,
                token_provider=lambda: self._credential.get_token(MCP_SCOPE),
            )

        logger.info("Image generation enabled (deployment=%s)", deployment)
        return [
            build_generate_image_tool(
                endpoint=endpoint,
                deployment=deployment,
                token_provider=token_provider,
                save_png=save_png,
            )
        ]
