import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "set_model.py"
SPEC = importlib.util.spec_from_file_location("set_model", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def guid(suffix):
    return f"00000000-0000-4000-8000-{suffix:012d}"


class FakeSession:
    def __init__(self, bot, components):
        self.bot = bot
        self.components = components

    def get(self, url, params=None):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = self.bot if "/bots(" in url else {"value": self.components}
        return response


class SetStandardModelTests(unittest.TestCase):
    def setUp(self):
        self.origin = "https://" + "example" + ".crm.dynamics.com"
        self.bot_id = guid(1)
        self.component_id = guid(2)
        self.source = (
            "kind: GptComponentMetadata\r\ninstructions:\r\n\r\n"
            "aISettings:\r\n  model:\r\n    modelNameHint: GPT55Chat"
        )
        self.session = FakeSession(
            {"name": "Example", "configuration": json.dumps({"gPTSettings": {"defaultSchemaName": "sample.gpt"}})},
            [{
                "botcomponentid": self.component_id,
                "schemaname": "sample.gpt",
                "data": self.source,
                "@odata.etag": 'W/"123"',
            }],
        )

    def test_plan_binds_source_target_and_component(self):
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        self.assertEqual(self.component_id, plan["componentId"])
        self.assertEqual(MODULE.data_hash(self.source), plan["sourceDataSha256"])
        self.assertEqual("GPT55Chat", plan["currentModel"])
        self.assertEqual("Sonnet46", plan["targetModel"])
        self.assertEqual("Sonnet46", MODULE.current_model_name(plan["targetData"]))

    def test_accepts_dataverse_guid_without_uuid_version_nibble(self):
        value = "00000000-0000-" + "f000-c000-000000000001"
        self.assertEqual(value, MODULE.normalize_bot_id(value))

    def test_multiple_components_without_default_are_rejected(self):
        session = FakeSession(
            {"name": "Example", "configuration": "{}"},
            self.session.components + [copy.deepcopy(self.session.components[0])],
        )
        with self.assertRaisesRegex(ValueError, "Multiple GPT components"):
            MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", session)

    def test_target_data_tamper_is_rejected(self):
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        plan["targetData"] = plan["targetData"].replace("Sonnet46", "GPT41")
        with self.assertRaisesRegex(ValueError, "hash"):
            MODULE.validate_plan(plan)

    def test_malformed_identity_and_read_back_are_rejected(self):
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        plan["botName"] = None
        with self.assertRaisesRegex(ValueError, "identity fields"):
            MODULE.validate_plan(plan)
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        plan["readBack"] = None
        with self.assertRaisesRegex(ValueError, "readBack"):
            MODULE.validate_plan(plan)

    def test_malformed_source_etag_is_rejected(self):
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        plan["sourceEtag"] = 'W/"123'
        with self.assertRaisesRegex(ValueError, "sourceEtag"):
            MODULE.validate_plan(plan)

    def test_unapproved_hash_is_rejected(self):
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "approval hash"):
                MODULE.load_approved_plan(path, "0" * 64)

    def test_runtime_origin_drift_is_rejected_before_patch(self):
        plan = MODULE.build_plan(self.origin, self.bot_id, "Sonnet46", self.session)
        with self.assertRaisesRegex(ValueError, "does not match"):
            MODULE.apply_plan(plan, "https://" + "other" + ".crm.dynamics.com", self.session)


if __name__ == "__main__":
    unittest.main()