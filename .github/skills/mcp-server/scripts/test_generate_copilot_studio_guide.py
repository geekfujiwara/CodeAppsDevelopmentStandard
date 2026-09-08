import unittest

from generate_copilot_studio_guide import (
    build_markdown,
    connection_create_url,
    connection_details_url,
    connector_scopes,
    environment_links,
)


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

    def test_environment_links_target_connections_and_studio(self) -> None:
        connections_url, studio_url = environment_links("environment-id")

        self.assertEqual(
            connections_url,
            "https://make.powerapps.com/environments/environment-id/connections",
        )
        self.assertEqual(
            studio_url,
            "https://copilotstudio.microsoft.com/environments/environment-id/bots",
        )

    def test_connection_details_url_targets_exact_connection(self) -> None:
        url = connection_details_url(
            "environment-id",
            "/providers/Microsoft.PowerApps/apis/shared_example-mcp",
            "connection-id",
        )

        self.assertEqual(
            url,
            "https://make.preview.powerapps.com/environments/environment-id/"
            "connections/shared_example-mcp/connection-id/details",
        )

    def test_connection_create_url_targets_exact_connector(self) -> None:
        url = connection_create_url(
            "environment-id",
            "/providers/Microsoft.PowerApps/apis/shared_example-mcp",
        )

        self.assertEqual(
            url,
            "https://make.preview.powerapps.com/environments/environment-id/"
            "connections/available/shared_example-mcp",
        )

    def test_generated_guide_prioritizes_connector_create_url(self) -> None:
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
            environment_id="environment-id",
            connector_id="shared_example-mcp",
        )

        self.assertIn("connections/available/shared_example-mcp", markdown)
        self.assertNotIn("/connection-id/details", markdown)


if __name__ == "__main__":
    unittest.main()