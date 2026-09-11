"""Unit tests for setup_evaluation_dataverse.py (mocked Dataverse; no network calls).

Run with:
    python -m unittest .github/skills/ai-teammate/scripts/tests/test_setup_evaluation_dataverse.py -v
"""
from __future__ import annotations

import importlib.util
import re
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "setup_evaluation_dataverse.py"

_spec = importlib.util.spec_from_file_location("setup_evaluation_dataverse", SCRIPT_PATH)
sed = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = sed
assert _spec.loader is not None
_spec.loader.exec_module(sed)


class FakeDataverse:
    """Enough of the Dataverse Web API surface for setup_evaluation_dataverse.py's own calls."""

    def __init__(self) -> None:
        self.solutions: dict[str, str] = {}
        # logical_name -> {"metadata_id": str, "columns": set[str], "owner_solution": str | None}
        self.tables: dict[str, dict] = {}
        self._next_id = 1

    def _new_id(self) -> str:
        self._next_id += 1
        return f"11111111-1111-1111-1111-{self._next_id:012d}"

    def add_solution(self, name: str) -> str:
        sid = self._new_id()
        self.solutions[name] = sid
        return sid

    def seed_table(self, logical: str, columns: set[str], owner_solution: str | None) -> None:
        self.tables[logical] = {
            "metadata_id": self._new_id(),
            "columns": columns,
            "owner_solution": owner_solution,
        }

    # -- api_get --------------------------------------------------------
    def api_get(self, path: str) -> dict:
        path = unquote(path)
        if path.startswith("solutions?"):
            match = re.search(r"uniquename eq '([^']+)'", path)
            name = match.group(1) if match else ""
            sid = self.solutions.get(name)
            return {"value": [{"solutionid": sid}] if sid else []}

        if path.startswith("EntityDefinitions?"):
            match = re.search(r"startswith\(LogicalName,'([^']+)'\)", path)
            prefix = match.group(1) if match else ""
            return {
                "value": [
                    {"LogicalName": name, "MetadataId": info["metadata_id"]}
                    for name, info in self.tables.items()
                    if name.startswith(prefix)
                ]
            }

        match = re.match(r"EntityDefinitions\(LogicalName='([^']+)'\)/Attributes\?", path)
        if match:
            logical = match.group(1)
            info = self.tables.get(logical)
            columns = info["columns"] if info else set()
            return {"value": [{"LogicalName": c} for c in columns]}

        if path.startswith("solutioncomponents?"):
            match = re.search(r"_solutionid_value eq ([0-9a-fA-F-]+)", path)
            sid = match.group(1) if match else ""
            return {
                "value": [
                    {"objectid": info["metadata_id"]}
                    for info in self.tables.values()
                    if info["owner_solution"] == sid
                ]
            }

        raise AssertionError(f"unexpected api_get path: {path}")

    # -- api_post -------------------------------------------------------
    def api_post(self, path: str, body: dict, scope=None, *, solution: str = "") -> str | None:
        if path == "EntityDefinitions":
            logical = body["SchemaName"]
            sid = self.solutions.get(solution)
            self.seed_table(logical, {f"{logical}id", body["PrimaryNameAttribute"]}, sid)
            return self.tables[logical]["metadata_id"]

        match = re.match(r"EntityDefinitions\(LogicalName='([^']+)'\)/Attributes$", path)
        if match:
            logical = match.group(1)
            self.tables[logical]["columns"].add(body["SchemaName"])
            return None

        if path == "PublishAllXml":
            return None

        raise AssertionError(f"unexpected api_post path: {path}")


def install_fake(fake: FakeDataverse) -> None:
    sed.api_get = fake.api_get
    sed.api_post = fake.api_post
    sed.retry_metadata = lambda fn, description, max_attempts=5: fn()
    sed._sleep = lambda seconds: None


class BuildTablesTests(unittest.TestCase):
    def test_four_tables_with_expected_logical_names(self) -> None:
        tables = sed.build_tables("acme")
        names = {t["logical"] for t in tables}
        self.assertEqual(names, {"acme_evalturn", "acme_evalrule", "acme_evalresult", "acme_evaljob"})

    def test_evalturn_columns_cover_ts_field_map(self) -> None:
        # Mirrors templates/evaluation-app/src/lib/eval-turns.ts's `F` map (minus id/name, which
        # Dataverse creates implicitly as <logical>id / <prefix>_name).
        expected_suffixes = {
            "runid", "evaluatedon", "occurredon", "actor", "source", "query", "response",
            "toolcalls", "toolcount", "toolcallaccuracy", "taskadherence",
            "toolcallaccuracyreason", "taskadherencereason", "humancomment", "humanverdict",
            "mergedinto", "mergedfrom", "turncount", "conversation",
        }
        tables = sed.build_tables("acme")
        evalturn = next(t for t in tables if t["logical"] == "acme_evalturn")
        actual_suffixes = {c["logical"].removeprefix("acme_") for c in evalturn["columns"]}
        self.assertEqual(actual_suffixes, expected_suffixes)

    def test_evaljob_columns_cover_ts_field_map(self) -> None:
        expected_suffixes = {
            "status", "scope", "rulekeys", "fromdate", "todate", "requestedby", "requestedon",
            "startedon", "completedon", "targetcount", "donecount", "message",
        }
        tables = sed.build_tables("acme")
        evaljob = next(t for t in tables if t["logical"] == "acme_evaljob")
        actual_suffixes = {c["logical"].removeprefix("acme_") for c in evaljob["columns"]}
        self.assertEqual(actual_suffixes, expected_suffixes)

    def test_prefix_with_underscore_is_not_mis_split(self) -> None:
        # Regression: table/column logical names must use the *whole* prefix, not just the text
        # before the first/last underscore in it.
        tables = sed.build_tables("my_org")
        names = {t["logical"] for t in tables}
        self.assertIn("my_org_evalturn", names)


class ColumnBodyTests(unittest.TestCase):
    def test_picklist_options_round_trip(self) -> None:
        body = sed.build_column_body({
            "logical": "acme_status", "display": "Status", "type": "Picklist",
            "options": [(1, "待機中"), (2, "完了")],
        })
        self.assertEqual(body["@odata.type"], "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata")
        self.assertEqual([o["Value"] for o in body["OptionSet"]["Options"]], [1, 2])

    def test_unknown_type_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            sed.build_column_body({"logical": "acme_x", "display": "X", "type": "Nope"})


class RunCheckTests(unittest.TestCase):
    def test_missing_solution_is_fatal(self) -> None:
        fake = FakeDataverse()
        install_fake(fake)
        self.assertEqual(sed.run_check("acme", "MissingSolution"), 1)

    def test_nothing_created_yet_reports_not_created_exit(self) -> None:
        fake = FakeDataverse()
        fake.add_solution("EvalSolution")
        install_fake(fake)
        self.assertEqual(sed.run_check("acme", "EvalSolution"), sed.NOT_CREATED_EXIT)

    def test_foreign_table_collision_is_fatal(self) -> None:
        fake = FakeDataverse()
        sid = fake.add_solution("EvalSolution")
        other_sid = fake.add_solution("OtherSolution")
        fake.seed_table("acme_evalturn", {"acme_evalturnid", "acme_name"}, other_sid)
        install_fake(fake)
        self.assertEqual(sed.run_check("acme", "EvalSolution"), 1)

    def test_fully_created_reports_ok(self) -> None:
        fake = FakeDataverse()
        sid = fake.add_solution("EvalSolution")
        install_fake(fake)
        for tbl in sed.build_tables("acme"):
            columns = {f"{tbl['logical']}id", "acme_name"} | {c["logical"] for c in tbl["columns"]}
            fake.seed_table(tbl["logical"], columns, sid)
        self.assertEqual(sed.run_check("acme", "EvalSolution"), 0)

    def test_missing_column_on_existing_table_reports_not_created_exit(self) -> None:
        fake = FakeDataverse()
        sid = fake.add_solution("EvalSolution")
        install_fake(fake)
        tables = sed.build_tables("acme")
        for tbl in tables:
            columns = {f"{tbl['logical']}id", "acme_name"} | {c["logical"] for c in tbl["columns"]}
            fake.seed_table(tbl["logical"], columns, sid)
        # Drop one column so the table exists but is incomplete.
        first_table = tables[0]["logical"]
        first_column = tables[0]["columns"][0]["logical"]
        fake.tables[first_table]["columns"].discard(first_column)
        self.assertEqual(sed.run_check("acme", "EvalSolution"), sed.NOT_CREATED_EXIT)


class RunExecuteTests(unittest.TestCase):
    def test_creates_all_tables_and_columns_idempotently(self) -> None:
        fake = FakeDataverse()
        fake.add_solution("EvalSolution")
        install_fake(fake)

        self.assertEqual(sed.run_execute("acme", "EvalSolution"), 0)
        for tbl in sed.build_tables("acme"):
            info = fake.tables[tbl["logical"]]
            for col in tbl["columns"]:
                self.assertIn(col["logical"], info["columns"])

        # Rerunning must not fail and must not error on "already exists" columns/tables.
        self.assertEqual(sed.run_execute("acme", "EvalSolution"), 0)

    def test_foreign_table_collision_blocks_execute(self) -> None:
        fake = FakeDataverse()
        sid = fake.add_solution("EvalSolution")
        other_sid = fake.add_solution("OtherSolution")
        fake.seed_table("acme_evalturn", {"acme_evalturnid", "acme_name"}, other_sid)
        install_fake(fake)
        self.assertEqual(sed.run_execute("acme", "EvalSolution"), 1)
        # Nothing else should have been created for the colliding table.
        self.assertNotIn("acme_evalrule", fake.tables)


class MainArgumentValidationTests(unittest.TestCase):
    def test_invalid_publisher_prefix_short_circuits_before_any_network_call(self) -> None:
        def _boom(*args, **kwargs):
            raise AssertionError("must not call the network before validating PUBLISHER_PREFIX")

        sed.api_get = _boom
        sed.api_post = _boom
        sys.argv = ["setup_evaluation_dataverse.py", "--check",
                    "--publisher-prefix", "Not_Valid", "--solution-name", "EvalSolution"]
        self.assertEqual(sed.main(), 1)


if __name__ == "__main__":
    unittest.main()
