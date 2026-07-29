#!/usr/bin/env python3
"""Fail if any secret value from .env appears in staged (to-be-committed) content.

Runs as part of the pre-commit hook after ``sanitize.py``, as a safety net so
that real secret values can never be committed even if generalization was
skipped.

Usage:
    python scripts/check_secrets.py --env .env
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# Public identifiers and human-readable metadata that legitimately appear in
# tracked files. Keep in sync with sanitize.py.
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

# Routing/configuration variables: they select the Git hosting and secret store
# and legitimately appear in committed CI definitions. Keep in sync with sanitize.py.
BACKEND_CONFIG_VARS = {
    "IMPLEMENTATION_MODE",
    "GIT_PROVIDER",
    "SECRET_BACKEND",
    "AZDO_ORG_URL",
    "AZDO_PROJECT",
    "AZDO_VARIABLE_GROUP_ID",
    "AZDO_SERVICE_CONNECTION",
    "AZURE_KEYVAULT_NAME",
}

# Obvious placeholder values shipped in .env.example.
PLACEHOLDER_HINTS = ("0000-0000", "your-", "example.com", "<")


def load_env_values(env_path: Path, non_secret: set[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.is_file():
        return values
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if not key or not val or key in non_secret:
            continue
        if any(hint in val for hint in PLACEHOLDER_HINTS):
            continue
        values[key] = val
    return values


def staged_diff() -> str:
    result = subprocess.run(
        ["git", "diff", "--cached", "--no-color"], check=True, capture_output=True
    )
    return result.stdout.decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", default=".env")
    parser.add_argument("--non-secret", action="append", default=[], metavar="NAME",
                        help="Additional variable to treat as public; repeatable.")
    args = parser.parse_args()

    values = load_env_values(Path(args.env), NON_SECRET_VARS | BACKEND_CONFIG_VARS | set(args.non_secret))
    if not values:
        return 0

    diff = staged_diff()
    leaked = sorted({name for name, value in values.items() if value in diff})
    if leaked:
        sys.stderr.write(
            "[pre-commit] Blocked: secret value(s) present in staged changes: "
            + ", ".join(leaked)
            + "\nRun sanitize before committing, or remove the value.\n"
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
