"""Upload a generated file to the teammate's own OneDrive via Microsoft Graph.

Files are written under the agent's identity, not a shared service account, so the normal
auditing and retention rules apply and the link can be revoked by the agent's owner. Sharing
scope is deliberately ``organization``: an anonymous link cannot be taken back once it is sent.
"""

from __future__ import annotations

import logging
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
UPLOAD_FOLDER = "AgentOutputs"


async def upload_png(*, file_name: str, data: bytes, token_provider) -> str:
    token = await token_provider()
    bearer = getattr(token, "token", token)
    path = quote(f"{UPLOAD_FOLDER}/{file_name}", safe="/")
    async with httpx.AsyncClient(timeout=180) as client:
        upload = await client.put(
            f"{GRAPH_BASE}/me/drive/root:/{path}:/content",
            headers={"Authorization": f"Bearer {bearer}", "Content-Type": "image/png"},
            content=data,
        )
        if upload.status_code >= 400:
            logger.warning("OneDrive upload failed: %s %s", upload.status_code, upload.text[:300])
            return ""
        item_id = upload.json().get("id")
        link = await client.post(
            f"{GRAPH_BASE}/me/drive/items/{item_id}/createLink",
            headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
            json={"type": "view", "scope": "organization"},
        )
        if link.status_code >= 400:
            logger.warning("createLink failed: %s %s", link.status_code, link.text[:300])
            return upload.json().get("webUrl", "")
        return (link.json().get("link") or {}).get("webUrl", "")
