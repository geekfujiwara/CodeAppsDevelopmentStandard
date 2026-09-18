#!/usr/bin/env python3
"""Scaffold an Agent 365 AI teammate from AskUserQuestion decisions and .env."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ALL_BLOCKS = tuple(f"B{number}" for number in range(1, 18))
REQUIRED_BLOCKS = ("B15",)
# The brain (B3) ships in two interchangeable shapes. Both are Agents SDK apps on the same
# App Service and differ only in who runs the tool loop, so the choice is a template swap:
#   copilot-sdk … GitHub Copilot SDK runtime, BYOK against the tenant's own Azure AI resource
#   agents-sdk  … in-process Chat Completions loop against Azure OpenAI
RUNTIMES = ("copilot-sdk", "agents-sdk")
RUNTIME_MARKERS = {"copilot-sdk": "RTCOPILOT", "agents-sdk": "RTAGENTS"}
# Where the container runs. This is a different axis from the brain: self-hosted keeps the
# Agents SDK app on App Service (both runtimes available), foundry-autopilot puts a Python
# container on Foundry and publishes it as an M365 Autopilot, which only has a Copilot SDK brain.
HOSTINGS = ("self-hosted", "foundry-autopilot")
HOSTING_RUNTIME_LOCK = {"foundry-autopilot": "copilot-sdk"}
ROLE_BLOCKS = {
    "R1": ("B1", "B2", "B3", "B4", "B6", "B8", "B15"),
    "R2": ("B2", "B3", "B4", "B5", "B6", "B8", "B10", "B15"),
    "R3": ("B1", "B2", "B3", "B5", "B7", "B8", "B9", "B10", "B11", "B13", "B15"),
    "R4": ("B2", "B3", "B4", "B5", "B8", "B11", "B12", "B13", "B14", "B15", "B16", "B17"),
    "R5": ("B1", "B2", "B3", "B5", "B6", "B7", "B8", "B12", "B13", "B14", "B15", "B16", "B17"),
}
ENV_REQUIRED = (
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_TENANT_ID",
    "AZURE_RESOURCE_GROUP",
    "ENV_ID",
    "DATAVERSE_URL",
    "SOLUTION_NAME",
    "PUBLISHER_PREFIX",
)
TOKEN_PATTERN = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\}")
BLOCK_MARKER_PATTERN = re.compile(r"GEEK:BLOCK:([A-Z][A-Z0-9]*):(START|END)")
NAMESPACE_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# Used as a Dataverse table-name prefix (evaluation hub) and interpolated into generated C#, so it
# must be a safe identifier fragment: lowercase start, then lowercase letters/digits/underscore only.
PUBLISHER_PREFIX_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")

# Files under templates/digital-colleague that only make sense for a given feature block.
# Anything not listed here (Agent.cs, AgentBrain.cs, AgentPrompt.cs, ConversationMemory.cs,
# Audience.cs, AgentHealth.cs, AgentProgress.cs, AgenticIdentity.cs, MessageHtml.cs,
# ReplyImages.cs, UntrustedContent.cs, McpClient.cs, AspNetExtensions.cs, Evaluation*.cs,
# Test{Runner,Worker}.cs, SkillSync.cs, Agent.csproj, appsettings.template.json,
# prompts/system.template.md)
# is base infrastructure and is always scaffolded, because either every block needs it (B3 the
# brain, B15 usage, B13 progress, B2 identity) or removing it would require rewriting the turn
# handler by hand.
BLOCK_FILES = {
    "B6": ("MailboxWorker.cs", "MailTools.cs"),
    "B7": ("PresenceWorker.cs",),
    "B9": ("TeamsChatTools.cs",),
    "B10": ("WebSearchTools.cs",),
    "B11": ("ScheduleStore.cs", "ScheduleTools.cs", "ScheduleWorker.cs"),
    "B12": ("CodeSandbox.cs", "SandboxTools.cs"),
    "B14": ("DocumentLedger.cs", "DocumentShareTools.cs", "FileDelivery.cs"),
    "B16": ("IncomingFiles.cs",),
    "B17": ("ImageGenerationTools.cs",),
}
FILE_TO_BLOCK = {
    filename: block for block, filenames in BLOCK_FILES.items() for filename in filenames
}
# appsettings.json sections that only mean something when their block was scaffolded. Leaving a
# section behind is not harmless: `"Sandbox": { "Enabled": true, "Endpoint": "${SANDBOX_ENDPOINT}" }`
# without B12's files produces an agent that believes it can run code and silently cannot.
BLOCK_SETTINGS = {
    "B6": "Mailbox",
    "B7": "Presence",
    "B9": "TeamsChat",
    "B10": "WebSearch",
    "B11": "Schedule",
    "B12": "Sandbox",
    "B14": "Documents",
    "B17": "ImageGeneration",
}
# Hard requirements per digital-colleague-design.md §3 ("依存" column). Expanded transitively.
BLOCK_DEPENDENCIES = {
    "B1": ("B3",),
    "B4": ("B3",),
    "B5": ("B3",),
    "B6": ("B2", "B3", "B4"),
    "B9": ("B3",),
    "B10": ("B3",),
    "B11": ("B2", "B3"),
    "B12": ("B3",),
    "B14": ("B3", "B12"),
    "B16": ("B1", "B3", "B12"),
    "B17": ("B3", "B14"),
}
# ${VAR} placeholders that are legitimately still unresolved right after scaffolding: they are
# filled in by provisioning/blueprint scripts in later Steps, not known at scaffold time.
DEFERRED_TOKENS = frozenset({
    "A365_AGENT_BLUEPRINT_ID",
    "A365_AGENT_INSTANCE_ID",
    "A365_AGENT_USER_ID",
    "AZURE_BOT_MSA_APP_ID",
    "SANDBOX_ENDPOINT",
    "IMAGE_GENERATION_DEPLOYMENT",
    "EVALUATION_JUDGE_DEPLOYMENT",
})


@dataclass(frozen=True)
class ScaffoldPlan:
    agent_name: str
    display_name: str
    namespace: str
    role: str
    personality: str
    implementation_mode: str
    preset: str
    runtime: str
    hosting: str
    blocks: tuple[str, ...]
    evaluation_app: bool
    target: Path

    def as_dict(self) -> dict[str, object]:
        return {
            "agentName": self.agent_name,
            "displayName": self.display_name,
            "namespace": self.namespace,
            "role": self.role,
            "personality": self.personality,
            "implementationMode": self.implementation_mode,
            "preset": self.preset,
            "runtime": self.runtime,
            "hosting": self.hosting,
            "blocks": list(self.blocks),
            "evaluationApp": self.evaluation_app,
            "target": str(self.target),
        }


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


def load_decisions(path: Path) -> dict[str, object]:
    if not path.exists():
        raise ValueError(f"AskUserQuestion decision file not found: {path}")
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError("AskUserQuestion decision file must contain a JSON object")
    return value


def normalize_namespace(agent_name: str) -> str:
    parts = re.findall(r"[A-Za-z0-9]+", agent_name)
    namespace = "".join(part[:1].upper() + part[1:] for part in parts)
    if not namespace or namespace[0].isdigit():
        namespace = f"Agent{namespace}"
    return f"{namespace}Agent"


def resolve_blocks(decisions: dict[str, object]) -> tuple[str, ...]:
    preset = str(decisions.get("preset", "role"))
    if preset == "full":
        return ALL_BLOCKS
    requested = {str(item).upper() for item in decisions.get("blocks", [])}
    for role in decisions.get("roles", []):
        role_key = str(role).upper()
        if role_key not in ROLE_BLOCKS:
            raise ValueError(f"Unknown role: {role}")
        requested.update(ROLE_BLOCKS[role_key])
    requested.update(REQUIRED_BLOCKS)

    # Design-doc recommendations that are auto-included rather than asked about (§3 notes):
    # B10/B12 make turns long enough to need progress updates, B12 makes files exist that need
    # a delivery/consent story and a way to receive them back.
    if "B10" in requested or "B12" in requested:
        requested.add("B13")
    if "B12" in requested:
        requested.update(("B14", "B16"))

    unknown = requested.difference(ALL_BLOCKS)
    if unknown:
        raise ValueError(f"Unknown feature blocks: {', '.join(sorted(unknown))}")

    # Transitive closure over hard dependencies, so a hand-picked block list cannot omit
    # something its own file references (e.g. B14 always needs B12's file set present -> loop
    # below also pulls in B3 through B12's own dependency).
    changed = True
    while changed:
        changed = False
        for block in list(requested):
            for dependency in BLOCK_DEPENDENCIES.get(block, ()):
                if dependency not in requested:
                    requested.add(dependency)
                    changed = True

    return tuple(block for block in ALL_BLOCKS if block in requested)


def validate_full_repository(full: dict[str, object]) -> None:
    """Full implementation mode always uses a private repository (references/troubleshooting.md
    and ci-providers.md #4: agent instructions are business knowledge and stay private even
    templated). This never creates a repository — the GeekPowerCode agent/user does that; this
    only validates that decisions.json contains what that later step will need.
    """
    visibility = str((full.get("repository") or {}).get("visibility", "private"))
    if visibility != "private":
        raise ValueError(
            f"full implementation requires a private repository (got visibility={visibility!r}); "
            "public/internal are not supported for a repo holding agent instructions"
        )
    git_provider = str(full.get("gitProvider", "github"))
    if git_provider == "github":
        repository = full.get("repository") or {}
        owner = str(repository.get("owner", "")).strip()
        name = str(repository.get("name", "")).strip()
        missing = [k for k, v in (("owner", owner), ("name", name)) if not v]
        if missing:
            raise ValueError(
                "full implementation with gitProvider=github requires repository."
                + " and repository.".join(missing)
            )


def build_plan(decisions: dict[str, object], target: Path) -> ScaffoldPlan:
    agent_name = str(decisions.get("agentName", "")).strip()
    display_name = str(decisions.get("displayName", "")).strip()
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,48}[a-z0-9]", agent_name):
        raise ValueError("agentName must be 3-50 characters in kebab-case")
    if ".." in agent_name or "/" in agent_name or "\\" in agent_name:
        raise ValueError("agentName must not contain path separators")
    if not display_name or len(display_name) > 30:
        raise ValueError("displayName must be 1-30 characters")
    implementation_mode = str(decisions.get("implementationMode", "full"))
    if implementation_mode not in {"poc", "full"}:
        raise ValueError("implementationMode must be poc or full")
    full_decisions = decisions.get("full") or {}
    if implementation_mode == "full" and full_decisions.get("selected"):
        validate_full_repository(full_decisions)
    preset = str(decisions.get("preset", "role"))
    if preset not in {"role", "full"}:
        raise ValueError("preset must be role or full")
    runtime = str(decisions.get("runtime", "copilot-sdk"))
    if runtime not in RUNTIMES:
        raise ValueError(f"runtime must be one of: {', '.join(RUNTIMES)}")
    hosting = str(decisions.get("hosting", "self-hosted"))
    if hosting not in HOSTINGS:
        raise ValueError(f"hosting must be one of: {', '.join(HOSTINGS)}")
    locked_runtime = HOSTING_RUNTIME_LOCK.get(hosting)
    if locked_runtime and runtime != locked_runtime:
        if "runtime" in decisions:
            raise ValueError(f"hosting={hosting} only supports runtime={locked_runtime}")
        runtime = locked_runtime
    namespace = str(decisions.get("namespace") or normalize_namespace(agent_name))
    if not NAMESPACE_PATTERN.fullmatch(namespace) or ".." in namespace:
        raise ValueError("namespace must be a valid C# identifier (letters, digits, underscore)")
    role = str(decisions.get("role", "")).strip() or "同僚エージェント"
    personality = str(decisions.get("personality", "")).strip() or "誠実で頼れる態度で対応します"
    return ScaffoldPlan(
        agent_name=agent_name,
        display_name=display_name,
        namespace=namespace,
        role=role,
        personality=personality,
        implementation_mode=implementation_mode,
        preset=preset,
        runtime=runtime,
        hosting=hosting,
        blocks=resolve_blocks(decisions),
        evaluation_app=True,
        target=target.resolve(),
    )


def validate_environment(values: dict[str, str], deploy: bool) -> None:
    publisher_prefix = values.get("PUBLISHER_PREFIX", "")
    if publisher_prefix and not PUBLISHER_PREFIX_PATTERN.fullmatch(publisher_prefix):
        raise ValueError(
            "PUBLISHER_PREFIX must start with a lowercase letter and contain only lowercase "
            f"letters, digits, and underscores (got: {publisher_prefix!r})"
        )
    if not deploy:
        return
    missing = [key for key in ENV_REQUIRED if not values.get(key)]
    if missing:
        raise ValueError(f"Deployment requires .env values: {', '.join(missing)}")


def strip_blocks(content: str, selected_blocks: set[str]) -> str:
    """Removes `// GEEK:BLOCK:<ID>:START` .. `:END` regions for blocks not in *selected_blocks*.

    Works for any comment style (`//`, `#`, `<!-- -->`) because it matches the marker text itself,
    not a specific comment prefix. The marker lines themselves are always dropped.
    """
    skip = False
    kept: list[str] = []
    for line in content.splitlines():
        match = BLOCK_MARKER_PATTERN.search(line)
        if match:
            block, kind = match.group(1), match.group(2)
            skip = kind == "START" and block not in selected_blocks
            continue
        if not skip:
            kept.append(line)
    trailing = "\n" if content.endswith("\n") else ""
    return "\n".join(kept) + trailing


def render_tree(
    source: Path,
    destination: Path,
    variables: dict[str, str],
    blocks: tuple[str, ...] = (),
    gate_files: bool = False,
    substitute_tokens: bool = True,
    fixed_prefix: str | None = None,
    exclude_dirs: tuple[str, ...] = (),
) -> set[str]:
    """Renders *source* into *destination*, returning the set of ${VAR} names left unresolved.

    *substitute_tokens* controls whether ``${VAR}`` text is rewritten. It is on for the C# agent
    project (which has no other templating mechanism) and off for the evaluation app: that tree is
    TypeScript, where ``${IDENTIFIER}`` is legitimate template-literal syntax (e.g. ``${FILE_PATH}``
    in plugins/plugin-power-apps.ts), so blanket substitution would corrupt real source code.

    *fixed_prefix* is a defense-in-depth safety net for trees whose source is meant to use
    ``${PUBLISHER_PREFIX}_`` everywhere: any literal ``<fixed_prefix>_`` text that slipped back in
    (e.g. a future edit that hardcodes the sample prefix instead of the token) is rewritten to
    ``<PUBLISHER_PREFIX>_`` too, so a regression cannot ship a fixed table/column prefix again.
    """
    if not source.is_dir():
        raise ValueError(f"Template directory not found: {source}")

    selected_blocks = set(blocks)
    unresolved: set[str] = set()

    for source_path in source.rglob("*"):
        relative = source_path.relative_to(source)
        if exclude_dirs and relative.parts and relative.parts[0] in exclude_dirs:
            continue
        if gate_files and source_path.is_file():
            required_block = FILE_TO_BLOCK.get(source_path.name)
            if required_block is not None and required_block not in selected_blocks:
                continue

        output_relative = Path(str(relative).replace(".template", ""))
        output_path = destination / output_relative
        if source_path.is_dir():
            output_path.mkdir(parents=True, exist_ok=True)
            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)
        if source_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".zip"}:
            shutil.copy2(source_path, output_path)
            continue

        # Outside the C# tree, only files that opt in via the ".template" name get substituted;
        # everything else is copied byte-for-byte so real ``${IDENTIFIER}`` code is never touched.
        renders_tokens = substitute_tokens or ".template" in source_path.name
        if not renders_tokens and not gate_files:
            shutil.copy2(source_path, output_path)
            continue

        content = source_path.read_text(encoding="utf-8")
        if gate_files:
            content = strip_blocks(content, selected_blocks)
        if renders_tokens:
            content = TOKEN_PATTERN.sub(lambda match: variables.get(match.group(1), match.group(0)), content)
            unresolved.update(match.group(1) for match in TOKEN_PATTERN.finditer(content))
            if fixed_prefix:
                content = content.replace(f"{fixed_prefix}_", f"{variables.get('PUBLISHER_PREFIX', '')}_")
        output_path.write_text(content, encoding="utf-8", newline="\n")

    return unresolved


def copy_teams_templates(skill_root: Path, target: Path) -> None:
    """Place the two Teams app templates ``build_teams_package.py`` reads by default.

    They are copied verbatim, tokens included: ``build_teams_package.py`` renders
    ``${INSTANCE_IDENTITY_CLIENT_ID}`` and friends from ``.env`` at build time. Without them the
    package build fails at the very end of the workflow, after Azure and Agent 365 are already
    provisioned.
    """
    destination = target / "teams"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("manifest.template.json", "agenticUser.template.json"):
        source = skill_root / "references" / "templates" / name
        if source.is_file() and not (destination / name).exists():
            shutil.copy2(source, destination / name)


def copy_alm_scaffold(skill_root: Path, target: Path) -> None:
    """Full implementation mode: bring in the shared ALM scaffold (pre-commit gate, CI workflow).

    Mirrors ``.github/skills/alm/references/repo-scaffold.md`` exactly: scripts land flat in
    ``scripts/`` (not a nested ``scripts/alm/``) because that is where the ALM scripts' own
    ``from alm_config import load_config`` and the documented CI workflow expect to find them,
    and because the product's own scripts (``deploy_ai_teammate.py`` etc.) already live there.
    """
    alm_root = skill_root.parent / "alm"
    alm_scripts = alm_root / "scripts"
    if not alm_scripts.is_dir():
        return

    destination = target / "scripts"
    destination.mkdir(parents=True, exist_ok=True)
    for script in alm_scripts.glob("*.py"):
        shutil.copy2(script, destination / script.name)

    alm_config_example = alm_root / "alm.config.example.json"
    alm_config_target = target / "alm.config.json"
    if alm_config_example.is_file() and not alm_config_target.exists():
        shutil.copy2(alm_config_example, alm_config_target)

    hooks_dir = target / ".githooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    pre_commit_path = hooks_dir / "pre-commit"
    if not pre_commit_path.exists():
        pre_commit_path.write_text(
            "#!/bin/sh\n"
            "set -e\n"
            "\n"
            "# 1. 実値入りファイルを汎用化し、SECRET_BACKEND のストアへ同期してテンプレートをステージ\n"
            "python scripts/sanitize.py --env .env --set-secrets --stage\n"
            "\n"
            "# 2. ステージ済み差分に実値が残っていないか検査（残っていればコミット中止）\n"
            "python scripts/check_secrets.py --env .env\n",
            encoding="utf-8", newline="\n",
        )

    workflow_dir = target / ".github" / "workflows"
    workflow_dir.mkdir(parents=True, exist_ok=True)
    workflow_path = workflow_dir / "review.yml"
    if not workflow_path.exists():
        # Matches .github/skills/alm/references/repo-scaffold.md's minimal review.yml verbatim:
        # a single deterministic gate (review_sanitization.py), no invented `sanitize.py --check`
        # flag (sanitize.py only supports `--set-secrets --stage`, used by the pre-commit hook).
        workflow_path.write_text(
            "# 秘匿化・汎用化の決定論ゲート。必須ステータスチェックに設定して merge をブロックする。\n"
            "name: review\n"
            "\n"
            "on:\n"
            "  pull_request:\n"
            "  push:\n"
            "    branches: [main]\n"
            "\n"
            "permissions:\n"
            "  contents: read\n"
            "\n"
            "jobs:\n"
            "  sanitization-review:\n"
            "    name: Sanitization / generalization gate\n"
            "    runs-on: ubuntu-latest\n"
            "    steps:\n"
            "      - name: Check out the repository\n"
            "        uses: actions/checkout@v4\n"
            "      - name: Set up Python\n"
            "        uses: actions/setup-python@v5\n"
            "        with:\n"
            "          python-version: \"3.12\"\n"
            "      - name: Run the sanitization gate\n"
            "        run: python scripts/review_sanitization.py\n",
            encoding="utf-8", newline="\n",
        )



def prune_settings(plan: ScaffoldPlan) -> None:
    """Drops appsettings sections whose feature block (or runtime) was not scaffolded.

    A section left behind is worse than a missing one. ``Sandbox.Enabled=true`` with an
    unsubstituted ``${SANDBOX_ENDPOINT}`` and no ``CodeSandbox.cs`` yields an agent that accepts
    "make me a deck", writes the script, and never runs it: nothing errors, the turn just ends
    empty. The same holds for ``Copilot`` when the in-process Chat Completions brain was chosen.
    """
    settings_path = plan.target / "appsettings.json"
    if not settings_path.is_file():
        return

    settings = json.loads(settings_path.read_text(encoding="utf-8"))
    selected = set(plan.blocks)
    for block, section in BLOCK_SETTINGS.items():
        if block not in selected:
            settings.pop(section, None)
    if plan.runtime != "copilot-sdk":
        settings.pop("Copilot", None)
    agent = settings.get("Agent")
    if isinstance(agent, dict) and "B13" not in selected:
        agent.pop("Progress", None)

    settings_path.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


OVERLAY_MARKER = "# --- ai-teammate overlay ---"

OVERLAY_REQUIREMENTS = f"""
{OVERLAY_MARKER}
# GitHub Copilot SDK — the agentic loop (planning, tool iteration, context compaction).
# Reaches this tenant's own Foundry deployment through its BYOK Azure provider, so no
# extra model quota and no API key are involved.
github-copilot-sdk>=1.0.13
"""

OVERLAY_DOCKERFILE = f"""
{OVERLAY_MARKER}
# Download the Copilot runtime at build time. Left to the first turn it would run inside the
# request, pushing the user's first reply past the activity timeout, and it would need outbound
# access from a container that may well be locked down.
ENV COPILOT_CLI_EXTRACT_DIR=/opt/copilot-runtime
RUN python -m copilot download-runtime
"""


def append_once(path: Path, addition: str) -> None:
    """Append *addition* unless the overlay marker is already there (re-running must be safe)."""
    if not path.is_file():
        return
    content = path.read_text(encoding="utf-8")
    if OVERLAY_MARKER in content:
        return
    separator = "" if content.endswith("\n") else "\n"
    path.write_text(content + separator + addition, encoding="utf-8", newline="\n")


def fetch_quickstart(target: Path, force: bool) -> None:
    """Download the Microsoft Foundry Autopilot quickstart into *target*.

    The upstream sample is never forked: it is fetched as-is so that later upstream fixes can be
    taken by re-running this step. Everything this skill adds lives in the overlay instead.
    """
    script = Path(__file__).resolve().parent / "fetch_autopilot_quickstart.py"
    command = [sys.executable, str(script), "--target", str(target)]
    if force:
        command.append("--force")
    # The child prints Japanese; a cp932 console would otherwise make stdout come back as None.
    result = subprocess.run(
        command, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if result.returncode != 0:
        raise ValueError(
            "Could not fetch the Foundry Autopilot quickstart: "
            + ((result.stderr or "").strip() or (result.stdout or "").strip() or "unknown error")
        )
    print((result.stdout or "").strip())


def resolve_package_dir(target: Path) -> Path:
    """Find the quickstart's Python package directory (its name changes between releases)."""
    candidates = sorted(target.glob("src/*/agent_interface.py"))
    if not candidates:
        raise ValueError(
            f"Could not locate the quickstart package under {target / 'src'} "
            "(expected src/<package>/agent_interface.py)"
        )
    return candidates[0].parent


def scaffold_foundry_autopilot(
    skill_root: Path, plan: ScaffoldPlan, variables: dict[str, str], force: bool
) -> set[str]:
    """Fetch the quickstart, then lay this skill's overlay on top of it."""
    fetch_quickstart(plan.target, force)
    package_dir = resolve_package_dir(plan.target)
    template_root = skill_root / "templates" / "foundry-autopilot"

    unresolved = render_tree(template_root / "__PKG__", package_dir, variables)
    unresolved |= render_tree(template_root / "prompts", package_dir / "prompts", variables)
    append_once(package_dir / "requirements.txt", OVERLAY_REQUIREMENTS)
    append_once(package_dir / "foundry-infra" / "Dockerfile", OVERLAY_DOCKERFILE)
    # The quickstart ships its own README; keep both rather than silently replacing theirs.
    readme = template_root / "README.md"
    content = TOKEN_PATTERN.sub(
        lambda match: variables.get(match.group(1), match.group(0)),
        readme.read_text(encoding="utf-8"),
    )
    (plan.target / "README-teammate.md").write_text(content, encoding="utf-8", newline="\n")
    unresolved.update(match.group(1) for match in TOKEN_PATTERN.finditer(content))
    return unresolved


def copy_regression_suite(skill_root: Path, plan: ScaffoldPlan) -> None:
    """Write the behaviour suite, keeping only cases whose feature blocks were scaffolded.

    Shipping a case for a block the agent does not have would fail on every run and train the
    team to ignore red, which is worse than having no test at all.
    """
    source = skill_root / "templates" / "regression" / "suite.json"
    if not source.is_file():
        return
    suite = json.loads(source.read_text(encoding="utf-8"))
    selected = set(plan.blocks)
    suite["cases"] = [
        case
        for case in suite.get("cases", [])
        if set(case.get("requiresBlocks") or []) <= selected
    ]
    destination = plan.target / "regression"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "suite.json").write_text(
        json.dumps(suite, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


def scaffold(plan: ScaffoldPlan, env: dict[str, str], force: bool) -> None:
    skill_root = Path(__file__).resolve().parents[1]
    if plan.target.resolve() == skill_root.resolve() or skill_root in plan.target.resolve().parents:
        raise ValueError("Target must not be inside the ai-teammate skill directory")
    if plan.target.exists() and any(plan.target.iterdir()) and not force:
        raise ValueError(f"Target is not empty: {plan.target}. Use --force to merge intentionally")

    validate_environment(env, deploy=False)

    variables = {
        **env,
        "AGENT_NAME": plan.agent_name,
        "AGENT_DISPLAY_NAME": plan.display_name,
        "AGENT_NAMESPACE": plan.namespace,
        "AGENT_ROLE": plan.role,
        "AGENT_PERSONALITY": plan.personality,
        "IMPLEMENTATION_MODE": plan.implementation_mode,
        "AGENT_HOSTING": plan.hosting,
        "FEATURE_BLOCKS": ",".join(plan.blocks),
    }

    unresolved: set[str] = set()
    if plan.hosting == "foundry-autopilot":
        unresolved |= scaffold_foundry_autopilot(skill_root, plan, variables, force)
    else:
        # The runtime marker rides along with the feature blocks so the existing GEEK:BLOCK
        # machinery can gate runtime-specific package references and DI registrations.
        render_blocks = plan.blocks + (RUNTIME_MARKERS[plan.runtime],)
        unresolved |= render_tree(
            skill_root / "templates" / "digital-colleague", plan.target, variables,
            blocks=render_blocks, gate_files=True, fixed_prefix="geek", exclude_dirs=("runtimes",),
        )
        unresolved |= render_tree(
            skill_root / "templates" / "digital-colleague" / "runtimes" / plan.runtime,
            plan.target, variables, blocks=render_blocks, gate_files=True, fixed_prefix="geek",
        )
        copy_teams_templates(skill_root, plan.target)
        prune_settings(plan)

    unresolved |= render_tree(
        skill_root / "templates" / "evaluation-app", plan.target / "evaluation-app", variables,
        substitute_tokens=False,
    )
    copy_regression_suite(skill_root, plan)

    if plan.implementation_mode == "full":
        copy_alm_scaffold(skill_root, plan.target)

    blocking = sorted(unresolved - DEFERRED_TOKENS)
    if blocking:
        raise ValueError(
            "Unresolved ${VAR} tokens after rendering (add these to .env): " + ", ".join(blocking)
        )

    (plan.target / "scaffold-plan.json").write_text(
        json.dumps(plan.as_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decisions", type=Path, required=True, help="JSON produced from the one AskUserQuestion response")
    parser.add_argument("--env", type=Path, default=Path(".env"), help="Existing environment-specific values")
    parser.add_argument("--target", type=Path, default=Path("."), help="Empty project directory to scaffold")
    parser.add_argument("--plan", action="store_true", help="Print the resolved plan without writing files")
    parser.add_argument("--deploy", action="store_true", help="Validate deployment values after scaffolding")
    parser.add_argument("--force", action="store_true", help="Merge into a non-empty target")
    parser.add_argument(
        "--no-skills", action="store_true",
        help="Do not install the default Agent Skills bundle into the scaffolded agent.",
    )
    return parser.parse_args()


def skills_root(plan: ScaffoldPlan) -> Path:
    """Where ``skills/`` has to sit so the running agent can actually read it.

    The self-hosted agent reads them from the app root; the Foundry-hosted one only ships the
    Python package into its container image, so skills placed at the repository root would be
    left behind at build time and the agent would come up knowing nothing.
    """
    if plan.hosting != "foundry-autopilot":
        return plan.target
    try:
        return resolve_package_dir(plan.target)
    except ValueError:
        return plan.target


def install_skills(target: Path, env: dict[str, str], env_file: Path | None = None) -> None:
    """A teammate with no skills still answers, just without any of the procedures its role
    implies, so the default is to start complete rather than to start empty. Skipped silently
    when the release cannot be reached: scaffolding offline is still useful."""
    script = Path(__file__).resolve().parent / "install_agent_skills.py"
    env_path = env_file or (target / ".env")
    command = [sys.executable, str(script), "--target", str(target), "--env", str(env_path)]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, **env},
    )
    if result.returncode == 0:
        print((result.stdout or "").strip())
    else:
        print(
            f"WARN: skills were not installed ({(result.stderr or '').strip() or 'unknown error'}).\n"
            f"      Run: python scripts/install_agent_skills.py --target {target}",
            file=sys.stderr,
        )


def main() -> int:
    args = parse_args()
    try:
        decisions = load_decisions(args.decisions)
        env = {**load_dotenv(args.env), **os.environ}
        plan = build_plan(decisions, args.target)
        validate_environment(env, args.deploy)
        if args.plan:
            print(json.dumps(plan.as_dict(), ensure_ascii=False, indent=2))
            return 0
        scaffold(plan, env, args.force)
        print(
            f"OK: scaffolded {plan.agent_name} at {plan.target} "
            f"(hosting={plan.hosting}, runtime={plan.runtime})"
        )
        if not args.no_skills:
            install_skills(skills_root(plan), env, env_file=plan.target / ".env")
        print("Next: run python scripts/deploy_ai_teammate.py --check")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
