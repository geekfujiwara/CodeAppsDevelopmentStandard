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