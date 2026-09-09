import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_ROOT / "scripts"))

from apply_acp_profile import DEFAULT_PROFILE_FILE, load_profile, resolve_allow_set
from check_development_environment import check_commands, main


class DevelopmentPreflightTests(unittest.TestCase):
    def test_documented_preflight_command_and_markdown_fences(self):
        root = SKILL_ROOT.parents[2]
        for path in (root / "README.md", SKILL_ROOT / "SKILL.md"):
            text = path.read_text(encoding="utf-8")
            self.assertIn("python .github/skills/admin/scripts/check_development_environment.py", text)
            self.assertIn("shared_agentnode", text)
            fences = [line for line in text.splitlines() if line.startswith("```")]
            self.assertEqual(len(fences) % 2, 0, str(path))

    def test_baseline_connectors_checked_in_dlp_and_acp_without_writes(self):
        commands = check_commands("environment-placeholder", "tenant-placeholder", ["shared_teams"])
        self.assertEqual(len(commands), 3)
        for command in commands[1:]:
            for connector in ("shared_commondataserviceforapps", "shared_agentnode", "shared_teams"):
                self.assertIn(connector, command)
            self.assertNotIn("--apply", command)
        self.assertIn("--include-group", commands[2])

    def test_failure_stops_preflight(self):
        for failure_index in range(3):
            with self.subTest(failure_index=failure_index):
                with patch("sys.argv", ["preflight", "--environment-id", "placeholder"]):
                    with patch("check_development_environment.subprocess.run") as run:
                        run.side_effect = [SimpleNamespace(returncode=0)] * failure_index + [
                            SimpleNamespace(returncode=1)
                        ]
                        self.assertEqual(main(), 1)
                        self.assertEqual(run.call_count, failure_index + 1)

    def test_success_requires_all_three_checks(self):
        with patch("sys.argv", ["preflight", "--environment-id", "placeholder"]):
            with patch("check_development_environment.subprocess.run") as run:
                run.return_value.returncode = 0
                self.assertEqual(main(), 0)
                self.assertEqual(run.call_count, 3)


class AgentNodeProfileTests(unittest.TestCase):
    def setUp(self):
        self.profile = load_profile(DEFAULT_PROFILE_FILE, "microsoft-first-party")

    def test_legacy_and_non_microsoft_publishers_are_rejected(self):
        publishers = {
            "shared_commondataservice": "Microsoft",
            "shared_commondataserviceforapps": "Microsoft",
            "shared_databricks": "Databricks Inc.",
            "shared_microsoftacronyms": "Individual Publisher",
            "shared_googledrive": "Microsoft",
            "shared_geekcustom": "Microsoft",
        }
        allowed, violations = resolve_allow_set(self.profile, set(publishers), {}, publishers)
        self.assertEqual(allowed, {"shared_commondataserviceforapps", "shared_agentnode"})
        self.assertEqual(violations, [])

    def test_work_iq_catalog_connectors_are_included(self):
        names = {
            "shared_a365copilotchatmcp", "shared_a365memcp", "shared_a365outlookcalendarmcp",
            "shared_a365outlookmailmcp", "shared_a365teamsmcp", "shared_a365wordmcp",
            "shared_workiqmcp", "shared_workiqonedrive", "shared_workiqsharepoint",
        }
        allowed, violations = resolve_allow_set(self.profile, names, {}, dict.fromkeys(names, "Microsoft"))
        self.assertTrue(names <= allowed)
        self.assertEqual(violations, [])

    def test_unknown_publisher_fails_closed_except_verified_preview(self):
        allowed, _ = resolve_allow_set(self.profile, {"shared_azureunknown"}, {})
        self.assertEqual(allowed, {"shared_agentnode"})
        allowed, _ = resolve_allow_set(self.profile, set(), {}, {"shared_agentnode": "Third Party"})
        self.assertEqual(allowed, set())

    def test_agent_node_is_included_without_catalog_or_existing_permission(self):
        allowed, violations = resolve_allow_set(self.profile, set(), {})
        self.assertEqual(allowed, {"shared_agentnode"})
        self.assertEqual(violations, [])

    def test_unrelated_agent_connectors_are_not_allowed(self):
        allowed, violations = resolve_allow_set(
            self.profile,
            {"shared_agentnode", "shared_agentnodecustom", "shared_googledrive"},
            {},
        )
        self.assertEqual(allowed, {"shared_agentnode"})
        self.assertEqual(violations, [])

    def test_explicit_deny_and_excluded_sources_still_win(self):
        self.profile["denyConnectors"].append("shared_agentnode")
        allowed, _ = resolve_allow_set(self.profile, set(), {})
        self.assertNotIn("shared_agentnode", allowed)
        self.profile["denyConnectors"].remove("shared_agentnode")
        allowed, _ = resolve_allow_set(
            self.profile, set(), {"shared_agentnode": "independentpublisher"}
        )
        self.assertNotIn("shared_agentnode", allowed)

    def test_must_not_allow_guard_still_detects_explicit_entries(self):
        self.profile["allowConnectors"].append("shared_googledrive")
        _, violations = resolve_allow_set(self.profile, set(), {})
        self.assertEqual(violations, ["shared_googledrive"])


if __name__ == "__main__":
    unittest.main()