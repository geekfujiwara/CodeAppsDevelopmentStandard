import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from model_policy import apply_model, resolve_model


class ModelPolicyTests(unittest.TestCase):
    def test_auto_and_empty_leave_selection_to_platform_without_browser(self):
        for series in ["", "Auto", "auto", " AUTO "]:
            with self.subTest(series=series):
                self.assertIsNone(resolve_model(series))

    def test_observed_model_or_absence_is_replayed_exactly(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "model.json"
            for model in [None, {"$kind": "ModelConfig", "series": "observed-test-value", "option": True}]:
                file.write_text(json.dumps({"selection": "Auto", "model": model}), encoding="utf-8")
                self.assertEqual(resolve_model("Auto", str(file)), model)
                settings = {"model": {"series": "previous"}, "instructions": {"value": "keep"}, "enableMemory": False}
                apply_model(settings, resolve_model("auto", str(file)))
                self.assertEqual(settings.get("model"), model)
                self.assertEqual(settings["instructions"], {"value": "keep"})
                self.assertFalse(settings["enableMemory"])
                if model is None:
                    self.assertNotIn("model", settings)

    def test_invalid_records_and_deprecated_series_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "model.json"
            for record in [[], {}, {"selection": "Other", "model": None},
                           {"selection": "Auto", "model": "auto"},
                           {"selection": "Auto", "model": {"$kind": "Wrong"}},
                           {"selection": "Auto", "model": {"$kind": "ModelConfig", "series": "Sonnet46"}}]:
                file.write_text(json.dumps(record), encoding="utf-8")
                with self.subTest(record=record), self.assertRaises(ValueError):
                    resolve_model("Auto", str(file))
        for series in ["Sonnet46", "Sonnet5", "Opus5", "GPT4o"]:
            with self.assertRaisesRegex(ValueError, "廃止"):
                resolve_model(series)

    def test_explicit_fixed_model_is_opt_in(self):
        self.assertEqual(resolve_model("chosen-fixed-model"), {"$kind": "ModelConfig", "series": "chosen-fixed-model"})

    def test_scaffold_and_environment_examples_default_to_auto(self):
        root = SCRIPTS.parent
        scaffold = json.loads((root / "templates" / "agm-qa-author" / "scaffold.json").read_text(encoding="utf-8"))
        question = next(q for q in scaffold["questions"] if q["variable"] == "AGENT_MODEL_SERIES")
        self.assertEqual(question["default"], "Auto")
        self.assertIn("AGENT_MODEL_SERIES=Auto", (root / "references" / ".env.example").read_text(encoding="utf-8"))
        self.assertIn("AGENT_AUTO_MODEL_CONFIG_FILE=", (root / "templates" / "agm-qa-author" / "agent.env").read_text(encoding="utf-8"))

    def load_script(self, name):
        auth = types.ModuleType("auth_helper")
        auth.DATAVERSE_URL = "https://example.invalid"
        auth.api_get = mock.Mock()
        auth.get_session = mock.Mock()
        spec = importlib.util.spec_from_file_location(f"model_test_{name}", SCRIPTS / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        with mock.patch.dict(sys.modules, {"auth_helper": auth}):
            spec.loader.exec_module(module)
        return module, auth

    def test_create_defaults_to_auto_without_model_pin(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            module, auth = self.load_script("create_agent")
            self.assertEqual(module.MODEL_SERIES, "Auto")
            self.assertNotIn("model", module.build_configuration()["agentSettings"])
            auth.get_session.assert_not_called()
            auth.api_get.assert_not_called()

    def test_invalid_explicit_capture_stops_before_authentication(self):
        with mock.patch.dict(os.environ, {"AGENT_AUTO_MODEL_CONFIG_FILE": "missing-capture.json"}, clear=True):
            module, auth = self.load_script("create_agent")
            with self.assertRaises(SystemExit):
                module.main()
            auth.get_session.assert_not_called()
            auth.api_get.assert_not_called()

    def test_memory_setting_and_duplicate_guard(self):
        with mock.patch.dict(os.environ, {"AGENT_ENABLE_MEMORY": "false"}, clear=True):
            module, auth = self.load_script("create_agent")
            self.assertFalse(module.build_configuration()["agentSettings"]["enableMemory"])
            auth.api_get.return_value = {"value": [{"botid": "existing"}]}
            with self.assertRaisesRegex(SystemExit, "既にあります"):
                module.main()
            auth.get_session.return_value.post.assert_not_called()
            with mock.patch.dict(os.environ, {"AGENT_ENABLE_MEMORY": "invalid"}):
                with self.assertRaises(ValueError):
                    module.build_configuration()

    def test_capture_is_read_only_requires_confirmation_and_never_overwrites(self):
        module, auth = self.load_script("set_model")
        auth.api_get.return_value = {"name": "Test", "configuration": json.dumps({"agentSettings": {}})}
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(module, "resolve_bot_id", return_value="test"):
            file = Path(folder) / "auto.json"
            with mock.patch.object(sys, "argv", ["set_model.py", "--capture-auto", str(file)]):
                with self.assertRaises(SystemExit):
                    module.main()
            self.assertFalse(file.exists())
            with mock.patch.object(sys, "argv", ["set_model.py", "--capture-auto", str(file), "--confirm-ui-auto"]):
                module.main()
                self.assertEqual(json.loads(file.read_text(encoding="utf-8")), {"selection": "Auto", "model": None})
                with self.assertRaises(FileExistsError):
                    module.main()
            auth.get_session.assert_not_called()

    def test_update_preflight_stops_before_instructions_or_tools_change(self):
        module, auth = self.load_script("update_agent")
        with mock.patch.dict(os.environ, {"AGENT_MODEL_SERIES": "Auto", "AGENT_AUTO_MODEL_CONFIG_FILE": "missing-capture.json"}), \
                mock.patch.object(module, "load_env_file", return_value=[]), \
                mock.patch.object(module, "run") as run:
            with self.assertRaises(SystemExit):
                module.main()
            run.assert_not_called()
            auth.api_get.assert_not_called()

    def test_setting_auto_preserves_other_configuration_and_checks_readback(self):
        module, auth = self.load_script("set_model")
        before = {"channels": ["keep"], "agentSettings": {
            "model": {"$kind": "ModelConfig", "series": "previous"},
            "instructions": {"text": "keep"}, "enableMemory": False}}
        after = json.loads(json.dumps(before))
        after["agentSettings"].pop("model")
        auth.api_get.side_effect = [{"name": "Test", "configuration": json.dumps(before)},
                                    {"configuration": json.dumps(after)}]
        auth.get_session.return_value.patch.return_value.status_code = 204
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(module, "resolve_bot_id", return_value="test"):
            file = Path(folder) / "auto.json"
            file.write_text('{"selection":"Auto","model":null}', encoding="utf-8")
            with mock.patch.dict(os.environ, {"AGENT_AUTO_MODEL_CONFIG_FILE": str(file)}), \
                    mock.patch.object(sys, "argv", ["set_model.py", "Auto"]):
                module.main()
        sent = auth.get_session.return_value.patch.call_args.kwargs["json"]
        self.assertEqual(json.loads(sent["configuration"]), after)
        self.assertEqual(sent["name"], "Test")


if __name__ == "__main__":
    unittest.main()
