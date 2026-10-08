from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import verify_native_package as verify


class VerifyNativePackageTests(unittest.TestCase):
    def test_preflight_distinguishes_first_deploy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "power.config.json").write_text("{}", encoding="utf-8")
            self.assertEqual(verify.preflight(root), 2)
            (root / "power.config.json").write_text(
                json.dumps({"appId": "11111111-2222-3333-4444-555555555555"}),
                encoding="utf-8",
            )
            self.assertEqual(verify.preflight(root), 0)

    def test_verify_accepts_complete_native_package(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / "dist"
            dist.mkdir()
            web_dist = root / "dist-web"
            web_dist.mkdir()
            (web_dist / "index.html").write_text("<!doctype html>", encoding="utf-8")
            for _, bundle_name, manifest_name in verify.ARTIFACTS:
                (dist / bundle_name).write_bytes(verify.HERMES_MAGIC + b"bundle")
                manifest = dist / manifest_name
                manifest.parent.mkdir(parents=True)
                manifest.write_text('{"assets":[]}', encoding="utf-8")
            self.assertEqual(verify.verify(root), 0)

    def test_verify_rejects_web_only_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dist-web").mkdir()
            (root / "dist-web" / "index.html").write_text("<!doctype html>", encoding="utf-8")
            self.assertEqual(verify.verify(root), 1)


if __name__ == "__main__":
    unittest.main()
