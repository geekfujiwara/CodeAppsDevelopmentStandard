from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from setup_entra_oauth_graph import resolve_api_scope


class ResolveApiScopeTests(unittest.TestCase):
    @patch.dict(os.environ, {"MCP_API_SCOPE_VALUE": "Custom.Access"}, clear=False)
    def test_uses_loaded_environment_value(self) -> None:
        self.assertEqual("Custom.Access", resolve_api_scope(None))

    @patch.dict(os.environ, {"MCP_API_SCOPE_VALUE": "Custom.Access"}, clear=False)
    def test_cli_value_takes_precedence(self) -> None:
        self.assertEqual("Cli.Access", resolve_api_scope("Cli.Access"))

    @patch.dict(os.environ, {}, clear=True)
    def test_uses_default_when_unconfigured(self) -> None:
        self.assertEqual("MCP.Access", resolve_api_scope(None))


if __name__ == "__main__":
    unittest.main()