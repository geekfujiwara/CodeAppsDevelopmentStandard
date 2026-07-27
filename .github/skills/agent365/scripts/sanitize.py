#!/usr/bin/env python3
"""Generalize + hide secrets in an agent manifest, then sync GitHub secrets.

1. Read a source manifest that still contains real values
   (default: ``agents/<agent>/agent.yaml`` — kept local, git-ignored).
2. For every NAME=VALUE pair in ``.env`` (excluding public identifiers), replace
   occurrences of VALUE in the manifest text with the ``${NAME}`` placeholder.
3. Optionally push each VALUE to GitHub Actions secrets via ``gh secret set``.
4. Write the generalized result to the template and optionally ``git add`` it.

Intended to run from the pre-commit hook so that only the generalized,
secret-free template is ever committed.

Usage:
    python scripts/sanitize.py --env .env --set-secrets --stage
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

# Public identifiers and human-readable metadata. Substituting them would
# corrupt prose that legitimately mentions the agent, so they stay literal.
NON_SECRET_VARS = {
    "AGENT_NAME",
    "BLUEPRINT_ID",
    "TEAMS_APP_VERSION",
    "AGENT_DISPLAY_NAME",
    "AGENT_FULL_NAME",
    "AGENT_DESCRIPTION_SHORT",
    "AGENT_DESCRIPTION_FULL",
    "DEVELOPER_NAME",
    "DEVELOPER_WEBSITE_URL",
    "DEVELOPER_PRIVACY_URL",
    "DEVELOPER_TERMS_URL",
    "TEAMS_APP_RESOURCE_URI",
}


def load_env(env_path: Path, non_secret: set[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.is_file():
        return values
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and val and key not in non_secret:
            values[key] = val
    return values


def set_github_secret(name: str, value: str, repo: str | None) -> None:
    cmd = ["gh", "secret", "set", name, "--body", value]
    if repo:
        cmd += ["--repo", repo]
    subprocess.run(cmd, check=True, shell=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", help="Agent name (default: $AGENT_NAME from --env).")
    parser.add_argument("--source", help="Manifest with real values (default: agents/<agent>/agent.yaml).")
    parser.add_argument("--template", help="Generalized output (default: agents/<agent>/agent.template.yaml).")
    parser.add_argument("--env", default=".env")
    parser.add_argument("--repo", default=None, help="owner/repo for gh secret set")
    parser.add_argument("--non-secret", action="append", default=[], metavar="NAME",
                        help="Additional variable to exclude from substitution; repeatable.")
    parser.add_argument("--set-secrets", action="store_true", help="push values to GitHub secrets")
    parser.add_argument("--stage", action="store_true", help="git add the generated template")
    args = parser.parse_args()

    non_secret = NON_SECRET_VARS | set(args.non_secret)
    env_path = Path(args.env)

    agent = args.agent
    if not agent:
        for raw in env_path.read_text(encoding="utf-8").splitlines() if env_path.is_file() else []:
            if raw.strip().startswith("AGENT_NAME="):
                agent = raw.split("=", 1)[1].strip().strip('"').strip("'")
                break
    agent = agent or os.environ.get("AGENT_NAME")

    if not agent and not (args.source and args.template):
        print("sanitize: AGENT_NAME not resolved and no --source/--template given; skipping.")
        return 0

    source_path = Path(args.source or f"agents/{agent}/agent.yaml")
    template_path = Path(args.template or f"agents/{agent}/agent.template.yaml")

    if not source_path.is_file():
        # Nothing to sanitize (no local manifest with real values) — no-op.
        print(f"sanitize: source not found ({source_path}); skipping.")
        return 0

    env_values = load_env(env_path, non_secret)
    if not env_values:
        raise SystemExit(f"sanitize: no values found in {args.env}; cannot generalize/hide secrets.")

    text = source_path.read_text(encoding="utf-8")

    # Replace longer values first so nested substrings do not clobber longer ones.
    replaced: list[str] = []
    for name in sorted(env_values, key=lambda n: len(env_values[n]), reverse=True):
        value = env_values[name]
        if value and value in text:
            text = text.replace(value, "${" + name + "}")
            replaced.append(name)

    template_path.parent.mkdir(parents=True, exist_ok=True)
    template_path.write_text(text, encoding="utf-8")
    print(f"sanitize: wrote generalized template -> {template_path}")
    if replaced:
        print("sanitize: generalized values -> " + ", ".join(sorted(replaced)))

    if args.set_secrets:
        for name in sorted(env_values):
            set_github_secret(name, env_values[name], args.repo)
        print("sanitize: synced GitHub secrets -> " + ", ".join(sorted(env_values)))

    if args.stage:
        subprocess.run(["git", "add", str(template_path)], check=True, shell=False)
        print(f"sanitize: staged {template_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
