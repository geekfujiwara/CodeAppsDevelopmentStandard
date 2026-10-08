"""check_code_apps_environment.py の終了条件を検証する。"""

import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_code_apps_environment as subject  # noqa: E402


class MainTests(unittest.TestCase):
    def run_main(self, *, managed, code_apps):
        with (
            patch.object(subject, "check_managed", return_value=(managed, "managed")),
            patch.object(subject, "check_code_apps", return_value=(code_apps, "code-apps")),
            patch.object(sys, "argv", ["check_code_apps_environment.py", "--environment-id", "env"]),
            contextlib.redirect_stdout(io.StringIO()) as output,
        ):
            return subject.main(), output.getvalue()

    def test_unmanaged_environment_with_code_apps_enabled_passes(self):
        result, output = self.run_main(managed=False, code_apps=True)
        self.assertEqual(result, 0)
        self.assertIn("マネージド環境は任意", output)

    def test_code_apps_disabled_fails_even_when_managed(self):
        result, output = self.run_main(managed=True, code_apps=False)
        self.assertEqual(result, 1)
        self.assertIn("Power Apps コード アプリ", output)

    def test_unknown_code_apps_setting_requires_visual_confirmation(self):
        result, output = self.run_main(managed=False, code_apps=None)
        self.assertEqual(result, 0)
        self.assertIn("目視確認", output)


if __name__ == "__main__":
    unittest.main()
