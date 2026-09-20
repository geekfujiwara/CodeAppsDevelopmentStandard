import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scaffold_from_template import main, strip_blocks, template_variables


class ScaffoldFromTemplateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.template = self.root / "template"
        self.target = self.root / "out"
        (self.template / "__PKG__").mkdir(parents=True)
        # 開発マシンに AGENT_NAME 等が残っていても結果が変わらないようにする
        self.env_patch = patch.dict(os.environ, {}, clear=True)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, **payload):
        (self.template / "scaffold.json").write_text(json.dumps(payload), encoding="utf-8")

    def run_scaffold(self, *extra):
        return main(["--template", str(self.template), "--target", str(self.target), *extra])

    def test_substitutes_contents_and_path_names(self):
        self.write_manifest(variables=["AGENT_NAME"], derivedVariables=["PKG"])
        (self.template / "__PKG__" / "app.py").write_text('NAME = "${AGENT_NAME}"\n', encoding="utf-8")

        code = self.run_scaffold("--var", "AGENT_NAME=Auri", "--var", "PKG=auri_agent")

        self.assertEqual(code, 0)
        generated = self.target / "auri_agent" / "app.py"
        self.assertEqual(generated.read_text(encoding="utf-8"), 'NAME = "Auri"\n')

    def test_unresolved_variable_stops_before_writing(self):
        self.write_manifest(variables=["AGENT_NAME"])
        (self.template / "app.py").write_text('NAME = "${AGENT_NAME}"\n', encoding="utf-8")

        code = self.run_scaffold("--env", str(self.root / "missing.env"))

        self.assertEqual(code, 3)
        self.assertFalse(self.target.exists())

    def test_preserves_undeclared_uppercase_runtime_template_literal_when_enabled(self):
        self.write_manifest(preserveUndeclaredVariables=True)
        (self.template / "app.ts").write_text("const value = `${MAX_ITEMS} items`;\n", encoding="utf-8")

        code = self.run_scaffold()

        self.assertEqual(code, 0)
        self.assertEqual((self.target / "app.ts").read_text(encoding="utf-8"), "const value = `${MAX_ITEMS} items`;\n")

    def test_ignores_typescript_template_literals(self):
        (self.template / "app.ts").write_text("const s = `${count} items`;\n", encoding="utf-8")

        code = self.run_scaffold()

        self.assertEqual(code, 0)
        self.assertEqual((self.target / "app.ts").read_text(encoding="utf-8"), "const s = `${count} items`;\n")

    def test_block_files_are_skipped_when_block_is_off(self):
        self.write_manifest(blockFiles={"B17": ["image_tools.py"]})
        (self.template / "image_tools.py").write_text("draw()\n", encoding="utf-8")
        (self.template / "main.py").write_text("run()\n", encoding="utf-8")

        self.assertEqual(self.run_scaffold(), 0)
        self.assertFalse((self.target / "image_tools.py").exists())
        self.assertTrue((self.target / "main.py").exists())

    def test_block_files_are_written_when_block_is_on(self):
        self.write_manifest(blockFiles={"B17": ["image_tools.py"]})
        (self.template / "image_tools.py").write_text("draw()\n", encoding="utf-8")

        self.assertEqual(self.run_scaffold("--blocks", "B17"), 0)
        self.assertTrue((self.target / "image_tools.py").exists())

    def test_refuses_non_empty_target_without_force(self):
        (self.template / "app.py").write_text("run()\n", encoding="utf-8")
        self.target.mkdir()
        (self.target / "existing.txt").write_text("keep", encoding="utf-8")

        self.assertEqual(self.run_scaffold(), 2)
        self.assertFalse((self.target / "app.py").exists())
        self.assertEqual(self.run_scaffold("--force"), 0)

    def test_dry_run_writes_nothing(self):
        (self.template / "app.py").write_text("run()\n", encoding="utf-8")

        self.assertEqual(self.run_scaffold("--dry-run"), 0)
        self.assertFalse(self.target.exists())

    def test_template_variables_collects_path_and_content_tokens(self):
        (self.template / "__PKG__" / "app.py").write_text("X = '${AGENT_NAME}'\n", encoding="utf-8")

        self.assertEqual(template_variables(self.template), {"PKG", "AGENT_NAME"})


class StripBlocksTests(unittest.TestCase):
    SOURCE = (
        "keep-1\n"
        "# SCAFFOLD:BLOCK:B17:START\n"
        "image()\n"
        "# SCAFFOLD:BLOCK:B17:END\n"
        "keep-2\n"
    )

    def test_removes_unselected_block(self):
        self.assertEqual(strip_blocks(self.SOURCE, set()), "keep-1\nkeep-2\n")

    def test_keeps_selected_block_without_markers(self):
        self.assertEqual(strip_blocks(self.SOURCE, {"B17"}), "keep-1\nimage()\nkeep-2\n")

    def test_leaves_files_without_markers_untouched(self):
        self.assertEqual(strip_blocks("plain\n", set()), "plain\n")


if __name__ == "__main__":
    unittest.main()
