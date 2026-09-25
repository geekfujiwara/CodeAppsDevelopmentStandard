import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_mapping import build, load_order, snake  # noqa: E402
from profile_source import profile  # noqa: E402

PROFILE = profile(ROOT / "references" / "samples" / "cold-chain")


class BuildMappingTest(unittest.TestCase):
    def test_databricks_names(self):  # DM-U-006
        mapping = build(PROFILE, "databricks", catalog="main", schema="cold_chain")
        self.assertEqual([t["target"] for t in mapping["tables"]], ["freezers", "stores", "telemetry", "work_orders"])
        self.assertEqual(snake("Store Name (JP)", "x"), "store_name_jp")
        self.assertEqual(snake("店舗名", "col_1"), "col_1")
        self.assertEqual(snake("2024 total", "x"), "c_2024_total")

    def test_databricks_rejects_bad_schema(self):
        with self.assertRaises(ValueError):
            build(PROFILE, "databricks", catalog="main", schema="cold-chain")

    def test_dataverse_names(self):  # DM-U-007
        mapping = build(PROFILE, "dataverse", prefix="cr1")
        freezer = next(t for t in mapping["tables"] if t["source"] == "freezers.csv")
        self.assertEqual(freezer["target"], "cr1_freezer")
        self.assertEqual(freezer["entitySet"], "cr1_freezers")
        self.assertEqual(freezer["columns"][1]["target"], "cr1_store_id")
        self.assertEqual(freezer["relationships"][0]["navigationProperty"], "cr1_storeid")
        self.assertTrue(any("navigationProperty" in item for item in mapping["review"]))

    def test_dataverse_requires_prefix(self):
        with self.assertRaises(ValueError):
            build(PROFILE, "dataverse", prefix="")

    def test_load_order(self):  # DM-U-008
        mapping = build(PROFILE, "databricks", catalog="main", schema="cold_chain")
        order = mapping["loadOrder"]
        self.assertLess(order.index("stores"), order.index("freezers"))
        self.assertLess(order.index("freezers"), order.index("telemetry"))
        self.assertLess(order.index("freezers"), order.index("work_orders"))

    def test_cycle_is_error(self):  # DM-U-008
        tables = [{"target": "a", "relationships": [{"references": {"table": "b"}}]},
                  {"target": "b", "relationships": [{"references": {"table": "a"}}]}]
        with self.assertRaises(ValueError):
            load_order(tables)


if __name__ == "__main__":
    unittest.main()
