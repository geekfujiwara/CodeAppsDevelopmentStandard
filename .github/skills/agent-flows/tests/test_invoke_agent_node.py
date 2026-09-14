import copy
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock
from uuid import UUID


SPEC = importlib.util.spec_from_file_location("invoke_agent_node", Path(__file__).resolve().parents[1] / "scripts" / "invoke_agent_node.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
ENVIRONMENT = str(UUID(int=1))
BOT_ID = str(UUID(int=2))
AGENT_ID = "sample_agent"
BASE = f"https://{ENVIRONMENT}.09.common.usa002.azure-apihub.net/apim/agentnode"


def response(payload, status=200):
    result = Mock(status_code=status)
    result.json.return_value = payload
    return result


def sessions(invoke_payload=None, invoke_status=201):
    dataverse, metadata, runtime = Mock(), Mock(), Mock()
    bot = {"botid": BOT_ID, "name": "Sample Agent", "schemaname": AGENT_ID,
           "template": "cliagent-1.0.0", "@odata.etag": 'W/"bot"'}
    reference = {"connectorid": MODULE.CONNECTOR, "connectionid": "sample-connection",
                 "@odata.etag": 'W/"reference"'}
    dataverse.get.side_effect = [response(bot), response({"value": [reference]})]
    swagger = {"paths": {
        MODULE.LIST_PATH: {"get": {"operationId": "ListAgents"}},
        MODULE.INVOKE_PATH: {"post": {"operationId": "InvokeAgent", "parameters": [
            {"in": "body", "schema": {"required": ["agentId", "prompt"]}}]}},
    }}
    metadata.get.return_value = response({"properties": {"primaryRuntimeUrl": BASE, "swagger": swagger}})
    runtime.get.return_value = response({"agents": [{"agentId": AGENT_ID, "agentName": bot["name"]}]})
    runtime.post.return_value = response(invoke_payload or {
        "result": "done", "structuredOutput": {"probe": "probe-1234"}, "files": []}, invoke_status)
    return Mock(side_effect=[dataverse, metadata, runtime]), runtime


class InvokeAgentNodeTests(unittest.TestCase):
    def build(self, factory, nonce="probe-1234"):
        return MODULE.build_plan(ENVIRONMENT, BOT_ID, "Sample Agent", "sample_reference",
                                 nonce, "https://example.invalid", factory)

    def test_plan_binds_safe_request_and_does_not_invoke(self):
        factory, runtime = sessions()
        plan = self.build(factory)
        self.assertFalse(plan["request"]["isHitlEscalationEnabled"])
        self.assertIn("Do not call tools", plan["request"]["prompt"])
        self.assertEqual(plan["expected"], {"probe": "probe-1234"})
        runtime.post.assert_not_called()
        MODULE.validate_plan(plan)

    def test_apply_rediscovers_exact_target_and_verifies_output(self):
        plan_factory, _ = sessions()
        plan = self.build(plan_factory)
        apply_factory, runtime = sessions()
        result = MODULE.apply_plan(plan, MODULE.digest(plan), "https://example.invalid", apply_factory)
        self.assertEqual(result["status"], "output-verified")
        runtime.post.assert_called_once_with(BASE + plan["path"], json=plan["request"],
                                             timeout=120, allow_redirects=False)

    def test_tamper_and_target_drift_stop_before_invoke(self):
        plan_factory, _ = sessions()
        plan = self.build(plan_factory)
        tampered = copy.deepcopy(plan)
        tampered["request"]["isHitlEscalationEnabled"] = True
        with self.assertRaises(ValueError):
            MODULE.validate_plan(tampered)
        apply_factory, runtime = sessions()
        plan["botEtag"] = 'W/"old"'
        with self.assertRaisesRegex(ValueError, "changed"):
            MODULE.apply_plan(plan, MODULE.digest(plan), "https://example.invalid", apply_factory)
        runtime.post.assert_not_called()

    def test_non_201_files_and_wrong_output_are_rejected(self):
        for payload, status in [
            ({}, 442),
            ({"structuredOutput": {"probe": "wrong"}, "files": []}, 201),
            ({"structuredOutput": {"probe": "probe-1234"}, "files": [{"name": "unexpected"}]}, 201),
            ({"structuredOutput": {"probe": "probe-1234"}, "files": [], "unknown": True}, 201),
        ]:
            plan_factory, _ = sessions()
            plan = self.build(plan_factory)
            apply_factory, runtime = sessions(payload, status)
            with self.subTest(status=status, payload=payload), self.assertRaises(ValueError):
                MODULE.apply_plan(plan, MODULE.digest(plan), "https://example.invalid", apply_factory)
            runtime.post.assert_called_once()

    def test_http_202_is_accepted_but_not_verified(self):
        plan_factory, _ = sessions()
        plan = self.build(plan_factory)
        apply_factory, runtime = sessions({}, 202)
        result = MODULE.apply_plan(plan, MODULE.digest(plan), "https://example.invalid", apply_factory)
        self.assertEqual(result, {"status": "accepted-unverified", "httpStatus": 202,
                                  "fileCount": None, "agentInvoked": True, "runtimeValidated": False})
        runtime.post.return_value.json.assert_not_called()

    def test_http_201_requires_json_and_explicit_empty_files(self):
        plan_factory, _ = sessions()
        plan = self.build(plan_factory)
        apply_factory, runtime = sessions({"structuredOutput": {"probe": "probe-1234"}}, 201)
        with self.assertRaisesRegex(ValueError, "structured smoke response"):
            MODULE.apply_plan(plan, MODULE.digest(plan), "https://example.invalid", apply_factory)
        apply_factory, runtime = sessions({}, 201)
        runtime.post.return_value.json.side_effect = ValueError("invalid JSON")
        with self.assertRaisesRegex(ValueError, "not valid JSON"):
            MODULE.apply_plan(plan, MODULE.digest(plan), "https://example.invalid", apply_factory)

    def test_unsafe_nonce_and_non_schema_agent_id_are_rejected(self):
        factory, _ = sessions()
        with self.assertRaisesRegex(ValueError, "Nonce"):
            self.build(factory, "bad value")
        factory, runtime = sessions()
        runtime.get.return_value = response({
            "agents": [{"agentId": BOT_ID, "agentName": "Sample Agent"}]})
        with self.assertRaisesRegex(ValueError, "schema name"):
            self.build(factory)


if __name__ == "__main__":
    unittest.main()