"""The quickstart host is patched, not forked: check the patch still lands on the upstream shape."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scaffold_ai_teammate as scaffold  # noqa: E402

UPSTREAM = '''from .agent_interface import AgentInterface, check_agent_inheritance
from .email_channel_compat import (
    is_email_activity,
)


class Host:
    def _setup_handlers(self) -> None:
        async def on_message(context, _):
            try:
                user_message = context.activity.text or ""
                if not user_message.strip() or user_message.strip() == "/help":
                    return

                logger.info("%s", user_message)
            except Exception as ex:
                logger.exception("Error processing message")
                if is_email_activity(context.activity):
                    return
                session_id = os.getenv("FOUNDRY_AGENT_SESSION_ID") or "(not set)"
                await context.send_activity(
                    "Sorry, something went wrong while processing your message.\\n"
                    f"FOUNDRY_AGENT_SESSION_ID: {session_id}\\n"
                    f"Exception: {ex}"
                )
'''


class PatchTurnHandlingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "host_agent_server.py"
        self.path.write_text(UPSTREAM, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_patch_lands_and_compiles(self):
        self.assertTrue(scaffold.patch_turn_handling(self.path))
        patched = self.path.read_text(encoding="utf-8")
        compile(patched, str(self.path), "exec")
        self.assertIn("if not has_files(context.activity):", patched)
        self.assertIn("from .incoming_files import has_files", patched)
        self.assertNotIn("Exception: {ex}", patched)

    def test_rerun_is_a_no_op(self):
        scaffold.patch_turn_handling(self.path)
        once = self.path.read_text(encoding="utf-8")
        self.assertTrue(scaffold.patch_turn_handling(self.path))
        self.assertEqual(once, self.path.read_text(encoding="utf-8"))

    def test_changed_upstream_is_reported(self):
        self.path.write_text("class Host: pass\n", encoding="utf-8")
        self.assertFalse(scaffold.patch_turn_handling(self.path))


if __name__ == "__main__":
    unittest.main()
