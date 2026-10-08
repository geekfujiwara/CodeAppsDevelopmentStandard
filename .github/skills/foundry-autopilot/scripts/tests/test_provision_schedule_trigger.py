"""Manual schedule ticks must not reuse a deleted hosted-agent session."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[1] / "provision_schedule_trigger.py"
SPEC = importlib.util.spec_from_file_location("provision_schedule_trigger", SCRIPT)
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
assert SPEC.loader is not None
SPEC.loader.exec_module(module)


class ManualTickTests(unittest.TestCase):
    def test_each_tick_uses_a_fresh_session_id(self) -> None:
        response = Mock(status_code=202, text='{"status":"accepted"}')
        env = {
            "FOUNDRY_PROJECT_ENDPOINT": "https://example.services.ai.azure.com/api/projects/p",
            "AGENT_NAME": "sample-agent",
        }
        with patch.dict(module.os.environ, env, clear=True):
            with patch.object(module.auth_helper, "get_token", return_value="token"):
                with patch.object(module.requests, "post", return_value=response) as post:
                    module.tick_now()
                    module.tick_now()

        urls = [call.args[0] for call in post.call_args_list]
        self.assertNotEqual(urls[0], urls[1])
        self.assertTrue(all("schedule-tick-manual-" in url for url in urls))


if __name__ == "__main__":
    unittest.main()
