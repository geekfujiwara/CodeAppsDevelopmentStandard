"""Unit tests for run_regression_tests.py and setup_foundry_evaluation.py.

Neither script is exercised end-to-end here - both talk to Azure and Dataverse. What is tested
is the pure decision logic, because that is where a silent wrong answer would hide: a case that
is reported green without being checked, or a safety evaluator handed a deployment name it
must not receive.

Run with:
    python -m unittest .github/skills/ai-teammate/scripts/tests/test_regression_and_evaluation.py -v
"""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


regression = load("run_regression_tests")
evaluation = load("setup_foundry_evaluation")
fetch = load("fetch_autopilot_quickstart")


PREFIX = "geek"


def row(**overrides):
    values = {"status": regression.STATUS_DONE, "response": "", "toolcalls": "",
              "autoscore": None, "durationms": 0}
    values.update(overrides)
    return {f"{PREFIX}_{key}": value for key, value in values.items()}


class CaseEvaluationTests(unittest.TestCase):
    def evaluate(self, case: dict, **row_values):
        return regression.evaluate_case(PREFIX, case, row(**row_values), 3.0)

    def test_skills_inside_the_container_package_are_found(self) -> None:
        # Foundry Autopilot keeps skills in src/<package>/skills (troubleshooting #95).
        import tempfile

        with tempfile.TemporaryDirectory() as root:
            skill = Path(root) / "src" / "agent_pkg" / "skills" / "daily-brief"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text("---\nname: daily-brief\n---\n", encoding="utf-8")
            suite = regression.Suite()
            regression.check_skills(Path(root), {}, suite)

        self.assertTrue(all(result.passed for result in suite.results))

    def test_a_case_with_no_assertions_passes(self) -> None:
        passed, _ = self.evaluate({"name": "smoke"}, response="なんでも")
        self.assertTrue(passed)

    def test_a_case_that_never_completed_fails(self) -> None:
        passed, detail = self.evaluate({"name": "c"}, status=regression.STATUS_WAITING)
        self.assertFalse(passed)
        self.assertIn(regression.STATUS_LABEL[regression.STATUS_WAITING], detail)

    def test_expect_contains_requires_every_string(self) -> None:
        case = {"name": "c", "expectContains": ["http", "出典"]}
        self.assertTrue(self.evaluate(case, response="出典: http://example.com")[0])
        self.assertFalse(self.evaluate(case, response="出典はありません")[0])

    def test_expect_not_contains_rejects_any_match(self) -> None:
        case = {"name": "c", "expectNotContains": ["(不明)"]}
        self.assertTrue(self.evaluate(case, response="田中さんが 3 回")[0])
        self.assertFalse(self.evaluate(case, response="(不明) が 3 回")[0])

    def test_expect_tools_requires_every_tool(self) -> None:
        case = {"name": "c", "expectTools": ["search"]}
        self.assertTrue(self.evaluate(case, toolcalls="search, fetch")[0])
        self.assertFalse(self.evaluate(case, toolcalls="fetch")[0])

    def test_expect_tools_accepts_any_listed_alternative(self) -> None:
        case = {"name": "c", "expectTools": ["run_python|code_interpreter"]}
        self.assertTrue(self.evaluate(case, toolcalls="foundry_toolbox-code_interpreter")[0])
        self.assertTrue(self.evaluate(case, toolcalls="run_python")[0])
        self.assertFalse(self.evaluate(case, toolcalls="web_search")[0])

    def test_expect_contains_accepts_any_listed_phrasing(self) -> None:
        case = {"name": "c", "expectContains": ["不要|必要ありません"]}
        self.assertTrue(self.evaluate(case, response="確認は必要ありません")[0])
        self.assertFalse(self.evaluate(case, response="確認してください")[0])

    def test_prompt_policies_fail_when_the_owner_rules_are_dropped(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as root:
            prompt = Path(root) / "src" / "pkg" / "prompts" / "system.md"
            prompt.parent.mkdir(parents=True)
            prompt.write_text("## 予定調整\n社内の人は Teams チャット、社外の人はメール、AI エージェントは空き不問\n", encoding="utf-8")
            suite = regression.Suite()
            regression.check_prompt_policies(Path(root), suite)

        by_name = {r.name: r.passed for r in suite.results}
        self.assertFalse(by_name["prompt: リアクションの指示"])
        self.assertTrue(by_name["prompt: 社内は Teams・社外はメール・AI は空きを問わない日程調整"])

    def test_min_score_uses_the_case_value_over_the_default(self) -> None:
        case = {"name": "c", "minScore": 4.5}
        self.assertFalse(self.evaluate(case, autoscore=4.0)[0])
        self.assertTrue(self.evaluate(case, autoscore=4.6)[0])

    def test_missing_score_does_not_silently_pass_a_scored_case(self) -> None:
        # A case that asked to be scored but was not scored has not been verified.
        passed, detail = self.evaluate({"name": "c", "minScore": 3.0}, autoscore=None)
        self.assertFalse(passed)
        self.assertTrue(detail)

    def test_an_unscored_case_without_min_score_is_not_failed_by_the_default(self) -> None:
        # The worker does not score every turn; the suite-wide default must not invent a failure.
        self.assertTrue(self.evaluate({"name": "c"}, autoscore=None)[0])

    def test_max_duration_is_enforced(self) -> None:
        case = {"name": "c", "maxDurationMs": 1000}
        self.assertTrue(self.evaluate(case, durationms=900)[0])
        self.assertFalse(self.evaluate(case, durationms=1500)[0])


class SuiteTests(unittest.TestCase):
    def test_failed_is_empty_until_a_result_fails(self) -> None:
        suite = regression.Suite()
        suite.add("ok", "invariant", True)
        self.assertEqual(suite.failed, [])
        suite.add("bad", "invariant", False, "boom")
        self.assertEqual(len(suite.failed), 1)

    def test_skipped_results_do_not_fail_the_suite(self) -> None:
        suite = regression.Suite()
        suite.add("n/a", "invariant", False, "not applicable", skipped=True)
        self.assertEqual(suite.failed, [])

    def test_required_access_boundaries_are_the_four_developer_values(self) -> None:
        self.assertEqual(
            set(regression.REQUIRED_ACCESS_BOUNDARIES),
            {
                "read.1on1.developers",
                "write.1on1.developers",
                "read.group.developers",
                "write.group.developers",
            },
        )


class TestingCriteriaTests(unittest.TestCase):
    def test_model_graded_evaluators_get_a_deployment(self) -> None:
        criteria = evaluation.testing_criteria(["builtin.task_adherence"], "judge-model")
        self.assertEqual(
            criteria[0]["initialization_parameters"], {"deployment_name": "judge-model"}
        )
        self.assertEqual(criteria[0]["name"], "task_adherence")

    def test_safety_evaluators_must_not_get_a_deployment(self) -> None:
        # Content Safety runs these server-side and rejects the parameter.
        criteria = evaluation.testing_criteria(["builtin.violence"], "judge-model")
        self.assertNotIn("initialization_parameters", criteria[0])

    def test_hosted_agent_rejection_is_recognised(self) -> None:
        error = Exception(
            "The agent 'x' is of kind 'hosted', which is not supported for evaluation rules."
        )
        self.assertTrue(evaluation._is_hosted_agent_rejection(error))

    def test_unrelated_errors_are_not_treated_as_the_hosted_rejection(self) -> None:
        # Swallowing a real failure as "just a hosted agent" would silently skip the rule.
        self.assertFalse(evaluation._is_hosted_agent_rejection(Exception("Forbidden")))


class QuickstartFetchTests(unittest.TestCase):
    def test_defaults_point_at_the_microsoft_sample(self) -> None:
        self.assertEqual(fetch.DEFAULT_REPO, "microsoft-foundry/foundry-samples")
        self.assertEqual(fetch.DEFAULT_SUBPATH, "samples/python/foundry-autopilot-agent")

    def test_path_traversal_entries_are_rejected(self) -> None:
        for name in ("../evil.py", "/etc/passwd", "a/../../b"):
            self.assertFalse(fetch.is_safe_member(name), name)

    def test_ordinary_paths_are_accepted(self) -> None:
        self.assertTrue(fetch.is_safe_member("src/pkg/agent.py"))


if __name__ == "__main__":
    unittest.main()
