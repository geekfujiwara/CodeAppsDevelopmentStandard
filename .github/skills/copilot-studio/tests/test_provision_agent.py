import copy
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "provision_agent.py"
SPEC = importlib.util.spec_from_file_location("provision_agent", SCRIPT)
provision_agent = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = provision_agent
SPEC.loader.exec_module(provision_agent)


class ProvisionAgentTests(unittest.TestCase):
    def setUp(self):
        self.icon = b"\x89PNG\r\n\x1a\nfixture"
        self.origin = "https://" + "example" + ".crm.dynamics.com"
        self.plan = provision_agent.build_plan(
            self.origin,
            "SampleSolution",
            "Sample agent",
            "sample_SampleAgent",
            1041,
            self.icon,
        )

    def test_builds_observed_standard_agent_contract(self):
        body = self.plan["body"]
        self.assertEqual(body["template"], "default-2.1.0")
        self.assertEqual(body["accesscontrolpolicy"], 1)
        self.assertEqual(body["authenticationmode"], 2)
        self.assertEqual(body["iscustomizable"], {"Value": False})
        self.assertEqual(body["configuration"]["$kind"], "BotConfiguration")
        self.assertIn("default-2.1.0", body["configuration"]["settings"])

    def test_rejects_contract_drift(self):
        changed = copy.deepcopy(self.plan)
        changed["body"]["template"] = "cliagent-1.0.0"
        with self.assertRaisesRegex(ValueError, "Fixed provisioning values"):
            provision_agent.validate_plan(changed)

    def test_rejects_unapproved_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(provision_agent.canonical_json(self.plan), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "approval hash"):
                provision_agent.load_approved_plan(path, "0" * 64)

    def test_accepts_exact_approved_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(provision_agent.canonical_json(self.plan), encoding="utf-8")
            loaded = provision_agent.load_approved_plan(path, provision_agent.canonical_hash(self.plan))
            self.assertEqual(loaded, self.plan)

    def test_rejects_runtime_target_drift(self):
        with self.assertRaisesRegex(ValueError, "does not match DATAVERSE_URL"):
            provision_agent.assert_runtime_target(
                self.plan, "https://" + "other" + ".crm.dynamics.com"
            )


if __name__ == "__main__":
    unittest.main()