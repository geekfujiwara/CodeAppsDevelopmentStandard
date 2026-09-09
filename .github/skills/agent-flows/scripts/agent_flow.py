"""Plan, create, publish, run and inspect an isolated new-UI inline Agent flow."""

import argparse
import copy
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID, uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard/scripts"))

FLOW_SCOPE = "https://service.flow.microsoft.com/.default"
SELECT = "name,clientdata,category,type,modernflowtype,statecode,statuscode"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def validate_client(client):
    properties = client["properties"]
    definition = properties["definition"]
    if set(definition["triggers"]) != {"manual"} or set(definition["actions"]) != {"Agent"}:
        raise ValueError("Exactly one manual trigger and one Agent action required")
    trigger = definition["triggers"]["manual"]
    if trigger["type"] != "Request" or trigger["kind"] != "Button":
        raise ValueError("Request/Button trigger required")
    if trigger["inputs"]["schema"] != {"type": "object", "properties": {}, "required": []}:
        raise ValueError("Only input-free smoke triggers are supported")
    action = definition["actions"]["Agent"]
    host = action["inputs"]["host"]
    if action["type"] != "OpenApiConnection" or host != {
        "apiId": "/providers/Microsoft.PowerApps/apis/shared_agentnode",
        "connectionName": "shared_agentnode", "operationId": "InvokeDefinition"
    }:
        raise ValueError("Inline shared_agentnode/InvokeDefinition required")
    parameters = action["inputs"]["parameters"]
    if set(parameters) != {"body/botDefinition", "body/message"}:
        raise ValueError("Unexpected Agent parameters")
    bot = json.loads(parameters["body/botDefinition"])
    if set(bot) != {"model", "tools"} or bot["tools"] != [] or not bot["model"]:
        raise ValueError("Explicit model and empty tools required")
    associated = trigger["metadata"]["associatedData"]
    graph = associated["graph"]
    if sorted(node["type"] for node in graph["nodes"]) != ["agent", "start"]:
        raise ValueError("Only Start and inline Agent nodes supported")
    start = next(node for node in graph["nodes"] if node["type"] == "start")
    agent = next(node for node in graph["nodes"] if node["type"] == "agent")
    if start["id"] == agent["id"] or start["data"]["config"] != {"triggerType": "manual"}:
        raise ValueError("Distinct nodes and manual graph trigger required")
    edges = graph["edges"]
    if len(edges) != 1 or edges[0]["source"] != start["id"] or edges[0]["target"] != agent["id"]:
        raise ValueError("Start to Agent edge required")
    if associated["nodeActionMapping"] != {agent["id"]: ["Agent"]} or action["metadata"]["nodeId"] != agent["id"]:
        raise ValueError("Graph/runtime node mapping mismatch")
    config = agent["data"]["config"]
    if (config["mode"] != "inline" or config.get("botSchemaName") or config.get("instructions")
            or config.get("webSearchEnabled") or config.get("isHitlEscalationEnabled")
            or config["inlineModel"] != bot["model"] or config["outputMode"] != "text"
            or config["inlineInstructions"] != parameters["body/message"]
            or config["connectionName"] != "shared_agentnode"):
        raise ValueError("Inline graph settings differ from the runtime or enable additional capabilities")
    references = properties["connectionReferences"]
    if set(references) != {"shared_agentnode"} or graph["connectionReferences"] != references:
        raise ValueError("Graph/runtime connection references mismatch")
    reference = references["shared_agentnode"]
    if reference["api"]["name"] != "shared_agentnode" or reference["runtimeSource"] != "embedded":
        raise ValueError("Embedded agentnode connection required")
    logical = reference["connection"]["connectionReferenceLogicalName"]
    if not re.fullmatch(r"[A-Za-z0-9_]+", logical):
        raise ValueError("Invalid connection reference logical name")
    if definition.get("outputs") or action.get("runAfter"):
        raise ValueError("Unexpected output or action dependency")
    return logical


def build_client(source, name, message):
    validate_client(source)
    client = copy.deepcopy(source)
    definition = client["properties"]["definition"]
    graph = definition["triggers"]["manual"]["metadata"]["associatedData"]["graph"]
    graph["name"] = name
    next(node for node in graph["nodes"] if node["type"] == "agent")["data"]["config"]["inlineInstructions"] = message
    definition["actions"]["Agent"]["inputs"]["parameters"]["body/message"] = message
    validate_client(client)
    return client


def workflow_body(flow_id, name, client):
    validate_client(client)
    return {"workflowid": flow_id, "name": name, "category": 5, "type": 1,
            "modernflowtype": 1, "primaryentity": "none", "clientdata": json.dumps(client)}


def validate_workflow(actual, name, client, state):
    if (actual["name"] != name or json.loads(actual["clientdata"]) != client
            or actual["category"] != 5 or actual["type"] != 1
            or actual["modernflowtype"] != 1 or actual["statecode"] != state):
        raise ValueError("Workflow identity, new-UI discriminator, state or definition mismatch")
    validate_client(client)


def require_approval(plan, expected_hash):
    if not expected_hash or digest(plan) != expected_hash:
        raise ValueError("Plan changed or approval hash missing; create a fresh dry-run")


def classify_output(run_status, action_status, output, expected):
    if output.get("statusCode") == 442:
        return {"status": "runtime-policy-blocked", "httpStatus": 442}
    if run_status != "Succeeded" or action_status != "Succeeded":
        return {"status": "run-not-succeeded"}
    if "statusCode" in output and output["statusCode"] not in (200, 201):
        return {"status": "output-mismatch"}
    body = output.get("body", {})
    if not isinstance(body, dict):
        return {"status": "output-mismatch"}
    if "status" in body and body["status"] != "Completed":
        return {"status": "output-mismatch"}
    fields = [key for key in ("message", "result") if key in body]
    if len(fields) != 1 or (fields[0] == "result" and body.get("status") != "Completed"):
        return {"status": "output-mismatch"}
    message = body[fields[0]]
    try:
        actual = json.loads(message) if isinstance(message, str) else None
    except ValueError:
        actual = None
    return {"status": "output-verified" if digest(actual) == digest(expected) else "output-mismatch"}


def safe_output_url(url, environment):
    parsed = urlsplit(url)
    compact = str(UUID(environment)).replace("-", "")
    host = compact[:30] + "." + compact[30:] + ".environment.api.powerplatformusercontent.com"
    if parsed.scheme != "https" or parsed.hostname != host or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError("Output URL must use the verified environment content host")
    return url


class Api:
    def __init__(self, environment):
        from auth_helper import DATAVERSE_URL, get_session
        self.dataverse = DATAVERSE_URL.rstrip("/") + "/api/data/v9.2/"
        self.flow = ("https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/"
                     + environment + "/flows/")
        self.dv_session = get_session()
        self.flow_session = get_session(FLOW_SCOPE)

    def request(self, method, path, body=None, flow=False, solution=None):
        session = self.flow_session if flow else self.dv_session
        url = (self.flow if flow else self.dataverse) + path
        if flow:
            url += ("&" if "?" in url else "?") + "api-version=2016-11-01"
        headers = {"MSCRM.SolutionUniqueName": solution} if solution else {}
        response = session.request(method, url, json=body, headers=headers, timeout=120, allow_redirects=False)
        if not 200 <= response.status_code < 300:
            raise ValueError("API request failed: HTTP " + str(response.status_code))
        return response.json() if response.content else {}

    def workflow(self, flow_id):
        return self.request("GET", f"workflows({flow_id})?$select={SELECT}")


def main():
    from auth_helper import DATAVERSE_URL
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["create", "publish", "run", "inspect"])
    parser.add_argument("--report-file", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-hash")
    parser.add_argument("--run-id")
    args = parser.parse_args()
    if args.report_file.exists():
        parser.error("Report already exists; use a new path (never automatically retry a write)")
    environment = str(UUID(os.environ["ENV_ID"]))
    name = os.environ["AGENT_FLOW_NAME"]
    solution = os.environ["SOLUTION_NAME"]
    expected = json.loads(os.environ["AGENT_FLOW_EXPECTED_JSON"])
    if not isinstance(expected, dict) or not expected or len(json.dumps(expected)) > 4096:
        parser.error("Expected JSON must be a nonempty object of at most 4096 characters")
    message = ("Return only this exact JSON without markdown: " + json.dumps(expected)
               + ". Do not use tools, knowledge, web search, email, or human assistance.")
    api = Api(environment)
    report = {"status": "dry-run", "command": args.command}
    args.report_file.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")

    def snapshot():
        if args.command == "create":
            source_id = str(UUID(os.environ["AGENT_FLOW_SOURCE_ID"]))
            source = api.workflow(source_id)
            source_client = json.loads(source["clientdata"])
            validate_workflow(source, source["name"], source_client, source["statecode"])
            client = build_client(source_client, name, message)
            logical = validate_client(client)
            refs = api.request("GET", "connectionreferences?$filter=connectionreferencelogicalname eq '"
                               + logical + "'&$select=connectionreferenceid,connectionid,connectorid").get("value", [])
            if len(refs) != 1 or not refs[0].get("connectionid") or not refs[0]["connectorid"].endswith("/shared_agentnode"):
                raise ValueError("Unique agentnode connection reference required")
            embedded = client["properties"]["connectionReferences"]["shared_agentnode"].get("connectionName")
            if embedded and embedded != refs[0]["connectionid"]:
                raise ValueError("Embedded connection differs from connection reference")
            escaped = name.replace("'", "''")
            if api.request("GET", f"workflows?$filter=name eq '{escaped}'&$select=workflowid").get("value"):
                raise ValueError("Target already exists; no overwrite or delete supported")
            return {"command": args.command, "environment": environment, "dataverse": DATAVERSE_URL,
                    "solution": solution, "sourceId": source_id, "sourceHash": digest(source),
                    "reference": refs[0], "name": name, "clientdata": client}
        flow_id = str(UUID(os.environ["AGENT_FLOW_ID"]))
        actual = api.workflow(flow_id)
        client = json.loads(actual["clientdata"])
        validate_workflow(actual, name, client, 0 if args.command == "publish" else 1)
        if client != build_client(client, name, message):
            raise ValueError("Configured smoke instructions differ from target")
        return {"command": args.command, "environment": environment, "dataverse": DATAVERSE_URL,
                "flowId": flow_id, "workflowHash": digest(actual)}

    try:
        plan = snapshot()
        report.update(plan=plan, expectedHash=digest(plan))
        save()
        if args.command == "inspect":
            flow_id = plan["flowId"]
            if not args.run_id:
                runs = api.request("GET", flow_id + "/runs?$top=10", flow=True).get("value", [])
                report.update(status="history-read", runs=[{"id": run["name"], "status": run["properties"]["status"],
                              "startTime": run["properties"].get("startTime")} for run in runs])
            else:
                if not re.fullmatch(r"[A-Za-z0-9-]+", args.run_id):
                    raise ValueError("Invalid run ID")
                path = flow_id + "/runs/" + args.run_id
                run = api.request("GET", path, flow=True)["properties"]
                action = api.request("GET", path + "/actions/Agent", flow=True)["properties"]
                report.update(runId=args.run_id, runStatus=run["status"], actionStatus=action["status"])
                output = {}
                if action.get("outputsLink"):
                    url = safe_output_url(action["outputsLink"]["uri"], environment)
                    response = api.flow_session.get(url, headers={"Authorization": None}, timeout=120, allow_redirects=False)
                    if response.status_code != 200:
                        raise ValueError("Output download failed: HTTP " + str(response.status_code))
                    output = response.json()
                report.update(classify_output(run["status"], action["status"], output, expected))
        elif args.apply:
            require_approval(plan, args.expected_hash)
            require_approval(snapshot(), args.expected_hash)
            report["status"] = "write-request-pending"
            if args.command == "create":
                report["flowId"] = str(uuid4())
            save()
            if args.command == "create":
                flow_id = report["flowId"]
                api.request("POST", "workflows", workflow_body(flow_id, name, plan["clientdata"]), solution=solution)
                validate_workflow(api.workflow(flow_id), name, plan["clientdata"], 0)
                if digest(api.workflow(plan["sourceId"])) != plan["sourceHash"]:
                    raise ValueError("Source changed during create")
                report["status"] = "created-verified"
            elif args.command == "publish":
                before = api.workflow(plan["flowId"])
                api.request("PATCH", "workflows(" + plan["flowId"] + ")", {"statecode": 1, "statuscode": 2})
                validate_workflow(api.workflow(plan["flowId"]), name, json.loads(before["clientdata"]), 1)
                state = api.request("GET", plan["flowId"], flow=True)["properties"]["state"]
                if state != "Started":
                    raise ValueError("Flow has not reached Started")
                report["status"] = "published-verified"
            else:
                api.request("POST", plan["flowId"] + "/triggers/manual/run", {}, flow=True)
                report["status"] = "run-accepted"
        print(json.dumps({key: value for key, value in report.items() if key != "plan"}, indent=2))
        return 0 if report["status"] not in {"runtime-policy-blocked", "run-not-succeeded", "output-mismatch"} else 2
    except Exception as error:
        report.update(status="failed-or-unverified", errorType=type(error).__name__)
        print("Failed or unverified; inspect the report and resource before retrying.", file=sys.stderr)
        return 1
    finally:
        save()


if __name__ == "__main__":
    raise SystemExit(main())