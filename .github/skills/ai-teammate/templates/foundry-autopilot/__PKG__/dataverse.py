"""Minimal Dataverse Web API client for the Foundry-hosted teammate.

Used by :mod:`skill_sync` and :mod:`test_worker` to reach the shared evaluation hub. The agent
authenticates with its own instance managed identity, so the hub records what *this* teammate
did under its own agent key - there is no service account to share.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import quote

import httpx
from azure.identity.aio import DefaultAzureCredential, ManagedIdentityCredential

logger = logging.getLogger(__name__)

API_PATH = "/api/data/v9.2"


class Dataverse:
    def __init__(self, url: str | None = None, client_id: str | None = None) -> None:
        self._url = (url or os.getenv("DATAVERSE_URL", "")).strip().rstrip("/")
        self._client_id = client_id or os.getenv("FOUNDRY_AGENT_DEFAULT_INSTANCE_CLIENT_ID")
        self._credential = None
        self._client: httpx.AsyncClient | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._url)

    async def _headers(self) -> dict[str, str]:
        if self._credential is None:
            self._credential = (
                ManagedIdentityCredential(client_id=self._client_id)
                if self._client_id
                else DefaultAzureCredential()
            )
        token = await self._credential.get_token(f"{self._url}/.default")
        return {
            "Authorization": f"Bearer {token.token}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
        }

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=f"{self._url}{API_PATH}", timeout=60)
        return self._client

    async def get(self, query: str) -> dict[str, Any]:
        client = await self._http()
        response = await client.get(f"/{query}", headers=await self._headers())
        response.raise_for_status()
        return response.json()

    async def post(self, entity_set: str, record: dict[str, Any]) -> None:
        client = await self._http()
        response = await client.post(f"/{entity_set}", headers=await self._headers(), json=record)
        response.raise_for_status()

    async def patch(self, entity_set: str, row_id: str, record: dict[str, Any]) -> None:
        client = await self._http()
        response = await client.patch(
            f"/{entity_set}({row_id})", headers=await self._headers(), json=record
        )
        response.raise_for_status()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        if self._credential is not None:
            await self._credential.close()
            self._credential = None


def odata_literal(value: str) -> str:
    """Escape a string for an OData $filter literal (single quotes are doubled)."""
    return quote(value.replace("'", "''"), safe="")
