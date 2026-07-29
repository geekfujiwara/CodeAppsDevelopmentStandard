#!/usr/bin/env python3
"""Generalize + hide secrets in a manifest, then sync them to a secret store.

1. Read a source manifest that still contains real values (kept local and
   git-ignored; ``agents/<agent>/agent.yaml`` by default, any file via
   ``--source``).
2. For every NAME=VALUE pair in ``.env`` (excluding public identifiers), replace
   occurrences of VALUE in the manifest text with the ``${NAME}`` placeholder.
3. Optionally push each VALUE to the CI secret store selected by ``--secret-backend``
   (``github`` / ``azure-devops`` / ``keyvault`` / ``none``). The backend is
   independent of the Git hosting used, so the same scripts work on GitHub,
   Azure DevOps Repos and any other Git server.
4. Write the generalized result to the template and optionally ``git add`` it.

Intended to run from the pre-commit hook so that only the generalized,
secret-free template is ever committed. Extra public identifiers can be declared
in ``alm.config.json`` (``non_secret_vars``) or with ``--non-secret``.

Usage:
    python scripts/sanitize.py --env .env --set-secrets --stage
    python scripts/sanitize.py --source power.config.json --template power.config.template.json
    python scripts/sanitize.py --env .env --set-secrets --secret-backend azure-devops
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

from alm_config import load_config

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

# Routing/configuration variables. They describe *where* secrets go, so they are
# never substituted into the manifest and never pushed to the secret store.
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

SECRET_BACKENDS = ("github", "azure-devops", "keyvault", "none")

# Key Vault secret names accept alphanumerics and dashes only.
KEYVAULT_NAME_RE = re.compile(r"[^0-9A-Za-z-]")


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


def env_value(env_path: Path, name: str) -> str | None:
    """Read a single raw value from .env, falling back to the process environment."""
    if env_path.is_file():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get(name)


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, shell=False)


def set_github_secret(name: str, value: str, opts: dict[str, str]) -> None:
    cmd = ["gh", "secret", "set", name, "--body", value]
    if opts.get("repo"):
        cmd += ["--repo", opts["repo"]]
    _run(cmd)


def set_azure_devops_secret(name: str, value: str, opts: dict[str, str]) -> None:
    """Update (or add) a secret variable in an Azure DevOps variable group."""
    tail = [
        "--group-id", opts["group_id"],
        "--organization", opts["org_url"],
        "--project", opts["project"],
        "--name", name,
        "--value", value,
        "--secret", "true",
    ]
    head = ["az", "pipelines", "variable-group", "variable"]
    try:
        _run([*head, "update", *tail])
    except subprocess.CalledProcessError:
        # Variable does not exist in the group yet.
        _run([*head, "create", *tail])


def set_keyvault_secret(name: str, value: str, opts: dict[str, str]) -> None:
    kv_name = KEYVAULT_NAME_RE.sub("-", name)
    _run([
        "az", "keyvault", "secret", "set",
        "--vault-name", opts["vault"],
        "--name", kv_name,
        "--value", value,
        "--output", "none",
    ])


def resolve_backend(backend: str, env_path: Path, repo: str | None) -> tuple[str, dict[str, str]]:
    """Validate the backend and collect its required options up front.

    Failing here (instead of mid-loop) guarantees that a misconfigured backend can
    never push half of the secrets and leave the rest behind.
    """
    if backend not in SECRET_BACKENDS:
        raise SystemExit(
            f"sanitize: unknown --secret-backend '{backend}' "
            f"(expected one of {', '.join(SECRET_BACKENDS)})."
        )

    if backend == "github":
        return backend, {"repo": repo or ""}

    if backend == "azure-devops":
        required = {
            "org_url": "AZDO_ORG_URL",
            "project": "AZDO_PROJECT",
            "group_id": "AZDO_VARIABLE_GROUP_ID",
        }
        opts = {key: env_value(env_path, var) or "" for key, var in required.items()}
        missing = sorted(required[key] for key, val in opts.items() if not val)
        if missing:
            raise SystemExit(
                "sanitize: --secret-backend azure-devops requires AZDO_ORG_URL / AZDO_PROJECT / "
                f"AZDO_VARIABLE_GROUP_ID in {env_path} (missing: {', '.join(missing)})."
            )
        return backend, opts

    if backend == "keyvault":
        vault = env_value(env_path, "AZURE_KEYVAULT_NAME") or ""
        if not vault:
            raise SystemExit(f"sanitize: --secret-backend keyvault requires AZURE_KEYVAULT_NAME in {env_path}.")
        return backend, {"vault": vault}

    return backend, {}


SETTERS = {
    "github": set_github_secret,
    "azure-devops": set_azure_devops_secret,
    "keyvault": set_keyvault_secret,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", help="Agent name (default: $AGENT_NAME from --env).")
    parser.add_argument("--source", help="Manifest with real values (default: agents/<agent>/agent.yaml).")
    parser.add_argument("--template", help="Generalized output (default: agents/<agent>/agent.template.yaml).")
    parser.add_argument("--env", default=".env")
    parser.add_argument("--repo", default=None, help="owner/repo for the github backend")
    parser.add_argument("--secret-backend", default=None, choices=SECRET_BACKENDS,
                        help="Secret store to sync to (default: SECRET_BACKEND from --env, else github).")
    parser.add_argument("--non-secret", action="append", default=[], metavar="NAME",
                        help="Additional variable to exclude from substitution; repeatable.")
    parser.add_argument("--set-secrets", action="store_true", help="push values to the secret store")
    parser.add_argument("--stage", action="store_true", help="git add the generated template")
    args = parser.parse_args()

    non_secret = (NON_SECRET_VARS | BACKEND_CONFIG_VARS | set(args.non_secret)
                  | set(load_config().non_secret_vars))
    env_path = Path(args.env)

    backend = args.secret_backend or env_value(env_path, "SECRET_BACKEND") or "github"
    backend, backend_opts = resolve_backend(backend, env_path, args.repo)

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
        if backend == "none":
            print("sanitize: SECRET_BACKEND=none (PoC mode) -> keeping secrets in .env only; nothing synced.")
        else:
            setter = SETTERS[backend]
            for name in sorted(env_values):
                setter(name, env_values[name], backend_opts)
            print(f"sanitize: synced secrets to {backend} -> " + ", ".join(sorted(env_values)))

    if args.stage:
        subprocess.run(["git", "add", str(template_path)], check=True, shell=False)
        print(f"sanitize: staged {template_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
