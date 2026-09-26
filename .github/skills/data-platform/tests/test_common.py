import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import (  # noqa: E402
    Api, DatabricksSql, HttpError, McpClient, mcp_outcome, parse_sse_or_json, plan_hash, redact, require_approval,
    require_identifier, seal_plan,
)
from fakes import FakeResponse, FakeSession, no_sleep, token_provider  # noqa: E402


class CommonTest(unittest.TestCase):
    def test_plan_hash_is_order_independent(self):  # DP-U-010
        self.assertEqual(plan_hash({"a": 1, "b": {"c": 2, "d": 3}}), plan_hash({"b": {"d": 3, "c": 2}, "a": 1}))
        self.assertNotEqual(plan_hash({"a": 1}), plan_hash({"a": 2}))

    def test_require_approval(self):  # DP-U-016
        plan = seal_plan({"x": 1})
        require_approval(plan, plan["planHash"])
        with self.assertRaises(SystemExit):
            require_approval(plan, "0" * 64)
        tampered = dict(plan, x=2)
        with self.assertRaises(SystemExit):
            require_approval(tampered, plan["planHash"])

    def test_retry_after_429(self):  # DP-U-011
        session = FakeSession().add("GET", r"/thing", FakeResponse(429, headers={"Retry-After": "1"}), FakeResponse(200, {"ok": True}))
        waits = []
        api = Api("arm", session=session, token_provider=token_provider, sleep=waits.append)
        self.assertEqual(api.json("GET", "/thing"), {"ok": True})
        self.assertEqual(waits, [1.0])

    def test_retry_is_bounded(self):  # DP-U-011
        session = FakeSession().add("GET", r"/thing", FakeResponse(503))
        api = Api("arm", session=session, token_provider=token_provider, sleep=no_sleep, max_retries=2)
        with self.assertRaises(HttpError):
            api.json("GET", "/thing")
        self.assertEqual(len(session.calls), 3)

    def test_mcp_outcome(self):  # DP-U-012
        self.assertEqual(mcp_outcome({"jsonrpc": "2.0", "id": 1, "result": {"content": []}})[0], "verified")
        self.assertEqual(mcp_outcome({"jsonrpc": "2.0", "id": 1, "error": {"code": -32000}})[0], "blocked")
        self.assertEqual(mcp_outcome({"jsonrpc": "2.0", "id": 1, "result": {"isError": True, "content": [{"type": "text", "text": "x"}]}})[0], "blocked")
        self.assertEqual(mcp_outcome({"ok": True})[0], "failed")

    def test_sse_parsing(self):  # DP-U-013
        text = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\ndata: [DONE]\n"
        self.assertEqual(parse_sse_or_json(text)["id"], 1)
        self.assertEqual(parse_sse_or_json('{"a": 1}'), {"a": 1})
        with self.assertRaises(ValueError):
            parse_sse_or_json("plain text")

    def test_token_redaction(self):  # DP-U-014
        self.assertNotIn("secret-token", redact("Authorization: Bearer secret-token"))
        session = FakeSession().add("GET", r"/x", FakeResponse(400, text="echo Bearer secret-token"))
        api = Api("arm", session=session, token_provider=lambda _: "secret-token", sleep=no_sleep)
        with self.assertRaises(HttpError) as context:
            api.json("GET", "/x")
        self.assertNotIn("secret-token", str(context.exception))

    def test_identifier_validation(self):
        self.assertEqual(require_identifier("cold_chain", "schema"), "cold_chain")
        for bad in ("cold-chain", "x; DROP TABLE y", "", "1abc"):
            with self.assertRaises(ValueError):
                require_identifier(bad, "schema")

    def test_mcp_client_session_flow(self):  # DP-U-012
        session = FakeSession()
        session.add("POST", r"/mcp", FakeResponse(200, {"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "2025-06-18"}},
                                                  headers={"Mcp-Session-Id": "s1"}),
                    FakeResponse(202, text=""),
                    FakeResponse(200, text='data: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"t"}]}}'))
        client = McpClient(Api("fabric", session=session, token_provider=token_provider), "https://host/mcp")
        self.assertEqual(mcp_outcome(client.initialize())[0], "verified")
        tools = client.list_tools()
        self.assertEqual(tools["result"]["tools"][0]["name"], "t")
        self.assertEqual(session.calls[1]["headers"]["Mcp-Session-Id"], "s1")
        self.assertEqual(session.bodies("POST", "/mcp")[1]["method"], "notifications/initialized")

    def test_databricks_sql_polls_and_parameterizes(self):
        session = FakeSession()
        session.add("POST", r"/api/2.0/sql/statements$", FakeResponse(200, {"statement_id": "s", "status": {"state": "PENDING"}}))
        session.add("GET", r"/api/2.0/sql/statements/s", FakeResponse(200, {"statement_id": "s", "status": {"state": "SUCCEEDED"},
                                                                            "result": {"data_array": [["1"]]}}))
        sql = DatabricksSql(Api("databricks", "https://host", session=session, token_provider=token_provider), "wh", sleep=no_sleep)
        self.assertEqual(sql.rows("SELECT :x", [{"name": "x", "value": "1", "type": "INT"}]), [["1"]])
        self.assertEqual(session.bodies("POST", "statements")[0]["parameters"][0]["name"], "x")

    def test_databricks_sql_failure(self):
        session = FakeSession().add("POST", r"/statements", FakeResponse(200, {"statement_id": "s", "status": {
            "state": "FAILED", "error": {"message": "boom"}}}))
        sql = DatabricksSql(Api("databricks", "https://host", session=session, token_provider=token_provider), "wh", sleep=no_sleep)
        with self.assertRaises(RuntimeError):
            sql.run("SELECT 1")


if __name__ == "__main__":
    unittest.main()
