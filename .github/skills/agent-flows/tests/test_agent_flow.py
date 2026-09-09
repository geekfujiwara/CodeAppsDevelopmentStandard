import copy
import contextlib
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from agent_flow import build_client, classify_output, digest, main, require_approval, safe_output_url, validate_client, validate_workflow, workflow_body


def fixture():
    refs = {"shared_agentnode": {"api": {"name": "shared_agentnode"}, "runtimeSource": "embedded",
                               "connection": {"connectionReferenceLogicalName": "sample_reference"}}}
    config = {"mode": "inline", "inlineModel": "sample-model", "inlineInstructions": "old",
              "outputMode": "text", "connectionName": "shared_agentnode"}
    graph = {"name": "source", "nodes": [
        {"id": "start", "type": "start", "data": {"config": {"triggerType": "manual"}}},
        {"id": "agent", "type": "agent", "data": {"config": config}}],
        "edges": [{"source": "start", "target": "agent"}], "connectionReferences": refs}
    return {"properties": {"connectionReferences": refs, "definition": {
        "triggers": {"manual": {"type": "Request", "kind": "Button", "inputs": {
            "schema": {"type": "object", "properties": {}, "required": []}}, "metadata": {
                "associatedData": {"graph": graph, "nodeActionMapping": {"agent": ["Agent"]}}}}},
        "actions": {"Agent": {"type": "OpenApiConnection", "metadata": {"nodeId": "agent"}, "inputs": {
            "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_agentnode", "connectionName": "shared_agentnode", "operationId": "InvokeDefinition"},
            "parameters": {"body/botDefinition": json.dumps({"model": "sample-model", "tools": []}), "body/message": "old"}}}}, "outputs": {}}}}


class AgentFlowTests(unittest.TestCase):
    def test_clone_and_readback(self):
        source = fixture()
        before = copy.deepcopy(source)
        client = build_client(source, "new", "new message")
        self.assertEqual(source, before)
        actual = dict(workflow_body("sample-id", "new", client), statecode=0)
        validate_workflow(actual, "new", client, 0)
        for key, value in [("modernflowtype", 0), ("statecode", 1), ("category", 0), ("name", "other")]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_workflow(dict(actual, **{key: value}), "new", client, 0)

    def test_graph_runtime_mismatch_rejected(self):
        for mutation in ["model", "mapping", "tools", "edge", "web", "extra-action", "reference"]:
            source = fixture()
            definition = source["properties"]["definition"]
            associated = definition["triggers"]["manual"]["metadata"]["associatedData"]
            config = associated["graph"]["nodes"][1]["data"]["config"]
            if mutation == "model":
                config["inlineModel"] = "other"
            elif mutation == "mapping":
                associated["nodeActionMapping"] = {}
            elif mutation == "tools":
                definition["actions"]["Agent"]["inputs"]["parameters"]["body/botDefinition"] = '{"model":"sample-model","tools":[{}]}'
            elif mutation == "edge":
                associated["graph"]["edges"][0]["target"] = "start"
            elif mutation == "web":
                config["webSearchEnabled"] = True
            elif mutation == "reference":
                associated["graph"]["connectionReferences"] = {}
            else:
                definition["actions"]["Other"] = {}
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_client(source)

    def test_approval_binds_scope_and_definition(self):
        plan = {"environment": "sample", "clientdata": fixture()}
        require_approval(plan, digest(plan))
        with self.assertRaises(ValueError):
            require_approval(dict(plan, environment="other"), digest(plan))
        with self.assertRaises(ValueError):
            require_approval(plan, None)

    def test_output_requires_success_and_exact_json(self):
        expected = {"ok": True}
        self.assertEqual(classify_output("Succeeded", "Succeeded", {"body": {"message": '{"ok":true}'}}, expected)["status"], "output-verified")
        for message in ['{"ok":1}', '```json\n{"ok":true}\n```', '{}']:
            self.assertEqual(classify_output("Succeeded", "Succeeded", {"body": {"message": message}}, expected)["status"], "output-mismatch")
        self.assertEqual(classify_output("Running", "Succeeded", {}, expected)["status"], "run-not-succeeded")
        self.assertEqual(classify_output("Failed", "Failed", {"statusCode": 442}, expected)["status"], "runtime-policy-blocked")

    def test_output_host_is_environment_bound(self):
        environment = "00000000-0000-0000-0000-000000000000"
        url = "https://" + "0" * 30 + ".00.environment.api.powerplatformusercontent.com/output?sig=example"
        self.assertEqual(safe_output_url(url, environment), url)
        for bad in [url.replace("https:", "http:"), url.replace("/output", ".example.com/output"), url.replace("https://", "https://user@")]:
            with self.subTest(url=bad), self.assertRaises(ValueError):
                safe_output_url(bad, environment)

    def test_completed_result_requires_nonempty_exact_json(self):
        expected = {"ok": True}
        body = {"status": "Completed", "result": '{"ok":true}'}
        self.assertEqual(classify_output("Succeeded", "Succeeded", {"statusCode": 200, "body": body}, expected)["status"], "output-verified")
        invalid = [dict(body, result=""), dict(body, result="   "), dict(body, result={"ok": True}),
                   dict(body, status="Running"), dict(body, status="Failed"),
                   {"result": '{"ok":true}'}, dict(body, message='{"ok":true}'),
                   dict(body, result='{"ok":1}'), [], None]
        for value in invalid:
            with self.subTest(body=value):
                self.assertEqual(classify_output("Succeeded", "Succeeded", {"statusCode": 200, "body": value}, expected)["status"], "output-mismatch")
        self.assertEqual(classify_output("Succeeded", "Succeeded", {"statusCode": 500, "body": body}, expected)["status"], "output-mismatch")

    def test_run_cli_requires_approval_and_reports_acceptance_only(self):
        identifier = "00000000-0000-0000-0000-000000000000"
        settings = {"ENV_ID": identifier, "AGENT_FLOW_ID": identifier, "AGENT_FLOW_NAME": "sample",
                    "SOLUTION_NAME": "Sample", "AGENT_FLOW_EXPECTED_JSON": '{"ok":true}'}
        message = 'Return only this exact JSON without markdown: {"ok": true}. Do not use tools, knowledge, web search, email, or human assistance.'
        actual = dict(workflow_body(identifier, "sample", build_client(fixture(), "sample", message)), statecode=1)
        auth = types.ModuleType("auth_helper")
        auth.DATAVERSE_URL = "https://example.com"
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, settings), patch.dict(sys.modules, {"auth_helper": auth}), patch("agent_flow.Api") as api_type, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            api = api_type.return_value
            api.workflow.return_value = actual
            path = Path(directory) / "plan.json"
            with patch.object(sys, "argv", ["agent_flow", "run", "--report-file", str(path)]):
                self.assertEqual(main(), 0)
            api.request.assert_not_called()
            approved = json.loads(path.read_text())["expectedHash"]
            with patch.object(sys, "argv", ["agent_flow", "run", "--apply", "--expected-hash", "stale", "--report-file", str(Path(directory) / "stale.json")]):
                self.assertEqual(main(), 1)
            api.request.assert_not_called()
            result = Path(directory) / "run.json"
            with patch.object(sys, "argv", ["agent_flow", "run", "--apply", "--expected-hash", approved, "--report-file", str(result)]):
                self.assertEqual(main(), 0)
            api.request.assert_called_once_with("POST", identifier + "/triggers/manual/run", {}, flow=True)
            self.assertEqual(json.loads(result.read_text())["status"], "run-accepted")


if __name__ == "__main__":
    unittest.main()