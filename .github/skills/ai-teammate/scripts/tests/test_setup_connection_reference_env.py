"""Unit tests for setup_connection_reference.py's `--write-env` / `upsert_env` helper.

Only tests the file-writing helper (pure, offline); the rest of the script talks to Dataverse
and is out of scope for an offline unit test.

Run with:
    python -m unittest .github/skills/ai-teammate/scripts/tests/test_setup_connection_reference_env.py -v
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = (
    Path(__file__).resolve().parents[3] / "code-apps" / "scripts" / "setup_connection_reference.py"
)

_spec = importlib.util.spec_from_file_location("setup_connection_reference", SCRIPT_PATH)
setup_connection_reference = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = setup_connection_reference
assert _spec.loader is not None
_spec.loader.exec_module(setup_connection_reference)


class UpsertEnvTests(unittest.TestCase):
    def test_appends_new_keys_to_empty_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            setup_connection_reference.upsert_env(env_path, {"SOLUTION_ID": "sol-1", "CONNECTION_REFERENCE_LOGICAL_NAME": "cr-1"})
            content = env_path.read_text(encoding="utf-8")
            self.assertIn("SOLUTION_ID=sol-1", content)
            self.assertIn("CONNECTION_REFERENCE_LOGICAL_NAME=cr-1", content)

    def test_updates_existing_key_in_place_without_reordering(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("AGENT_NAME=sample\nSOLUTION_ID=old\nPUBLISHER_PREFIX=acme\n", encoding="utf-8")
            setup_connection_reference.upsert_env(env_path, {"SOLUTION_ID": "new"})
            lines = env_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(lines, ["AGENT_NAME=sample", "SOLUTION_ID=new", "PUBLISHER_PREFIX=acme"])

    def test_preserves_comments_and_unrelated_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("# a comment\nAGENT_NAME=sample\n", encoding="utf-8")
            setup_connection_reference.upsert_env(env_path, {"SOLUTION_ID": "sol-1"})
            content = env_path.read_text(encoding="utf-8")
            self.assertIn("# a comment", content)
            self.assertIn("AGENT_NAME=sample", content)
            self.assertIn("SOLUTION_ID=sol-1", content)

    def test_does_not_touch_key_mentioned_only_in_a_comment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text("# SOLUTION_ID=should-not-match\nAGENT_NAME=sample\n", encoding="utf-8")
            setup_connection_reference.upsert_env(env_path, {"SOLUTION_ID": "sol-1"})
            lines = env_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(lines[0], "# SOLUTION_ID=should-not-match")
            self.assertIn("SOLUTION_ID=sol-1", lines)


if __name__ == "__main__":
    unittest.main()
