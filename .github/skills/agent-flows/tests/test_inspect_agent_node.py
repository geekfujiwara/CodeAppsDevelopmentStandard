import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import Mock
from uuid import UUID

SPEC = importlib.util.spec_from_file_location("inspect_agent_node", Path(__file__).resolve().parents[1] / "scripts/inspect_agent_node.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
ENVIRONMENT = str(UUID(int=1))
BOT_ID = str(UUID(int=2))
BASE = f"https://{ENVIRONMENT}.09.common.usa002.azure-apihub.net/apim/agentnode"
BOT = {"botid": BOT_ID, "name": "Sample Agent", "schemaname": "sample_agent", "template": "cliagent-1.0.0"}


def response(payload, status=200):
    result = Mock(status_code=status)
    result.json.return_value = payload
    return result


def sessions(runtime_status=200):
    dataverse, metadata, runtime = Mock(), Mock(), Mock()
    dataverse.get.side_effect = [response(BOT), response({"value": [{"connectorid": MODULE.CONNECTOR, "connectionid": "sample-connection"}]})]
    swagger = {"paths": {
        MODULE.LIST_PATH: {"get": {"operationId": "ListAgents"}},
        MODULE.INVOKE_PATH: {"post": {"operationId": "InvokeAgent", "parameters": [
            {"in": "body", "schema": {"required": ["agentId", "prompt"]}}]}},
    }}
    metadata.get.return_value = response({"properties": {"primaryRuntimeUrl": BASE, "swagger": swagger}})
    runtime.get.return_value = response({"agents": [{"agentId": BOT_ID, "agentName": BOT["name"]}]}, runtime_status)
    factory = Mock(side_effect=[dataverse, metadata, runtime])
    return factory, dataverse, metadata, runtime


class AgentNodeInspectionTests(unittest.TestCase):
    def inspect(self, factory):
        return MODULE.inspect_agent(ENVIRONMENT, BOT_ID, BOT["name"], "sample_reference", "https://example.invalid", factory)

    def test_success_is_discovery_only_and_uses_separate_audiences(self):
        factory, dataverse, metadata, runtime = sessions()
        report = self.inspect(factory)
        self.assertEqual(report["status"], "target-verified")
        self.assertFalse(report["runtimeValidated"])
        self.assertFalse(report["agentInvoked"])
        self.assertEqual([call.args for call in factory.call_args_list], [(), (MODULE.METADATA_SCOPE,), (MODULE.RUNTIME_SCOPE,)])
        self.assertEqual(metadata.get.call_args.kwargs["params"]["$filter"], f"environment eq '{ENVIRONMENT}'")
        for session in (dataverse, metadata, runtime):
            session.post.assert_not_called()
            session.patch.assert_not_called()
            session.delete.assert_not_called()
            for call in session.get.call_args_list:
                self.assertFalse(call.kwargs["allow_redirects"])

    def test_policy_block_is_sanitized_without_retry(self):
        factory, _, _, runtime = sessions(442)
        runtime.get.return_value.json.return_value = {"message": "secret-output-url"}
        report = self.inspect(factory)
        self.assertEqual(report["status"], "runtime-policy-blocked")
        self.assertEqual(report["stage"], "list-agents")
        self.assertNotIn("secret", json.dumps(report))
        runtime.get.assert_called_once()
        runtime.get.return_value.json.assert_not_called()

    def test_host_guard_rejects_other_environments_and_credentials(self):
        self.assertEqual(MODULE.validate_runtime_url(BASE, ENVIRONMENT), BASE)
        for value in (BASE.replace(ENVIRONMENT, BOT_ID), BASE + "?sig=secret", BASE + "#fragment",
                      BASE.replace("https:", "http:"), BASE.replace("https://", "https://user:secret@"),
                      BASE.replace(".net/", ".net.evil/"), BASE.replace(".net/", ".net:444/")):
            with self.assertRaises(ValueError):
                MODULE.validate_runtime_url(value, ENVIRONMENT)

    def test_identity_and_schema_ambiguity_fail_closed(self):
        entry = {"agentId": BOT_ID, "agentName": BOT["name"]}
        self.assertEqual(MODULE.resolve_agent({"entities": [entry]}, BOT), BOT_ID)
        for payload in ({"agents": []}, {"agents": [entry, entry]}, {"agents": [entry], "entities": [entry]},
                        {"agents": [entry], "moreRecords": True}, {"entities": [{"id": BOT_ID}]},
                        {"agents": [{**entry, "agentId": "other"}]}):
            with self.assertRaises(ValueError):
                MODULE.resolve_agent(payload, BOT)

    def test_wrong_connector_stops_before_runtime_auth(self):
        factory, dataverse, _, _ = sessions()
        dataverse.get.side_effect = [response(BOT), response({"value": [{"connectorid": "other"}]})]
        self.assertEqual(self.inspect(factory)["status"], "contract-mismatch")
        factory.assert_called_once_with()

    def test_swagger_change_stops_before_runtime_auth(self):
        factory, _, metadata, _ = sessions()
        metadata.get.return_value.json.return_value["properties"]["swagger"]["paths"][MODULE.INVOKE_PATH]["post"]["operationId"] = "InvokeDefinition"
        self.assertEqual(self.inspect(factory)["status"], "contract-mismatch")
        self.assertEqual(factory.call_count, 2)

    def test_http_and_transport_errors_do_not_expose_details(self):
        for status in (201, 302, 400, 401, 403, 500):
            factory, _, _, _ = sessions(status)
            self.assertEqual(self.inspect(factory)["status"], "http-error")
        factory, _, _, runtime = sessions()
        runtime.get.side_effect = RuntimeError("Authorization: secret")
        report = self.inspect(factory)
        self.assertEqual(report["status"], "request-failed")
        self.assertNotIn("secret", json.dumps(report))


if __name__ == "__main__":
    unittest.main()