#!/usr/bin/env python3
"""Build the hosted image through ACR Tasks using the shared auth_helper cache."""
from __future__ import annotations

import argparse
import importlib
import os
import re
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from requests import RequestException

ARM = "https://management.azure.com"
API = "2019-04-01"


def archive(source: Path, destination: Path) -> None:
    with tarfile.open(destination, "w:gz") as output:
        for path in sorted(source.rglob("*")):
            relative = path.relative_to(source)
            if any(part in {".git", "node_modules", "__pycache__", ".venv"} for part in relative.parts):
                continue
            if any(part.startswith((".env", "a365.generated.", "auth_record", "token-cache")) for part in relative.parts):
                continue
            if path.name in {"auth-token.json", ".a365-auth.json"} or path.suffix in {".pfx", ".key", ".pem"}:
                continue
            if path.is_symlink():
                raise ValueError("Build context must not contain symbolic links.")
            if path.is_file():
                output.add(path, arcname=relative.as_posix(), recursive=False)


def build(session, source: Path, env: dict[str, str], tag: str, timeout: int = 1800) -> str:
    registry = env["ACR_LOGIN_SERVER"].split(".")[0]
    if not re.fullmatch(r"[a-zA-Z0-9]{5,50}", registry) or not re.fullmatch(r"[\w.-]{1,128}", tag):
        raise ValueError("Invalid registry name or image tag.")
    base = (f"{ARM}/subscriptions/{env['AZURE_SUBSCRIPTION_ID']}/resourceGroups/"
            f"{env.get('ACR_RESOURCE_GROUP') or env['AZURE_RESOURCE_GROUP']}/providers/"
            f"Microsoft.ContainerRegistry/registries/{registry}")
    response = session.post(f"{base}/listBuildSourceUploadUrl?api-version={API}", timeout=60)
    response.raise_for_status()
    upload = response.json()
    target = urlparse(upload["uploadUrl"])
    if target.scheme != "https" or not (target.hostname or "").endswith(".blob.core.windows.net"):
        raise ValueError("ACR returned an untrusted upload endpoint.")
    with tempfile.TemporaryDirectory() as temporary:
        context = Path(temporary) / "context.tar.gz"
        archive(source, context)
        with context.open("rb") as content:
            # This short-lived SAS comes from the authenticated ACR operation, not a storage key.
            headers = dict(session.headers)
            session.headers.pop("Authorization", None)
            try:
                response = session.put(upload["uploadUrl"], data=content,
                                       headers={"x-ms-blob-type": "BlockBlob", "Content-Type": "application/gzip"},
                                       allow_redirects=False, timeout=300)
                if response.status_code not in (200, 201):
                    raise RuntimeError(f"ACR source upload failed (HTTP {response.status_code}); SAS is not logged.")
            finally:
                session.headers.clear()
                session.headers.update(headers)
    body = {
        "type": "DockerBuildRequest", "sourceLocation": upload["relativePath"],
        "dockerFilePath": "foundry-infra/Dockerfile", "platform": {"os": "Linux", "architecture": "amd64"},
        "imageNames": [f"{env['AGENT_IMAGE_NAME']}:{tag}"], "isPushEnabled": True,
        "isArchiveEnabled": False, "timeout": timeout,
    }
    response = session.post(f"{base}/scheduleRun?api-version={API}", json=body, timeout=60)
    response.raise_for_status()
    deadline = time.monotonic() + timeout
    while response.status_code == 202 and not response.content:
        location = response.headers.get("Location")
        if not isinstance(location, str) or not location.startswith(base + "/"):
            raise RuntimeError("ACR accepted the build without a run ID or registry-scoped polling URL; inspect ACR Tasks.")
        if time.monotonic() >= deadline:
            raise TimeoutError("ACR build scheduling timed out.")
        time.sleep(5)
        response = session.get(location, timeout=60)
        response.raise_for_status()
    if not response.content:
        raise RuntimeError("ACR returned no run ID; inspect ACR Tasks before retrying.")
    run_id = response.json().get("properties", {}).get("runId")
    if not run_id:
        raise RuntimeError("ACR returned no run ID.")
    while time.monotonic() < deadline:
        response = session.get(f"{base}/runs/{run_id}?api-version={API}", timeout=60)
        response.raise_for_status()
        properties = response.json()["properties"]
        status = properties.get("status")
        if status == "Succeeded":
            images = properties.get("outputImages", [])
            if not any(image.get("repository") == env["AGENT_IMAGE_NAME"] and image.get("tag") == tag
                       and image.get("digest") for image in images):
                raise RuntimeError("ACR run succeeded without the expected image digest.")
            return run_id
        if status in {"Failed", "Canceled", "Error", "Timeout"}:
            raise RuntimeError(f"ACR Tasks run {run_id}: {status}.")
        time.sleep(5)
    raise TimeoutError(f"ACR Tasks run {run_id} did not finish within {timeout}s.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from scaffold_ai_teammate import load_dotenv

        env = load_dotenv(args.env)
        os.environ.update(env)
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
        auth = importlib.import_module("auth_helper")
        if not (args.source / "foundry-infra" / "Dockerfile").is_file():
            raise ValueError("The quickstart Dockerfile is missing.")
        run_id = build(auth.get_session(f"{ARM}/.default"), args.source, env, args.tag)
        print(f"ACR image verified: {env['AGENT_IMAGE_NAME']}:{args.tag} (run {run_id})")
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, RequestException) as exc:
        # Request exceptions can include a source-upload SAS in their URL.
        if isinstance(exc, RequestException):
            status = exc.response.status_code if exc.response is not None else "connection error"
            detail = f"HTTP {status}; inspect ACR Tasks (request URL is not logged)"
        else:
            detail = str(exc)
        print(f"Image build failed: {detail}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
