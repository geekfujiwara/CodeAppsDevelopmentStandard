"""Plan and run one approval-bound existing-Agent smoke invocation."""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from inspect_agent_node import (CONNECTOR, INVOKE_PATH, LIST_PATH, METADATA_SCOPE, RUNTIME_SCOPE,
                                get_json, resolve_agent, validate_operations, validate_runtime_url)


CONTRACT = "agent-flow-existing-agent-smoke/2026-09-14"
PLAN_PATH = Path(".local/agent-flow/invoke-plan.json")
NONCE_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")
ETAG_PATTERN = re.compile(r'^W/"[^"\r\n]+"$')


def canonical_json(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def normalize_origin(value):
    from urllib.parse import urlsplit
    parsed = urlsplit(value.rstrip("/"))
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/"):
        raise ValueError("DATAVERSE_URL must be an HTTPS origin")
    return "https://" + parsed.hostname


def build_request(agent_id, nonce):
    if not NONCE_PATTERN.fullmatch(nonce):
        raise ValueError("Nonce must be 8-64 ASCII letters, numbers or hyphens")
    expected = {"probe": nonce}
    return expected, {
        "agentId": agent_id,
        "prompt": ("Return only this exact JSON object: " + canonical_json(expected)
                   + ". Do not call tools, use knowledge, browse, create files, send messages, "
                     "change data, or ask a human."),
        "isHitlEscalationEnabled": False,
        "outputSchema": {
            "type": "object",
            "properties": {"probe": {"type": "string"}},
            "required": ["probe"],
            "additionalProperties": False,
        },
    }


def discover(environment, bot_id, bot_name, reference_name, origin, session_factory):
    environment, bot_id = str(UUID(environment)), str(UUID(bot_id))
    if not bot_name or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", reference_name or ""):
        raise ValueError("Expected bot name and connection-reference logical name")
    origin = normalize_origin(origin)
    api = origin + "/api/data/v9.2/"
    dataverse = session_factory()
    bot = get_json(dataverse, api + "bots(" + bot_id + ")", params={
        "$select": "botid,name,schemaname,template"})
    if (bot.get("botid") != bot_id or bot.get("name") != bot_name
            or bot.get("template") != "cliagent-1.0.0"
            or not ETAG_PATTERN.fullmatch(bot.get("@odata.etag", ""))):
        raise ValueError("Bot identity or ETag mismatch")
    references = get_json(dataverse, api + "connectionreferences", params={
        "$select": "connectionid,connectorid",
        "$filter": "connectionreferencelogicalname eq '" + reference_name.replace("'", "''") + "'"})
    if len(references.get("value", [])) != 1 or references.get("@odata.nextLink"):
        raise ValueError("Expected one complete connection reference result")
    reference = references["value"][0]
    if (not isinstance(reference, dict) or reference.get("connectorid") != CONNECTOR
            or not ETAG_PATTERN.fullmatch(reference.get("@odata.etag", ""))):
        raise ValueError("Connection reference identity or ETag mismatch")
    connection_id = str(reference.get("connectionid", "")).rsplit("/", 1)[-1]
    if not re.fullmatch(r"[A-Za-z0-9-]+", connection_id):
        raise ValueError("Invalid connection ID")
    connector = get_json(session_factory(METADATA_SCOPE), "https://api.powerapps.com" + CONNECTOR,
                         params={"api-version": "2016-11-01", "$filter": f"environment eq '{environment}'"})
    properties = connector["properties"]
    validate_operations(properties["swagger"])
    runtime_base = validate_runtime_url(properties["primaryRuntimeUrl"], environment)
    runtime = session_factory(RUNTIME_SCOPE)
    agents = get_json(runtime, runtime_base + "/" + connection_id + "/powerautomate/agentnodes/agents")
    agent_id = resolve_agent(agents, bot)
    if agent_id != bot.get("schemaname"):
        raise ValueError("Observed existing-Agent runtime ID must equal bot schema name")
    return {
        "environment": environment,
        "origin": origin,
        "botId": bot_id,
        "botName": bot_name,
        "botSchemaName": bot["schemaname"],
        "botEtag": bot["@odata.etag"],
        "connectionReference": reference_name,
        "connectionReferenceEtag": reference["@odata.etag"],
        "runtimeBase": runtime_base,
        "path": INVOKE_PATH.replace("{connectionId}", connection_id),
        "agentId": agent_id,
    }, runtime


def build_plan(environment, bot_id, bot_name, reference_name, nonce, origin, session_factory):
    target, _ = discover(environment, bot_id, bot_name, reference_name, origin, session_factory)
    expected, request = build_request(target["agentId"], nonce)
    return {"contract": CONTRACT, "operation": "invoke-existing-agent-smoke",
            **target, "request": request, "expected": expected}


def validate_plan(plan):
    expected_keys = {"contract", "operation", "environment", "origin", "botId", "botName",
                     "botSchemaName", "botEtag", "connectionReference", "connectionReferenceEtag",
                     "runtimeBase", "path", "agentId", "request", "expected"}
    if not isinstance(plan, dict) or set(plan) != expected_keys:
        raise ValueError("Plan fields do not match the smoke contract")
    if plan["contract"] != CONTRACT or plan["operation"] != "invoke-existing-agent-smoke":
        raise ValueError("Unsupported smoke contract")
    if str(UUID(plan["environment"])) != plan["environment"] or str(UUID(plan["botId"])) != plan["botId"]:
        raise ValueError("Plan IDs are not canonical UUIDs")
    if plan["origin"] != normalize_origin(plan["origin"]):
        raise ValueError("Plan origin is invalid")
    if plan["agentId"] != plan["botSchemaName"] or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", plan["agentId"]):
        raise ValueError("Plan agent identity is invalid")
    if not all(ETAG_PATTERN.fullmatch(plan.get(key, "")) for key in ("botEtag", "connectionReferenceEtag")):
        raise ValueError("Plan ETags are invalid")
    nonce = plan.get("expected", {}).get("probe") if isinstance(plan.get("expected"), dict) else None
    expected, request = build_request(plan["agentId"], nonce or "")
    if plan["expected"] != expected or plan["request"] != request:
        raise ValueError("Plan request or expected output changed")
    expected_path = INVOKE_PATH.replace("{connectionId}", plan["path"].split("/", 2)[1])
    if plan["path"] != expected_path or validate_runtime_url(plan["runtimeBase"], plan["environment"]) != plan["runtimeBase"]:
        raise ValueError("Plan runtime target is invalid")
    return plan


def apply_plan(plan, expected_hash, configured_origin, session_factory):
    validate_plan(plan)
    if not expected_hash or digest(plan) != expected_hash.lower():
        raise ValueError("Plan changed or approval hash missing")
    if plan["origin"] != normalize_origin(configured_origin):
        raise ValueError("Approved origin differs from DATAVERSE_URL")
    current, runtime = discover(plan["environment"], plan["botId"], plan["botName"],
                                plan["connectionReference"], configured_origin, session_factory)
    target_keys = set(current)
    if any(plan[key] != current[key] for key in target_keys):
        raise ValueError("Agent target changed after approval")
    response = runtime.post(plan["runtimeBase"] + plan["path"], json=plan["request"],
                            timeout=120, allow_redirects=False)
    if response.status_code == 202:
        return {"status": "accepted-unverified", "httpStatus": 202, "fileCount": None,
                "agentInvoked": True, "runtimeValidated": False}
    if response.status_code != 201:
        raise ValueError("InvokeAgent failed: HTTP " + str(response.status_code))
    try:
        payload = response.json()
    except (TypeError, ValueError) as error:
        raise ValueError("InvokeAgent HTTP 201 body is not valid JSON") from error
    if (not isinstance(payload, dict) or set(payload) - {"result", "structuredOutput", "files"}
            or payload.get("structuredOutput") != plan["expected"]
            or payload.get("files") != []):
        raise ValueError("Agent output did not match the approved structured smoke response")
    return {"status": "output-verified", "httpStatus": 201, "fileCount": 0,
            "agentInvoked": True, "runtimeValidated": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("--nonce", required=True)
    plan_parser.add_argument("--output", type=Path, default=PLAN_PATH)
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--plan", type=Path, default=PLAN_PATH)
    apply_parser.add_argument("--expected-hash", required=True)
    args = parser.parse_args()
    from auth_helper import DATAVERSE_URL, get_session
    if args.command == "plan":
        plan = build_plan(os.environ["ENV_ID"], os.environ["AGENT_FLOW_BOT_ID"],
                          os.environ["AGENT_FLOW_BOT_NAME"], os.environ["AGENT_FLOW_CONNECTION_REFERENCE"],
                          args.nonce, DATAVERSE_URL, get_session)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
        print("Plan:", args.output)
        print("Approval SHA-256:", digest(plan))
        print("DRY-RUN: agent was not invoked")
        return 0
    plan = validate_plan(json.loads(args.plan.read_text(encoding="utf-8")))
    result = apply_plan(plan, args.expected_hash, DATAVERSE_URL, get_session)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "output-verified" else 2


if __name__ == "__main__":
    raise SystemExit(main())