#!/usr/bin/env python3
"""Deterministic sanitization / generalization review gate.

This is the automated reviewer that backs the review process. It inspects
Git-tracked files and fails (exit 1) if secret-hiding or generalization rules
are violated, so the review can only Pass when the repo is clean.

Rules enforced:
  1. `.env` and Agent 365 generated config must not be tracked.
  2. Rendered manifests `agents/**/agent.yaml` and built Teams packages
     `teams/*.zip` must not be tracked.
  3. Agent templates, Teams templates and `.env.example` must not contain real
     GUIDs or `/subscriptions/<guid>/...` ARM paths (all-zero placeholder GUIDs
     are allowed).
  4. `agents/**/agent.template.yaml` and `teams/*.template.json` must be
     generalized: they must use `${VAR}` placeholders.

The script never hardcodes real secret values; it matches by pattern only.

Usage:
    python scripts/review_sanitization.py
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

GUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
ZERO_GUID = re.compile(r"^0+(-0+)*$")
SUBSCRIPTION_PATH = re.compile(r"/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/", re.IGNORECASE)
TEAMS_TEMPLATE = re.compile(r"teams/.+\.template\.json")
AGENT_MANIFEST = re.compile(r"agents/.+/agent\.yaml")
AGENT_TEMPLATE = re.compile(r"agents/.+/agent\.template\.yaml")
AGENT_ANY_YAML = re.compile(r"agents/.+/agent(\.template)?\.yaml")
FORBIDDEN_TRACKED = {".env", "a365.config.json", "a365.generated.config.json", "auth-token.json"}


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], check=True, capture_output=True, text=True).stdout
    return [line.strip() for line in out.splitlines() if line.strip()]


def is_real_guid(value: str) -> bool:
    return not ZERO_GUID.match(value)


def main() -> int:
    failures: list[str] = []
    files = tracked_files()

    # Rule 1: secret-bearing files must not be tracked.
    for name in sorted(FORBIDDEN_TRACKED):
        if name in files:
            failures.append(f"{name} is tracked; it must be git-ignored.")

    # Rule 2: rendered manifests / built packages must not be tracked.
    for f in files:
        if AGENT_MANIFEST.fullmatch(f):
            failures.append(f"Rendered manifest is tracked: {f} (must be git-ignored).")
        if re.fullmatch(r"teams/.+\.zip", f):
            failures.append(f"Built Teams package is tracked: {f} (must be git-ignored).")

    # Rule 3: scan sensitive text files for real identifiers.
    scan_targets = [
        f for f in files
        if f.endswith(".env.example") or AGENT_ANY_YAML.fullmatch(f) or TEAMS_TEMPLATE.fullmatch(f)
    ]
    for f in scan_targets:
        text = Path(f).read_text(encoding="utf-8", errors="replace")

        if SUBSCRIPTION_PATH.search(text):
            failures.append(
                f"{f}: contains a real /subscriptions/<guid>/resourceGroups ARM path (must be ${{...}})."
            )

        for m in GUID.finditer(text):
            if is_real_guid(m.group(0)):
                failures.append(
                    f"{f}: contains a real GUID '{m.group(0)}' (generalize to a ${{VAR}} placeholder)."
                )
                break

    # Rule 4: templates must be generalized.
    for f in files:
        if AGENT_TEMPLATE.fullmatch(f) or TEAMS_TEMPLATE.fullmatch(f):
            text = Path(f).read_text(encoding="utf-8", errors="replace")
            if "${" not in text:
                failures.append(f"{f}: no ${{VAR}} placeholders found; template is not generalized.")

    if failures:
        sys.stderr.write("Sanitization review FAILED:\n")
        for msg in failures:
            sys.stderr.write(f"  - {msg}\n")
        return 1

    print("Sanitization review PASSED: no real secrets, templates generalized.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
