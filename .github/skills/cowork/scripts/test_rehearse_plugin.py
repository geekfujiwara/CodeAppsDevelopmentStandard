from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "rehearse_plugin.py"
SPEC = importlib.util.spec_from_file_location("rehearse_plugin", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def make_plugin(root: Path, remote: dict, skill_body: str) -> None:
    manifest = {"manifestVersion": "1.29", "agentConnectors": [
        {"id": "dataverse-mcp", "toolSource": {"remoteMcpServer": {"mcpServerUrl": "https://example.invalid/api/mcp", **remote}}}]}
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (root / "skills" / "demo").mkdir(parents=True)
    (root / "skills" / "demo" / "SKILL.md").write_text(skill_body, encoding="utf-8")


class RehearsePluginTests(unittest.TestCase):
    def test_plugin_tools_is_none_without_tool_description(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin(root, {}, "`describe` を使う")
            self.assertIsNone(MODULE.plugin_tools(root))

    def test_plugin_tools_reads_referenced_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin(root, {"mcpToolDescription": {"file": "tools.json"}}, "")
            (root / "tools.json").write_text(json.dumps({"tools": [{"name": "describe"}, {"name": "read_query"}]}), encoding="utf-8")
            self.assertEqual(MODULE.plugin_tools(root), ["describe", "read_query"])

    def test_skill_tool_names_only_counts_code_spans(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin(root, {}, "最初に `describe` を呼ぶ。`create_record(tablename=...)` で登録。read_query という語だけ。")
            self.assertEqual(MODULE.skill_tool_names(root), ["create_record", "describe"])

    def test_unknown_tools_are_treated_as_writes(self):
        self.assertFalse(MODULE.is_write("read_query"))
        self.assertTrue(MODULE.is_write("delete_table"))
        self.assertTrue(MODULE.is_write("some_new_server_tool"))


if __name__ == "__main__":
    unittest.main()
