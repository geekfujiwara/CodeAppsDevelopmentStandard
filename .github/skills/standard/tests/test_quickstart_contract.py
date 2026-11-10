import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
STANDARD = ROOT / ".github/skills/standard"


class QuickstartContractTests(unittest.TestCase):
    def test_readme_has_copyable_short_prompt_and_full_handoff(self):
        readme = ROOT / "README.md"
        if not readme.exists():
            self.skipTest("README.md is not included in this workspace")
        text = readme.read_text(encoding="utf-8")
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
        self.assertNotIn("認証後は`AskUserQuestion`で要望と実施範囲を確認して一旦停止", text)
        self.assertNotIn("認証後の一度の要望確認は維持", text)

    def test_workflow_covers_setup_documents_environment_and_deployment_in_order(self):
        text = (STANDARD / "references/quickstart.md").read_text(encoding="utf-8")
        steps = re.findall(r"^## Step (\d+):", text, re.MULTILINE)
        self.assertEqual(steps, ["0", "1", "2", "3"])
        for requirement in (
            "initialize_workspace.py", "setup_environment.py --list",
            "setup_environment.py --profile", "setup_environment.py --auth-only",
            "publishers", "solutions", "PUBLISHER_PREFIX",
            "spec-builder/SKILL.md", "ワークスペース名", "architecture/SKILL.md",
            "business-requirements.md", "design-requirements.md",
            "Mermaid コードブロック", "チャットと Markdown の両方",
            "仮説", "To-Be", "AI 改善", "AskUserQuestion", "organize_input.py",
            "scaffold_from_template.py", "フル構成", "実動作検証",
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

    def test_entrypoints_continue_without_mandatory_intent_checkpoint(self):
        paths = (
            STANDARD / "SKILL.md",
            ROOT / ".github/agents/GeekPowerCode.agent.md",
            ROOT / ".github/prompts/quickstart.prompt.md",
        )
        for path in paths:
            with self.subTest(path=str(path)):
                text = path.read_text(encoding="utf-8")
                self.assertIn("既知事項や通常の実装判断で AskUserQuestion を繰り返さない", text)
                self.assertNotIn("必ず回答待ちで一旦停止", text)
                self.assertNotIn("認証準備後は AskUserQuestion で要望確認", text)

    def test_any_blocker_question_follows_cache_verification_and_only_blocks_affected_actions(self):
        text = (STANDARD / "references/quickstart.md").read_text(encoding="utf-8")
        setup = text.split("## Step 0:", 1)[1].split("## Step 1:", 1)[0]
        self.assertLess(
            setup.index("setup_environment.py --auth-only"),
            setup.index("verify_auth_cache.py --env .env"),
        )
        self.assertLess(
            setup.index("verify_auth_cache.py --env .env"),
            setup.index("### 対象が明確なら質問せず構築を開始する"),
        )
        for requirement in (
            "本人しか決められない事項が残る場合", "回答を要する操作だけを保留",
            "独立作業を継続", "安全な開発用の既定案",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, setup)
        self.assertNotIn("必ず回答待ち", setup)

    def test_entrypoints_continue_autonomously_without_mandatory_checkpoint(self):
        for path in (
            STANDARD / "SKILL.md",
            ROOT / ".github/agents/GeekPowerCode.agent.md",
            ROOT / ".github/prompts/quickstart.prompt.md",
            ROOT / ".github/skills/spec-builder/SKILL.md",
            ROOT / ".github/skills/architecture/SKILL.md",
        ):
            with self.subTest(path=str(path)):
                text = path.read_text(encoding="utf-8")
                self.assertIn("既知事項や通常の実装判断で AskUserQuestion を繰り返さない", text)
                self.assertIn("フル構成", text)
                self.assertIn("実動作検証", text)

    def test_scaffolding_and_environment_discovery_do_not_force_questions(self):
        scaffolding = (
            ROOT / ".github/skills/update-skills/references/scaffolding.md"
        ).read_text(encoding="utf-8")
        self.assertIn("明示済みの意図を聞き直さず", scaffolding)
        self.assertNotIn("認証後の要望確認で必ず一度停止", scaffolding)

        setup_script = (
            ROOT / ".github/skills/standard/scripts/setup_environment.py"
        ).read_text(encoding="utf-8")
        self.assertIn("本人しか決められない選択が残る場合だけ確認", setup_script)
        self.assertNotIn("AskUserQuestion でユーザーに選ばせる", setup_script)

    def test_documentation_and_environment_selection_precede_full_deployment(self):
        text = (STANDARD / "references/quickstart.md").read_text(encoding="utf-8")
        design = text.split("## Step 1:", 1)[1].split("## Step 2:", 1)[0]
        environment = text.split("## Step 2:", 1)[1].split("## Step 3:", 1)[0]
        deployment = text.split("## Step 3:", 1)[1]
        for requirement in (
            "spec/input/", "organize_input.py", "spec-builder/SKILL.md", "architecture/SKILL.md",
            "templates/", "scaffold.json", "チャットと Markdown の両方",
            "図を質問欄へ入れない", "返答を待たず Step 2",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, design)
        for requirement in (
            "サブスクリプション", "リソースグループ", "AI モデル", "リージョン",
            "publishers", "solutions", "テーブル", "候補が複数あることだけを理由に質問しない",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, environment)
        self.assertLess(deployment.index("npm run predeploy"), deployment.index("npm run deploy"))
        for requirement in (
            "失敗時は停止", "実動作", "HTTP 成功や URL 発行だけで完了としない",
            "各 URL", "spec/requirements.md", "全て実装・デプロイ・検証済みの場合だけ",
            "本番・外部公開", "追加費用", "hash 承認", "ブロックされた操作だけを止め",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, deployment)

    def test_spec_and_architecture_preserve_fact_and_hypothesis_boundary(self):
        for skill in ("spec-builder", "architecture"):
            with self.subTest(skill=skill):
                text = (ROOT / f".github/skills/{skill}/SKILL.md").read_text(encoding="utf-8")
                self.assertIn("クイックスタート", text)
                self.assertIn("仮説", text)
                self.assertIn("AskUserQuestion", text)
                self.assertIn("ワークスペース", text)

    def test_deployment_entrypoints_do_not_require_a_monthly_budget(self):
        for relative in (
            "skills/standard/SKILL.md",
            "skills/standard/references/quickstart.md",
            "skills/azure-infra/SKILL.md",
            "skills/azure-infra/references/preflight-checklist.md",
            "skills/azure-infra/references/foundry-agent.md",
            "skills/architecture/SKILL.md",
            "skills/foundry-autopilot/SKILL.md",
            "agents/GeekPowerCode.agent.md",
            "prompts/quickstart.prompt.md",
        ):
            with self.subTest(path=relative):
                text = (ROOT / ".github" / relative).read_text(encoding="utf-8")
                for requirement in (
                    "開発デプロイと費用の共通契約", "月額上限の確定を開始条件にしない",
                    "モデルのデプロイ", "従量課金",
                ):
                    self.assertIn(requirement, text)
        azure = (ROOT / ".github/skills/azure-infra/SKILL.md").read_text(encoding="utf-8")
        self.assertNotIn("実装先と課金上限", azure)

    def test_cost_contract_preserves_explicit_limits_and_security_boundaries(self):
        text = (STANDARD / "SKILL.md").read_text(encoding="utf-8")
        contract = text.split("## 開発デプロイと費用の共通契約", 1)[1].split("\n## ", 1)[0]
        for requirement in (
            "予算未回答・未確定だけを理由に停止しない",
            "必要最小限の容量と検証回数", "停止・削除方法",
            "明示された予算上限・課金禁止", "組織の支出制限・ライセンス条件",
            "予約／専用容量・長期契約", "該当操作だけを止め",
            "本番・外部公開", "RBAC", "Azure Policy", "MFA", "hash 承認",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, contract)
        workflow = (STANDARD / "references/quickstart.md").read_text(encoding="utf-8")
        exceptions = workflow.split("### 追加の質問が必要な例外", 1)[1]
        self.assertIn("依頼範囲外の追加費用", exceptions)
        self.assertIn("開発依頼に必要な従量課金", exceptions)
        self.assertIn("明示された予算上限・課金禁止", exceptions)


if __name__ == "__main__":
    unittest.main()
