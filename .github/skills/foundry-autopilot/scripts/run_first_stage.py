#!/usr/bin/env python3
"""Scaffold, publish and verify a Foundry Autopilot. No shared-bot fallback.

Default: execute. --plan is local only. --resume continues after approval/hire;
it never republishes the template. Private API approvals and sign-in stay human gates.
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def skill_root(target: Path) -> Path:
    local = target / "first-stage.local.json"
    root = (Path(json.loads(local.read_text(encoding="utf-8"))["skillRoot"])
            if local.is_file() else Path(__file__).resolve().parents[1])
    if not (root / "scripts" / "scaffold_ai_teammate.py").is_file():
        raise ValueError("Skill installation not found; restore first-stage.local.json skillRoot.")
    return root


def validate_decisions(decisions: dict) -> None:
    if decisions.get("hosting", "foundry-autopilot") != "foundry-autopilot":
        raise ValueError("First stage requires hosting=foundry-autopilot. No fallback is allowed.")
    if decisions.get("runtime", "copilot-sdk") != "copilot-sdk":
        raise ValueError("First stage requires runtime=copilot-sdk.")
    for key in ("externalEmailEnabled", "imageGenerationEnabled"):
        if type(decisions.get(key)) is not bool:
            raise ValueError(f"Missing boolean answer: {key}")
    if not decisions.get("agentName") or not decisions.get("displayName"):
        raise ValueError("agentName and displayName are required (derive kebab-case from the supplied name).")
    if any(character in str(decisions["displayName"]) for character in "\r\n"):
        raise ValueError("The display name must be a single line.")
    resource_group = decisions.get("resourceGroup")
    if (not isinstance(resource_group, dict)
            or resource_group.get("mode") not in ("new", "existing")):
        raise ValueError("Confirm resourceGroup.mode (new/existing). All Azure resources are new in one group.")
    group_name = resource_group.get("name", "")
    if not isinstance(group_name, str) or (resource_group["mode"] == "existing" and not group_name.strip()):
        raise ValueError("Confirm the existing resourceGroup.name.")
    image = decisions.get("profileImage") or {}
    if not isinstance(image, dict) or image.get("mode") != "file" or not image.get("path"):
        raise ValueError("Supply the user's profile icon as profileImage={mode:file,path:...}.")
    styles = decisions.get("communicationStyle") or {}
    if not isinstance(styles, dict):
        raise ValueError("communicationStyle must be an object.")
    for audience in ("internal", "external"):
        style = styles.get(audience) or {}
        if not isinstance(style, dict) or style.get("tone") not in ("formal", "friendly") or type(style.get("emoji")) is not bool:
            raise ValueError(f"communicationStyle.{audience} requires tone and emoji.")


def approval(target: Path) -> dict:
    publication = json.loads((target / "autopilot-publication.json").read_text(encoding="utf-8"))
    evidence = json.loads((target / "autopilot-approval.json").read_text(encoding="utf-8"))
    for key in ("agentName", "version", "blueprintClientId", "teamsAppId", "titleId"):
        if not publication.get(key) or evidence.get(key) != publication[key]:
            raise ValueError(f"Approval is not bound to the published template: {key}")
    if evidence.get("templateType") != "Agent template" or not evidence.get("hiredUserId"):
        raise ValueError("M365 Type=Agent template and Teams hire must be verified in the integrated browser.")
    if evidence.get("frontierLicenseAssigned") is not True:
        raise ValueError("Assign Microsoft 365 Frontier for Autopilot to the hired user first.")
    return evidence


def write_state(target: Path, status: str, **values: object) -> None:
    target.mkdir(parents=True, exist_ok=True)
    (target / "first-stage-state.json").write_text(
        json.dumps({"status": status, **values}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--decisions", type=Path)
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--model", help="New chat model selected from the live catalogue")
    parser.add_argument("--model-version")
    parser.add_argument("--model-sku")
    parser.add_argument("--model-location")
    args = parser.parse_args()
    target = args.target.resolve()
    try:
        root = skill_root(target)
        sys.path.insert(0, str(root / "scripts"))
        scaffold = importlib.import_module("scaffold_ai_teammate")
        decisions_file = (args.decisions or target / "first-stage.decisions.json").resolve()
        decisions = scaffold.load_decisions(decisions_file)
        validate_decisions(decisions)
        decisions.update(hosting="foundry-autopilot", runtime="copilot-sdk", goal="d")
        decisions.setdefault("emailEnabled", True)
        scaffold.build_plan(decisions, target)
        scaffold.communication_style(decisions)
        if args.plan:
            print(json.dumps({"hosting": "foundry-autopilot", "goal": "d",
                              "infrastructure": "new-public",
                              "resourceGroup": decisions["resourceGroup"],
                              "steps": ["provision-new-public-foundry", "discover",
                                        "scaffold", "hub", "publish", "approve/hire",
                                        "instance", "logic-app", "Teams API + Hub acceptance"]}, indent=2))
            return 0

        env_path = target / ".env"

        def run(script: str, *arguments: str, cwd: Path = target) -> None:
            env = {**os.environ, **scaffold.load_dotenv(env_path), "PYTHONIOENCODING": "utf-8"}
            executable = shutil.which(script)
            command = ([sys.executable, str(root / "scripts" / script)] if script.endswith(".py")
                       else [executable or script])
            result = subprocess.run([*command, *arguments], cwd=cwd, env=env, check=False)
            if result.returncode:
                raise RuntimeError(f"{script} failed (exit {result.returncode}); first stage is NOT complete.")

        target.mkdir(parents=True, exist_ok=True)
        state_path = target / "first-stage-state.json"
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}
        if not args.resume or not (target / "autopilot-publication.json").is_file():
            if state and not args.resume:
                raise ValueError("A first-stage run exists. Use --resume; do not silently republish.")
            if state.get("status") not in ("scaffolded", "deploying"):
                if any(target.iterdir()) and not args.resume and not env_path.is_file():
                    raise ValueError("Use an empty target or an explicitly prepared .env; existing files are protected.")
                resource_group = decisions["resourceGroup"]
                group_values = {"AZURE_RESOURCE_GROUP_MODE": resource_group["mode"]}
                if resource_group.get("name"):
                    group_values["AZURE_RESOURCE_GROUP"] = resource_group["name"].strip()
                apply_decision_env(env_path, group_values)
                run("provision_foundry.py", "--env", str(env_path),
                    "--agent-name", decisions["agentName"], "--execute")
                model_args = [argument for flag, value in (
                    ("--model", args.model), ("--model-version", args.model_version),
                    ("--model-sku", args.model_sku), ("--model-location", args.model_location),
                ) if value for argument in (flag, value)]
                run("prepare_first_stage.py", "--env", str(env_path), "--execute",
                    "--new-foundation", *model_args)
                plan = scaffold.build_plan(decisions, target)
                scaffold.scaffold(plan, scaffold.load_dotenv(env_path), True, decisions, decisions_file.parent)
                scaffold.install_skills(scaffold.skills_root(plan), scaffold.load_dotenv(env_path), env_path)
                write_state(target, "scaffolded")
            write_state(target, "deploying")
            decision_values = scaffold.runtime_settings(scaffold.build_plan(decisions, target), decisions)
            apply_decision_env(env_path, decision_values)
            deploy_hub(root, target, scaffold.load_dotenv(env_path))
            if decisions["imageGenerationEnabled"]:
                run("provision_image_model.py", "--env", str(env_path), "--execute", "--shared-auth")
            # Preflight precedes the build; the generated deploy script also preflights before publish.
            run("publish_foundry_autopilot.py", "--env", str(env_path), "--check")
            run("powershell", "-NoProfile", "-File", str(target / "deploy.ps1"))
            write_state(target, "awaiting-approval-and-hire")
            print("Published request, NOT complete. Verify M365 Type=Agent template, approve, hire in Teams, "
                  "assign Frontier for Autopilot, record autopilot-approval.json, then run --resume.")
            return 2

        evidence = approval(target)
        sys.path.insert(0, str(root.parent / "standard" / "scripts"))
        os.environ.update(scaffold.load_dotenv(env_path))
        auth = importlib.import_module("auth_helper")
        graph = auth.get_session("https://graph.microsoft.com/.default")
        response = graph.get(f"https://graph.microsoft.com/beta/users/{evidence['hiredUserId']}", timeout=60)
        response.raise_for_status()
        user = response.json()
        if not user.get("identityParentId") or not user.get("userPrincipalName"):
            raise ValueError("The hired account is not an agent user.")
        run("setup_autopilot_instance.py", "--env", str(env_path), "--upn", user["userPrincipalName"], "--execute")
        run("provision_schedule_trigger.py", "--env", str(env_path), "--execute")
        run("test_first_stage.py", "--env", str(env_path), "--target", str(target), "--execute")
        run("run_regression_tests.py", "--env", str(env_path), "--target", str(target), "--check")
        run("setup_foundry_evaluation.py", "--env", str(env_path), "--check", "--mode", "scheduled")
        write_state(target, "passed")
        print("PASS: Teams API conversations, artifacts and matching Hub logs verified.")
        return 0
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        if target.is_dir() and not args.plan:
            state_file = target / "first-stage-state.json"
            previous = json.loads(state_file.read_text(encoding="utf-8")) if state_file.is_file() else {}
            write_state(target, previous.get("status", "blocked"), reason=str(exc))
        return 2


def apply_decision_env(path: Path, values: dict[str, str]) -> None:
    """An explicit answer wins over an old scaffold's feature switches, but not its credentials."""
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    remaining = dict(values)
    output = []
    for line in lines:
        key = line.partition("=")[0].strip()
        if key in values:
            output.append(f"{key}={values[key]}")
            remaining.pop(key, None)
        else:
            output.append(line)
    output.extend(f"{key}={value}" for key, value in remaining.items())
    path.write_text("\n".join(output) + "\n", encoding="utf-8")


def deploy_hub(root: Path, target: Path, env: dict[str, str]) -> None:
    """Reuse the same connection/predeploy path as self-hosting without deploying a self-host."""
    deploy = importlib.import_module("deploy_ai_teammate")
    app = target / "evaluation-app"
    deploy.write_evaluation_app_env(target, env)

    def execute(command: tuple[str, ...], name: str, cwd: Path) -> None:
        ok, output = deploy.run(list(command), cwd, name, env)
        print(output)
        if not ok:
            raise RuntimeError(f"{name} failed; Hub is not deployed.")

    if not (app / "node_modules").is_dir():
        execute(("npm", "install"), "Hub dependencies", app)
    if not env.get("PP_AUTH_ACCOUNT") or not env.get("PP_AUTH_EDGE_PROFILE"):
        raise ValueError("Code Apps authentication needs the approved account/Edge profile preferences.")
    execute((sys.executable, str(root.parent / "code-apps" / "scripts" / "setup_code_app_auth.py"),
             "--account", env["PP_AUTH_ACCOUNT"], "--edge-profile", env["PP_AUTH_EDGE_PROFILE"],
             "--approve-interactive"), "Hub authentication cache", app)
    execute((sys.executable, str(root / "scripts" / "setup_evaluation_dataverse.py"),
             "--env", str(target / ".env")), "Hub schema", target)
    if not (app / "power.config.json").is_file():
        execute(("npx", "pa", "app", "init", "--environment-id", env["ENV_ID"],
                 "--display-name", deploy._evaluation_app_display_name(env), "--app-type", "CodeApp", "--non-interactive"),
                "Hub initialization", app)
    config_file = app / "power.config.json"
    config = json.loads(config_file.read_text(encoding="utf-8"))
    if config.get("environmentId") != env["ENV_ID"]:
        raise ValueError("Hub power.config.json belongs to another Power Platform environment.")
    ok, output = deploy.run(["npx", "pa", "app", "list", "--json", "--non-interactive"], app, "Hub inventory", env)
    if not ok:
        raise RuntimeError("Cannot inventory Code Apps; refusing to create a duplicate Hub.")
    existing = select_hub(json.loads(output), deploy._evaluation_app_display_name(env), env.get("EVALUATION_APP_ID", ""))
    if existing:
        config["appId"] = existing
        config_file.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    execute((sys.executable, str(root.parent / "code-apps" / "scripts" / "setup_connection_reference.py"),
             "--write-env", str(target / ".env")), "Hub connection", app)
    env.update(deploy.load_dotenv(target / ".env"))
    for step in deploy.build_post_connection_steps(target, env, root):
        execute(step.command, step.name, step.cwd)


def select_hub(payload: object, display_name: str, pinned_id: str) -> str:
    if isinstance(payload, dict):
        payload = payload.get("apps", payload.get("value"))
    if not isinstance(payload, list):
        raise ValueError("Unrecognized Code Apps inventory JSON; verify existing Hub configuration before deployment.")
    matches = []
    for item in payload:
        if not isinstance(item, dict):
            raise ValueError("Invalid Code Apps inventory record.")
        properties = item.get("properties") or item
        name = properties.get("displayName")
        identifier = item.get("appId") or item.get("name")
        if not isinstance(name, str) or not isinstance(identifier, str):
            raise ValueError("Code Apps inventory must expose displayName and appId/name; refusing an ambiguous inventory.")
        if (pinned_id and identifier == pinned_id) or (not pinned_id and name == display_name):
            matches.append(identifier)
    if len(matches) > 1 or (pinned_id and not matches):
        raise ValueError("Existing Hub is ambiguous or the pinned app ID is not in this environment.")
    return matches[0] if matches else ""


if __name__ == "__main__":
    raise SystemExit(main())
