"""Shared document types and content hashing for input organization and conversion."""

from __future__ import annotations

import hashlib
from pathlib import Path


SUPPORTED_EXTENSIONS = {
    ".pdf", ".ppt", ".pptx", ".xls", ".xlsx", ".doc", ".docx",
    ".md", ".txt", ".html", ".htm",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif",
}
HASH_CHUNK_SIZE = 8192


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()
