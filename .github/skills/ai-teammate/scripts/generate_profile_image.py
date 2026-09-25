#!/usr/bin/env python3
"""Draw a teammate's profile picture with the tenant's own Foundry image deployment.

Used when the AskUserQuestion answer for the profile image was "generate" rather than a file.
The picture is written as a square PNG; ``set_agent_user_photo.py`` then converts it and puts
it on the agent user after the instance has been hired.

Usage:
    python scripts/generate_profile_image.py --env <.env> --prompt-file assets/profile-prompt.txt --out assets/profile.png

Env: FOUNDRY_PROJECT_ENDPOINT, IMAGE_MODEL_DEPLOYMENT
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
import auth_helper  # noqa: E402

STYLE = (
    "Square profile avatar for a friendly AI coworker in a business chat app. "
    "Centered head-and-shoulders character, simple flat illustration, soft solid background, "
    "no text, no letters, no logos, no real person, no trademarked character. "
)


def load_env(path: Path | None) -> None:
    if not path or not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", type=Path)
    parser.add_argument("--prompt", default="", help="描いてほしい見た目（日本語可）")
    parser.add_argument("--prompt-file", type=Path)
    parser.add_argument("--out", type=Path, default=Path("assets/profile.png"))
    args = parser.parse_args()
    load_env(args.env)

    description = args.prompt or (args.prompt_file.read_text(encoding="utf-8").strip() if args.prompt_file else "")
    endpoint = (os.environ.get("FOUNDRY_PROJECT_ENDPOINT") or "").strip()
    deployment = (os.environ.get("IMAGE_MODEL_DEPLOYMENT") or "").strip()
    if not (description and endpoint and deployment):
        sys.exit("--prompt / FOUNDRY_PROJECT_ENDPOINT / IMAGE_MODEL_DEPLOYMENT が必要です")

    parts = urlsplit(endpoint)
    # Image generation is served by the account root, not by /api/projects/<name>.
    url = f"{parts.scheme}://{parts.netloc}/openai/v1/images/generations"
    token = auth_helper.get_token("https://ai.azure.com/.default")
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {token}"},
        json={"model": deployment, "prompt": STYLE + description, "size": "1024x1024",
              "quality": "medium", "output_format": "png", "n": 1},
        timeout=300,
    )
    if response.status_code >= 400:
        sys.exit(f"画像を生成できませんでした: {response.status_code} {response.text[:300]}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(base64.b64decode(response.json()["data"][0]["b64_json"]))
    print(f"OK {args.out}（{deployment}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
