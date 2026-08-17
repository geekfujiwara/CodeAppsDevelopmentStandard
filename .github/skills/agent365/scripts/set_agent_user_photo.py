#!/usr/bin/env python3
"""Set the profile photo of an Agent 365 agent *instance*'s agentic user.

The Teams package icon and the agentic user's profile photo are two different
things. The package icon is what appears in the Teams app catalog and in the
chat header; the profile photo is what appears on the profile card, in the
people picker, and as the sender avatar on mail the agent sends. Uploading the
Teams package does **not** set the profile photo -- it has to be pushed to
Microsoft Graph separately, once per instance.

Agentic users are real directory objects (``#microsoft.graph.agentUser``), so
the ordinary ``PUT /users/{id}/photo/$value`` endpoint applies. Graph accepts
JPEG here, so a PNG icon is converted and downscaled to 648x648 first.

Requires Microsoft Graph ``ProfilePhoto.ReadWrite.All`` or ``User.ReadWrite.All``
(User Administrator or Global Administrator). Do not create an agent365-specific
login cache; use the standard auth_helper cache for delegated tokens and an
existing Azure CLI context only for Azure CLI operations.

Usage:
    python scripts/set_agent_user_photo.py --upn agent-user@contoso.onmicrosoft.com
    python scripts/set_agent_user_photo.py --instance-name "秘書 ミーナ" --icon assets/agent-icon.png
    python scripts/set_agent_user_photo.py --upn <upn> --check
"""
from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
from pathlib import Path

import requests
from PIL import Image

GRAPH = "https://graph.microsoft.com/v1.0"
# Graph's documented recommended maximum for profile photos.
PHOTO_SIZE = 648


def load_env(path: Path) -> None:
    """Load KEY=VALUE pairs from a .env file without overriding real env vars."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def az(*args: str) -> str:
    """Run an az command and return stdout, raising with stderr on failure."""
    result = subprocess.run(
        ["az", *args], capture_output=True, text=True, shell=(os.name == "nt")
    )
    if result.returncode != 0:
        raise RuntimeError(f"az {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def az_json(*args: str):
    out = az(*args, "-o", "json")
    return json.loads(out) if out else None


def resolve_icon(icon: str | None) -> Path:
    """Resolve --icon / $AGENT_ICON the same way build_teams_package.py does."""
    icon = icon or os.environ.get("AGENT_ICON") or "assets/agent-icon.png"
    path = Path(icon)
    if path.is_file():
        return path
    raise SystemExit(f"Icon not found: {icon}")


def resolve_agent_user(upn: str | None, instance_name: str | None) -> dict:
    """Find the agentic user backing the instance."""
    if upn:
        flt = f"userPrincipalName eq '{upn}'"
    else:
        flt = f"displayName eq '{instance_name}'"
    users = (
        az_json(
            "rest", "--method", "GET", "--uri",
            f"{GRAPH}/users?$filter={flt}&$select=id,displayName,userPrincipalName",
        )
        or {}
    ).get("value", [])
    if not users:
        raise SystemExit(
            "Agentic user not found. Create the instance in the Microsoft 365 admin "
            "center first, then retry."
        )
    if len(users) > 1:
        listing = "\n".join(f"  {u['userPrincipalName']}  {u['displayName']}" for u in users)
        raise SystemExit(f"Multiple matches; rerun with --upn:\n{listing}")
    return users[0]


def to_jpeg(path: Path) -> bytes:
    img = Image.open(path).convert("RGB")
    img = img.resize((PHOTO_SIZE, PHOTO_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--upn", help="Agentic user UPN, e.g. agent-user@contoso.onmicrosoft.com.")
    group.add_argument("--instance-name", help="Agent instance display name.")
    parser.add_argument("--icon", help="Icon file path. Defaults to $AGENT_ICON.")
    parser.add_argument("--check", action="store_true", help="Only report the current photo state.")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    upn = args.upn
    instance_name = args.instance_name or (None if upn else os.environ.get("AGENT_DISPLAY_NAME"))
    if not upn and not instance_name:
        parser.error("--upn or --instance-name is required (or set AGENT_DISPLAY_NAME).")

    try:
        user = resolve_agent_user(upn, instance_name)
        token = az("account", "get-access-token", "--resource",
                   "https://graph.microsoft.com", "--query", "accessToken", "-o", "tsv")
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

    print(f"agentic user : {user['displayName']} <{user['userPrincipalName']}>")
    auth = {"Authorization": f"Bearer {token}"}
    photo_url = f"{GRAPH}/users/{user['id']}/photo"

    if args.check:
        resp = requests.get(photo_url, headers=auth, timeout=30)
        if resp.status_code == 404:
            print("MISSING: no profile photo is set. Rerun without --check to upload one.")
            return 1
        resp.raise_for_status()
        meta = resp.json()
        print(f"OK: {meta.get('width')}x{meta.get('height')} {meta.get('@odata.mediaContentType')}")
        return 0

    icon = resolve_icon(args.icon)
    print(f"icon         : {icon}")
    resp = requests.put(
        f"{photo_url}/$value",
        headers={**auth, "Content-Type": "image/jpeg"},
        data=to_jpeg(icon),
        timeout=60,
    )
    if not resp.ok:
        print(f"Upload failed ({resp.status_code}): {resp.text}", file=sys.stderr)
        return 1

    meta = requests.get(photo_url, headers=auth, timeout=30).json()
    print(f"Uploaded: {meta.get('width')}x{meta.get('height')} {meta.get('@odata.mediaContentType')}")
    print("Teams and Outlook cache avatars; allow time or restart the client to see it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
