import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from validate_skill import validate_skill


SKILL = """---
name: sample-skill
description: Sample
category: testing
triggers:
  - sample
---
# Sample
"""
REAL_GUID = "-".join(("12345678", "1234", "1234", "1234", "123456789abc"))


class ValidateSkillTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.skill = Path(self.temp.name) / "sample-skill"
        self.skill.mkdir()
        (self.skill / "SKILL.md").write_text(SKILL, encoding="utf-8")
        (self.skill / "references").mkdir()
        (self.skill / "scripts").mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_ignores_vendored_node_modules(self):
        dependency = self.skill / "node_modules" / "sample"
        dependency.mkdir(parents=True)
        (dependency / "README.md").write_text(REAL_GUID, encoding="utf-8")
        self.assertEqual(validate_skill(self.skill).errors, [])

    def test_still_scans_source_files(self):
        (self.skill / "scripts" / "sample.py").write_text(REAL_GUID, encoding="utf-8")
        report = validate_skill(self.skill)
        self.assertEqual(len(report.errors), 1)
        self.assertIn(REAL_GUID, report.errors[0])


if __name__ == "__main__":
    unittest.main()