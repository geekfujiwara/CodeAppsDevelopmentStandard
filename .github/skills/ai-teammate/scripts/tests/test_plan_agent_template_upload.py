import importlib.util
import json
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "plan_agent_template_upload.py"
SPEC = importlib.util.spec_from_file_location("plan_agent_template_upload", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def guid(suffix):
    return f"00000000-0000-4000-8000-{suffix:012d}"


class PlanAgentTemplateUploadTests(unittest.TestCase):
    def package(
        self,
        *,
        manifest_version="devPreview",
        blueprint_id=guid(2),
        agentic_user_id="example-agentic-user",
        color=b"color",
    ):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(directory, ignore_errors=True))
        path = directory / "agent.zip"
        manifest = {
            "manifestVersion": manifest_version,
            "id": guid(1),
            "version": "1.2.3",
            "name": {"short": "Example Agent"},
            "agenticUserTemplates": [{"id": "example-agentic-user", "file": "agenticUser.json"}],
        }
        agentic_user = {
            "id": agentic_user_id,
            "agentIdentityBlueprintId": blueprint_id,
        }
        with zipfile.ZipFile(path, "w") as package:
            package.writestr("manifest.json", json.dumps(manifest))
            package.writestr("agenticUser.json", json.dumps(agentic_user))
            package.writestr("color.png", color)
            package.writestr("outline.png", b"outline")
        return path

    def test_plan_binds_package_and_tenant(self):
        plan = MODULE.build_plan(self.package(), guid(3))
        self.assertEqual("agent-template-stage", plan["operation"])
        self.assertEqual(guid(3), plan["tenantId"])
        self.assertEqual("1.2.3", plan["package"]["version"])
        self.assertEqual(guid(2), plan["package"]["blueprintId"])
        self.assertEqual(64, len(plan["package"]["sha256"]))

    def test_hash_changes_when_package_changes(self):
        first = MODULE.build_plan(self.package(), guid(3))
        second = MODULE.build_plan(
            self.package(color=b"changed"), guid(3)
        )
        self.assertNotEqual(MODULE.canonical_hash(first), MODULE.canonical_hash(second))

    def test_hash_matches_browser_runner_for_non_ascii_text(self):
        self.assertEqual(
            "31df002d712a1505df7ae9aef407de26bfa3ef5c3a1d56e1816cc26d63d2b3f8",
            MODULE.canonical_hash({"label": "公開", "a": 1}),
        )

    def test_rejects_non_devpreview_package(self):
        with self.assertRaises(SystemExit):
            MODULE.inspect_package(self.package(manifest_version="1.22"))

    def test_rejects_zero_tenant(self):
        with self.assertRaises(SystemExit):
            MODULE.build_plan(self.package(), "00000000-0000-0000-0000-000000000000")

    def test_rejects_mismatched_template_id(self):
        with self.assertRaises(SystemExit):
            MODULE.inspect_package(self.package(agentic_user_id="different-agentic-user"))

    def test_rejects_duplicate_zip_entry(self):
        path = self.package()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(path, "a") as package:
                package.writestr("color.png", b"duplicate")
        with self.assertRaises(SystemExit):
            MODULE.inspect_package(path)


if __name__ == "__main__":
    unittest.main()