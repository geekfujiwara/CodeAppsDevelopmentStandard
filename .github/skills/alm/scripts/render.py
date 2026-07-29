#!/usr/bin/env python3
"""Render a template into a concrete manifest by substituting ``${VAR}``.

Placeholders use ``${VAR}`` syntax and are resolved from environment variables
(and, for convenience, from a ``.env`` file). Fails fast if any variable is
missing so that secrets are never left as literal placeholders in a manifest
that is about to be deployed.

The inverse of ``sanitize.py``: the template is what gets committed, the render
result is local-only (git-ignored) input for the deploy step.

Usage:
    python scripts/render.py --agent my-agent
    python scripts/render.py --template agents/my-agent/agent.template.yaml \
        --output agents/my-agent/agent.yaml
    python scripts/render.py --template power.config.template.json --output power.config.json
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

PLACEHOLDER = re.compile(r"\$\{([A-Z0-9_]+)\}")


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


def render(template_text: str) -> str:
    missing: list[str] = []

    def _sub(match: re.Match[str]) -> str:
        name = match.group(1)
        value = os.environ.get(name)
        if not value:
            missing.append(name)
            return match.group(0)
        return value

    result = PLACEHOLDER.sub(_sub, template_text)
    if missing:
        raise SystemExit(
            "Missing required environment variables: " + ", ".join(sorted(set(missing)))
        )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", help="Agent name (default: $AGENT_NAME). Drives default paths.")
    parser.add_argument("--template", help="Template YAML (default: agents/<agent>/agent.template.yaml).")
    parser.add_argument("--output", help="Rendered YAML (default: agents/<agent>/agent.yaml).")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))

    agent = args.agent or os.environ.get("AGENT_NAME")
    if not agent and not (args.template and args.output):
        raise SystemExit("Provide --agent, set AGENT_NAME, or pass both --template and --output.")

    template_path = Path(args.template or f"agents/{agent}/agent.template.yaml")
    output_path = Path(args.output or f"agents/{agent}/agent.yaml")

    if not template_path.is_file():
        raise SystemExit(f"Template not found: {template_path}")

    rendered = render(template_path.read_text(encoding="utf-8"))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8")
    print(f"Rendered {template_path} -> {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
