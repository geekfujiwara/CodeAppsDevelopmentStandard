"""Regression checks for the documented development-first skill contract."""

import ast
import re
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


GITHUB_ROOT = Path(__file__).resolve().parents[3]
SKILLS_ROOT = GITHUB_ROOT / "skills"


def skill_text(skill, relative="SKILL.md"):
    return (SKILLS_ROOT / skill / relative).read_text(encoding="utf-8")


class DevelopmentPolicyTests(unittest.TestCase):
    def test_primary_entrypoints_use_dataverse_and_start_without_environment_checks(self):
        sources = {
            skill: skill_text(skill)
            for skill in ("standard", "architecture", "code-apps")
        }
        sources["agent"] = (GITHUB_ROOT / "agents/GeekPowerCode.agent.md").read_text(
            encoding="utf-8"
        )
        for name, text in sources.items():
            with self.subTest(entrypoint=name):
                self.assertIn("SharePoint URL", text)
                self.assertIn("Dataverse", text)
                self.assertIn("環境チェックを明示的に依頼されない限り", text)
                self.assertIn("初回 push", text)
                self.assertIn("development-recovery.md", text)

    def test_normal_code_apps_commands_do_not_run_admin_diagnostics(self):
        paths = (
            "SKILL.md",
            "references/build-reference.md",
            "templates/store-ordering/README.md",
        )
        for path in paths:
            with self.subTest(path=path):
                text = skill_text("code-apps", path)
                code_blocks = re.findall(r"```[^\n]*\n(.*?)```", text, re.DOTALL)
                commands = "\n".join(
                    line for block in code_blocks for line in block.splitlines()
                    if not line.lstrip().startswith("#")
                )
                self.assertNotRegex(
                    commands,
                    r"python\s+\S*/(?:check_environment|check_dlp|"
                    r"check_development_environment|check_code_apps_environment)\.py",
                )

    def test_old_mandatory_environment_gates_are_not_reintroduced(self):
        paths = [SKILLS_ROOT / "README.md", GITHUB_ROOT / "agents/GeekPowerCode.agent.md"]
        paths.extend(SKILLS_ROOT.glob("*/SKILL.md"))
        forbidden = (
            "実装着手前に必須",
            "実装着手前に** Step 1・Step 2",
            "開発着手前の環境チェック",
            "pa app init の前に必ず実行",
            "設計確定後に admin の環境・DLP/ACP チェックを実行",
        )
        for path in paths:
            with self.subTest(path=str(path.relative_to(GITHUB_ROOT))):
                text = path.read_text(encoding="utf-8")
                for phrase in forbidden:
                    self.assertNotIn(phrase, text)

    def test_store_ordering_deploys_before_full_dataverse_setup(self):
        text = skill_text("code-apps", "templates/store-ordering/README.md")
        self.assertLess(text.index("npm run deploy --"), text.index("npm run dv:setup"))
        self.assertLess(text.index("--solution-only"), text.index("setup_connection_reference.py"))
        self.assertIn("未接続部分は UI と報告で明示", text)

    def test_solution_only_does_not_create_tables_or_data(self):
        path = SKILLS_ROOT / "code-apps/templates/store-ordering/scripts/dataverse/setup_dataverse.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "main")
        calls = {
            name: Mock() for name in (
                "ensure_solution", "validate_tables", "validate_no_foreign_tables", "create_tables",
                "create_lookups", "ensure_date_only_behavior", "publish_all", "localize_tables",
                "create_demo_data", "ensure_solution_membership", "verify_tables",
            )
        }
        namespace = {**calls, "DATAVERSE_URL": "placeholder", "SOLUTION_NAME": "Example", "PREFIX": "example"}
        exec(compile(ast.Module(body=[main], type_ignores=[]), str(path), "exec"), namespace)
        with patch.object(sys, "argv", ["setup", "--solution-only"]):
            namespace["main"]()
        calls["ensure_solution"].assert_called_once_with()
        for name, function in calls.items():
            if name != "ensure_solution":
                function.assert_not_called()
        with patch.object(sys, "argv", ["setup", "--solution-only", "--localize-only"]):
            with self.assertRaises(SystemExit) as raised:
                namespace["main"]()
            self.assertEqual(raised.exception.code, 2)
        calls["ensure_solution"].assert_called_once_with()

    def test_migration_entrypoints_preserve_explicit_sharepoint_exception(self):
        for skill in ("sharepoint", "dataverse", "data-migration"):
            with self.subTest(skill=skill):
                text = skill_text(skill)
                self.assertIn("SharePoint URL", text)
                self.assertIn("明示", text)
                self.assertIn("Dataverse", text)
                self.assertIn("移行元", text)
        migration = skill_text("data-migration")
        self.assertIn("元の SharePoint データは変更・削除せず", migration)
        self.assertIn("hash 承認", migration)
        self.assertIn("照合", migration)

    def test_recovery_distinguishes_read_write_and_escalates_without_retry_loops(self):
        text = skill_text("admin", "references/development-recovery.md")
        for requirement in (
            "委任スコープ", "有効ロールと範囲", "PIM", "変更権限",
            "読み取れない項目", "未確認", "管理操作は行わない",
            "1 回", "二重作成", "読み戻し", "環境管理者", "承認", "Retry-After",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, text)
        steps = re.findall(r"^## Step (\d+):", text, re.MULTILINE)
        self.assertEqual(steps, ["1", "2", "3", "4", "5"])

    def test_new_recovery_links_resolve(self):
        paths = list(SKILLS_ROOT.glob("*/SKILL.md"))
        paths += [SKILLS_ROOT / "README.md"]
        for path in paths:
            text = path.read_text(encoding="utf-8")
            for target in re.findall(r"\]\(([^)]+development-recovery\.md)\)", text):
                with self.subTest(path=str(path), target=target):
                    self.assertTrue((path.parent / target).is_file())


if __name__ == "__main__":
    unittest.main()
