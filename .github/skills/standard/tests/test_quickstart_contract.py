import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
STANDARD = ROOT / ".github/skills/standard"


class QuickstartContractTests(unittest.TestCase):
    def test_readme_has_copyable_short_prompt_and_full_handoff(self):
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(
            "```text\nhttps://github.com/geekfujiwara/CodeAppsDevelopmentStandard クイックスタートして\n```",
            text,
        )
        for requirement in (
            ".github/agents", ".github/skills", ".gitignore", "auth_helper.py",
            "spec-builder", "インタラクティブ", "AskUserQuestion", "Mermaid",
            ".github/skills/standard/references/quickstart.md",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, text)

    def test_workflow_covers_setup_documents_consulting_and_decisions_in_order(self):
        text = (STANDARD / "references/quickstart.md").read_text(encoding="utf-8")
        steps = re.findall(r"^## Step (\d+):", text, re.MULTILINE)
        self.assertEqual(steps, ["1", "2", "3", "4", "5", "6"])
        for requirement in (
            "initialize_workspace.py", "setup_environment.py --list",
            "setup_environment.py --profile", "setup_environment.py --auth-only",
            "publishers", "solutions", "PUBLISHER_PREFIX",
            "spec-builder/SKILL.md", "ワークスペース名", "architecture/SKILL.md",
            "business-requirements.md", "design-requirements.md",
            "Mermaid コードブロック", "チャットと Markdown の両方",
            "仮説", "To-Be", "AI 改善", "AskUserQuestion",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, text)
        self.assertIn("認証できない場合は未完了を明記", text)
        self.assertIn("本人の決定が不可欠", text)

    def test_entrypoints_route_to_quickstart_without_stopping_after_copy(self):
        paths = (
            STANDARD / "SKILL.md",
            ROOT / ".github/agents/GeekPowerCode.agent.md",
            ROOT / ".github/prompts/quickstart.prompt.md",
        )
        for path in paths:
            with self.subTest(path=str(path)):
                text = path.read_text(encoding="utf-8")
                self.assertIn("quickstart.md", text)
                self.assertIn("architecture", text)
                self.assertIn("spec-builder", text)
                self.assertIn("Mermaid", text)

    def test_spec_and_architecture_preserve_fact_and_hypothesis_boundary(self):
        for skill in ("spec-builder", "architecture"):
            with self.subTest(skill=skill):
                text = (ROOT / f".github/skills/{skill}/SKILL.md").read_text(encoding="utf-8")
                self.assertIn("クイックスタート", text)
                self.assertIn("仮説", text)
                self.assertIn("AskUserQuestion", text)
                self.assertIn("ワークスペース名", text)


if __name__ == "__main__":
    unittest.main()
