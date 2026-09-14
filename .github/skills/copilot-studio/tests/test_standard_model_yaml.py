import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "standard_model_yaml.py"
SPEC = importlib.util.spec_from_file_location("standard_model_yaml", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class StandardModelYamlTests(unittest.TestCase):
    def test_replaces_only_existing_model_hint(self):
        before = (
            "kind: GptComponentMetadata\r\n\r\n"
            "instructions: |-\r\n  Keep this exact.\r\n\r\n"
            "aISettings:\r\n  model:\r\n    kind: CurrentModels\r\n"
            "    modelNameHint: GPT5Chat\r\n\r\n"
            "  extensionData:\r\n    lastUsedCustomModel: {}\r\n\r\n"
            "displayName: Example\r\n"
        )
        after = MODULE.set_model_name(before, "Sonnet46")
        self.assertEqual("Sonnet46", MODULE.current_model_name(after))
        self.assertEqual(before.replace("GPT5Chat", "Sonnet46"), after)

    def test_adds_hint_without_changing_other_model_fields(self):
        before = "aISettings:\n  model:\n    kind: CurrentModels\n\n  extensionData:\n    value: keep\n"
        after = MODULE.set_model_name(before, "GPT5Chat")
        self.assertEqual(
            "aISettings:\n  model:\n    modelNameHint: GPT5Chat\n    kind: CurrentModels\n\n"
            "  extensionData:\n    value: keep\n",
            after,
        )

    def test_adds_ai_settings_without_changing_existing_yaml(self):
        before = "kind: GptComponentMetadata\n\ndisplayName: Example\n"
        after = MODULE.set_model_name(before, "GPT5Chat")
        self.assertTrue(after.startswith(before))
        self.assertEqual("GPT5Chat", MODULE.current_model_name(after))

    def test_rejects_unsafe_model_name(self):
        with self.assertRaisesRegex(ValueError, "model name"):
            MODULE.set_model_name("aISettings:\n", "model: injected")

    def test_top_level_model_hint_is_not_mistaken_for_ai_settings(self):
        data = "modelNameHint: Other\n\naISettings:\n  model:\n    modelNameHint: GPT5Chat\n"
        self.assertEqual("GPT5Chat", MODULE.current_model_name(data))


if __name__ == "__main__":
    unittest.main()