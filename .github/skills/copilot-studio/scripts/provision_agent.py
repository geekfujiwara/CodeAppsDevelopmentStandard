"""Provision a classic Copilot Studio agent with the UI-observed Dataverse contract.

Create and review a plan first, then apply the exact approved hash:

  python provision_agent.py plan --name "Sample agent" --schema prefix_SampleAgent
  python provision_agent.py apply --plan .mcp/copilot-studio-v1-agent-plan.json \
      --expected-hash <sha256>
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

_SCRIPT_DIR = Path(__file__).resolve().parent
_STANDARD_SCRIPTS = _SCRIPT_DIR.parents[1] / "standard" / "scripts"
sys.path.insert(0, str(_STANDARD_SCRIPTS))

from auth_helper import DATAVERSE_URL, get_session  # noqa: E402
from generate_icon_png import draw_agent_icon  # noqa: E402

CONTRACT = "copilot-studio-v1-agent-provision/2026-09-14"
TEMPLATE = "default-2.1.0"
PLAN_PATH = Path(".mcp/copilot-studio-v1-agent-plan.json")
SCHEMA_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{1,99}$")


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def canonical_hash(plan: dict) -> str:
    return hashlib.sha256(canonical_json(plan).encode("utf-8")).hexdigest()


def normalize_origin(value: str) -> str:
    parsed = urlparse(value.rstrip("/"))
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/"):
        raise ValueError("DATAVERSE_URL must be an HTTPS origin")
    return f"https://{parsed.hostname}"


def build_configuration(name: str) -> dict:
    return {
        "categories": [],
        "channels": [],
        "settings": {
            "GenerativeActionsEnabled": True,
            TEMPLATE: {
                "spec": {"connectors": []},
                "content": {
                    "displayName": name,
                    "description": "",
                    "instructions": "",
                    "conversationStarters": [],
                    "capabilities": {
                        "diagnostics": [],
                        "webBrowsing": True,
                        "$kind": "GptCapabilities",
                    },
                },
            },
        },
        "memoryParameters": [],
        "diagnostics": [],
        "$kind": "BotConfiguration",
        "isAgentConnectable": True,
        "aISettings": {
            "diagnostics": [],
            "$kind": "AISettings",
            "useModelKnowledge": True,
            "isSemanticSearchEnabled": True,
            "isFileAnalysisEnabled": True,
            "optInUseLatestModels": False,
        },
    }


def default_icon() -> bytes:
    from io import BytesIO

    output = BytesIO()
    draw_agent_icon(240).save(output, format="PNG", optimize=True)
    return output.getvalue()


def build_plan(origin: str, solution: str, name: str, schema: str, language: int, icon: bytes) -> dict:
    plan = {
        "contract": CONTRACT,
        "operation": "provision-standard-agent",
        "method": "POST",
        "origin": normalize_origin(origin),
        "path": "/api/data/v9.2/bots?$select=botid",
        "solutionName": solution,
        "body": {
            "configuration": build_configuration(name),
            "name": name,
            "language": language,
            "schemaname": schema,
            "template": TEMPLATE,
            "accesscontrolpolicy": 1,
            "authenticationmode": 2,
            "authenticationtrigger": 1,
            "iscustomizable": {"Value": False},
        },
        "icon": {
            "sha256": hashlib.sha256(icon).hexdigest(),
            "size": len(icon),
        },
        "readBack": {"requiredComponentTypes": [9, 15]},
    }
    return validate_plan(plan)


def validate_plan(plan: dict) -> dict:
    if plan.get("contract") != CONTRACT or plan.get("operation") != "provision-standard-agent":
        raise ValueError("Unsupported provisioning contract")
    if plan.get("method") != "POST" or plan.get("path") != "/api/data/v9.2/bots?$select=botid":
        raise ValueError("Unexpected provisioning endpoint")
    normalize_origin(plan.get("origin", ""))
    if not plan.get("solutionName"):
        raise ValueError("solutionName is required")
    body = plan.get("body")
    expected_keys = {
        "configuration", "name", "language", "schemaname", "template",
        "accesscontrolpolicy", "authenticationmode", "authenticationtrigger", "iscustomizable",
    }
    if not isinstance(body, dict) or set(body) != expected_keys:
        raise ValueError("Provisioning body fields do not match the observed contract")
    if not body["name"].strip() or not SCHEMA_PATTERN.fullmatch(body["schemaname"]):
        raise ValueError("Agent name and schema are required; schema must be alphanumeric with underscores")
    if not isinstance(body["language"], int) or body["language"] <= 0:
        raise ValueError("language must be a positive LCID")
    fixed = {
        "template": TEMPLATE,
        "accesscontrolpolicy": 1,
        "authenticationmode": 2,
        "authenticationtrigger": 1,
        "iscustomizable": {"Value": False},
    }
    if any(body[key] != value for key, value in fixed.items()):
        raise ValueError("Fixed provisioning values differ from the observed Standard agent contract")
    if body["configuration"] != build_configuration(body["name"]):
        raise ValueError("BotConfiguration differs from the observed Standard agent contract")
    icon = plan.get("icon", {})
    if not re.fullmatch(r"[0-9a-f]{64}", icon.get("sha256", "")) or not 0 < icon.get("size", 0) < 100_000:
        raise ValueError("Invalid icon approval metadata")
    if plan.get("readBack") != {"requiredComponentTypes": [9, 15]}:
        raise ValueError("Unexpected provisioning read-back contract")
    return plan


def load_approved_plan(path: Path, expected_hash: str) -> dict:
    plan = validate_plan(json.loads(path.read_text(encoding="utf-8")))
    if not expected_hash or canonical_hash(plan) != expected_hash.lower():
        raise ValueError("Plan changed or approval hash is missing")
    return plan


def assert_runtime_target(plan: dict, configured_origin: str) -> None:
    if plan["origin"] != normalize_origin(configured_origin):
        raise ValueError("Approved plan origin does not match DATAVERSE_URL")


def odata_literal(value: str) -> str:
    return value.replace("'", "''")


def apply_plan(plan: dict, icon: bytes, timeout: int = 180) -> str:
    assert_runtime_target(plan, DATAVERSE_URL)
    if hashlib.sha256(icon).hexdigest() != plan["icon"]["sha256"] or len(icon) != plan["icon"]["size"]:
        raise ValueError("Icon differs from the approved plan")
    session = get_session()
    api = f"{plan['origin']}/api/data/v9.2"
    schema = odata_literal(plan["body"]["schemaname"])
    duplicate = session.get(
        f"{api}/bots",
        params={"$filter": f"schemaname eq '{schema}'", "$select": "botid"},
    )
    duplicate.raise_for_status()
    if duplicate.json().get("value"):
        raise RuntimeError("An agent with the approved schema already exists")

    body = dict(plan["body"])
    body["configuration"] = json.dumps(body["configuration"], ensure_ascii=False, separators=(",", ":"))
    body["iconbase64"] = base64.b64encode(icon).decode("ascii")
    response = session.post(
        f"{plan['origin']}{plan['path']}",
        json=body,
        headers={"Prefer": "return=representation", "MSCRM.SolutionName": plan["solutionName"]},
    )
    response.raise_for_status()
    bot_id = response.json()["botid"]

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        components = session.get(
            f"{api}/botcomponents",
            params={
                "$filter": f"_parentbotid_value eq {bot_id}",
                "$select": "componenttype",
            },
        )
        components.raise_for_status()
        component_types = {row.get("componenttype") for row in components.json().get("value", [])}
        if {9, 15}.issubset(component_types):
            return bot_id
        time.sleep(6)
    raise TimeoutError(f"Agent {bot_id} did not provision required components within {timeout} seconds")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("--name", default=os.getenv("AGENT_NAME"), required=not os.getenv("AGENT_NAME"))
    plan_parser.add_argument("--schema", default=os.getenv("BOT_SCHEMA"), required=not os.getenv("BOT_SCHEMA"))
    plan_parser.add_argument("--language", type=int, default=int(os.getenv("AGENT_LANGUAGE", "1041")))
    plan_parser.add_argument("--solution", default=os.getenv("SOLUTION_NAME"), required=not os.getenv("SOLUTION_NAME"))
    plan_parser.add_argument("--origin", default=DATAVERSE_URL, required=not DATAVERSE_URL)
    plan_parser.add_argument("--output", type=Path, default=PLAN_PATH)
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--plan", type=Path, default=PLAN_PATH)
    apply_parser.add_argument("--expected-hash", required=True)
    apply_parser.add_argument("--timeout", type=int, default=180)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    icon = default_icon()
    if args.command == "plan":
        plan = build_plan(args.origin, args.solution, args.name, args.schema, args.language, icon)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Plan: {args.output}")
        print(f"Approval SHA-256: {canonical_hash(plan)}")
        return
    plan = load_approved_plan(args.plan, args.expected_hash)
    bot_id = apply_plan(plan, icon, args.timeout)
    print(f"Provisioned agent: {bot_id}")


if __name__ == "__main__":
    main()