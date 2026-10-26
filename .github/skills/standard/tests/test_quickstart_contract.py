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

    def test_entrypoints_require_waiting_for_intent_after_authentication(self):
        paths = (
            STANDARD / "SKILL.md",
            ROOT / ".github/agents/GeekPowerCode.agent.md",
            ROOT / ".github/prompts/quickstart.prompt.md",
        )
        for path in paths:
            with self.subTest(path=str(path)):
                text = path.read_text(encoding="utf-8")
                self.assertIn("認証準備後は AskUserQuestion で要望確認", text)
                self.assertIn("必ず回答待ちで一旦停止", text)
                self.assertIn("回答前に資料変換・仕様作成・設計提案へ進ま", text)

    def test_checkpoint_follows_cache_verification_and_precedes_documentation(self):
        text = (STANDARD / "references/quickstart.md").read_text(encoding="utf-8")
        setup = text.split("## Step 0:", 1)[1].split("## Step 1:", 1)[0]
        self.assertLess(
            setup.index("setup_environment.py --auth-only"),
            setup.index("verify_auth_cache.py --env .env"),
        )
        self.assertLess(
            setup.index("verify_auth_cache.py --env .env"),
            setup.index("必ず回答待ちで一旦停止"),
        )
        for requirement in (
            "2〜3 個の具体的なアプリ案", "想定利用者・主要機能・推奨 AI 機能・推奨理由",
            "今は準備までにする", "開発環境へのデプロイ・テストまで進める",
            "AskUserQuestion が提供されていない", "回答を待つ",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, setup)
        self.assertIn("回答を待ちます", (ROOT / "README.md").read_text(encoding="utf-8"))

    def test_entrypoints_continue_autonomously_after_the_single_checkpoint(self):
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
                self.assertIn("ワークスペース名", text)


if __name__ == "__main__":
    unittest.main()
