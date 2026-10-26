"""Refresh only the authenticated agent user's presence, never the initiating person's."""
from __future__ import annotations

import base64
import json

import aiohttp

GRAPH = "https://graph.microsoft.com/v1.0"


def application_id(token: str) -> str:
    payload = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    identifier = claims.get("azp") or claims.get("appid")
    if not isinstance(identifier, str) or not identifier:
        raise ValueError("Presence token has no application ID.")
    return identifier


async def refresh(token: str) -> None:
    async with aiohttp.ClientSession(headers={"Authorization": f"Bearer {token}"},
                                     timeout=aiohttp.ClientTimeout(total=30)) as session:
        async with session.get("https://graph.microsoft.com/beta/me") as response:
            response.raise_for_status()
            user = await response.json()
        if not user.get("identityParentId") and user.get("@odata.type") != "#microsoft.graph.agentUser":
            raise ValueError("Presence refresh requires an authenticated agent user, not a human.")
        async with session.post(f"{GRAPH}/users/{user['id']}/presence/setPresence", json={
            "sessionId": application_id(token), "availability": "Available",
            "activity": "Available", "expirationDuration": "PT4H",
        }) as response:
            response.raise_for_status()
