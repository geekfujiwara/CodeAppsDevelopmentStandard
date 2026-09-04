from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import configure_connector_oauth as oauth
import verify_mcp_server as verify


class AdminConsentTests(unittest.TestCase):
    @patch.object(oauth, "graph_post")
    @patch.object(oauth, "graph_get", return_value={"value": []})
    def test_creates_tenant_wide_grant(self, graph_get: Mock, graph_post: Mock) -> None:
        oauth.ensure_admin_consent({"id": "service-principal-id"}, "MCP.Access")

        graph_get.assert_called_once()
        graph_post.assert_called_once_with(
            "/oauth2PermissionGrants",
            {
                "clientId": "service-principal-id",
                "consentType": "AllPrincipals",
                "principalId": None,
                "resourceId": "service-principal-id",
                "scope": "MCP.Access",
            },
        )

    @patch.object(oauth, "graph_patch")
    @patch.object(oauth, "graph_get")
    def test_adds_scope_to_existing_grant(self, graph_get: Mock, graph_patch: Mock) -> None:
        graph_get.return_value = {
            "value": [{"id": "grant-id", "consentType": "AllPrincipals", "scope": "User.Read"}]
        }

        oauth.ensure_admin_consent({"id": "service-principal-id"}, "MCP.Access")

        graph_patch.assert_called_once_with(
            "/oauth2PermissionGrants/grant-id", {"scope": "MCP.Access User.Read"}
        )


class StreamableGetTests(unittest.TestCase):
    def check(self, status_code: int, content_type: str = "") -> list[str]:
        notification = Mock(status_code=202, content=b"")
        streamed = Mock(status_code=status_code, headers={"Content-Type": content_type})
        with (
            patch.object(verify, "rpc", return_value={"protocolVersion": verify.CLIENT_PROTOCOL_VERSION}),
            patch.object(verify.requests, "post", return_value=notification),
            patch.object(verify.requests, "get", return_value=streamed),
        ):
            return verify.check_streamable_compliance("https://example.test/mcp", "token")

    def test_accepts_method_not_allowed_without_sse(self) -> None:
        self.assertEqual([], self.check(405))

    def test_rejects_unexpected_status(self) -> None:
        self.assertTrue(any("500" in item for item in self.check(500)))

    def test_rejects_non_sse_success(self) -> None:
        self.assertTrue(any("Content-Type" in item for item in self.check(200, "application/json")))


if __name__ == "__main__":
    unittest.main()