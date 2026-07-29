#!/usr/bin/env python3
"""Deterministic sanitization / generalization review gate.

This is the automated reviewer that backs the review process. It inspects
Git-tracked files and fails (exit 1) if secret-hiding or generalization rules
are violated, so the review can only Pass when the repository is clean.

The rules are product agnostic; the paths they apply to come from
``alm.config.json`` (see ``alm_config.py``), so the same gate protects a Foundry
agent repository, a Code Apps repository or any other code-first asset.

Rules enforced:
  1. Secret-bearing files (``.env`` and friends) must not be tracked.
  2. Rendered manifests and build artifacts must not be tracked.
  3. Templates and ``.env.example`` must not contain real GUIDs or
     ``/subscriptions/<guid>/...`` ARM paths (all-zero placeholders are allowed).
  4. Templates must be generalized: they must use ``${VAR}`` placeholders.

The script never hardcodes real secret values; it matches by pattern only.

Usage:
    python scripts/review_sanitization.py
"""
from __future__ import annotations

import fnmatch
import re
import subprocess
import sys
from pathlib import Path

from alm_config import load_config

GUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
ZERO_GUID = re.compile(r"^0+(-0+)*$")
SUBSCRIPTION_PATH = re.compile(r"/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/", re.IGNORECASE)


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], check=True, capture_output=True, text=True).stdout
    return [line.strip() for line in out.splitlines() if line.strip()]


def matches(path: str, patterns: list[str]) -> bool:
    """True when the path matches any glob pattern (``**/`` may be omitted)."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        if pattern.startswith("**/") and fnmatch.fnmatch(path, pattern[3:]):
            return True
    return False


def is_real_guid(value: str) -> bool:
    return not ZERO_GUID.match(value)


def main() -> int:
    cfg = load_config()
    failures: list[str] = []
    files = tracked_files()

    # Rule 1: secret-bearing files must not be tracked.
    for name in sorted(cfg.forbidden_tracked):
        if name in files:
            failures.append(f"{name} is tracked; it must be git-ignored.")

    # Rule 2: rendered output / build artifacts must not be tracked.
    for f in files:
        if matches(f, cfg.rendered):
            failures.append(f"Rendered output is tracked: {f} (must be git-ignored).")
        if matches(f, cfg.artifacts):
            failures.append(f"Build artifact is tracked: {f} (must be git-ignored).")

    # Rule 3: scan sensitive text files for real identifiers.
    scan_targets = [
        f for f in files
        if f.endswith(cfg.env_example) or matches(f, cfg.templates) or matches(f, cfg.rendered)
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
        if matches(f, cfg.templates):
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
