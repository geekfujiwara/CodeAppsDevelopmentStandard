import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
STANDARD_SCRIPTS = SCRIPTS.parents[1] / "standard" / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(STANDARD_SCRIPTS))

SCRIPT = SCRIPTS / "trigger_contract.py"
SPEC = importlib.util.spec_from_file_location("trigger_contract", SCRIPT)
trigger_contract = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = trigger_contract
SPEC.loader.exec_module(trigger_contract)


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


deploy_email_trigger = load_script("deploy_email_trigger")
fix_email_trigger = load_script("fix_email_trigger")


class TriggerContractTests(unittest.TestCase):
    def setUp(self):
        self.workflow_id = "00000000-0000-" + "4000-8000-000000000001"
        self.flow_api_id = "00000000-0000-" + "4000-8000-000000000002"
        self.environment_id = "00000000-0000-" + "4000-8000-000000000003"

    def build(self, **overrides):
        values = {
            "workflow_id": self.workflow_id,
            "flow_api_id": self.flow_api_id,
            "environment_id": self.environment_id,
            "trigger_connection_type": "Office 365 Outlook",
        }
        values.update(overrides)
        return trigger_contract.build_external_trigger_yaml(**values)

    def test_builds_observed_contract(self):
        data = self.build()
        self.assertEqual(data.count("\n\n"), 1)
        self.assertIn(f"  flowId: {self.workflow_id}\n\n", data)
        self.assertIn(f"  flowName: {self.flow_api_id}\n", data)
        self.assertIn(f"/environments/{self.environment_id}/flows/{self.flow_api_id}", data)

    def test_rejects_invalid_workflow_id(self):
        with self.assertRaisesRegex(ValueError, "workflow_id must be a GUID"):
            self.build(workflow_id="not-a-guid")

    def test_rejects_missing_flow_api_id(self):
        with self.assertRaisesRegex(ValueError, "flow_api_id must be a GUID"):
            self.build(flow_api_id=None)

    def test_rejects_unobserved_connection_type(self):
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            self.build(trigger_connection_type="Microsoft Teams")

    def test_accepts_connection_reference_logical_names(self):
        trigger_contract.validate_deployment_settings(
            self.workflow_id,
            "sample_Agent",
            self.environment_id,
            {"CONNREF_COPILOT": "sample_copilotConnRef"},
        )

    def test_rejects_empty_connection_reference_before_deploy(self):
        with self.assertRaisesRegex(
            ValueError, "CONNREF_OUTLOOK must be a connection-reference logical name"
        ):
            trigger_contract.validate_deployment_settings(
                self.workflow_id,
                "sample_Agent",
                self.environment_id,
                {"CONNREF_OUTLOOK": ""},
            )

    def test_deploy_rejects_invalid_flow_before_dataverse_read(self):
        deploy_email_trigger.ENV_ID = self.environment_id
        with patch.object(
            deploy_email_trigger, "api_get", side_effect=AssertionError("unexpected read")
        ):
            with self.assertRaisesRegex(ValueError, "flow_api_id must be a GUID"):
                deploy_email_trigger.register_external_trigger(self.workflow_id, None)

    def test_fix_rejects_invalid_flow_before_dataverse_read(self):
        fix_email_trigger.WF_ID = self.workflow_id
        fix_email_trigger.ENV_ID = self.environment_id
        with patch.object(
            fix_email_trigger, "api_get", side_effect=AssertionError("unexpected read")
        ):
            with self.assertRaisesRegex(ValueError, "flow_api_id must be a GUID"):
                fix_email_trigger.step4_fix_external_trigger(None)


if __name__ == "__main__":
    unittest.main()