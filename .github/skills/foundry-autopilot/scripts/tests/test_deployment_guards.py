"""Wrong deployment routes must fail before creating an ordinary agent or package."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_teams_package", SCRIPTS / "build_teams_package.py")
package = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(package)

BLUEPRINT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


class RetiredOrdinaryDeployTests(unittest.TestCase):
    def test_old_cli_fails_with_migration_instructions_and_no_sdk_imports(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "deploy.py"), "--agent", "teammate"],
            capture_output=True, text=True, check=False, timeout=30,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("No deployment was performed", result.stderr)
        self.assertIn("publish_foundry_autopilot.py", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(result.stdout, "")


class AgentTemplatePackageTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.output = self.root / "package.zip"
        self.manifest = {
            "manifestVersion": "devPreview",
            "name": {"short": "Teammate"}, "version": "1.0.0",
            "icons": {"color": "color.png", "outline": "outline.png"},
            "bots": [{"supportsFiles": True}],
            "copilotAgents": {"customEngineAgents": [{
                "agenticUserTemplateId": "teammate-user", "functionsAs": "agenticUserOnly",
            }]},
            "agenticUserTemplates": [{"id": "teammate-user", "file": "agenticUser.json"}],
        }
        self.agentic = {
            "id": "teammate-user", "agentIdentityBlueprintId": BLUEPRINT,
            "schemaVersion": "0.1.0-preview", "communicationProtocol": "activityProtocol",
        }
        self.icon = self.root / "icon.png"
        Image.new("RGBA", (32, 32), (0, 128, 255, 255)).save(self.icon)

    def build(self, blueprint: str = BLUEPRINT, *extra: str) -> int:
        manifest_path = self.root / "manifest.template.json"
        manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        agentic_path = self.root / "agenticUser.template.json"
        agentic_path.write_text(json.dumps(self.agentic), encoding="utf-8")
        args = [
            str(SCRIPTS / "build_teams_package.py"), "--env", str(self.root / ".env"),
            "--template", str(manifest_path), "--agentic-user-template", str(agentic_path),
            "--icon", str(self.icon), "--output", str(self.output), *extra,
        ]
        with patch.dict(os.environ, {"A365_AGENT_BLUEPRINT_ID": blueprint}, clear=True):
            with patch.object(sys, "argv", args):
                return package.main()

    def assert_build_blocked(self, blueprint: str = BLUEPRINT) -> None:
        with self.assertRaises(SystemExit):
            self.build(blueprint)
        self.assertFalse(self.output.exists(), "A rejected input must not leave a shared-agent ZIP")

    def test_missing_blueprint_fails_even_without_require_template_flag(self) -> None:
        self.assert_build_blocked("")

    def test_invalid_or_zero_blueprint_is_refused(self) -> None:
        for blueprint in ("not-a-guid", "00000000-0000-0000-0000-000000000000"):
            with self.subTest(blueprint=blueprint):
                self.assert_build_blocked(blueprint)

    def test_ga_shared_manifest_is_refused_even_with_blueprint(self) -> None:
        self.manifest["manifestVersion"] = "1.22"
        self.assert_build_blocked()

    def test_missing_template_is_refused(self) -> None:
        self.manifest.pop("agenticUserTemplates")
        self.assert_build_blocked()

    def test_mismatched_template_reference_is_refused(self) -> None:
        self.manifest["copilotAgents"]["customEngineAgents"][0]["agenticUserTemplateId"] = "another"
        self.assert_build_blocked()

    def test_non_agentic_user_mode_is_refused(self) -> None:
        self.manifest["copilotAgents"]["customEngineAgents"][0].pop("functionsAs")
        self.assert_build_blocked()

    def test_mismatched_blueprint_in_agentic_file_is_refused(self) -> None:
        self.agentic["agentIdentityBlueprintId"] = "11111111-2222-3333-4444-555555555555"
        self.assert_build_blocked()

    def test_mismatched_agentic_id_is_refused(self) -> None:
        self.agentic["id"] = "another"
        self.assert_build_blocked()

    def test_invalid_agentic_protocol_is_refused(self) -> None:
        self.agentic["communicationProtocol"] = "unknown"
        self.assert_build_blocked()

    def test_built_zip_is_always_an_agent_template(self) -> None:
        self.assertEqual(self.build(), 0)
        with zipfile.ZipFile(self.output) as built:
            self.assertEqual(set(built.namelist()), {
                "manifest.json", "agenticUser.json", "color.png", "outline.png",
            })
            manifest = json.loads(built.read("manifest.json"))
            agentic = json.loads(built.read("agenticUser.json"))
        self.assertEqual(manifest["manifestVersion"], "devPreview")
        self.assertEqual(manifest["agenticUserTemplates"][0]["id"], agentic["id"])
        self.assertEqual(agentic["agentIdentityBlueprintId"], BLUEPRINT)

    def test_require_template_remains_accepted_for_existing_callers(self) -> None:
        self.assertEqual(self.build(BLUEPRINT, "--require-template"), 0)


if __name__ == "__main__":
    unittest.main()
