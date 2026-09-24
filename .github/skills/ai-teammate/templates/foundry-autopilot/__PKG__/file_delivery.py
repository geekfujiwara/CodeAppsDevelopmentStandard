"""Hand a file the teammate produced to people, through its own OneDrive (feature block B14).

Files land under the agent's identity, so the normal auditing and retention rules apply and the
owner can revoke access. The link is always organisation-scoped: an anonymous link cannot be taken
back once it has been pasted somewhere. Sharing with named people is limited to the agent's own
tenant domain, and the prompt requires the requester's consent before the tool is called.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote

import httpx
from copilot import Tool, define_tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

TOOL_NAME = "deliver_file"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
FILES_READ_WRITE = "https://graph.microsoft.com/Files.ReadWrite"
UPLOAD_ROOT = "成果物"
# Graph's single-request upload stops at 250 MB; anything that large belongs elsewhere anyway.
MAX_BYTES = 100 * 1024 * 1024

TokenProvider = Callable[[str], Awaitable[Optional[str]]]


class DeliverFileParams(BaseModel):
    path: str = Field(description="Absolute path of the file you created in this session.")
    share_with: list[str] = Field(
        default_factory=list,
        description=(
            "Email addresses to give read access. Leave empty unless the requester has just "
            "agreed to who receives it; the organisation link is enough to hand it over."
        ),
    )


def _allowed_roots() -> list[Path]:
    roots = [Path(os.path.expanduser("~")), Path("/tmp"), Path.cwd()]
    return [r.resolve() for r in roots if r.exists()]


def resolve_deliverable(path: str) -> Path | None:
    """Only files under the session's own work areas; never system files."""
    try:
        candidate = Path(path).expanduser().resolve()
    except (OSError, RuntimeError):
        return None
    if not candidate.is_file():
        return None
    if not any(candidate == root or root in candidate.parents for root in _allowed_roots()):
        return None
    return candidate


def domain_of(address: str) -> str:
    return address.rsplit("@", 1)[-1].strip().lower() if "@" in address else ""


def build_delivery_tool(*, graph_token: TokenProvider) -> Tool:
    async def handler(params: DeliverFileParams, _invocation: Any) -> str:
        source = resolve_deliverable(params.path)
        if source is None:
            return "That path is not a file you created in this session. Save the file first, then call this tool with its path."
        data = source.read_bytes()
        if len(data) > MAX_BYTES:
            return f"{source.name} is {len(data):,} bytes, over the {MAX_BYTES:,}-byte limit. Tell the user it is too large to hand over this way."
        token = await graph_token(FILES_READ_WRITE)
        if not token:
            logger.warning("No Graph token for file delivery")
            return "The file could not be saved just now. Tell the user and offer to try again."
        headers = {"Authorization": f"Bearer {token}"}
        folder = f"{UPLOAD_ROOT}/{datetime.now():%Y-%m-%d}"
        target = quote(f"{folder}/{source.name}", safe="/")

        async with httpx.AsyncClient(timeout=180) as client:
            upload = await client.put(
                f"{GRAPH_BASE}/me/drive/root:/{target}:/content?@microsoft.graph.conflictBehavior=rename",
                headers=headers,
                content=data,
            )
            if upload.status_code >= 400:
                logger.warning("OneDrive upload failed: %s %s", upload.status_code, upload.text[:300])
                return "The file could not be saved just now. Tell the user and offer to try again."
            item = upload.json()
            link = await client.post(
                f"{GRAPH_BASE}/me/drive/items/{item['id']}/createLink",
                headers={**headers, "Content-Type": "application/json"},
                json={"type": "view", "scope": "organization"},
            )
            url = (link.json().get("link") or {}).get("webUrl") if link.status_code < 400 else ""
            if not url:
                logger.warning("createLink failed: %s %s", link.status_code, link.text[:300])
                url = item.get("webUrl", "")

            shared: list[str] = []
            refused: list[str] = []
            if params.share_with:
                me = await client.get(f"{GRAPH_BASE}/me?$select=mail,userPrincipalName", headers=headers)
                own = me.json() if me.status_code < 400 else {}
                home = domain_of(own.get("mail") or own.get("userPrincipalName") or "")
                for address in params.share_with:
                    # L4: a mail or document can ask for a copy to go outside; only people here get one.
                    (shared if home and domain_of(address) == home else refused).append(address)
                if shared:
                    invite = await client.post(
                        f"{GRAPH_BASE}/me/drive/items/{item['id']}/invite",
                        headers={**headers, "Content-Type": "application/json"},
                        json={
                            "recipients": [{"email": a} for a in shared],
                            "roles": ["read"],
                            "requireSignIn": True,
                            "sendInvitation": False,
                        },
                    )
                    if invite.status_code >= 400:
                        logger.warning("Invite failed: %s %s", invite.status_code, invite.text[:300])
                        refused += shared
                        shared = []

        logger.info("Delivered %s (%d bytes, shared=%d, refused=%d)", item.get("name"), len(data), len(shared), len(refused))
        lines = [
            f"Saved as {item.get('name')} in the teammate's OneDrive ({folder}).",
            f"Organisation link (anyone signed in to this organisation can view): {url}",
        ]
        if shared:
            lines.append("Read access was also given to: " + ", ".join(shared))
        if refused:
            lines.append(
                "Not shared with (outside this organisation or rejected): " + ", ".join(refused)
                + ". Tell the user these people did not get access."
            )
        lines.append("Give the user the link as a Markdown link with the file name. Do not show internal paths.")
        return "\n".join(lines)

    return define_tool(
        TOOL_NAME,
        description=(
            "Save a file you created (document, slide deck, spreadsheet, CSV, image) to your own "
            "OneDrive and get an organisation-only view link to give to the user. Use this "
            "whenever the user should receive a file you made."
        ),
        handler=handler,
        params_type=DeliverFileParams,
        skip_permission=True,
    )
