from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "check_connector_ids.py"
SPEC = importlib.util.spec_from_file_location("check_connector_ids", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE  # dataclass が自分のモジュールを sys.modules から引くため
SPEC.loader.exec_module(MODULE)


def write_manifest(folder: Path, plugin_id: str, name: str, *connector_ids: str) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {
        "id": plugin_id,
        "name": {"short": name},
        "agentConnectors": [{"id": cid, "toolSource": {"remoteMcpServer": {"mcpServerUrl": "https://example.invalid/api/mcp"}}} for cid in connector_ids],
    }
    path = folder / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path


class CheckConnectorIdsTests(unittest.TestCase):
    def test_generic_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = MODULE.load_connectors(write_manifest(Path(tmp) / "a", "id-a", "A", "dataverse-mcp"))
            errors = MODULE.validate(target, [])
            self.assertEqual(len(errors), 1)
            self.assertIn("汎用的すぎます", errors[0])

    def test_plugin_specific_id_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = MODULE.load_connectors(write_manifest(Path(tmp) / "a", "id-a", "A", "store-assist-dataverse-mcp"))
            self.assertEqual(MODULE.validate(target, []), [])

    def test_clash_with_other_plugin_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = MODULE.load_connectors(write_manifest(root / "a", "id-a", "A", "shared-dataverse-mcp"))
            write_manifest(root / "scan" / "b", "id-b", "B", "shared-dataverse-mcp")
            errors = MODULE.validate(target, MODULE.scan([root / "scan"]))
            self.assertEqual(len(errors), 1)
            self.assertIn("ほかのプラグインでも使われています", errors[0])
            self.assertIn("B", errors[0])

    def test_same_plugin_elsewhere_is_not_a_clash(self):
        """同じプラグイン（manifest の id が同じ）の別の置き場所・古い版は衝突にしない"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = MODULE.load_connectors(write_manifest(root / "a", "id-a", "A", "a-dataverse-mcp"))
            write_manifest(root / "scan" / "copy", "id-a", "A", "a-dataverse-mcp")
            self.assertEqual(MODULE.validate(target, MODULE.scan([root / "scan"])), [])

    def test_source_with_placeholder_id_is_the_same_plugin_as_the_build(self):
        """ビルド後の manifest（実 id）と、そのソース（プレースホルダー id・同じ名前）は同じプラグイン"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = MODULE.load_connectors(write_manifest(root / "build", "real-id", "A", "a-dataverse-mcp"))
            write_manifest(root / "scan" / "src", "${COWORK_PLUGIN_ID}", "A", "a-dataverse-mcp")
            self.assertEqual(MODULE.validate(target, MODULE.scan([root / "scan"])), [])

    def test_templates_with_placeholder_ids_are_separate_plugins(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = MODULE.load_connectors(write_manifest(root / "a", "${COWORK_PLUGIN_ID}", "A", "x-dataverse-mcp"))
            write_manifest(root / "scan" / "t", "${COWORK_PLUGIN_ID}", "T", "x-dataverse-mcp")
            self.assertEqual(len(MODULE.validate(target, MODULE.scan([root / "scan"]))), 1)

    def test_different_plugins_with_the_same_name_still_clash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = MODULE.load_connectors(write_manifest(root / "a", "id-1", "Same", "s-dataverse-mcp"))
            write_manifest(root / "scan" / "b", "id-2", "Same", "s-dataverse-mcp")
            self.assertEqual(len(MODULE.validate(target, MODULE.scan([root / "scan"]))), 1)

    def test_duplicate_and_format_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = MODULE.load_connectors(write_manifest(Path(tmp) / "a", "id-a", "A", "Bad_ID", "Bad_ID"))
            errors = MODULE.validate(target, [])
            self.assertTrue(any("重複" in e for e in errors))
            self.assertTrue(any("kebab-case" in e for e in errors))

    def test_scan_skips_node_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "node_modules" / "pkg", "id-z", "Z", "z-mcp")
            self.assertEqual(MODULE.scan([root]), [])

    def test_repository_templates_use_plugin_specific_ids(self):
        """スキルに同梱しているテンプレートの manifest が汎用 ID に戻っていないこと"""
        skills = Path(__file__).resolve().parents[2]
        manifests = [p for p in skills.rglob("manifest.json") if "node_modules" not in p.parts]
        connectors = [c for p in manifests for c in MODULE.load_connectors(p)]
        self.assertTrue(connectors, "テンプレートの manifest が見つかりません")
        for c in connectors:
            self.assertNotIn(c.connector_id.lower(), MODULE.GENERIC_IDS, c.path)
        ids = [c.connector_id for c in connectors]
        self.assertEqual(len(ids), len(set(ids)), f"テンプレート同士でコネクタ ID が重なっています: {ids}")


if __name__ == "__main__":
    unittest.main()
