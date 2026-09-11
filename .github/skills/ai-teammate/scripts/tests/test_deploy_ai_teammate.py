"""Unit tests for deploy_ai_teammate.py's *planning* functions.

These test the exact command lists deploy_ai_teammate.py would run, without ever invoking a
subprocess (no dotnet/npm/az/a365/network calls) — a wrong CLI name or wrong step order is a bug
that should fail here, long before anyone runs `--execute` against a real environment.

Run with:
    python -m unittest .github/skills/ai-teammate/scripts/tests/test_deploy_ai_teammate.py -v
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "deploy_ai_teammate.py"

_spec = importlib.util.spec_from_file_location("deploy_ai_teammate", SCRIPT_PATH)
deploy_ai_teammate = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = deploy_ai_teammate
assert _spec.loader is not None
_spec.loader.exec_module(deploy_ai_teammate)

FAKE_ENV = {
    "AGENT_NAME": "sample-colleague",
    "AGENT_DISPLAY_NAME": "サンプル同僚",
    "ENV_ID": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "DATAVERSE_URL": "https://<org>.crm.dynamics.com",
    "SOLUTION_NAME": "TestSolution",
    "PUBLISHER_PREFIX": "acme",
}


def _skill_root() -> Path:
    return SCRIPT_PATH.parent.parent


class PreConnectionStepsTests(unittest.TestCase):
    def _steps(self, target: Path, env: dict[str, str] | None = None) -> list:
        return deploy_ai_teammate.build_pre_connection_steps(target, env or dict(FAKE_ENV), _skill_root())

    def test_no_old_power_apps_cli_name_anywhere(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "evaluation-app").mkdir()
            steps = self._steps(target)
            for step in steps:
                self.assertNotIn("power-apps", step.command,
                                  f"{step.name}: must use the `pa` CLI, not the retired `power-apps` binary")

    def test_pa_app_init_present_with_required_flags_when_not_yet_initialized(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "evaluation-app").mkdir()
            steps = self._steps(target)
            init_steps = [s for s in steps if s.name == "pa app init"]
            self.assertEqual(len(init_steps), 1)
            command = init_steps[0].command
            self.assertEqual(command[:3], ("npx", "pa", "app"))
            self.assertIn("--environment-id", command)
            self.assertIn("--display-name", command)
            self.assertIn("--app-type", command)
            self.assertIn("CodeApp", command)

    def test_pa_app_init_skipped_when_power_config_already_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            app_dir = target / "evaluation-app"
            app_dir.mkdir()
            (app_dir / "power.config.json").write_text("{}", encoding="utf-8")
            steps = self._steps(target)
            self.assertFalse(any(s.name == "pa app init" for s in steps))

    def test_setup_connection_reference_is_the_wrapper_script_not_raw_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "evaluation-app").mkdir()
            steps = self._steps(target)
            cr_steps = [s for s in steps if s.name == "setup_connection_reference.py"]
            self.assertEqual(len(cr_steps), 1)
            command = cr_steps[0].command
            self.assertTrue(command[1].endswith("setup_connection_reference.py"))
            self.assertIn("--write-env", command)

    def test_setup_evaluation_dataverse_runs_before_provision_selfhost(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "evaluation-app").mkdir()
            names = [s.name for s in self._steps(target)]
            self.assertLess(names.index("setup_evaluation_dataverse.py"), names.index("provision_selfhost.py"))

    def test_deploy_agent_webapp_step_is_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "evaluation-app").mkdir()
            names = [s.name for s in self._steps(target)]
            self.assertIn("deploy_agent_webapp.py", names)


class PostConnectionStepsTests(unittest.TestCase):
    def test_add_data_source_uses_connector_dataverse_not_per_table_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            env = {**FAKE_ENV, "CONNECTION_REFERENCE_LOGICAL_NAME": "acme_connref_x", "SOLUTION_ID": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}
            steps = deploy_ai_teammate.build_post_connection_steps(target, env, _skill_root())
            add_source = next(s for s in steps if s.name.startswith("add_data_source"))
            command = add_source.command
            self.assertIn("--connector", command)
            self.assertIn("dataverse", command)
            self.assertIn("--connection-ref", command)
            self.assertIn("acme_connref_x", command)
            self.assertIn("--solution-id", command)
            self.assertIn("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", command)
            self.assertNotIn("-t", command, "must not pass a per-table flag for the Dataverse connector")

    def test_predeploy_runs_before_deploy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            steps = deploy_ai_teammate.build_post_connection_steps(target, dict(FAKE_ENV), _skill_root())
            names = [s.name for s in steps]
            self.assertLess(names.index("npm run predeploy"), names.index("npm run deploy"))


class RedactionTests(unittest.TestCase):
    def test_deploy_scripts_never_enable_shell_execution(self) -> None:
        deploy_source = SCRIPT_PATH.read_text(encoding="utf-8")
        webapp_source = (SCRIPT_PATH.parent / "deploy_agent_webapp.py").read_text(encoding="utf-8")
        self.assertNotIn("shell=True", deploy_source)
        self.assertNotIn("shell=True", webapp_source)
        self.assertNotIn("shell=(", deploy_source)
        self.assertNotIn("shell=(", webapp_source)

    def test_redact_output_scrubs_secret_values(self) -> None:
        env = {"A365_CLIENT_SECRET": "sup3rSecretValue123"}
        text = "leaked: sup3rSecretValue123 in the middle of output"
        self.assertNotIn("sup3rSecretValue123", deploy_ai_teammate.redact_output(text, env))

    def test_redact_output_leaves_non_secret_values_alone(self) -> None:
        env = {"AGENT_NAME": "sample-colleague"}
        text = "agent name is sample-colleague"
        self.assertEqual(text, deploy_ai_teammate.redact_output(text, env))


class EvaluationAppEnvGenerationTests(unittest.TestCase):
    def test_writes_only_allowlisted_keys_not_a_copy_of_target_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "evaluation-app").mkdir()
            secret_env = {**FAKE_ENV, "AZURE_OPENAI_ENDPOINT": "https://leak.example.com", "A365_CLIENT_SECRET": "topsecret"}
            deploy_ai_teammate.write_evaluation_app_env(target, secret_env)
            content = (target / "evaluation-app" / ".env").read_text(encoding="utf-8")
            self.assertIn("VITE_PUBLISHER_PREFIX=acme", content)
            self.assertNotIn("leak.example.com", content)
            self.assertNotIn("topsecret", content)
            self.assertNotIn("AZURE_OPENAI_ENDPOINT", content)


class CheckHelpersTests(unittest.TestCase):
    def test_template_uses_current_pa_cli(self) -> None:
        package_json = (
            SCRIPT_PATH.parent.parent / "templates" / "evaluation-app" / "package.json"
        ).read_text(encoding="utf-8")
        self.assertIn("npx pa app push", package_json)
        self.assertNotIn("npx power-apps", package_json)

    def test_scaffold_blocks_reads_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / "scaffold-plan.json").write_text('{"blocks": ["B1", "B12"]}', encoding="utf-8")
            self.assertEqual(deploy_ai_teammate._scaffold_blocks(target), {"B1", "B12"})

    def test_scaffold_blocks_empty_without_plan_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(deploy_ai_teammate._scaffold_blocks(Path(tmp)), set())


if __name__ == "__main__":
    unittest.main()
