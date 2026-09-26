import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from profile_source import profile  # noqa: E402

SAMPLES = ROOT / "references" / "samples" / "cold-chain"


class ProfileSourceTest(unittest.TestCase):
    def setUp(self):
        self.tables = {table["file"]: table for table in profile(SAMPLES)["tables"]}

    def test_type_inference(self):  # DM-U-001
        telemetry = {c["name"]: c["type"] for c in self.tables["telemetry.csv"]["columns"]}
        self.assertEqual(telemetry, {"event_id": "string", "freezer_id": "string", "event_time": "datetime",
                                     "temperature_c": "decimal", "humidity_pct": "decimal"})

    def test_key_candidates(self):  # DM-U-002
        self.assertEqual(self.tables["telemetry.csv"]["key"], "event_id")
        self.assertEqual(self.tables["work_orders.csv"]["key"], "work_order_id")
        self.assertNotIn("freezer_id", self.tables["telemetry.csv"]["keyCandidates"])

    def test_foreign_key_candidates(self):  # DM-U-003
        fks = {(t, fk["column"], fk["references"]["file"]) for t, table in self.tables.items() for fk in table["foreignKeyCandidates"]}
        self.assertEqual(fks, {("freezers.csv", "store_id", "stores.csv"), ("telemetry.csv", "freezer_id", "freezers.csv"),
                               ("work_orders.csv", "freezer_id", "freezers.csv")})

    def test_json_and_jsonl(self):  # DM-U-004
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "a.json").write_text(json.dumps([{"id": 1, "flag": True}, {"id": 2, "flag": False}]), encoding="utf-8")
            Path(directory, "b.jsonl").write_text('{"id": "x", "n": 1.5}\n{"id": "y", "n": null}\n', encoding="utf-8")
            tables = {t["file"]: t for t in profile(Path(directory))["tables"]}
            self.assertEqual({c["name"]: c["type"] for c in tables["a.json"]["columns"]}, {"id": "integer", "flag": "boolean"})
            self.assertEqual(tables["b.jsonl"]["columns"][1]["nullCount"], 1)

    def test_bom_and_japanese_headers(self):  # DM-U-005
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "店舗.csv").write_bytes("\ufeff店舗コード,店舗名\nS1,東京\nS2,大阪\n".encode("utf-8"))
            table = profile(Path(directory))["tables"][0]
            self.assertEqual([c["name"] for c in table["columns"]], ["店舗コード", "店舗名"])
            self.assertEqual(table["keyCandidates"], ["店舗コード", "店舗名"])


if __name__ == "__main__":
    unittest.main()
