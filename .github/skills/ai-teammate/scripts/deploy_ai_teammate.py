#!/usr/bin/env python3
"""Two-stage deploy for a scaffolded AI teammate (agent + evaluation hub).

Stage 1 (``--check``, always run first): verifies tools, `.env` values, that the agent project
builds, that the evaluation app's static checks pass, that the existing provision scripts report
a clean plan, that the Dataverse evaluation-hub schema plan is conflict-free, and that the target
Dataverse environment/DLP policy allow the connections this agent needs. Nothing here creates or
changes a resource, and nothing here costs money.

Stage 2 (``--execute``): runs the actual provisioning/publish steps in order (see
``build_pre_connection_steps`` / ``build_post_connection_steps`` for the exact command list).
Refuses to run unless ``--check`` was run for the same target within the last 30 minutes (a
checkpoint file is written by ``--check`` and consumed here), so a stale pass cannot be replayed
after the project changed.

Design constraints (see .github/skills/ai-teammate/SKILL.md):
    - `command` is always a fixed argv list and subprocesses never use a shell. Executables are
        resolved with `shutil.which`, including Windows `.cmd` shims.
  - Every subprocess call receives the target `.env` values explicitly via
    `env={**os.environ, **env}`, so a script never has to guess `.env`'s location.
  - Secrets (client secrets, tokens) are never printed to stdout/stderr; `run()` redacts any
    `.env` secret value that leaks into a child process's combined output before returning it.
  - The devPreview publish step in the M365 admin center is a hard stop: this script prints the
    manual steps and does not attempt Playwright/browser automation for it.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

CHECKPOINT_NAME = ".deploy-check-ok.json"
CHECKPOINT_MAX_AGE_SECONDS = 30 * 60

# `--check`'s own exit code for "the Dataverse schema is not created yet" (setup_evaluation_dataverse.py
# uses the same value): this is the expected pre-deploy state, not a problem to fix before --execute.
NOT_CREATED_EXIT = 3

REQUIRED_TOOLS = ("dotnet", "npm", "npx", "az", "a365")
REQUIRED_ENV = (
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_TENANT_ID",
    "AZURE_RESOURCE_GROUP",
    "AGENT_NAME",
    "DATAVERSE_URL",
    "ENV_ID",
    "SOLUTION_NAME",
    "PUBLISHER_PREFIX",
)

SECRET_KEY_HINTS = ("SECRET", "PASSWORD", "TOKEN", "KEY")

# Sections whose Enabled flag also needs a value that only provisioning can supply.
PROVISIONED_KEYS = {"Sandbox": "Endpoint", "ImageGeneration": "Deployment"}


def feature_sections() -> dict[str, tuple[str, str | None, tuple[str, ...]]]:
    """block -> (settings section, key that must be resolved or None, files the block scaffolds).

    Derived from the scaffolder's own catalog rather than restated here. A hand-kept copy silently
    stops covering whichever block was added last, which is exactly the failure this check exists
    to catch: settings claim a capability, no code implements it, and the agent answers nothing.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import scaffold_ai_teammate as catalog

    return {
        block: (section, PROVISIONED_KEYS.get(section), catalog.BLOCK_FILES.get(block, ()))
        for block, section in catalog.BLOCK_SETTINGS.items()
    }


# `<prefix>_evalturn` and friends, as compiled into the agent's Dataverse calls.
PREFIXED_TABLE_PATTERN = re.compile(r"\b([a-z][a-z0-9_]*?)_eval(?:turn|rule|result|job|agent)s?\b")


@dataclass(frozen=True)
class Step:
    name: str
    command: tuple[str, ...]
    cwd: Path


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def redact(env: dict[str, str]) -> dict[str, str]:
    return {
        key: ("(redacted)" if any(hint in key.upper() for hint in SECRET_KEY_HINTS) else value)
        for key, value in env.items()
    }


def redact_output(text: str, env: dict[str, str]) -> str:
    """Scrubs any `.env` secret value that appears verbatim in *text* before it is ever printed
    or returned. A secret value must be non-trivial (>=6 chars) to avoid redacting common short
    substrings by accident."""
    for key, value in env.items():
        if value and len(value) >= 6 and any(hint in key.upper() for hint in SECRET_KEY_HINTS):
            text = text.replace(value, "(redacted)")
    return text


def run(command: list[str], cwd: Path, description: str, env: dict[str, str] | None = None) -> tuple[bool, str]:
    """Runs *command* without a shell and returns (ok, combined output). Never logs secrets.

    The child process always receives ``{**os.environ, **env}`` so scripts never have to guess
    where the target's `.env` values come from (no reliance on the child re-discovering `.env`
    from its own file location).
    """
    child_env = {**os.environ, **(env or {})}
    executable = shutil.which(command[0], path=child_env.get("PATH"))
    if executable is None:
        return False, f"{description}: command not found: {command[0]}"
    try:
        result = subprocess.run(
            [executable, *command[1:]],
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=1800,
            check=False,
            env=child_env,
            shell=False,
        )
    except FileNotFoundError:
        return False, f"{description}: command not found: {command[0]}"
    except subprocess.TimeoutExpired:
        return False, f"{description}: timed out after 30 minutes"

    output = (result.stdout or "") + (result.stderr or "")
    output = redact_output(output.strip(), child_env)
    ok = result.returncode == 0
    return ok, output


def check_tools() -> list[str]:
    problems = []
    for tool in REQUIRED_TOOLS:
        found, _ = run([tool, "--version"], Path.cwd(), tool)
        if not found:
            problems.append(f"required tool not found or failed to run: {tool}")
    return problems


def check_env(env: dict[str, str]) -> list[str]:
    missing = [key for key in REQUIRED_ENV if not env.get(key)]
    return [f".env is missing {key}" for key in missing]


def check_agent_build(target: Path, env: dict[str, str]) -> list[str]:
    csproj = next(target.glob("*.csproj"), None)
    if csproj is None:
        return ["No .csproj found under target; run scaffold_ai_teammate.py first"]
    ok, output = run(["dotnet", "build", str(csproj), "-c", "Release"], target, "dotnet build", env)
    return [] if ok else [f"dotnet build failed:\n{output[-2000:]}"]


def check_evaluation_app(target: Path, env: dict[str, str]) -> list[str]:
    """Runs only the checks that do not require a live Dataverse connection.

    `src/generated/` (and therefore a real `npm run build`) does not exist until `--execute` has
    run `pa app init` + `add-data-source` against a real environment (see
    references/troubleshooting.md #56) — this is expected, not a failure. Once `power.config.json`
    exists (a previous partial `--execute` already ran `pa app init`), the full build is a
    meaningful check and is run.
    """
    app_dir = target / "evaluation-app"
    if not app_dir.is_dir():
        return ["evaluation-app is required and was not found under the scaffolded target"]

    problems = []
    node_modules = app_dir / "node_modules"
    if not node_modules.is_dir():
        ok, output = run(["npm", "install"], app_dir, "npm install", env)
        if not ok:
            problems.append(f"npm install failed:\n{output[-2000:]}")
            return problems

    if not (app_dir / "power.config.json").is_file():
        ok, output = run(["npm", "run", "lint"], app_dir, "npm run lint", env)
        if not ok:
            problems.append(
                "lint failed (this is the extent of what can be checked before "
                "`pa app init` / `add-data-source` produce src/generated):\n" + output[-2000:]
            )
        return problems

    ok, output = run(["npm", "run", "build", "--if-present"], app_dir, "npm run build", env)
    if not ok:
        problems.append(f"npm run build failed:\n{output[-2000:]}")
    return problems


def _scaffold_blocks(target: Path) -> set[str]:
    plan_path = target / "scaffold-plan.json"
    if not plan_path.is_file():
        return set()
    try:
        data = json.loads(plan_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    return set(data.get("blocks", []))


def check_existing_scripts(skill_root: Path, env_path: Path, target: Path, env: dict[str, str]) -> list[str]:
    """`--check`s the provisioning scripts this agent actually needs, per its scaffolded feature
    blocks: `provision_code_sandbox.py` only makes sense with B12 (code execution), and
    `provision_image_model.py` only with B17 (image generation) — checking them unconditionally
    would fail (or silently no-op) for agents that never asked for those blocks."""
    blocks = _scaffold_blocks(target)
    script_names = ["provision_selfhost.py"]
    if "B12" in blocks:
        script_names.append("provision_code_sandbox.py")
    if "B17" in blocks:
        script_names.append("provision_image_model.py")

    problems = []
    for script_name in script_names:
        script = skill_root / "scripts" / script_name
        if not script.is_file():
            problems.append(f"required provisioning script not found: {script_name}")
            continue
        ok, output = run(
            [sys.executable, str(script), "--check", "--env", str(env_path)],
            skill_root,
            script_name,
            env,
        )
        if not ok:
            problems.append(f"{script_name} --check reported a problem:\n{output[-1500:]}")
    return problems


def check_settings_consistency(target: Path, env: dict[str, str]) -> list[str]:
    """Catches the two silent mismatches that produce an agent which looks healthy and is not.

    1. A feature is switched on in ``appsettings.json`` but its endpoint is still an unsubstituted
       ``${VAR}``, or its C# file was never scaffolded. Nothing throws: the tool simply never
       reaches the model, so the agent accepts the work and returns nothing.
    2. ``PUBLISHER_PREFIX`` drifted after scaffolding. The prefix is compiled into the agent's
       Dataverse logical names, so changing ``.env`` afterwards splits the evaluation data across
       two table families — the hub keeps reading the new tables while the agent writes the old.
    """
    settings_path = target / "appsettings.json"
    if not settings_path.is_file():
        return ["appsettings.json not found; run scaffold_ai_teammate.py first"]

    problems: list[str] = []
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        return [f"appsettings.json is not readable: {error}"]

    blocks = _scaffold_blocks(target)
    program = (target / "Program.cs").read_text(encoding="utf-8") if (target / "Program.cs").is_file() else ""
    for block, (section, endpoint_key, source_files) in feature_sections().items():
        config = settings.get(section)
        if not isinstance(config, dict) or not config.get("Enabled"):
            continue
        # The source files on disk are the authority, not scaffold-plan.json: a project that was
        # hand-edited (or scaffolded before the plan file existed) still has to be caught here.
        # This is the failure that costs a user a whole turn — the prompt promises the capability,
        # the settings claim it is on, and the tool was never registered, so the agent writes code
        # it cannot run and returns nothing.
        missing = [name for name in source_files if not (target / name).is_file()]
        if missing:
            problems.append(
                f"appsettings {section}.Enabled is true but {', '.join(missing)} is missing "
                f"(={block} was never scaffolded); set Enabled to false or re-scaffold with {block}"
            )
            continue
        # A file that was copied in but never wired up is just as silent as a missing one.
        unwired = [name for name in source_files if program and name[:-3] not in program]
        if unwired:
            problems.append(
                f"appsettings {section}.Enabled is true and {', '.join(unwired)} exists but is not "
                f"registered in Program.cs; the tools would never reach the agent"
            )
            continue
        if blocks and block not in blocks:
            problems.append(
                f"appsettings {section}.Enabled is true but {block} is not in scaffold-plan.json; "
                f"re-scaffold with {block} so its tools are registered"
            )
            continue
        value = str(config.get(endpoint_key, "")) if endpoint_key else ""
        if endpoint_key and ("${" in value or not value):
            problems.append(
                f"appsettings {section}.Enabled is true but {section}.{endpoint_key} is unresolved "
                f"({value or 'empty'}); provision it first or set Enabled to false"
            )

    # Skills are data rather than a code block, so they miss the loop above and fail the same way:
    # the runtime turns skills off when the folder is empty, and the agent just loses the procedure.
    skills = settings.get("Skills")
    if isinstance(skills, dict) and skills.get("Enabled"):
        folder = target / str(skills.get("Directory") or "skills")
        if not any(folder.glob("*/SKILL.md")):
            problems.append(
                f"appsettings Skills.Enabled is true but {folder.name}/ holds no SKILL.md; "
                "run install_agent_skills.py or set Enabled to false"
            )

    prefix = env.get("PUBLISHER_PREFIX", "").strip()
    if prefix:
        compiled = sorted({
            match.group(1)
            for path in target.glob("Evaluation*.cs")
            for match in PREFIXED_TABLE_PATTERN.finditer(path.read_text(encoding="utf-8"))
        })
        drifted = [found for found in compiled if found != prefix]
        if drifted:
            problems.append(
                f"PUBLISHER_PREFIX is {prefix!r} but the agent's C# uses {', '.join(drifted)}_eval*; "
                "re-scaffold or migrate the rows — the evaluation hub would read empty tables"
            )
        app_env = target / "evaluation-app" / ".env"
        if app_env.is_file():
            app_prefix = load_dotenv(app_env).get("VITE_PUBLISHER_PREFIX", "").strip()
            if app_prefix and app_prefix != prefix:
                problems.append(
                    f"evaluation-app/.env VITE_PUBLISHER_PREFIX={app_prefix!r} does not match "
                    f"PUBLISHER_PREFIX={prefix!r}; the hub would query tables nobody writes"
                )
    return problems


def check_evaluation_dataverse(skill_root: Path, env_path: Path, env: dict[str, str]) -> tuple[list[str], list[str]]:
    """Runs `setup_evaluation_dataverse.py --check`. Returns (problems, planned) — "not created
    yet" is not a problem (it is exactly what `--execute` will do first), so it is reported
    separately as *planned* and does not block `--execute`."""
    script = skill_root / "scripts" / "setup_evaluation_dataverse.py"
    if not script.is_file():
        return ["setup_evaluation_dataverse.py not found next to this script"], []

    result = subprocess.run(
        [sys.executable, str(script), "--check", "--env", str(env_path)],
        cwd=skill_root, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=600, env={**os.environ, **env},
    )
    output = redact_output((result.stdout or "") + (result.stderr or ""), env).strip()
    if result.returncode == 0:
        return [], []
    if result.returncode == NOT_CREATED_EXIT:
        return [], [output]
    return [f"setup_evaluation_dataverse.py --check failed:\n{output[-1500:]}"], []


def check_environment_dlp(skill_root: Path, env: dict[str, str]) -> list[str]:
    """Confirms the target Dataverse environment is managed/Code-Apps-ready and that the
    connectors this agent needs are not blocked by a DLP policy, via the shared admin scripts
    (read-only; they call Dataverse/BAP through auth_helper, never MSAL/requests directly)."""
    admin_scripts = skill_root.parent / "admin" / "scripts"
    env_id = env.get("ENV_ID", "")
    tenant_id = env.get("AZURE_TENANT_ID", "")
    if not env_id:
        return [".env ENV_ID is required to check the environment/DLP policy"]
    if not admin_scripts.is_dir():
        return ["admin skill scripts not found (.github/skills/admin/scripts); copy the skill in first"]

    problems: list[str] = []

    check_environment = admin_scripts / "check_environment.py"
    if check_environment.is_file():
        ok, output = run(
            [sys.executable, str(check_environment), "--environment-id", env_id,
             "--require-managed", "--require-code-apps"],
            skill_root, "check_environment.py", env,
        )
        if not ok:
            problems.append(f"check_environment.py reported a problem:\n{output[-1500:]}")

    check_dlp = admin_scripts / "check_dlp.py"
    if check_dlp.is_file():
        command = [sys.executable, str(check_dlp), "--environment-id", env_id,
                   "--connector", "shared_commondataserviceforapps"]
        if tenant_id:
            command += ["--tenant-id", tenant_id]
        ok, output = run(command, skill_root, "check_dlp.py", env)
        if not ok:
            problems.append(f"check_dlp.py reported a problem:\n{output[-1500:]}")

    return problems


def write_checkpoint(target: Path) -> None:
    checkpoint = {"checkedAt": time.time(), "target": str(target.resolve())}
    (target / CHECKPOINT_NAME).write_text(json.dumps(checkpoint) + "\n", encoding="utf-8")


def read_checkpoint(target: Path) -> float | None:
    path = target / CHECKPOINT_NAME
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return float(data.get("checkedAt", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


def run_check(target: Path, env: dict[str, str]) -> int:
    skill_root = Path(__file__).resolve().parents[1]
    env_path = target / ".env"

    problems: list[str] = []
    problems += [f"tool check: {p}" for p in check_tools()]
    problems += [f"env check: {p}" for p in check_env(env)]
    problems += [f"agent build: {p}" for p in check_agent_build(target, env)]
    problems += [f"evaluation app: {p}" for p in check_evaluation_app(target, env)]
    problems += [f"settings consistency: {p}" for p in check_settings_consistency(target, env)]
    problems += [f"existing scripts: {p}" for p in check_existing_scripts(skill_root, env_path, target, env)]

    dv_problems, dv_planned = check_evaluation_dataverse(skill_root, env_path, env)
    problems += [f"evaluation Dataverse schema: {p}" for p in dv_problems]

    problems += [f"environment/DLP: {p}" for p in check_environment_dlp(skill_root, env)]

    if dv_planned:
        print("PLANNED (will happen during --execute, not a blocking problem):")
        for item in dv_planned:
            print(f"  - {item}")

    if problems:
        print("CHECK FAILED:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 2

    write_checkpoint(target)
    print("CHECK OK: safe to run --execute within the next 30 minutes.")
    return 0


def _evaluation_app_display_name(env: dict[str, str]) -> str:
    # One hub per environment, not per teammate: agents are separated by `<prefix>_agentkey` inside
    # it. Naming it after the agent produced a second app on every new teammate, splitting the
    # review history across apps that each showed only part of it.
    return env.get("EVALUATION_APP_DISPLAY_NAME") or "AI チームメイト評価Hub"


def build_pre_connection_steps(target: Path, env: dict[str, str], skill_root: Path) -> list[Step]:
    """Steps that do not depend on values written by `setup_connection_reference.py` (SOLUTION_ID /
    CONNECTION_REFERENCE_LOGICAL_NAME); pure data, no subprocess is run here."""
    env_path = target / ".env"
    app_dir = target / "evaluation-app"
    code_apps_scripts = skill_root.parent / "code-apps" / "scripts"
    blocks = _scaffold_blocks(target)

    steps = [
        Step(
            "setup_evaluation_dataverse.py",
            (sys.executable, str(skill_root / "scripts" / "setup_evaluation_dataverse.py"), "--env", str(env_path)),
            target,
        ),
    ]
    if "B17" in blocks:
        steps.append(Step(
            "provision_image_model.py",
            (sys.executable, str(skill_root / "scripts" / "provision_image_model.py"), "--env", str(env_path)),
            target,
        ))
    steps += [
        Step(
            "provision_selfhost.py",
            (sys.executable, str(skill_root / "scripts" / "provision_selfhost.py"), "--write", str(env_path)),
            target,
        ),
        # After provision_selfhost.py, which writes AZURE_CLIENT_ID: without an application user the
        # agent's background workers get 403 on every Dataverse call and the host can stop outright.
        Step(
            "setup_agent_dataverse_user.py",
            (sys.executable, str(skill_root / "scripts" / "setup_agent_dataverse_user.py"), "--env", str(env_path)),
            target,
        ),
    ]
    if "B12" in blocks:
        # Must run after provision_selfhost.py (it writes AGENT_IDENTITY_PRINCIPAL_ID) and before
        # the publish: an agent whose prompt promises documents but whose sandbox is missing fails
        # silently at the user's first request instead of here.
        steps.append(Step(
            "provision_code_sandbox.py",
            (sys.executable, str(skill_root / "scripts" / "provision_code_sandbox.py"),
             "--write-settings", "--env", str(env_path)),
            target,
        ))
    # Skills are part of the app payload, so they must be on disk before the publish packs it.
    steps.append(Step(
        "install_agent_skills.py",
        (sys.executable, str(skill_root / "scripts" / "install_agent_skills.py"),
         "--target", str(target), "--env", str(env_path)),
        target,
    ))
    steps += [
        Step(
            "deploy_agent_webapp.py",
            (sys.executable, str(skill_root / "scripts" / "deploy_agent_webapp.py"), "--target", str(target), "--env", str(env_path)),
            target,
        ),
        Step(
            "build_teams_package.py",
            (sys.executable, str(skill_root / "scripts" / "build_teams_package.py"), "--require-template"),
            target,
        ),
    ]

    if not (app_dir / "power.config.json").is_file():
        steps.append(Step(
            "pa app init",
            ("npx", "pa", "app", "init", "--environment-id", env.get("ENV_ID", ""),
             "--display-name", _evaluation_app_display_name(env), "--app-type", "CodeApp"),
            app_dir,
        ))

    steps.append(Step(
        "setup_connection_reference.py",
        (sys.executable, str(code_apps_scripts / "setup_connection_reference.py"), "--write-env", str(env_path)),
        app_dir,
    ))
    return steps


def build_post_connection_steps(target: Path, env: dict[str, str], skill_root: Path) -> list[Step]:
    """Steps that need SOLUTION_ID / CONNECTION_REFERENCE_LOGICAL_NAME, i.e. must be built *after*
    `setup_connection_reference.py` ran and `.env` was reloaded."""
    app_dir = target / "evaluation-app"
    code_apps_scripts = skill_root.parent / "code-apps" / "scripts"

    return [
        Step(
            "add_data_source.py (dataverse)",
            (
                sys.executable, str(code_apps_scripts / "add_data_source.py"),
                "--connector", "dataverse",
                "--connection-ref", env.get("CONNECTION_REFERENCE_LOGICAL_NAME", ""),
                "--solution-id", env.get("SOLUTION_ID", ""),
                "--org-url", env.get("DATAVERSE_URL", ""),
            ),
            app_dir,
        ),
        Step("npm run predeploy", ("npm", "run", "predeploy"), app_dir),
        Step("npm run deploy", ("npm", "run", "deploy"), app_dir),
    ]


def write_evaluation_app_env(target: Path, env: dict[str, str]) -> None:
    """Generates `evaluation-app/.env` from a small, explicit allowlist of keys derived from the
    target `.env` — never a wholesale copy. The target `.env` carries Azure/Foundry/AOAI secrets
    the Code App has no business seeing; only the Vite-prefixed, non-secret display values the
    evaluation-app actually reads (see templates/evaluation-app/src/config.ts) are written here.
    """
    app_env_path = target / "evaluation-app" / ".env"
    lines = [
        "# Generated by deploy_ai_teammate.py --execute from the target .env's non-secret values.",
        "# Do not hand-edit; do not copy the target .env here (it is git-ignored either way).",
        # pre-deploy-check.mjs refuses to deploy unless these four are real values.
        f"DATAVERSE_URL={env.get('DATAVERSE_URL', '')}",
        f"TENANT_ID={env.get('TENANT_ID', '')}",
        f"ENV_ID={env.get('ENV_ID', '')}",
        f"SOLUTION_NAME={env.get('SOLUTION_NAME', '')}",
        f"PUBLISHER_PREFIX={env.get('PUBLISHER_PREFIX', '')}",
        f"VITE_PUBLISHER_PREFIX={env.get('PUBLISHER_PREFIX', '')}",
        f"VITE_CODEAPPS_APP_NAME={_evaluation_app_display_name(env)}",
        "VITE_CODEAPPS_APP_SUBTITLE=",
        f"VITE_CODEAPPS_DOCUMENT_TITLE={_evaluation_app_display_name(env)}",
        "VITE_CODEAPPS_THEME_STORAGE_KEY=code-app-theme",
    ]
    # Optional VITE_ settings (GitHub repo, org-chart owner, ...) live in the target .env so a
    # redeploy does not silently drop what the operator configured for the hub.
    written = {line.split("=", 1)[0] for line in lines if "=" in line}
    lines += [
        f"{key}={value}"
        for key, value in env.items()
        if key.startswith("VITE_") and key not in written
    ]
    app_env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_execute(target: Path, env: dict[str, str]) -> int:
    checked_at = read_checkpoint(target)
    if checked_at is None or (time.time() - checked_at) > CHECKPOINT_MAX_AGE_SECONDS:
        print(
            "ERROR: run `python scripts/deploy_ai_teammate.py --check` first "
            "(checkpoint missing or older than 30 minutes).",
            file=sys.stderr,
        )
        return 2

    skill_root = Path(__file__).resolve().parents[1]
    env_path = target / ".env"

    write_evaluation_app_env(target, env)

    for step in build_pre_connection_steps(target, env, skill_root):
        print(f"--- {step.name} ---")
        ok, output = run(list(step.command), step.cwd, step.name, env)
        print(output)
        if not ok:
            print(f"ERROR: {step.name} failed", file=sys.stderr)
            return 2

    # setup_connection_reference.py just wrote SOLUTION_ID / CONNECTION_REFERENCE_LOGICAL_NAME
    # into .env — reload so the next steps see them (no stdout-parsing).
    env = {**load_dotenv(env_path), **os.environ}

    for step in build_post_connection_steps(target, env, skill_root):
        print(f"--- {step.name} ---")
        ok, output = run(list(step.command), step.cwd, step.name, env)
        print(output)
        if not ok:
            print(f"ERROR: {step.name} failed", file=sys.stderr)
            return 2

    agent_name = env.get("AGENT_NAME", "")
    print()
    print("Everything up to Teams packaging is done and the agent/evaluation hub are deployed.")
    print("The remaining M365 Agent template publish is a separate approval-bound operation:")
    print()
    print("  python scripts/plan_agent_template_upload.py ^")
    print(f"    --package teams/{agent_name}-teams-app.zip ^")
    print("    --tenant-id <AZURE_TENANT_ID> --output .mcp/agent-template-stage-plan.json")
    print()
    print("  Review and approve the staging hash, then use the logged-in VS Code browser runner.")
    print("  Publishing requires a second approval for the generated FINALIZEPACKAGE plan.")
    print("  See references/agent-template-upload.md. Authentication and MFA remain manual.")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path("."), help="Scaffolded project directory")
    parser.add_argument("--env", type=Path, default=None, help="Defaults to <target>/.env")
    parser.add_argument("--check", action="store_true", help="Stage 1: validate only, no changes")
    parser.add_argument("--execute", action="store_true", help="Stage 2: run the deployment")
    return parser.parse_args()


def main() -> int:
    # The status lines below contain the agent's display name, which is routinely non-ASCII. On a
    # Japanese Windows console stdout defaults to cp932 and a single such line aborts the whole
    # deployment with UnicodeEncodeError, halfway through creating Azure resources.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    args = parse_args()
    if args.check == args.execute:
        print("ERROR: pass exactly one of --check or --execute", file=sys.stderr)
        return 2

    target = args.target.resolve()
    env_path = args.env or (target / ".env")
    env = {**load_dotenv(env_path), **os.environ}

    if args.check:
        return run_check(target, env)
    return run_execute(target, env)


if __name__ == "__main__":
    raise SystemExit(main())
