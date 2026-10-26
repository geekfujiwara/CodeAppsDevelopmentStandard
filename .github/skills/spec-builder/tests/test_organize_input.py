import sys
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from organize_input import organize_documents


class OrganizeInputTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve()
        self.document = self.workspace / "business.docx"
        self.content = b"original business document"
        self.document.write_bytes(self.content)

    def test_plan_does_not_move_or_create_directories(self):
        plan = organize_documents(self.workspace, ["business.docx"])
        self.assertEqual(plan, [(self.document, self.workspace / "spec/input/business.docx")])
        self.assertTrue(self.document.exists())
        self.assertFalse((self.workspace / "spec").exists())

    def test_apply_moves_selected_documents_without_changing_content(self):
        readme = self.workspace / "README.md"
        readme.write_text("project instructions", encoding="utf-8")
        plan = organize_documents(self.workspace, ["business.docx"], apply=True)
        self.assertFalse(self.document.exists())
        self.assertEqual(plan[0][1].read_bytes(), self.content)
        self.assertTrue(readme.exists())

    def test_collision_is_detected_before_any_move(self):
        destination = self.workspace / "spec/input"
        destination.mkdir(parents=True)
        (destination / "later.pdf").write_bytes(b"existing input")
        (self.workspace / "later.pdf").write_bytes(b"new input")
        with self.assertRaises(FileExistsError):
            organize_documents(self.workspace, ["business.docx", "later.pdf"], apply=True)
        self.assertTrue(self.document.exists())
        self.assertFalse((destination / "business.docx").exists())
        self.assertEqual((destination / "later.pdf").read_bytes(), b"existing input")

    def test_protected_files_paths_and_unsupported_extensions_are_rejected(self):
        for name in ("README.md", "README.ja.md", "AGENTS.md", "LICENSE.txt",
                     ".env", "app.ts", "index.html", "../outside.pdf", "nested/input.pdf"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                organize_documents(self.workspace, ["business.docx", name], apply=True)
            self.assertTrue(self.document.exists())

    def test_duplicate_selection_is_rejected_before_any_move(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            organize_documents(self.workspace, ["business.docx", "BUSINESS.docx"], apply=True)
        self.assertTrue(self.document.exists())

    def test_input_parent_file_is_rejected(self):
        (self.workspace / "spec").write_text("not a directory", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Unsafe input directory"):
            organize_documents(self.workspace, ["business.docx"], apply=True)
        self.assertTrue(self.document.exists())

    def test_source_and_destination_symlinks_are_rejected_without_privileged_setup(self):
        for relative in ("business.docx", "spec", "spec/input", "spec/input/business.docx"):
            with self.subTest(relative=relative):
                original = Path.is_symlink
                selected_path = self.workspace / relative
                with patch.object(Path, "is_symlink",
                                  lambda path: path == selected_path or original(path)):
                    with self.assertRaises((ValueError, FileExistsError)):
                        organize_documents(self.workspace, ["business.docx"], apply=True)
                self.assertTrue(self.document.exists())

    def test_failed_copy_preserves_source_and_removes_partial_destination(self):
        with patch("organize_input.shutil.copyfileobj", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(OSError, "disk full"):
                organize_documents(self.workspace, ["business.docx"], apply=True)
        self.assertEqual(self.document.read_bytes(), self.content)
        self.assertFalse((self.workspace / "spec/input/business.docx").exists())

    def test_changed_content_is_not_removed(self):
        with patch("organize_input.sha256_of", side_effect=["original", "changed"]):
            with self.assertRaisesRegex(RuntimeError, "source preserved"):
                organize_documents(self.workspace, ["business.docx"], apply=True)
        self.assertTrue(self.document.exists())

    def test_cli_can_plan_in_a_workspace_without_git(self):
        script = Path(__file__).resolve().parents[1] / "scripts/organize_input.py"
        result = subprocess.run(
            [sys.executable, str(script), "--file", "business.docx"],
            cwd=self.workspace, text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PLAN:", result.stdout)
        self.assertTrue(self.document.exists())

    def test_organized_text_can_be_converted_with_the_existing_converter(self):
        source = self.workspace / "business.md"
        source.write_text("# Business\n\nExisting requirements.", encoding="utf-8")
        organize_documents(self.workspace, ["business.md"], apply=True)
        script = Path(__file__).resolve().parents[1] / "scripts/convert_documents.py"
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(script),
             "--input", str(self.workspace / "spec/input"),
             "--staging", str(self.workspace / "spec/output/staging"),
             "--docs", str(self.workspace / "spec/output/docs"),
             "--checklist", str(self.workspace / "spec/.cache/conversion-checklist.json")],
            cwd=self.workspace, text=True, encoding="utf-8", capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        staging = self.workspace / "spec/output/staging/business.md.MD"
        self.assertIn("Existing requirements.", staging.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
