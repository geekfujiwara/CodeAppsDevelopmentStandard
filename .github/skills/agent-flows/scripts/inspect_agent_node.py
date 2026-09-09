"""Read-only, experimental existing-agent discovery. Never invokes an agent."""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

CONNECTOR = "/providers/Microsoft.PowerApps/apis/shared_agentnode"
METADATA_SCOPE = "https://service.powerapps.com/.default"
RUNTIME_SCOPE = "https://apihub.azure.com/.default"
LIST_PATH = "/{connectionId}/powerautomate/agentnodes/agents"
INVOKE_PATH = "/{connectionId}/powerautomate/agentnodes/conversations"


class ApiFailure(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__(f"HTTP {status}")


def get_json(session, url, **kwargs):
    response = session.get(url, timeout=90, allow_redirects=False, **kwargs)
    if response.status_code != 200:
        raise ApiFailure(response.status_code)
    value = response.json()
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    return value


def validate_runtime_url(value, environment):
    environment = str(UUID(environment))
    parsed = urlsplit(value)
    host_pattern = re.escape(environment) + r"\.[a-z0-9-]+\.common\.[a-z0-9-]+\.azure-apihub\.net"
    if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.query
            or parsed.fragment or parsed.port not in (None, 443)
            or not re.fullmatch(host_pattern, parsed.hostname or "")
            or parsed.path != "/apim/agentnode"):
        raise ValueError("Runtime URL is outside the observed environment-bound contract")
    return value.rstrip("/")


def validate_operations(swagger):
    paths = swagger["paths"]
    if paths[LIST_PATH]["get"]["operationId"] != "ListAgents":
        raise ValueError("ListAgents contract changed")
    operation = paths[INVOKE_PATH]["post"]
    bodies = [parameter for parameter in operation["parameters"] if parameter.get("in") == "body"]
    if (operation["operationId"] != "InvokeAgent" or len(bodies) != 1
            or not {"agentId", "prompt"}.issubset(bodies[0]["schema"].get("required", []))):
        raise ValueError("InvokeAgent contract changed")


def resolve_agent(payload, bot):
    collections = [payload[key] for key in ("agents", "entities") if key in payload]
    if len(collections) != 1 or not isinstance(collections[0], list) or payload.get("moreRecords"):
        raise ValueError("Ambiguous, incomplete or unknown ListAgents response")
    entries = collections[0]
    matches = [entry for entry in entries if isinstance(entry, dict)
               and entry.get("agentName") == bot["name"]
               and entry.get("agentId") in (bot["botid"], bot["schemaname"])]
    if len(matches) != 1:
        raise ValueError("Expected exactly one matching agent ID and name")
    return matches[0]["agentId"]


def inspect_agent(environment, bot_id, bot_name, reference_name, dataverse_url, session_factory):
    report = {"status": "started", "stage": "input", "runtimeValidated": False, "agentInvoked": False}
    try:
        environment, bot_id = str(UUID(environment)), str(UUID(bot_id))
        if not bot_name or not reference_name:
            raise ValueError("Expected bot name and connection reference")
        api = dataverse_url.rstrip("/") + "/api/data/v9.2/"
        dataverse = session_factory()
        report["stage"] = "bot-identity"
        bot = get_json(dataverse, api + f"bots({bot_id})", params={
            "$select": "botid,name,schemaname,template"})
        if bot["botid"] != bot_id or bot["name"] != bot_name or bot["template"] != "cliagent-1.0.0":
            raise ValueError("Bot identity mismatch")
        report["stage"] = "connection-reference"
        references = get_json(dataverse, api + "connectionreferences", params={
            "$select": "connectionid,connectorid",
            "$filter": "connectionreferencelogicalname eq '" + reference_name.replace("'", "''") + "'"})
        if len(references.get("value", [])) != 1 or references.get("@odata.nextLink"):
            raise ValueError("Expected one complete connection reference result")
        reference = references["value"][0]
        if reference["connectorid"] != CONNECTOR:
            raise ValueError("Wrong connector")
        connection = reference["connectionid"].rsplit("/", 1)[-1]
        if not re.fullmatch(r"[a-zA-Z0-9-]+", connection):
            raise ValueError("Invalid connection ID")
        report["stage"] = "connector-metadata"
        connector = get_json(session_factory(METADATA_SCOPE), "https://api.powerapps.com" + CONNECTOR,
                             params={"api-version": "2016-11-01", "$filter": f"environment eq '{environment}'"})
        properties = connector["properties"]
        validate_operations(properties["swagger"])
        base = validate_runtime_url(properties["primaryRuntimeUrl"], environment)
        report["stage"] = "list-agents"
        payload = get_json(session_factory(RUNTIME_SCOPE), base + LIST_PATH.replace("{connectionId}", connection))
        resolve_agent(payload, bot)
        report["status"] = "target-verified"
    except ApiFailure as error:
        report.update(status="runtime-policy-blocked" if error.status == 442 else "http-error", httpStatus=error.status)
    except (ValueError, KeyError, TypeError, AttributeError):
        report["status"] = "contract-mismatch"
    except Exception:
        report["status"] = "request-failed"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-file", type=Path, required=True)
    args = parser.parse_args()
    if args.report_file.exists():
        parser.error("Report exists; use a new path")
    from auth_helper import DATAVERSE_URL, get_session
    report = inspect_agent(os.environ.get("ENV_ID", ""), os.environ.get("AGENT_FLOW_BOT_ID", ""),
                           os.environ.get("AGENT_FLOW_BOT_NAME", ""),
                           os.environ.get("AGENT_FLOW_CONNECTION_REFERENCE", ""), DATAVERSE_URL, get_session)
    report["checkedAt"] = datetime.now(timezone.utc).isoformat()
    args.report_file.parent.mkdir(parents=True, exist_ok=True)
    with args.report_file.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "target-verified" else 2


if __name__ == "__main__":
    raise SystemExit(main())