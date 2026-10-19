import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/initialize_workspace.py"
SPEC = importlib.util.spec_from_file_location("initialize_workspace", SCRIPT)
subject = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(subject)


class InitializeWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.source = root / "standard"
        self.target = root / "application"
        self.write_source(".github/agents/example.agent.md", "agent")
        self.write_source(".github/skills/standard/SKILL.md", "skill")
        self.write_source(".github/skills/standard/scripts/auth_helper.py", "shared authentication")
        self.write_source(".github/skills/standard/references/gitignore-template", ".env\n.venv/\n")
        self.write_source(".github/prompts/quickstart.prompt.md", "continue")

    def write_source(self, relative, content):
        path = self.source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_dry_run_does_not_create_workspace(self):
        report = subject.install_workspace(self.source, self.target)
        self.assertIn(".github/agents/example.agent.md", report["copied"])
        self.assertFalse(self.target.exists())

    def test_installs_agents_skills_authentication_and_ignore_template(self):
        report = subject.install_workspace(self.source, self.target, apply=True)
        self.assertFalse(report["conflicts"])
        for relative in (
            ".github/agents/example.agent.md",
            ".github/skills/standard/scripts/auth_helper.py",
            ".github/prompts/quickstart.prompt.md",
        ):
            self.assertTrue((self.target / relative).is_file())
        self.assertIn(".env", (self.target / ".gitignore").read_text())

    def test_reexecution_is_idempotent_and_preserves_local_customizations(self):
        subject.install_workspace(self.source, self.target, apply=True)
        ignore = self.target / ".gitignore"
        original_ignore = ignore.read_text()
        local_agent = self.target / ".github/agents/example.agent.md"
        local_agent.write_text("local rules", encoding="utf-8")
        report = subject.install_workspace(self.source, self.target, apply=True)
        self.assertEqual(report["conflicts"], [".github/agents/example.agent.md"])
        self.assertEqual(local_agent.read_text(), "local rules")
        self.assertEqual(ignore.read_text(), original_ignore)
        self.assertEqual(report["copied"], [])

    def test_existing_gitignore_and_env_are_preserved(self):
        self.target.mkdir()
        (self.target / ".gitignore").write_text("local-output/", encoding="utf-8")
        (self.target / ".env").write_text("LOCAL_SETTING=kept\n", encoding="utf-8")
        subject.install_workspace(self.source, self.target, apply=True)
        self.assertTrue((self.target / ".gitignore").read_text().startswith("local-output/"))
        self.assertEqual((self.target / ".env").read_text(), "LOCAL_SETTING=kept\n")

    def test_runtime_files_and_env_values_are_not_copied(self):
        self.write_source(".github/skills/standard/.env", "PRIVATE=value")
        self.write_source(".github/skills/standard/.venv/cache.py", "runtime")
        self.write_source(".github/skills/standard/references/.env.example", "NAME=<name>")
        report = subject.install_workspace(self.source, self.target, apply=True)
        self.assertNotIn(".github/skills/standard/.env", report["copied"])
        self.assertFalse((self.target / ".github/skills/standard/.venv").exists())
        self.assertTrue((self.target / ".github/skills/standard/references/.env.example").exists())

    def test_symlink_destination_is_rejected_before_any_copy(self):
        self.target.mkdir()
        outside = Path(self.temporary.name) / "outside"
        outside.mkdir()
        (self.target / ".github").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            subject.install_workspace(self.source, self.target, apply=True)
        self.assertEqual(list(outside.iterdir()), [])

    def test_source_symlink_is_rejected(self):
        outside = Path(self.temporary.name) / "external.md"
        outside.write_text("not part of standard", encoding="utf-8")
        (self.source / ".github/agents/linked.md").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "symlink"):
            subject.install_workspace(self.source, self.target, apply=True)
        self.assertFalse(self.target.exists())

    def test_file_as_destination_parent_is_rejected_before_any_copy(self):
        self.target.mkdir()
        (self.target / ".github").write_text("local file", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "not a directory"):
            subject.install_workspace(self.source, self.target, apply=True)
        self.assertEqual((self.target / ".github").read_text(), "local file")


if __name__ == "__main__":
    unittest.main()
