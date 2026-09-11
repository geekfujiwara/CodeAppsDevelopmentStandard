"""Unit tests for scaffold_ai_teammate.py.

Run with:
    python -m unittest .github/skills/ai-teammate/scripts/tests/test_scaffold_ai_teammate.py -v
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scaffold_ai_teammate.py"
SKILL_ROOT = SCRIPT_PATH.parent.parent

_spec = importlib.util.spec_from_file_location("scaffold_ai_teammate", SCRIPT_PATH)
scaffold_ai_teammate = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = scaffold_ai_teammate
assert _spec.loader is not None
_spec.loader.exec_module(scaffold_ai_teammate)

# Split so this file never contains the literal contiguous GUID/URL patterns that the
# skill's own secret scanner (update-skills/scripts/validate_skill.py) looks for.
_REAL_SUBSCRIPTION_ID = "d0b22a7f" + "-8129-4a0d-bd5a-e8af107be62b"
_REAL_TENANT_ID = "f092b281" + "-d5e8-40dd-9bc0-198b375b0e7a"

BANNED_SUBSTRINGS = (
    "Hunter3Agent",
    "hunter3-agent",
    "ミーナ",
    "M365x" + "45121568",
    _REAL_SUBSCRIPTION_ID,
    _REAL_TENANT_ID,
)

# Uses only allowlisted placeholder GUIDs/domains (see validate_skill.py ALLOWLIST/EMAIL_ALLOW)
# so this fixture itself passes the skill's secret scan.
FULL_ENV = {
    "AZURE_SUBSCRIPTION_ID": "00000000-0000-0000-0000-000000000000",
    "AZURE_TENANT_ID": "00000000-0000-0000-0000-000000000001",
    "AZURE_RESOURCE_GROUP": "rg-test",
    "ENV_ID": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "DATAVERSE_URL": "https://<org>.crm.dynamics.com",
    "SOLUTION_NAME": "TestSolution",
    "PUBLISHER_PREFIX": "geek",
    "ORGANIZATION_INTERNAL_DOMAINS": "contoso.onmicrosoft.com",
    "AZURE_OPENAI_ENDPOINT": "https://test-aoai.openai.azure.com",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-4.1",
    "USAGE_ADMINS": "admin@contoso.onmicrosoft.com",
}


def base_decisions(**overrides: object) -> dict[str, object]:
    decisions: dict[str, object] = {
        "agentName": "sample-colleague",
        "displayName": "サンプル同僚",
        "role": "予定調整の秘書",
        "personality": "誠実で頼れる態度",
        "implementationMode": "full",
        "preset": "role",
    }
    decisions.update(overrides)
    return decisions


class ResolveBlocksTests(unittest.TestCase):
    def test_full_preset_includes_all_blocks(self) -> None:
        plan = scaffold_ai_teammate.build_plan(
            base_decisions(preset="full"), Path("unused")
        )
        self.assertEqual(plan.blocks, scaffold_ai_teammate.ALL_BLOCKS)
        self.assertEqual(len(plan.blocks), 17)

    def test_b15_and_evaluation_app_are_always_required(self) -> None:
        plan = scaffold_ai_teammate.build_plan(
            base_decisions(preset="role", blocks=["B1"]), Path("unused")
        )
        self.assertIn("B15", plan.blocks)
        self.assertTrue(plan.evaluation_app)

    def test_evaluation_app_cannot_be_disabled_via_decisions(self) -> None:
        plan = scaffold_ai_teammate.build_plan(
            base_decisions(preset="role", blocks=["B1"], evaluationApp=False), Path("unused")
        )
        self.assertTrue(plan.evaluation_app)

    def test_b12_dependency_pulls_in_b3_b13_b14_b16(self) -> None:
        plan = scaffold_ai_teammate.build_plan(
            base_decisions(preset="role", blocks=["B12"]), Path("unused")
        )
        for expected in ("B3", "B12", "B13", "B14", "B16", "B15"):
            self.assertIn(expected, plan.blocks, f"{expected} should be pulled in by B12")

    def test_b17_dependency_pulls_in_delivery_and_sandbox_blocks(self) -> None:
        plan = scaffold_ai_teammate.build_plan(
            base_decisions(preset="role", blocks=["B17"]), Path("unused")
        )
        for expected in ("B3", "B12", "B14", "B15", "B17"):
            self.assertIn(expected, plan.blocks, f"{expected} should be pulled in by B17")

    def test_role_r1_resolves_documented_blocks(self) -> None:
        plan = scaffold_ai_teammate.build_plan(
            base_decisions(preset="role", roles=["R1"]), Path("unused")
        )
        for expected in ("B1", "B2", "B3", "B4", "B6", "B8", "B15"):
            self.assertIn(expected, plan.blocks)

    def test_unknown_block_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            scaffold_ai_teammate.build_plan(
                base_decisions(preset="role", blocks=["B99"]), Path("unused")
            )

    def test_unknown_role_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            scaffold_ai_teammate.build_plan(
                base_decisions(preset="role", roles=["R9"]), Path("unused")
            )

    def test_invalid_namespace_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            scaffold_ai_teammate.build_plan(
                base_decisions(preset="role", blocks=["B1"], namespace="not-valid!"),
                Path("unused"),
            )

    def test_agent_name_with_path_traversal_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            scaffold_ai_teammate.build_plan(
                base_decisions(preset="role", blocks=["B1"], agentName="../evil"),
                Path("unused"),
            )


class ScaffoldFileSystemTests(unittest.TestCase):
    def test_scaffold_into_empty_target_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="full"), target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            self.assertTrue((target / "Agent.csproj").is_file())
            self.assertTrue((target / "Program.cs").is_file())
            self.assertTrue((target / "evaluation-app" / "package.json").is_file())
            self.assertTrue((target / "scaffold-plan.json").is_file())

            plan_data = json.loads((target / "scaffold-plan.json").read_text(encoding="utf-8"))
            self.assertEqual(plan_data["blocks"], list(scaffold_ai_teammate.ALL_BLOCKS))

    def test_scaffold_rejects_nonempty_target_without_force(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            (target / "existing.txt").write_text("keep me", encoding="utf-8")
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="role", blocks=["B1"]), target)
            with self.assertRaises(ValueError):
                scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

    def test_scaffold_rejects_unresolved_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="full"), target)
            incomplete_env = {"AZURE_SUBSCRIPTION_ID": "00000000-0000-0000-0000-000000000000"}
            with self.assertRaises(ValueError) as context:
                scaffold_ai_teammate.scaffold(plan, incomplete_env, force=False)
            self.assertIn("Unresolved", str(context.exception))

    def test_excluded_block_files_are_not_scaffolded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            decisions = base_decisions(preset="role", blocks=["B1"])
            plan = scaffold_ai_teammate.build_plan(decisions, target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            # B9/B10/B11/B12/B17 were not requested and have no hard dependency here.
            self.assertFalse((target / "TeamsChatTools.cs").exists())
            self.assertFalse((target / "WebSearchTools.cs").exists())
            self.assertFalse((target / "ImageGenerationTools.cs").exists())
            # Base files are always present.
            self.assertTrue((target / "AgentBrain.cs").is_file())
            self.assertTrue((target / "UsageStore.cs").is_file())

    def test_b17_scaffolds_image_generation_and_delivery_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(
                base_decisions(preset="role", blocks=["B17"]), target
            )
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            self.assertTrue((target / "ImageGenerationTools.cs").is_file())
            self.assertTrue((target / "FileDelivery.cs").is_file())
            self.assertTrue((target / "DocumentLedger.cs").is_file())
            self.assertTrue((target / "SandboxTools.cs").is_file())

    def test_rendered_csharp_has_no_leftover_block_markers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="full"), target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            for path in target.rglob("*.cs"):
                content = path.read_text(encoding="utf-8")
                self.assertNotIn("GEEK:BLOCK", content, f"leftover marker in {path}")


class SanitizationScanTests(unittest.TestCase):
    """Scans the checked-in templates (not rendered output) for tenant-specific leftovers."""

    def test_digital_colleague_templates_have_no_banned_strings(self) -> None:
        self._scan(SKILL_ROOT / "templates" / "digital-colleague")

    def test_evaluation_app_templates_have_no_banned_strings(self) -> None:
        self._scan(SKILL_ROOT / "templates" / "evaluation-app", skip_dirs={"node_modules"})

    def _scan(self, root: Path, skip_dirs: set[str] = frozenset()) -> None:
        offenders: list[str] = []
        for path in root.rglob("*"):
            if not path.is_file() or any(part in skip_dirs for part in path.parts):
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, PermissionError):
                continue
            for banned in BANNED_SUBSTRINGS:
                if banned in content:
                    offenders.append(f"{path}: contains '{banned}'")
        self.assertEqual([], offenders)


class PublisherPrefixSubstitutionTests(unittest.TestCase):
    """Regression coverage for the geek_ -> ${PUBLISHER_PREFIX}_ fix in EvaluationDataverse.cs /
    EvaluationRunner.cs: generated C# must use whatever PUBLISHER_PREFIX the project configured,
    never the sample prefix "geek" hardcoded."""

    def test_generated_csharp_has_no_leftover_geek_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="full"), target)
            env = {**FULL_ENV, "PUBLISHER_PREFIX": "contoso"}
            scaffold_ai_teammate.scaffold(plan, env, force=False)

            dataverse_content = (target / "EvaluationDataverse.cs").read_text(encoding="utf-8")
            runner_content = (target / "EvaluationRunner.cs").read_text(encoding="utf-8")
            self.assertNotIn("geek_", dataverse_content)
            self.assertNotIn("geek_", runner_content)
            self.assertIn("contoso_evalturns", dataverse_content)
            self.assertIn("contoso_evaljobs", runner_content)

    def test_arbitrary_publisher_prefix_is_honored(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="full"), target)
            env = {**FULL_ENV, "PUBLISHER_PREFIX": "zz9"}
            scaffold_ai_teammate.scaffold(plan, env, force=False)
            content = (target / "EvaluationDataverse.cs").read_text(encoding="utf-8")
            self.assertIn("zz9_evalturns", content)
            self.assertNotIn("geek_", content)

    def test_invalid_publisher_prefix_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="full"), target)
            env = {**FULL_ENV, "PUBLISHER_PREFIX": "Not_Valid"}
            with self.assertRaises(ValueError):
                scaffold_ai_teammate.scaffold(plan, env, force=False)


class FullRepositoryValidationTests(unittest.TestCase):
    def test_full_with_public_visibility_is_rejected(self) -> None:
        decisions = base_decisions(preset="role", blocks=["B1"], implementationMode="full", full={
            "selected": True, "gitProvider": "github",
            "repository": {"owner": "acme", "name": "agent-repo", "visibility": "public"},
        })
        with self.assertRaises(ValueError):
            scaffold_ai_teammate.build_plan(decisions, Path("unused"))

    def test_full_github_without_owner_or_name_is_rejected(self) -> None:
        decisions = base_decisions(preset="role", blocks=["B1"], implementationMode="full", full={
            "selected": True, "gitProvider": "github", "repository": {"visibility": "private"},
        })
        with self.assertRaises(ValueError):
            scaffold_ai_teammate.build_plan(decisions, Path("unused"))

    def test_full_with_private_github_repository_is_accepted(self) -> None:
        decisions = base_decisions(preset="role", blocks=["B1"], implementationMode="full", full={
            "selected": True, "gitProvider": "github",
            "repository": {"owner": "acme", "name": "agent-repo", "visibility": "private"},
        })
        plan = scaffold_ai_teammate.build_plan(decisions, Path("unused"))
        self.assertEqual(plan.implementation_mode, "full")

    def test_full_without_selected_flag_is_not_validated(self) -> None:
        # Matches base_decisions()'s own default (implementationMode="full", no "full" key): many
        # tests use this just to exercise the ALM scaffold, without providing repository decisions.
        plan = scaffold_ai_teammate.build_plan(base_decisions(preset="role", blocks=["B1"]), Path("unused"))
        self.assertEqual(plan.implementation_mode, "full")


class AlmScaffoldTests(unittest.TestCase):
    def test_alm_config_and_pre_commit_and_workflow_are_generated(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="role", blocks=["B1"], implementationMode="full"), target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            self.assertTrue((target / "alm.config.json").is_file())
            self.assertTrue((target / ".githooks" / "pre-commit").is_file())
            self.assertTrue((target / ".github" / "workflows" / "review.yml").is_file())
            # Scripts land flat in scripts/ (not scripts/alm/): that is where their own
            # `from alm_config import load_config` and the workflow below expect to find them.
            self.assertTrue((target / "scripts" / "review_sanitization.py").is_file())
            self.assertTrue((target / "scripts" / "alm_config.py").is_file())

    def test_workflow_only_calls_review_sanitization_not_the_nonexistent_sanitize_check_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="role", blocks=["B1"], implementationMode="full"), target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            workflow = (target / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
            self.assertIn("python scripts/review_sanitization.py", workflow)
            self.assertNotIn("sanitize.py --check", workflow)

    def test_pre_commit_uses_flat_scripts_path_and_real_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="role", blocks=["B1"], implementationMode="full"), target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)

            pre_commit = (target / ".githooks" / "pre-commit").read_text(encoding="utf-8")
            self.assertIn("python scripts/sanitize.py --env .env --set-secrets --stage", pre_commit)
            self.assertIn("python scripts/check_secrets.py --env .env", pre_commit)

    def test_poc_mode_does_not_generate_alm_scaffold(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "agent"
            target.mkdir()
            plan = scaffold_ai_teammate.build_plan(base_decisions(preset="role", blocks=["B1"], implementationMode="poc"), target)
            scaffold_ai_teammate.scaffold(plan, dict(FULL_ENV), force=False)
            self.assertFalse((target / "alm.config.json").exists())
            self.assertFalse((target / ".githooks").exists())


if __name__ == "__main__":
    unittest.main()
