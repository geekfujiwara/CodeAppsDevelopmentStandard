#!/usr/bin/env python3
"""Deploys the self-hosted agent's code and registers the Agent 365 blueprint endpoint.

Split out of ``deploy_ai_teammate.py`` because the two secret-bearing steps below must be the
only place that ever sees the blueprint client secret:

  1. If ``A365_AGENT_BLUEPRINT_ID`` is not yet known, creates the blueprint
     (``a365 setup blueprint -n <agent> --no-endpoint``) and reads the id back from
     ``a365.generated.config.json`` — never from the secret ``a365`` prints to stdout.
  2. ``dotnet publish`` -> zip -> ``az webapp deploy`` -> ``az webapp restart``.
  3. Rotates the blueprint's client secret (``az ad app credential reset --append``), captures it
     into a local variable, immediately injects it as the App Service connection-string setting,
     then discards the variable. The secret is never printed, logged, or written to a file.
  4. Registers the messaging endpoint
     (``a365 setup blueprint --endpoint-only --messaging-endpoint ...``).

This mirrors references/self-hosted-agent.md and SKILL.md Step 6 exactly (same commands, same
order); it exists so ``deploy_ai_teammate.py --execute`` does not skip them.

Usage:
    python scripts/deploy_agent_webapp.py --target . --env .env
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

REQUIRED_ENV = ("AGENT_NAME", "AZURE_RESOURCE_GROUP")


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def update_env(path: Path, values: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    remaining = dict(values)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"
    lines.extend(f"{k}={v}" for k, v in remaining.items())
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _run(command: list[str], cwd: Path, *, capture: bool = False) -> subprocess.CompletedProcess:
    """Runs *command* without shell-interpreted input. Never pass a secret in *command* unless
    *capture* is True (capture=True results are never printed by this script's own callers).

    Executables are resolved explicitly, including Windows `.cmd` shims, and no shell is used.
    """
    executable = shutil.which(command[0])
    if executable is None:
        raise FileNotFoundError(f"Command not found: {command[0]}")
    return subprocess.run(
        [executable, *command[1:]], cwd=cwd, check=True,
        capture_output=capture, text=True if capture else None,
        encoding="utf-8" if capture else None, errors="replace" if capture else None,
        shell=False,
    )


def ensure_blueprint(agent_name: str, cwd: Path) -> str:
    """Returns the blueprint appId, creating the blueprint (without an endpoint) if missing.

    Never prints the command's stdout: `a365 setup blueprint` prints the client secret in plain
    text, and this script's job is to make sure that text never reaches a log or a chat surface.
    """
    config_path = cwd / "a365.generated.config.json"
    if not config_path.is_file():
        print("  a365 setup blueprint --no-endpoint (output withheld: contains a client secret)")
        _run(["a365", "setup", "blueprint", "-n", agent_name, "--no-endpoint"], cwd, capture=True)
    data = json.loads(config_path.read_text(encoding="utf-8"))
    blueprint_id = data.get("agentBlueprintId")
    if not blueprint_id:
        raise SystemExit(f"{config_path} has no agentBlueprintId")
    return blueprint_id


def publish_and_deploy(target: Path, resource_group: str, app_name: str) -> None:
    publish_dir = target / "publish"
    if publish_dir.exists():
        shutil.rmtree(publish_dir)
    csproj = next(target.glob("*.csproj"), None)
    if csproj is None:
        raise SystemExit(f"No .csproj found under {target}")

    print(f"  dotnet publish -c Release -o {publish_dir}")
    _run(["dotnet", "publish", str(csproj), "-c", "Release", "-o", str(publish_dir)], target)

    zip_path = target / "publish.zip"
    zip_path.unlink(missing_ok=True)
    print(f"  zipping {publish_dir} -> {zip_path}")
    shutil.make_archive(str(publish_dir), "zip", root_dir=str(publish_dir))

    print(f"  az webapp deploy -> {app_name}")
    _run([
        "az", "webapp", "deploy", "-g", resource_group, "-n", app_name,
        "--src-path", str(zip_path), "--type", "zip", "--track-status", "false", "--timeout", "600000",
    ], target)
    print(f"  az webapp restart -> {app_name}")
    _run(["az", "webapp", "restart", "-g", resource_group, "-n", app_name], target)


def rotate_and_inject_secret(resource_group: str, app_name: str, blueprint_id: str, agent_name: str, target: Path) -> None:
    """Rotates the blueprint client secret and injects it as an App Service app setting.

    The secret only ever exists in the local ``secret`` variable between these two calls; it is
    never printed, returned, or written to a file, and ``--append`` keeps the existing credential
    valid until this one is confirmed (a bad rotation must not lock the agent out).
    """
    print("  az ad app credential reset --append (secret withheld)")
    result = _run([
        "az", "ad", "app", "credential", "reset", "--id", blueprint_id, "--append",
        "--display-name", f"{agent_name}-agent", "--years", "1", "--query", "password", "-o", "tsv",
    ], target, capture=True)
    secret = result.stdout.strip()
    try:
        print("  az webapp config appsettings set -> ClientSecret (value withheld)")
        _run([
            "az", "webapp", "config", "appsettings", "set", "-g", resource_group, "-n", app_name,
            "--settings", f"Connections__ServiceConnection__Settings__ClientSecret={secret}",
        ], target, capture=True)
    finally:
        secret = ""  # noqa: F841 - best-effort scrub of the local reference before it goes out of scope
        del secret


def register_endpoint(agent_name: str, endpoint: str, cwd: Path) -> None:
    print(f"  a365 setup blueprint --endpoint-only --messaging-endpoint {endpoint}")
    _run(["a365", "setup", "blueprint", "-n", agent_name, "--endpoint-only", "--messaging-endpoint", endpoint], cwd)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", type=Path, default=Path("."))
    parser.add_argument("--env", type=Path, default=None)
    args = parser.parse_args()

    target = args.target.resolve()
    env_path = args.env or (target / ".env")
    env = {**load_env(env_path), **os.environ}

    missing = [key for key in REQUIRED_ENV if not env.get(key)]
    if missing:
        print(f"ERROR: .env is missing {', '.join(missing)}", file=sys.stderr)
        return 2

    agent_name = env["AGENT_NAME"]
    resource_group = env["AZURE_RESOURCE_GROUP"]
    app_name = env.get("AGENT_WEBAPP_NAME") or f"{agent_name}-agent"
    endpoint = env.get("AGENT_MESSAGING_ENDPOINT") or f"https://{app_name}.azurewebsites.net/api/messages"

    print("[1/4] agent identity blueprint")
    blueprint_id = ensure_blueprint(agent_name, target)
    if env.get("A365_AGENT_BLUEPRINT_ID") != blueprint_id:
        update_env(env_path, {"A365_AGENT_BLUEPRINT_ID": blueprint_id})

    print("[2/4] publish + deploy")
    publish_and_deploy(target, resource_group, app_name)

    print("[3/4] rotate blueprint client secret")
    rotate_and_inject_secret(resource_group, app_name, blueprint_id, agent_name, target)

    print("[4/4] register messaging endpoint")
    register_endpoint(agent_name, endpoint, target)

    print(f"OK: {app_name} deployed and blueprint endpoint registered ({endpoint})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
