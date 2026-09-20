import json
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


class TemplateManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.skill = Path(self.temp.name) / "sample-skill"
        (self.skill / "references").mkdir(parents=True)
        (self.skill / "scripts").mkdir()
        (self.skill / "SKILL.md").write_text(SKILL, encoding="utf-8")
        self.template = self.skill / "templates" / "sample"
        self.template.mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, **payload):
        (self.template / "scaffold.json").write_text(json.dumps(payload), encoding="utf-8")

    def test_undeclared_variable_is_an_error(self):
        self.write_manifest(variables=["AGENT_NAME"])
        (self.template / "app.py").write_text("X = '${AGENT_ROLE}'\n", encoding="utf-8")

        errors = validate_skill(self.skill).errors
        self.assertEqual(len(errors), 1)
        self.assertIn("AGENT_ROLE", errors[0])

    def test_declared_variable_passes(self):
        self.write_manifest(variables=["AGENT_NAME"], derivedVariables=["PKG"])
        (self.template / "__PKG__").mkdir()
        (self.template / "__PKG__" / "app.py").write_text("X = '${AGENT_NAME}'\n", encoding="utf-8")

        self.assertEqual(validate_skill(self.skill).errors, [])

    def test_template_without_manifest_is_not_scanned(self):
        (self.template / "app.ts").write_text("const s = `${count}`;\n", encoding="utf-8")

        report = validate_skill(self.skill)
        self.assertEqual(report.errors, [])
        self.assertEqual(report.warnings, [])

    def test_derived_variable_is_not_required_in_env_example(self):
        (self.skill / "references" / ".env.example").write_text("AGENT_NAME=Auri\n", encoding="utf-8")
        self.write_manifest(variables=["AGENT_NAME"], derivedVariables=["PKG"])
        (self.template / "__PKG__").mkdir()
        (self.template / "__PKG__" / "app.py").write_text("X = '${AGENT_NAME}'\n", encoding="utf-8")

        self.assertEqual(validate_skill(self.skill).warnings, [])

    def test_variable_missing_from_env_example_warns(self):
        (self.skill / "references" / ".env.example").write_text("OTHER=1\n", encoding="utf-8")
        self.write_manifest(variables=["AGENT_NAME"])
        (self.template / "app.py").write_text("X = '${AGENT_NAME}'\n", encoding="utf-8")

        warnings = validate_skill(self.skill).warnings
        self.assertEqual(len(warnings), 1)
        self.assertIn(".env.example", warnings[0])


if __name__ == "__main__":
    unittest.main()