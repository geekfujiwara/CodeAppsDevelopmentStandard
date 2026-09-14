#!/usr/bin/env python3
"""Show or update a Copilot Studio Standard agent model with an approved plan.

The Standard model is stored in the owning componenttype 15 YAML at
``aISettings.model.modelNameHint``. Plan generation binds the exact source YAML,
component identity, ETag, target model, and Dataverse origin. Apply fails closed
if any of them changed after approval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse


SCRIPT_DIR = Path(__file__).resolve().parent
STANDARD_SCRIPTS = SCRIPT_DIR.parents[1] / "standard" / "scripts"
sys.path.insert(0, str(STANDARD_SCRIPTS))
sys.path.insert(0, str(SCRIPT_DIR))

from auth_helper import DATAVERSE_URL, get_session  # noqa: E402
from standard_model_yaml import MODEL_NAME_PATTERN, current_model_name, set_model_name  # noqa: E402


CONTRACT = "copilot-studio-standard-model/2026-09-14"
PLAN_PATH = Path(".mcp/copilot-standard-model-update-plan.json")
GUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
OBSERVED_MODELS = ("GPT41", "GPT5Chat", "GPT55Chat", "Opus48", "Sonnet46", "opus4-1", "sonnet4-5")


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def canonical_hash(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def data_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_origin(value: str) -> str:
    parsed = urlparse(value.rstrip("/"))
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/"):
        raise ValueError("DATAVERSE_URL must be an HTTPS origin")
    return f"https://{parsed.hostname}"


def normalize_bot_id(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("BOT_ID must contain a GUID")
    match = GUID_PATTERN.search(value)
    if not match:
        raise ValueError("BOT_ID must contain a GUID")
    return match.group(0).lower()


def get_json(session: Any, url: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    response = session.get(url, params=params)
    response.raise_for_status()
    value = response.json()
    if not isinstance(value, dict):
        raise ValueError("Dataverse response must be an object")
    return value


def select_component(origin: str, bot_id: str, session: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    api = f"{origin}/api/data/v9.2"
    bot = get_json(session, f"{api}/bots({bot_id})", {"$select": "name,configuration"})
    try:
        configuration = json.loads(bot.get("configuration") or "{}")
    except json.JSONDecodeError as error:
        raise ValueError("Bot configuration is not valid JSON") from error
    default_schema = configuration.get("gPTSettings", {}).get("defaultSchemaName")
    result = get_json(
        session,
        f"{api}/botcomponents",
        {
            "$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
            "$select": "botcomponentid,name,schemaname,data",
        },
    )
    components = result.get("value")
    if not isinstance(components, list) or not components:
        raise ValueError("Standard agent has no componenttype 15 GPT component")
    if default_schema:
        matches = [item for item in components if item.get("schemaname") == default_schema]
        if len(matches) != 1:
            raise ValueError("defaultSchemaName does not identify exactly one GPT component")
        component = matches[0]
    elif len(components) == 1:
        component = components[0]
    else:
        raise ValueError("Multiple GPT components exist and configuration has no defaultSchemaName")
    if not isinstance(component.get("data"), str) or not component["data"]:
        raise ValueError("GPT component data is empty")
    if not isinstance(component.get("@odata.etag"), str) or not component["@odata.etag"]:
        raise ValueError("GPT component ETag is missing")
    return bot, component


def build_plan(origin: str, bot_id: str, model_name: str, session: Any) -> dict[str, Any]:
    origin = normalize_origin(origin)
    bot_id = normalize_bot_id(bot_id)
    if not MODEL_NAME_PATTERN.fullmatch(model_name):
        raise ValueError("Invalid Standard model name")
    bot, component = select_component(origin, bot_id, session)
    source_data = component["data"]
    target_data = set_model_name(source_data, model_name)
    component_id = normalize_bot_id(component["botcomponentid"])
    return validate_plan(
        {
            "contract": CONTRACT,
            "operation": "set-standard-model",
            "origin": origin,
            "method": "PATCH",
            "path": f"/api/data/v9.2/botcomponents({component_id})",
            "botId": bot_id,
            "botName": bot.get("name"),
            "componentId": component_id,
            "componentSchemaName": component.get("schemaname"),
            "sourceEtag": component["@odata.etag"],
            "sourceDataSha256": data_hash(source_data),
            "currentModel": current_model_name(source_data),
            "targetModel": model_name,
            "targetData": target_data,
            "targetDataSha256": data_hash(target_data),
            "readBack": {
                "path": f"/api/data/v9.2/botcomponents({component_id})",
                "model": model_name,
                "dataSha256": data_hash(target_data),
            },
        }
    )


def validate_plan(plan: dict[str, Any]) -> dict[str, Any]:
    expected_keys = {
        "contract", "operation", "origin", "method", "path", "botId", "botName",
        "componentId", "componentSchemaName", "sourceEtag", "sourceDataSha256", "currentModel",
        "targetModel", "targetData", "targetDataSha256", "readBack",
    }
    if set(plan) != expected_keys:
        raise ValueError("Plan fields do not match the Standard model contract")
    if plan["contract"] != CONTRACT or plan["operation"] != "set-standard-model":
        raise ValueError("Unsupported Standard model contract")
    string_fields = ("origin", "botName", "componentId", "componentSchemaName", "targetModel")
    if any(not isinstance(plan[key], str) or not plan[key] for key in string_fields):
        raise ValueError("Plan identity fields must be non-empty strings")
    if not isinstance(plan["readBack"], dict):
        raise ValueError("readBack must be an object")
    if plan["method"] != "PATCH" or plan["origin"] != normalize_origin(plan["origin"]):
        raise ValueError("Unexpected Standard model target")
    component_id = normalize_bot_id(plan["componentId"])
    normalize_bot_id(plan["botId"])
    expected_path = f"/api/data/v9.2/botcomponents({component_id})"
    if plan["path"] != expected_path or plan["readBack"].get("path") != expected_path:
        raise ValueError("Component path does not match componentId")
    if not isinstance(plan["sourceEtag"], str) or not re.fullmatch(r'W/"[^"\r\n]+"', plan["sourceEtag"]):
        raise ValueError("sourceEtag is invalid")
    if not all(re.fullmatch(r"[0-9a-f]{64}", plan[key] or "") for key in ("sourceDataSha256", "targetDataSha256")):
        raise ValueError("Data hashes are invalid")
    if not MODEL_NAME_PATTERN.fullmatch(plan["targetModel"]):
        raise ValueError("targetModel is invalid")
    if not isinstance(plan["targetData"], str) or data_hash(plan["targetData"]) != plan["targetDataSha256"]:
        raise ValueError("targetData does not match its hash")
    if current_model_name(plan["targetData"]) != plan["targetModel"]:
        raise ValueError("targetData does not contain targetModel")
    if plan["readBack"] != {
        "path": expected_path,
        "model": plan["targetModel"],
        "dataSha256": plan["targetDataSha256"],
    }:
        raise ValueError("Unexpected read-back contract")
    return plan


def load_approved_plan(path: Path, expected_hash: str) -> dict[str, Any]:
    plan = validate_plan(json.loads(path.read_text(encoding="utf-8")))
    if not expected_hash or canonical_hash(plan) != expected_hash.lower():
        raise ValueError("Plan changed or approval hash is missing")
    return plan


def apply_plan(plan: dict[str, Any], configured_origin: str, session: Any) -> None:
    validate_plan(plan)
    if plan["origin"] != normalize_origin(configured_origin):
        raise ValueError("Approved plan origin does not match DATAVERSE_URL")
    _, component = select_component(plan["origin"], plan["botId"], session)
    if normalize_bot_id(component["botcomponentid"]) != plan["componentId"]:
        raise ValueError("Owning GPT component changed after approval")
    if component["@odata.etag"] != plan["sourceEtag"] or data_hash(component["data"]) != plan["sourceDataSha256"]:
        raise ValueError("GPT component changed after approval; create a new plan")
    response = session.patch(
        f"{plan['origin']}{plan['path']}",
        json={"data": plan["targetData"]},
        headers={"If-Match": plan["sourceEtag"]},
    )
    response.raise_for_status()
    after = get_json(session, f"{plan['origin']}{plan['readBack']['path']}", {"$select": "data"})
    if data_hash(after.get("data", "")) != plan["readBack"]["dataSha256"]:
        raise RuntimeError("Standard model read-back data hash mismatch")
    if current_model_name(after["data"]) != plan["readBack"]["model"]:
        raise RuntimeError("Standard model read-back value mismatch")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    show = subparsers.add_parser("show")
    show.add_argument("--bot-id", required=True)
    show.add_argument("--origin", default=DATAVERSE_URL, required=not DATAVERSE_URL)
    plan = subparsers.add_parser("plan")
    plan.add_argument("--bot-id", required=True)
    plan.add_argument("--model", required=True)
    plan.add_argument("--origin", default=DATAVERSE_URL, required=not DATAVERSE_URL)
    plan.add_argument("--output", type=Path, default=PLAN_PATH)
    apply = subparsers.add_parser("apply")
    apply.add_argument("--plan", type=Path, default=PLAN_PATH)
    apply.add_argument("--expected-hash", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    session = get_session()
    if args.command == "show":
        bot, component = select_component(normalize_origin(args.origin), normalize_bot_id(args.bot_id), session)
        print(json.dumps({
            "botName": bot.get("name"),
            "componentSchemaName": component.get("schemaname"),
            "model": current_model_name(component["data"]),
        }, ensure_ascii=False, indent=2))
        return
    if args.command == "plan":
        plan = build_plan(args.origin, args.bot_id, args.model, session)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Plan: {args.output}")
        print(f"Current model: {plan['currentModel']}")
        print(f"Target model: {plan['targetModel']}")
        if plan["targetModel"] not in OBSERVED_MODELS:
            print("WARNING: target model has not been observed in this Standard environment")
        print(f"Approval SHA-256: {canonical_hash(plan)}")
        print("DRY-RUN: no changes made")
        return
    plan = load_approved_plan(args.plan, args.expected_hash)
    apply_plan(plan, DATAVERSE_URL, session)
    print(f"Updated Standard model: {plan['currentModel']} -> {plan['targetModel']}")
    print("Republish the agent to make the draft model selection live.")


if __name__ == "__main__":
    main()