from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "manage_agent_package_graph.py"
SPEC = importlib.util.spec_from_file_location("manage_agent_package_graph", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def make_package(path: Path, manifest_id: str = "<manifest-id>") -> None:
    manifest = {"id": manifest_id, "version": "1.0.0", "name": {"short": "Example"}}
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("color.png", b"placeholder")


class ManageAgentPackageTests(unittest.TestCase):
    def test_package_metadata_reads_root_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            package_path = Path(directory) / "agent.zip"
            make_package(package_path)

            manifest, package, digest = MODULE.package_metadata(package_path)

            self.assertEqual(manifest["version"], "1.0.0")
            self.assertTrue(package)
            self.assertEqual(len(digest), 64)

    def test_plan_hash_changes_with_package_digest(self):
        first = {"operation": "create", "packageSha256": "a" * 64}
        second = {"operation": "create", "packageSha256": "b" * 64}

        self.assertNotEqual(MODULE.plan_hash(first), MODULE.plan_hash(second))


if __name__ == "__main__":
    unittest.main()