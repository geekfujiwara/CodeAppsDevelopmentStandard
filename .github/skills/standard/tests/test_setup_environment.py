import importlib.util
import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/setup_environment.py"
SPEC = importlib.util.spec_from_file_location("setup_environment", SCRIPT)
subject = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(subject)


class EnvironmentDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.profiles = [
            {"name": "Selected", "active": "*", "index": "1", "user": "maker@example.com"},
            {"name": "Alternative", "active": "", "index": "2", "user": "maker@example.com"},
        ]
        self.info = {"url": "https://example.crm.dynamics.com", "env_id": "placeholder",
                     "user": "maker@example.com", "friendly": "Development"}

    def test_discovery_restores_original_profile(self):
        with patch.object(subject, "list_profiles", return_value=self.profiles), \
             patch.object(subject, "org_who", return_value=self.info), \
             patch.object(subject, "_run", return_value=SimpleNamespace(returncode=0)) as run, \
             redirect_stdout(io.StringIO()):
            self.assertEqual(subject.cmd_list(), 0)
        run.assert_called_once_with(["pac", "auth", "select", "--name", "Selected"])

    def test_failed_discovery_is_reported_and_restores_original_profile(self):
        errors = io.StringIO()
        with patch.object(subject, "list_profiles", return_value=self.profiles), \
             patch.object(subject, "org_who", side_effect=[self.info, None]), \
             patch.object(subject, "_run", return_value=SimpleNamespace(returncode=0)) as run, \
             redirect_stdout(io.StringIO()), redirect_stderr(errors):
            self.assertEqual(subject.cmd_list(), 0)
        self.assertIn("Alternative", errors.getvalue())
        run.assert_called_once_with(["pac", "auth", "select", "--name", "Selected"])

    def test_restoration_failure_stops_discovery(self):
        with patch.object(subject, "list_profiles", return_value=self.profiles), \
             patch.object(subject, "org_who", return_value=self.info), \
             patch.object(subject, "_run", return_value=SimpleNamespace(returncode=1)), \
             redirect_stderr(io.StringIO()):
            self.assertEqual(subject.cmd_list(), 1)

    def test_missing_active_profile_does_not_select_an_account(self):
        with patch.object(subject, "list_profiles", return_value=[self.profiles[1]]), \
             patch.object(subject, "org_who") as who, \
             patch.object(subject, "_run") as run, redirect_stderr(io.StringIO()):
            self.assertEqual(subject.cmd_list(), 1)
        who.assert_not_called()
        run.assert_not_called()

    def test_exception_still_restores_original_profile(self):
        with patch.object(subject, "list_profiles", return_value=self.profiles), \
             patch.object(subject, "org_who", side_effect=OSError("CLI unavailable")), \
             patch.object(subject, "_run", return_value=SimpleNamespace(returncode=0)) as run:
            with self.assertRaises(OSError):
                subject.cmd_list()
        run.assert_called_once_with(["pac", "auth", "select", "--name", "Selected"])


if __name__ == "__main__":
    unittest.main()
