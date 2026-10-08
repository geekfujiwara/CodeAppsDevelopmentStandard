"""Image generation tool for the Foundry-hosted teammate (feature block B17).

The image model is a deployment on the same Foundry account as the brain, so it is reached with
the agent's own managed identity - no API key exists to leak. The picture is posted straight into
the conversation as an inline attachment, because "show me the image" is what people actually
want; a link adds a click. Saving to the teammate's own OneDrive is an optional extra, not the
delivery mechanism.

Image generation is billed per image, so it is only ever started from a turn the user themselves
opened. Untrusted text (mail bodies, fetched pages) must never reach this tool as an instruction.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit

import aiohttp
from copilot import Tool, define_tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

TOOL_NAME = "generate_image"

_SIZES = {
    "square": "1024x1024",
    "portrait": "1024x1536",
    "landscape": "1536x1024",
}
_QUALITIES = ("low", "medium", "high")
# Teams renders inline base64 images up to about 1 MB; JPEG keeps 1024px art well under it.
_OUTPUT_FORMAT = "jpeg"
_OUTPUT_COMPRESSION = 60
_CONTENT_TYPE = f"image/{_OUTPUT_FORMAT}"
_TIMEOUT_SECONDS = 240

TokenProvider = Callable[[], Awaitable[str]]
ImageSink = Callable[[bytes, str, str], Awaitable[None]]


class GenerateImageParams(BaseModel):
    prompt: str = Field(
        description=(
            "Complete English description of the picture: subject, style, colours "
            "and composition. Translate the user's request into English yourself."
        )
    )
    aspect: str = Field(
        default="square",
        description="Aspect ratio: 'square', 'portrait' or 'landscape'.",
    )
    quality: str = Field(
        default="low",
        description=(
            "Rendering quality: 'low', 'medium' or 'high'. Keep 'low' unless the "
            "user asks for a detailed or print-ready picture; higher is far slower."
        ),
    )


def images_endpoint(project_endpoint: str) -> str:
    """Image generation is served by the account root, not by /api/projects/<name>."""
    parts = urlsplit(project_endpoint)
    return f"{parts.scheme}://{parts.netloc}/openai/v1/images/generations"


def build_image_tool(
    *,
    project_endpoint: str,
    deployment: str,
    token_provider: TokenProvider,
    on_image: ImageSink,
) -> Tool | None:
    """Return the ``generate_image`` tool, or ``None`` when no image model is configured.

    ``token_provider`` yields a bearer token for ``https://ai.azure.com/.default`` and
    ``on_image`` delivers ``(data, content_type, prompt)`` to the conversation.
    """

    if not deployment:
        logger.info(
            "IMAGE_MODEL_DEPLOYMENT is not set; the generate_image tool stays unregistered"
        )
        return None

    url = images_endpoint(project_endpoint)

    async def handler(params: GenerateImageParams, _invocation: Any) -> str:
        size = _SIZES.get((params.aspect or "").strip().lower(), _SIZES["square"])
        quality = (params.quality or "").strip().lower()
        if quality not in _QUALITIES:
            quality = "low"

        body = {
            "model": deployment,
            "prompt": params.prompt,
            "size": size,
            "quality": quality,
            "output_format": _OUTPUT_FORMAT,
            "output_compression": _OUTPUT_COMPRESSION,
            "n": 1,
        }
        headers = {"Authorization": f"Bearer {await token_provider()}"}
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)

        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=body, headers=headers) as response:
                # The default gpt-image quota is 1 request per minute; turn the 429 into
                # words so the model explains the wait instead of retrying in the same turn.
                if response.status == 429:
                    logger.warning("Image model %s is rate limited", deployment)
                    return (
                        "The image model hit its per-minute quota. Tell the user the "
                        "picture could not be drawn right now and offer to retry in "
                        "about a minute. Do not call this tool again in this turn."
                    )
                if response.status >= 400:
                    detail = (await response.text())[:400]
                    logger.warning("Image generation failed: %s %s", response.status, detail)
                    # Phrased as a transient glitch so one failure does not teach the
                    # model, for the rest of the conversation, that it cannot draw.
                    return (
                        f"The image service returned a temporary error ({response.status}). "
                        "Tell the user the picture could not be drawn just now and offer "
                        "to try again. Never say that image generation is unavailable, "
                        "unsupported or blocked by permissions - it is a working feature."
                    )
                payload = await response.json()

        encoded = (payload.get("data") or [{}])[0].get("b64_json")
        if not encoded:
            return "Image generation returned no image data."

        await on_image(base64.b64decode(encoded), _CONTENT_TYPE, params.prompt)
        logger.info("Generated a %s %s image", size, quality)
        return (
            f"Done: a {size} image was generated and has already been posted to the "
            "conversation. Reply with a single short caption in the user's language; "
            "do not describe the picture in detail and do not paste any image data."
        )

    return define_tool(
        TOOL_NAME,
        description=(
            "Draw a picture, illustration, diagram sketch, icon or logo from a text "
            "description and post it into the conversation. Use this whenever the "
            "user asks for an image to be created, drawn, generated or designed."
        ),
        handler=handler,
        params_type=GenerateImageParams,
        skip_permission=True,
    )


def image_tools_enabled() -> bool:
    return bool(os.getenv("IMAGE_MODEL_DEPLOYMENT", "").strip())
