import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import REFERENCES_DIR, Api, read_json  # noqa: E402
from fakes import FakeResponse, FakeSession, no_sleep, token_provider  # noqa: E402
from verify_platform import check_databricks_genie, check_foundry_kb, check_mcp, mcp_ready, retrieve_body, rows_match, run  # noqa: E402

SPEC = read_json(REFERENCES_DIR / "samples" / "cold-chain-semantics.json")
EXPECTED = read_json(REFERENCES_DIR / "samples" / "cold-chain-expected.json")
ENV = {"DATABRICKS_HOST": "host", "DATABRICKS_WAREHOUSE_ID": "wh", "DATABRICKS_CATALOG": "main",
       "DATABRICKS_GENIE_SPACE_ID": "sp", "SEARCH_SERVICE_NAME": "srch", "FABRIC_WORKSPACE_ID": "ws", "FABRIC_ONTOLOGY_ID": "on"}
ANSWER = [["Tokyo Central", "FZ-101", "3", "-13.0", "WO-9001", "P1"]]


def api(kind, session, base=None):
    return Api(kind, base, session=session, token_provider=token_provider, sleep=no_sleep)


def rpc(result=None, error=None, id_=1):
    body = {"jsonrpc": "2.0", "id": id_}
    body.update({"error": error} if error else {"result": result})
    return FakeResponse(200, body, headers={"Mcp-Session-Id": "s"})


@patch.dict(os.environ, ENV, clear=True)
class VerifyPlatformTest(unittest.TestCase):
    def test_rows_match(self):  # DP-U-024
        self.assertTrue(rows_match(ANSWER, EXPECTED["rows"]))
        self.assertFalse(rows_match(ANSWER + [["Sapporo North", "FZ-301", "3", "-14.0", "WO-9003", "P2"]], EXPECTED["rows"]))

    def test_genie_success_and_extra_row(self):  # DP-U-024
        for rows, status in ((ANSWER, "verified"), (ANSWER + [["x", "y", 1, 1, "z", "P2"]], "failed")):
            session = self._genie_session("COMPLETED", rows)
            self.assertEqual(check_databricks_genie(api("databricks", session, "https://host"), EXPECTED, sleep=no_sleep)[0]["status"], status)

    def test_genie_failed_state(self):  # DP-U-025
        for state in ("FAILED", "CANCELLED"):
            session = self._genie_session(state, [])
            out = check_databricks_genie(api("databricks", session, "https://host"), EXPECTED, sleep=no_sleep)
            self.assertEqual(out[0]["status"], "failed")

    def test_empty_ontology_is_blocked(self):  # DP-U-026
        session = FakeSession().add("POST", r"ontologyEndpoint", rpc({"protocolVersion": "2025-06-18"}), FakeResponse(202, text=""),
                                    rpc({"tools": [{"name": "list_ontology_entity_types"}, {"name": "search_ontology"}]}, id_=2),
                                    rpc({"content": [{"type": "text", "text": "[]"}]}, id_=3))
        out = check_mcp("fabric-mcp", api("fabric", session), "https://api.fabric.microsoft.com/v1/mcp/x/ontologyEndpoint",
                        question="q", must_contain=["FZ-101"], tool_name="search_ontology", list_tool="list_ontology_entity_types")
        self.assertEqual(out[-1]["status"], "blocked")
        self.assertIn("未バインド", out[-1]["detail"])

    def test_mcp_tool_error_is_blocked(self):  # DP-U-012
        session = FakeSession().add("POST", r"/mcp", rpc({}), FakeResponse(202, text=""),
                                    rpc({"tools": [{"name": "ask", "inputSchema": {"type": "object", "required": ["query"], "properties": {"query": {"type": "string"}}}}]}, id_=2),
                                    rpc({"isError": True, "content": [{"type": "text", "text": "nope"}]}, id_=3))
        out = check_mcp("x", api("search", session), "https://h/mcp", question="q", must_contain=["FZ-101"], tool_name="ask")
        self.assertEqual(out[-1]["status"], "blocked")
        self.assertEqual(session.bodies("POST", "/mcp")[-1]["params"], {"name": "ask", "arguments": {"query": "q"}})

    def test_mcp_does_not_guess_complex_schema(self):
        schema = {"type": "object", "required": ["request"], "properties": {"request": {"type": "object"}}}
        session = FakeSession().add("POST", r"/mcp", rpc({}), FakeResponse(202, text=""),
                                    rpc({"tools": [{"name": "knowledge_base_retrieve", "inputSchema": schema}]}, id_=2))
        out = check_mcp("x", api("search", session), "https://h/mcp", question="q", must_contain=[], tool_name="knowledge_base_retrieve")
        self.assertEqual(out[-1]["status"], "not-tested")

    def test_foundry_mcp_query_variants(self):  # 実測した knowledge_base_retrieve の inputSchema
        schema = {"type": "object", "required": ["query_variants"],
                  "properties": {"query_variants": {"type": "array", "items": {"type": "string"}, "maxItems": 1}}}
        session = FakeSession().add("POST", r"/mcp", rpc({}), FakeResponse(202, text=""),
                                    rpc({"tools": [{"name": "knowledge_base_retrieve", "inputSchema": schema}]}, id_=2),
                                    rpc({"content": [{"type": "text", "text": "FZ-101 P1 door seal"}]}, id_=3))
        out = check_mcp("foundry-kb-mcp", api("search", session), "https://h/mcp", question="q", must_contain=["FZ-101", "P1"],
                        tool_name="knowledge_base_retrieve")
        self.assertEqual(out[-1]["status"], "verified")
        self.assertEqual(session.bodies("POST", "/mcp")[-1]["params"]["arguments"], {"query_variants": ["q"]})

    def test_genie_mcp_polls_until_completed(self):  # DP-E-002 のモック（実測した応答形状）
        tools = [{"name": "query_space_sp", "inputSchema": {"required": ["query"]}},
                 {"name": "poll_response_sp", "inputSchema": {"required": ["conversation_id", "message_id"]}}]
        pending = {"content": {"queryAttachments": []}, "conversationId": "c", "messageId": "m", "status": "ASKING_AI"}
        values = [{"values": [{"string_value": v} for v in ANSWER[0]]}]
        done = {"content": {"queryAttachments": [{"statement_response": {"result": {"data_array": values}}}]},
                "conversationId": "c", "messageId": "m", "status": "COMPLETED"}
        session = FakeSession().add("POST", r"/mcp/genie/sp", rpc({}), FakeResponse(202, text=""), rpc({"tools": tools}, id_=2),
                                    rpc({"structuredContent": pending, "content": []}, id_=3),
                                    rpc({"structuredContent": done, "content": []}, id_=4))
        from verify_platform import check_genie_mcp
        out = check_genie_mcp(api("databricks", session), "https://host/api/2.0/mcp/genie/sp", EXPECTED, sleep=no_sleep)
        self.assertEqual(out[-1]["status"], "verified")
        poll = session.bodies("POST", "/mcp/genie")[-1]["params"]
        self.assertEqual(poll, {"name": "poll_response_sp", "arguments": {"conversation_id": "c", "message_id": "m"}})

    def test_retrieve_body_shape(self):  # DP-U-027
        self.assertIn("intents", retrieve_body("minimal", "q", "extractiveData"))
        body = retrieve_body("low", "q", "answerSynthesis")
        self.assertEqual(body["messages"][0]["content"][0]["text"], "q")
        self.assertNotIn("intents", body)

    def test_foundry_kb_requires_citation(self):  # DP-U-027
        for doc_key, status in (("manual-fz101", "verified"), ("manual-fz201", "failed")):
            session = FakeSession()
            session.add("GET", r"/knowledgebases/kb-cold-chain\?", FakeResponse(200, {"retrievalReasoningEffort": {"kind": "low"}, "outputMode": "answerSynthesis"}))
            session.add("POST", r"/retrieve", FakeResponse(200, {"response": [{"content": [{"type": "text", "text": "FZ-101 needs P1 maintenance"}]}],
                                                              "references": [{"docKey": doc_key}]}))
            out = check_foundry_kb(api("search", session, "https://srch.search.windows.net"), SPEC, EXPECTED)
            self.assertEqual(out[0]["status"], status)
            self.assertIn("messages", session.bodies("POST", "retrieve")[0])

    def test_mcp_endpoints_have_no_tokens(self):  # DP-U-028
        _, endpoints = run([], SPEC, EXPECTED)
        text = json.dumps(endpoints)
        self.assertIn("/api/2.0/mcp/genie/sp", text)
        self.assertIn("knowledgebases/kb-cold-chain/mcp", text)
        self.assertNotIn("Bearer", text)

    def test_mcp_ready_requires_all_stages(self):  # DP-U-028
        results = [{"check": "fabric-mcp:initialize", "status": "verified"}, {"check": "fabric-mcp:tools/call", "status": "blocked"}]
        self.assertFalse(mcp_ready(results, "fabric-mcp"))
        self.assertTrue(mcp_ready(results[:1], "fabric-mcp"))
        self.assertFalse(mcp_ready([], "fabric-mcp"))

    def test_forbidden_is_blocked(self):
        def factory(kind, base=None):
            session = FakeSession().add("GET", r"knowledgebases", FakeResponse(403, {"error": "forbidden"}))
            return api(kind, session, base)
        results, _ = run(["foundry-kb"], SPEC, EXPECTED, factory=factory)
        self.assertEqual(results[0]["status"], "blocked")

    @staticmethod
    def _genie_session(state: str, rows: list) -> FakeSession:
        session = FakeSession()
        session.add("POST", r"start-conversation", FakeResponse(200, {"conversation_id": "c", "message_id": "m"}))
        session.add("GET", r"/messages/m$", FakeResponse(200, {"status": "EXECUTING_QUERY"}),
                    FakeResponse(200, {"status": state, "attachments": [{"attachment_id": "a", "query": {"query": "SELECT"}}]}))
        session.add("GET", r"/attachments/a/query-result", FakeResponse(200, {"statement_response": {"result": {"data_array": rows}}}))
        return session


if __name__ == "__main__":
    unittest.main()
