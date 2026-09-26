import copy
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT.parent / "data-platform" / "tests"))
from build_mapping import build  # noqa: E402
from data_platform_common import Api, DatabricksSql  # noqa: E402
from fakes import FakeResponse, FakeSession, no_sleep, token_provider  # noqa: E402
from migrate_data import DatabricksWriter, DataverseWriter, LakehouseWriter, apply, build_plan, verify  # noqa: E402
from profile_source import profile  # noqa: E402

SAMPLES = ROOT / "references" / "samples" / "cold-chain"


def api(kind, session, base=None):
    return Api(kind, base, session=session, token_provider=token_provider, sleep=no_sleep)


class MigrateDataTest(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp())
        for file in SAMPLES.iterdir():
            shutil.copy(file, self.directory / file.name)
        self.profile = profile(self.directory)
        self.mapping = build(self.profile, "databricks", catalog="main", schema="cold_chain")

    def tearDown(self):
        shutil.rmtree(self.directory, ignore_errors=True)

    def edit(self, name: str, old: str, new: str) -> None:
        path = self.directory / name
        path.write_text(path.read_text(encoding="utf-8").replace(old, new), encoding="utf-8")

    def rules(self) -> set[str]:
        plan, errors = build_plan(self.mapping, self.directory)
        self.assertIsNone(plan)
        return {error["rule"] for error in errors}

    def test_plan_succeeds_for_sample(self):
        plan, errors = build_plan(self.mapping, self.directory)
        self.assertEqual(errors, [])
        self.assertEqual(sum(plan["rowCounts"].values()), 22)

    def test_duplicate_key(self):  # DM-U-009
        self.edit("stores.csv", "ST-02,Osaka", "ST-01,Osaka")
        self.assertIn("duplicate-key", self.rules())

    def test_required_null(self):  # DM-U-010
        self.edit("freezers.csv", "FZ-102,ST-01,Polar-X2,Medium", "FZ-102,ST-01,Polar-X2,")
        self.assertIn("required", self.rules())

    def test_type_error(self):  # DM-U-011
        self.edit("telemetry.csv", "-13.5,46.0", "warm,46.0")
        plan, errors = build_plan(self.mapping, self.directory)
        error = next(e for e in errors if e["rule"] == "type:decimal")
        self.assertEqual((error["row"], error["value"]), (4, "warm"))

    def test_reference_error(self):  # DM-U-012
        self.edit("work_orders.csv", "WO-9003,FZ-301", "WO-9003,FZ-999")
        self.assertIn("reference:freezers", self.rules())

    def test_identifier_injection_rejected(self):  # DM-U-013
        bad = copy.deepcopy(self.mapping)
        bad["tables"][0]["target"] = "stores; DROP TABLE x"
        with self.assertRaises(ValueError):
            build_plan(bad, self.directory)

    def test_hash_changes_with_source(self):  # DM-U-014
        first, _ = build_plan(self.mapping, self.directory)
        self.edit("stores.csv", "Tokyo Central", "Tokyo Centrai")
        second, _ = build_plan(self.mapping, self.directory)
        self.assertNotEqual(first["planHash"], second["planHash"])

    def test_source_change_blocks_apply(self):  # DM-U-015
        plan, _ = build_plan(self.mapping, self.directory)
        self.edit("stores.csv", "Tokyo Central", "Tokyo Centrai")
        session = FakeSession()
        writer = DatabricksWriter(self.mapping, DatabricksSql(api("databricks", session, "https://host"), "wh", sleep=no_sleep))
        with self.assertRaises(SystemExit):
            apply(plan, writer)
        self.assertEqual(session.calls, [])

    def test_databricks_merge_is_parameterized(self):  # DM-U-016 / DM-U-017
        plan, _ = build_plan(self.mapping, self.directory)
        session = FakeSession().add("POST", r"/sql/statements$", FakeResponse(200, {"statement_id": "s", "status": {"state": "SUCCEEDED"}}))
        writer = DatabricksWriter(self.mapping, DatabricksSql(api("databricks", session, "https://host"), "wh", sleep=no_sleep))
        with patch("migrate_data.MAX_PARAMETERS", 20):
            report = apply(plan, writer)
        self.assertEqual(report["status"], "verified")
        bodies = session.bodies("POST", "statements")
        merges = [b for b in bodies if b["statement"].startswith("MERGE")]
        self.assertTrue(all("Tokyo Central" not in b["statement"] for b in merges))
        self.assertTrue(all(len(b["parameters"]) <= 20 for b in merges))
        telemetry = next(t for t in report["tables"] if t["table"] == "telemetry")
        self.assertEqual(telemetry["statements"], 3)
        self.assertTrue(any("`main`.`cold_chain`.`telemetry`" in b["statement"] for b in merges))
        timestamp = next(p for b in merges for p in b["parameters"] if p["type"] == "TIMESTAMP")
        self.assertEqual(timestamp["value"], "2026-09-23 10:00:00")

    def test_dataverse_upsert_and_lookup(self):  # DM-U-018 / DM-U-019
        mapping = build(self.profile, "dataverse", prefix="cr1")
        self.edit("stores.csv", "Tokyo Central", "O'Hare+Tokyo")
        plan, errors = build_plan(mapping, self.directory)
        self.assertEqual(errors, [])
        session = FakeSession()
        for table in mapping["tables"]:
            key = next(c["target"] for c in table["columns"] if c["source"] == table["key"])
            session.add("GET", rf"LogicalName='{table['target']}'\)/Keys", FakeResponse(200, {"value": [{"KeyAttributes": [key]}]}))
        session.add("PATCH", r"cr1_", FakeResponse(204))
        report = apply(plan, DataverseWriter(mapping, api("dataverse", session, "https://org/api/data/v9.2")))
        self.assertEqual(report["status"], "verified")
        patches = [call for call in session.calls if call["method"] == "PATCH"]
        self.assertEqual(len(patches), 22)
        store = next(json.loads(c["body"]) for c in patches if "cr1_stores(" in c["url"] and "ST-01" in c["url"])
        self.assertEqual(store["cr1_store_name"], "O'Hare+Tokyo")
        freezer = next(c for c in patches if "cr1_freezers(" in c["url"])
        self.assertEqual(json.loads(freezer["body"])["cr1_storeid@odata.bind"], "/cr1_stores(cr1_store_id='ST-01')")
        escaped = DataverseWriter.key_literal({"type": "string"}, "O'Hare+X")
        self.assertEqual(escaped, "'O%27%27Hare%2BX'")

    def test_dataverse_missing_alternate_key_is_blocked(self):  # DM-U-020
        mapping = build(self.profile, "dataverse", prefix="cr1")
        plan, _ = build_plan(mapping, self.directory)
        session = FakeSession().add("GET", r"/Keys", FakeResponse(200, {"value": []}))
        report = apply(plan, DataverseWriter(mapping, api("dataverse", session, "https://org/api/data/v9.2")))
        self.assertEqual(report["status"], "blocked")
        self.assertFalse([c for c in session.calls if c["method"] == "PATCH"])

    def test_lakehouse_upload_and_load(self):  # DM-U-021
        mapping = build(self.profile, "fabric-lakehouse", workspace_id="ws", lakehouse_id="lh")
        plan, _ = build_plan(mapping, self.directory)
        storage = FakeSession()
        storage.add("PUT", r"resource=file", FakeResponse(201))
        storage.add("PATCH", r"action=append", FakeResponse(202))
        storage.add("PATCH", r"action=flush", FakeResponse(200))
        fabric = FakeSession()
        fabric.add("POST", r"/tables/\w+/load", FakeResponse(202, headers={"Location": "https://api.fabric.microsoft.com/v1/operations/op"}))
        fabric.add("GET", r"/operations/op", FakeResponse(200, {"status": "Succeeded"}))
        writer = LakehouseWriter(mapping, api("fabric", fabric), api("storage", storage))
        report = apply(plan, writer)
        self.assertEqual(report["status"], "verified")
        methods = [(c["method"], c["url"].split("?")[1].split("&")[0]) for c in storage.calls[:3]]
        self.assertEqual(methods, [("PUT", "resource=file"), ("PATCH", "action=append"), ("PATCH", "action=flush")])
        load = fabric.bodies("POST", "/load")[0]
        self.assertEqual(load["mode"], "Overwrite")
        self.assertTrue(load["relativePath"].startswith("Files/migration/"))

    def test_verify_databricks(self):  # DM-U-022 / DM-U-023
        plan, _ = build_plan(self.mapping, self.directory)
        stores = [["ST-01", "Tokyo Central", "Japan East"], ["ST-02", "Osaka Bay", "Japan West"], ["ST-03", "Sapporo North", "Japan North"]]
        for rows, status in ((stores, "verified"), (stores[:2] + [["ST-09", "X", "Y"]], "failed")):
            writer = _FakeReader(self.mapping, {"stores": rows})
            checks = {c["check"]: c for c in verify(plan, writer)}
            self.assertEqual(checks["stores"]["status"], status)
        self.assertEqual(checks["stores"]["evidence"]["missingKeys"], ["ST-03"])
        self.assertEqual(checks["stores"]["evidence"]["extraKeys"], ["ST-09"])

    def test_verify_lakehouse_marks_count_not_tested(self):  # DM-U-024
        mapping = build(self.profile, "fabric-lakehouse", workspace_id="ws", lakehouse_id="lh")
        plan, _ = build_plan(mapping, self.directory)
        fabric = FakeSession().add("GET", r"/tables$", FakeResponse(200, {"data": [{"name": n} for n in plan["loadOrder"]]}))
        checks = verify(plan, LakehouseWriter(mapping, api("fabric", fabric), api("storage", FakeSession())))
        statuses = {c["check"]: c["status"] for c in checks}
        self.assertEqual(statuses["stores:exists"], "verified")
        self.assertEqual(statuses["stores:rows"], "not-tested")


class _FakeReader:
    def __init__(self, mapping, overrides):
        self.mapping = mapping
        self.overrides = overrides

    def read(self, table):
        from source_reader import read_table
        if table["target"] in self.overrides:
            rows = self.overrides[table["target"]]
            return [{c["source"]: value for c, value in zip(table["columns"], row)} for row in rows]
        _, raw = read_table(SAMPLES / table["source"])
        return raw


if __name__ == "__main__":
    unittest.main()
