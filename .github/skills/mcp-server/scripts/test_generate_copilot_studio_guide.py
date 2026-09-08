import unittest

from generate_copilot_studio_guide import build_markdown, connector_scopes


class ConnectorScopesTests(unittest.TestCase):
    def test_adds_offline_access(self) -> None:
        self.assertEqual(connector_scopes("api://example/MCP.Access"), "api://example/MCP.Access offline_access")

    def test_does_not_duplicate_offline_access(self) -> None:
        self.assertEqual(
            connector_scopes("api://example/MCP.Access offline_access"),
            "api://example/MCP.Access offline_access",
        )

    def test_generated_guide_requests_refresh_token(self) -> None:
        markdown = build_markdown(
            server_name="example-mcp",
            server_description="Example MCP server",
            server_url="https://example.invalid/api/mcp",
            display_name="Example MCP",
            tenant_id="example-tenant",
            audience="api://example",
            full_scope="api://example/MCP.Access",
            client_id="example-client",
            client_secret="example-secret",
            redirect_uri=None,
        )

        self.assertIn("api://example/MCP.Access offline_access", markdown)
        self.assertEqual(markdown.count("offline_access"), 1)


if __name__ == "__main__":
    unittest.main()