from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "setup_dataverse.py"


def load_module():
    os.environ.setdefault("DATAVERSE_URL", "https://example.invalid/")
    os.environ.setdefault("SOLUTION_NAME", "TestSolution")
    os.environ.setdefault("PUBLISHER_PREFIX", "test")
    spec = importlib.util.spec_from_file_location("setup_dataverse_under_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class DateOnlyColumnTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_module()

    def test_date_only_format_uses_date_only_behavior(self):
        """日付だけの列は DateTimeBehavior=DateOnly（UserLocal だと read_query の日付比較がずれる）"""
        body = self.module.build_column_body({"logical": "test_date", "type": "DateTime", "display": "日付", "format": "DateOnly"})
        self.assertEqual(body["Format"], "DateOnly")
        self.assertEqual(body["DateTimeBehavior"], {"Value": "DateOnly"})

    def test_date_and_time_keeps_default_behavior(self):
        body = self.module.build_column_body({"logical": "test_at", "type": "DateTime", "display": "日時"})
        self.assertEqual(body["Format"], "DateAndTime")
        self.assertNotIn("DateTimeBehavior", body)


if __name__ == "__main__":
    unittest.main()
