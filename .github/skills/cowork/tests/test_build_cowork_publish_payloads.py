import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
ADMIN_SCRIPTS = Path(__file__).resolve().parents[2] / "admin" / "scripts"
BUILDER = SCRIPTS / "build_cowork_publish_payloads.py"

SPEC = importlib.util.spec_from_file_location("manage_m365_portal_api", ADMIN_SCRIPTS / "manage_m365_portal_api.py")
PLANNER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(PLANNER)

TITLE = "T_00000000-0000-0000-0000-000000000000"
USER = "00000000-0000-0000-0000-000000000001"
OP = "00000000-0000-0000-0000-000000000000"


class BuildCoworkPublishPayloadsTests(unittest.TestCase):
    def run_builder(self, stage, *extra):
        directory = Path(tempfile.mkdtemp())
        stage_file = directory / "stage.json"
        stage_file.write_text(json.dumps(stage), encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(BUILDER), "--stage-file", str(stage_file), "--out-dir", str(directory / "out"), *extra],
            capture_output=True, text=True, encoding="utf-8",
        )
        return result, directory / "out"

    def stage(self, **overrides):
        return {"ok": True, "titleId": TITLE, "mosOperationId": OP, "currentVersion": "1.0.0",
                "latestVersion": "1.0.0", "appType": "LOB", **overrides}

    def test_new_mode_payloads_pass_planner_validation(self):
        result, out = self.run_builder(self.stage(), "--mode", "new", "--publish-to", USER, "--install-to", USER)
        self.assertEqual(0, result.returncode, result.stderr)
        for name, operation in (("1-finalize.json", "agent-publish"), ("2-allow.json", "agent-allow"),
                                ("3-deploy.json", "agent-lifecycle")):
            PLANNER.validate_payload(operation, json.loads((out / name).read_text(encoding="utf-8")))
        deploy = json.loads((out / "3-deploy.json").read_text(encoding="utf-8"))
        self.assertEqual(OP, deploy["WorkloadManagementList"][0]["MosOperationId"])
        self.assertFalse(deploy["UserAssignmentDetails"]["DeployToEveryone"])

    def test_new_mode_without_install_skips_deploy(self):
        result, out = self.run_builder(self.stage(), "--mode", "new", "--publish-to", USER)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertFalse((out / "3-deploy.json").exists())

    def test_new_mode_requires_publish_target(self):
        result, _ = self.run_builder(self.stage(), "--mode", "new")
        self.assertNotEqual(0, result.returncode)

    def test_update_mode_requires_new_version(self):
        result, _ = self.run_builder(self.stage(), "--mode", "update")
        self.assertNotEqual(0, result.returncode)
        result, out = self.run_builder(self.stage(latestVersion="1.0.1"), "--mode", "update")
        self.assertEqual(0, result.returncode, result.stderr)
        PLANNER.validate_payload("agent-update-app", json.loads((out / "1-update-app.json").read_text(encoding="utf-8")))

    def test_failed_stage_is_rejected(self):
        result, _ = self.run_builder({"ok": False, "statusCode": "Failure"}, "--mode", "new", "--publish-to", USER)
        self.assertNotEqual(0, result.returncode)


if __name__ == "__main__":
    unittest.main()
