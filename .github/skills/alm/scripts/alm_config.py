#!/usr/bin/env python3
"""Shared configuration for the ALM scripts.

The ALM scripts are product agnostic: the same review gates run for a Foundry
agent repository, a Code Apps repository or any other code-first asset. What
differs per product is only *which paths hold templates, rendered output and
build artifacts*. That mapping lives in ``alm.config.json`` at the repository
root (see ``alm.config.example.json`` in this skill).

When the file is absent the defaults below apply, so a repository that follows
the standard layout needs no configuration at all.

Usage:
    from alm_config import load_config
    cfg = load_config()
    cfg.template_files()
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_NAME = "alm.config.json"

# Files that must never be tracked because they hold resolved secrets.
DEFAULT_FORBIDDEN_TRACKED = [".env"]
# Templates hold ${VAR} placeholders and are the only things committed.
DEFAULT_TEMPLATES = ["**/*.template.yaml", "**/*.template.yml", "**/*.template.json"]
# Rendered output of those templates: local only.
DEFAULT_RENDERED = ["**/*.rendered.*"]
# Build artifacts that embed resolved identifiers: local only.
DEFAULT_ARTIFACTS = ["**/*.zip"]
# Pipeline sources reviewed by the quality / readability gates.
DEFAULT_SCRIPTS = ["scripts/*.py"]
# Public identifiers that may appear verbatim in tracked files.
DEFAULT_NON_SECRET_VARS = ["AGENT_NAME", "BLUEPRINT_ID"]
# Actions allowed by the security gate (supply-chain allow list).
DEFAULT_ALLOWED_ACTIONS = [
    "actions/checkout",
    "actions/setup-python",
    "actions/setup-node",
    "actions/upload-artifact",
    "actions/download-artifact",
    "azure/login",
]
# Jobs allowed to request `contents: write` (publishing a release needs it).
DEFAULT_CONTENTS_WRITE_JOBS = ["release"]
DEFAULT_MAX_LINE = 120


@dataclass
class AlmConfig:
    """Resolved ALM layout for one repository."""

    repo: Path
    forbidden_tracked: list[str] = field(default_factory=lambda: list(DEFAULT_FORBIDDEN_TRACKED))
    templates: list[str] = field(default_factory=lambda: list(DEFAULT_TEMPLATES))
    rendered: list[str] = field(default_factory=lambda: list(DEFAULT_RENDERED))
    artifacts: list[str] = field(default_factory=lambda: list(DEFAULT_ARTIFACTS))
    scripts: list[str] = field(default_factory=lambda: list(DEFAULT_SCRIPTS))
    non_secret_vars: list[str] = field(default_factory=lambda: list(DEFAULT_NON_SECRET_VARS))
    allowed_actions: list[str] = field(default_factory=lambda: list(DEFAULT_ALLOWED_ACTIONS))
    contents_write_jobs: list[str] = field(default_factory=lambda: list(DEFAULT_CONTENTS_WRITE_JOBS))
    env_example: str = ".env.example"
    max_line: int = DEFAULT_MAX_LINE

    def _glob(self, patterns: list[str]) -> list[Path]:
        found: set[Path] = set()
        for pattern in patterns:
            found.update(p for p in self.repo.glob(pattern) if p.is_file())
        return sorted(found)

    def template_files(self) -> list[Path]:
        return self._glob(self.templates)

    def script_files(self) -> list[Path]:
        return self._glob(self.scripts)

    def workflow_files(self) -> list[Path]:
        workflows = self.repo / ".github" / "workflows"
        return sorted(workflows.glob("*.yml")) + sorted(workflows.glob("*.yaml"))

    def env_example_path(self) -> Path:
        return self.repo / self.env_example

    def rel(self, path: Path) -> str:
        try:
            return path.relative_to(self.repo).as_posix()
        except ValueError:
            return path.as_posix()


def load_config(repo: Path | None = None) -> AlmConfig:
    """Read ``alm.config.json`` from the repository root, or fall back to defaults."""
    root = Path(repo) if repo else Path.cwd()
    config = AlmConfig(repo=root)
    path = root / CONFIG_NAME
    if not path.is_file():
        return config

    data = json.loads(path.read_text(encoding="utf-8"))
    for name in (
        "forbidden_tracked",
        "templates",
        "rendered",
        "artifacts",
        "scripts",
        "non_secret_vars",
        "allowed_actions",
        "contents_write_jobs",
        "env_example",
        "max_line",
    ):
        if name in data:
            setattr(config, name, data[name])
    return config
