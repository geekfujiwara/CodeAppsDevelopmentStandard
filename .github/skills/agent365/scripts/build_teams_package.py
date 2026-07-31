#!/usr/bin/env python3
"""Build the Teams app package for a Foundry agent.

Renders ``teams/manifest.template.json`` and ``teams/agenticUser.template.json``
(``${VAR}`` placeholders resolved from environment variables / ``.env``) and
generates the Teams icons from a square source image:

  - color icon:   192x192 PNG (full color)
  - outline icon: 32x32 PNG, white silhouette on transparency (Teams spec)

The resulting ZIP is uploaded once in the Microsoft 365 / Teams admin center so
an instance of the agent can be created for the org. The package contains real
identifiers, so it must stay git-ignored.

The manifest ``version`` comes from ``TEAMS_APP_VERSION`` and MUST be increased
for every re-upload; the admin center rejects an already present version.

Usage:
    python scripts/build_teams_package.py
    python scripts/build_teams_package.py --output teams/my-agent-teams-app.zip
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image

COLOR_SIZE = 192
OUTLINE_SIZE = 32
PLACEHOLDER = re.compile(r"\$\{([A-Z0-9_]+)\}")

# Per-install agent instances (each with their own Entra Agent ID) require an
# Agent 365 blueprint. Without it the package can only be published as a single
# shared agent, which needs the GA schema because the agentic-user properties
# exist in devPreview only.
A365_BLUEPRINT_VAR = "A365_AGENT_BLUEPRINT_ID"
SHARED_MANIFEST_VERSION = "1.22"
SHARED_MANIFEST_SCHEMA = (
    "https://developer.microsoft.com/json-schemas/teams/v1.22/MicrosoftTeams.schema.json"
)


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


def render(template: str) -> str:
    missing: list[str] = []

    def substitute(match: re.Match[str]) -> str:
        name = match.group(1)
        value = os.environ.get(name)
        if not value:
            missing.append(name)
            return match.group(0)
        return value

    result = PLACEHOLDER.sub(substitute, template)
    if missing:
        raise SystemExit("Missing environment variables: " + ", ".join(sorted(set(missing))))
    return result


def make_color_icon(icon_path: Path, size: int = COLOR_SIZE) -> bytes:
    img = Image.open(icon_path).convert("RGBA").resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_outline_icon(icon_path: Path, size: int = OUTLINE_SIZE) -> bytes:
    """White silhouette on a transparent background, as Teams requires."""
    img = Image.open(icon_path).convert("RGBA").resize((size, size), Image.LANCZOS)
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    white.putalpha(img.getchannel("A"))
    buf = io.BytesIO()
    white.save(buf, format="PNG")
    return buf.getvalue()


def downgrade_to_shared_agent(manifest: dict) -> None:
    """Strip the Agent 365 instantiation nodes so the app installs as one shared agent."""
    manifest["$schema"] = SHARED_MANIFEST_SCHEMA
    manifest["manifestVersion"] = SHARED_MANIFEST_VERSION
    manifest.pop("agenticUserTemplates", None)
    for agent in manifest.get("copilotAgents", {}).get("customEngineAgents", []):
        agent.pop("functionsAs", None)
        agent.pop("agenticUserTemplateId", None)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", default="teams/manifest.template.json")
    parser.add_argument("--agentic-user-template", default="teams/agenticUser.template.json")
    parser.add_argument("--icon", default="assets/agent-icon.png")
    parser.add_argument("--output", help="Output ZIP (default: teams/<agent>-teams-app.zip).")
    parser.add_argument("--env", default=".env")
    parser.add_argument(
        "--require-template",
        action="store_true",
        help=(
            f"Fail instead of silently downgrading when {A365_BLUEPRINT_VAR} is "
            "missing. Use this whenever the goal is an Agent template (M365 admin "
            "center 'Agent template' badge), so a non-template shared-agent package "
            "can never be built or published by mistake."
        ),
    )
    args = parser.parse_args()

    load_env(Path(args.env))

    template_path = Path(args.template)
    icon = Path(args.icon)
    agent = os.environ.get("AGENT_NAME", "agent")
    output = Path(args.output or f"teams/{agent}-teams-app.zip")

    if not template_path.is_file():
        raise SystemExit(f"Manifest template not found: {template_path}")
    if not icon.is_file():
        raise SystemExit(f"Icon not found: {icon}")

    manifest_text = render(template_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_text)

    color_name = manifest["icons"]["color"]
    outline_name = manifest["icons"]["outline"]

    # Agent 365 provisions a per-install agent instance (its own Entra Agent ID)
    # only when the package carries the agentic user template referenced here.
    extra_files: dict[str, bytes] = {}
    if not os.environ.get(A365_BLUEPRINT_VAR):
        if args.require_template:
            raise SystemExit(
                f"{A365_BLUEPRINT_VAR} is not set, so this package would install as a "
                "SHARED agent, not an Agent template. Run 'a365 setup blueprint' first "
                f"(Step 7), set {A365_BLUEPRINT_VAR} in .env, then re-run with "
                "--require-template."
            )
        print(
            f"WARNING: {A365_BLUEPRINT_VAR} is not set - building a SHARED agent "
            "package. Installing it does not create a per-install agent instance.\n"
            "         Run 'a365 setup blueprint' to obtain the Agent 365 blueprint "
            f"GUID, then set {A365_BLUEPRINT_VAR}.",
            file=sys.stderr,
        )
        downgrade_to_shared_agent(manifest)
        manifest_text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"

    for ref in manifest.get("agenticUserTemplates", []):
        agentic_path = Path(args.agentic_user_template)
        if not agentic_path.is_file():
            raise SystemExit(f"Agentic user template not found: {agentic_path}")
        agentic_text = render(agentic_path.read_text(encoding="utf-8"))
        agentic = json.loads(agentic_text)
        if agentic["id"] != ref["id"]:
            raise SystemExit(
                f"agenticUserTemplates id '{ref['id']}' does not match "
                f"{agentic_path} id '{agentic['id']}'."
            )
        extra_files[ref["file"]] = agentic_text.encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_text)
        zf.writestr(color_name, make_color_icon(icon))
        zf.writestr(outline_name, make_outline_icon(icon))
        for name, data in extra_files.items():
            zf.writestr(name, data)

    print(f"Built Teams package: {output}")
    print(f"  app name     : {manifest['name']['short']} (v{manifest['version']})")
    print(f"  manifest ver : {manifest['manifestVersion']}")
    print(f"  color  icon  : {color_name} ({COLOR_SIZE}x{COLOR_SIZE}) from {icon}")
    print(f"  outline icon : {outline_name} ({OUTLINE_SIZE}x{OUTLINE_SIZE}) from {icon}")
    for name in extra_files:
        print(f"  agentic user : {name}")
    print("  mode         : " + ("per-install agent instance" if extra_files else "shared agent"))
    print("Bump TEAMS_APP_VERSION in .env before every re-upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
