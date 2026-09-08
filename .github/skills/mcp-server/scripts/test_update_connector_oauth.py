import unittest

from update_connector_oauth import apply_oauth_credentials


class UpdateConnectorOauthTests(unittest.TestCase):
    def test_injects_exported_secret_and_refresh_scope(self) -> None:
        properties = {
            "properties": {
                "connectionParameters": {
                    "token": {
                        "oAuthSettings": {
                            "clientId": "old-client",
                            "scopes": ["api://example/MCP.Access"],
                        }
                    }
                }
            }
        }

        apply_oauth_credentials(properties, {"clientId": "current-client", "clientSecret": "secret-value"})

        settings = properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]
        self.assertEqual(settings["clientId"], "current-client")
        self.assertEqual(settings["clientSecret"], "secret-value")
        self.assertEqual(settings["scopes"], ["api://example/MCP.Access", "offline_access"])

    def test_overrides_resource_and_scope_for_guid_audience(self):
        properties = {
            "properties": {
                "connectionParameters": {
                    "token": {
                        "oAuthSettings": {
                            "clientId": "old-client",
                            "clientSecret": "old-secret",
                            "properties": {"AzureActiveDirectoryResourceId": "api://example"},
                            "scopes": ["api://example/MCP.Access", "offline_access"],
                        }
                    }
                }
            }
        }

        apply_oauth_credentials(
            properties,
            {"clientId": "new-client", "clientSecret": "new-secret"},
            "00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000000/MCP.Access",
        )

        settings = properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]
        self.assertEqual(
            settings["properties"]["AzureActiveDirectoryResourceId"],
            "00000000-0000-0000-0000-000000000000",
        )
        self.assertEqual(
            settings["scopes"],
            ["00000000-0000-0000-0000-000000000000/MCP.Access", "offline_access"],
        )

    def test_does_not_duplicate_refresh_scope(self) -> None:
        properties = {
            "properties": {
                "connectionParameters": {
                    "token": {
                        "oAuthSettings": {
                            "scopes": ["api://example/MCP.Access", "offline_access"],
                        }
                    }
                }
            }
        }

        apply_oauth_credentials(properties, {"clientId": "current-client", "clientSecret": "secret-value"})

        scopes = properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]["scopes"]
        self.assertEqual(scopes.count("offline_access"), 1)


if __name__ == "__main__":
    unittest.main()