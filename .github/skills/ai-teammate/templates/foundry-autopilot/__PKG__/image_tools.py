"""Image generation tool for the Foundry-hosted teammate (feature block B17).

The image model is a deployment on the same Foundry account as the brain, so it is reached with
the agent's own managed identity - no API key exists to leak. Generated PNGs are not returned
inline: they are written to the teammate's own OneDrive through the Agent 365 OneDrive/SharePoint
MCP server, so the file lives under the agent's identity with a normal audit trail and the reply
carries a link instead of a megabyte of base64.

Image generation is billed per image, so it is only ever started from a turn the user themselves
opened. Untrusted text (mail bodies, fetched pages) must never reach this tool as an instruction.
"""

from __future__ import annotations

import base64
import logging
import os
import re
from datetime import datetime, timezone

import httpx
from copilot import define_tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

DEFAULT_API_VERSION = "v1"
DEFAULT_SIZE = "1024x1024"
ALLOWED_SIZES = {"1024x1024", "1024x1536", "1536x1024", "auto"}
SAFE_NAME = re.compile(r"[^0-9A-Za-z._-]+")


class GenerateImageParams(BaseModel):
    prompt: str = Field(description="生成したい画像の説明。日本語で構わない")
    file_name: str = Field(default="", description="保存するファイル名（省略時は日時から生成）")
    size: str = Field(default=DEFAULT_SIZE, description=f"画像サイズ。{', '.join(sorted(ALLOWED_SIZES))}")


def build_generate_image_tool(*, endpoint: str, deployment: str, token_provider, save_png):
    """Create the ``generate_image`` tool.

    ``token_provider`` is an awaitable returning a bearer token for the Foundry account and
    ``save_png`` is an awaitable ``(file_name, data) -> str`` returning a shareable link.
    """

    @define_tool(
        name="generate_image",
        description=(
            "画像を生成して OneDrive に保存し、共有リンクを返します。"
            "依頼者が明示的に画像を求めたときだけ使ってください（1 枚ごとに課金されます）。"
        ),
    )
    async def generate_image(params: GenerateImageParams) -> str:
        size = params.size if params.size in ALLOWED_SIZES else DEFAULT_SIZE
        token = await token_provider()
        url = f"{endpoint.rstrip('/')}/openai/{DEFAULT_API_VERSION}/images/generations"
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"model": deployment, "prompt": params.prompt, "size": size, "n": 1},
            )
        if response.status_code >= 400:
            logger.warning("Image generation failed: %s %s", response.status_code, response.text[:400])
            return f"画像を生成できませんでした（HTTP {response.status_code}）。"

        payload = response.json().get("data") or []
        if not payload or not payload[0].get("b64_json"):
            return "画像を生成できませんでした（応答に画像データがありません）。"

        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        name = SAFE_NAME.sub("-", params.file_name.strip()) or f"image-{stamp}"
        if not name.lower().endswith(".png"):
            name = f"{name}.png"
        link = await save_png(name, base64.b64decode(payload[0]["b64_json"]))
        return f"画像を生成しました: {link}" if link else "画像を生成しましたが、保存に失敗しました。"

    return generate_image


def image_tools_enabled() -> bool:
    return bool(os.getenv("IMAGE_MODEL_DEPLOYMENT", "").strip())
