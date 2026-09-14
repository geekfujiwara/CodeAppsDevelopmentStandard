import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from create_initial_tools_manifest import build_manifest
from mcp_tool_plan import canonical_hash


def synthetic_guid(digit):
    return "-".join((digit * 8, digit * 4, digit * 4, digit * 4, digit * 12))


def plan(operation="one", bot_id=synthetic_guid("2")):
    return {
        "environmentId": synthetic_guid("1"),
        "botId": bot_id,
        "connectorId": "/providers/Microsoft.PowerApps/apis/shared_sample",
        "operationId": operation,
    }


class InitialToolsManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write_plan(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_builds_manifest_for_one_target(self):
        first = plan()
        second = plan("two")
        first_path = self.write_plan("one.json", first)
        second_path = self.write_plan("two.json", second)
        manifest = build_manifest(
            [(first_path, canonical_hash(first)), (second_path, canonical_hash(second))],
            self.root / "initial-tools.json",
        )
        self.assertEqual(len(manifest["approvals"]), 2)
        self.assertEqual(manifest["approvals"][0]["planPath"], "one.json")

    def test_rejects_hash_mismatch(self):
        value = plan()
        path = self.write_plan("one.json", value)
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            build_manifest([(path, "0" * 64)], self.root / "initial-tools.json")

    def test_rejects_mixed_targets(self):
        first = plan()
        second = plan("two", bot_id=synthetic_guid("3"))
        first_path = self.write_plan("one.json", first)
        second_path = self.write_plan("two.json", second)
        with self.assertRaisesRegex(ValueError, "one environment and bot"):
            build_manifest(
                [(first_path, canonical_hash(first)), (second_path, canonical_hash(second))],
                self.root / "initial-tools.json",
            )

    def test_rejects_duplicates(self):
        value = plan()
        first_path = self.write_plan("one.json", value)
        second_path = self.write_plan("two.json", value)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            build_manifest(
                [(first_path, canonical_hash(value)), (second_path, canonical_hash(value))],
                self.root / "initial-tools.json",
            )


if __name__ == "__main__":
    unittest.main()