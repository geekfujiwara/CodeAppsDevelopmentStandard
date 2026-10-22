import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw, ImageFont

Image.init()


class IconTests(unittest.TestCase):
    def load_script(self):
        auth = types.ModuleType("auth_helper")
        auth.DATAVERSE_URL = "https://example.invalid"
        auth.api_get = mock.Mock()
        auth.get_session = mock.Mock()
        spec = importlib.util.spec_from_file_location(
            "icon_test_script", Path(__file__).resolve().parents[1] / "scripts" / "set_icon.py")
        module = importlib.util.module_from_spec(spec)
        with mock.patch.dict(sys.modules, {"auth_helper": auth}):
            spec.loader.exec_module(module)
        return module, auth

    def test_all_three_icons_are_generated_and_verified(self):
        module, auth = self.load_script()
        main, color, outline = [
            module.to_b64(module.draw_icon(size, "SC", transparent_bg=size == 32, outline_only=size == 32))
            for size in (240, 192, 32)]
        auth.api_get.side_effect = [
            {"name": "Test"},
            {"applicationmanifestinformation": '{"teams":{"other":"keep"}}'},
            {"iconbase64": main, "applicationmanifestinformation": json.dumps({
                "teams": {"colorIcon": color, "outlineIcon": outline}})}]
        session = mock.Mock()
        module.set_icon(session, "test", "SC")
        self.assertEqual(session.patch.call_count, 2)
        manifest = json.loads(session.patch.call_args.kwargs["json"]["applicationmanifestinformation"])
        self.assertEqual(manifest["teams"]["other"], "keep")
        self.assertEqual(manifest["teams"]["colorIcon"], color)

    def test_http_failure_stops_before_claiming_success(self):
        module, auth = self.load_script()
        auth.api_get.return_value = {"name": "Test"}
        session = mock.Mock()
        session.patch.return_value.raise_for_status.side_effect = RuntimeError("HTTP failure")
        with self.assertRaisesRegex(RuntimeError, "HTTP failure"):
            module.set_icon(session, "test", "SC")
        self.assertEqual(session.patch.call_count, 1)

    def test_readback_mismatch_is_failure(self):
        module, auth = self.load_script()
        auth.api_get.side_effect = [{"name": "Test"}, {}, {}]
        with self.assertRaisesRegex(RuntimeError, "読み戻し"):
            module.set_icon(mock.Mock(), "test", "SC")


if __name__ == "__main__":
    unittest.main()
