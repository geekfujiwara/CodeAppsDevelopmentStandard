import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from configure_semantics import apply_plan, build_plan, databricks_operations, metric_view_yaml  # noqa: E402
from data_platform_common import REFERENCES_DIR, Api, read_json  # noqa: E402
from fakes import FakeResponse, FakeSession, no_sleep, token_provider  # noqa: E402

SPEC_PATH = REFERENCES_DIR / "samples" / "cold-chain-semantics.json"
SPEC = read_json(SPEC_PATH)
ENV = {"DATABRICKS_CATALOG": "main", "DATABRICKS_WAREHOUSE_ID": "wh", "DATABRICKS_HOST": "host",
       "FOUNDRY_ACCOUNT_NAME": "ais-x", "SEARCH_SERVICE_NAME": "srch-x",
       "FABRIC_WORKSPACE_ID": "ws", "FABRIC_ONTOLOGY_ID": "on"}


@patch.dict(os.environ, ENV, clear=True)
class ConfigureSemanticsTest(unittest.TestCase):
    def test_genie_body(self):  # DP-U-021
        genie = databricks_operations(SPEC, "main", "wh")[-1]
        serialized = json.loads(genie["body"]["serialized_space"])
        self.assertEqual(serialized["version"], 2)
        self.assertEqual(len(serialized["data_sources"]["tables"]), 4)
        self.assertEqual(serialized["data_sources"]["metric_views"][0]["identifier"], "main.cold_chain.freezer_health_metrics")
        self.assertEqual(len(serialized["config"]["sample_questions"][0]["id"]), 32)

    def test_genie_data_sources_are_sorted(self):  # DP-U-021
        spec = json.loads(json.dumps(SPEC))
        spec["databricks"]["genie"]["tables"] = ["work_orders", "stores", "telemetry", "freezers"]
        serialized = json.loads(databricks_operations(spec, "main", "wh")[-1]["body"]["serialized_space"])
        identifiers = [item["identifier"] for item in serialized["data_sources"]["tables"]]
        self.assertEqual(identifiers, sorted(identifiers))

    def test_metric_view_yaml_quotes_values(self):
        text = metric_view_yaml(SPEC["databricks"]["metricView"], "main.cold_chain")
        self.assertIn("source: main.cold_chain.telemetry_enriched", text)
        self.assertIn('  - name: "Over-temperature Reading Count"', text)
        self.assertIn("fields:", text)

    def test_invalid_identifier_is_rejected(self):  # DP-U-023
        with self.assertRaises(ValueError):
            databricks_operations(SPEC, "main; DROP", "wh")
        bad = json.loads(json.dumps(SPEC))
        bad["databricks"]["genie"]["tables"].append("x y")
        with self.assertRaises(ValueError):
            databricks_operations(bad, "main", "wh")

    def test_comment_literal_is_escaped(self):
        spec = json.loads(json.dumps(SPEC))
        spec["databricks"]["comments"]["tables"]["stores"] = "O'Brien \\ test"
        statement = next(op["statement"] for op in databricks_operations(spec, "main", "wh") if "TABLE main.cold_chain.stores" in op.get("statement", ""))
        self.assertIn("'O\\'Brien \\\\ test'", statement)

    def test_fabric_source_raises_reasoning_to_low(self):  # DP-U-022
        spec = json.loads(json.dumps(SPEC))
        spec["foundry"]["knowledgeBase"]["reasoning"] = "minimal"
        path = Path(self._tmp_spec(spec))
        plan = build_plan("foundry-kb", str(path), with_fabric=True)
        kb = plan["operations"][-1]["body"]
        self.assertEqual(kb["retrievalReasoningEffort"], {"kind": "low"})
        self.assertEqual([s["name"] for s in kb["knowledgeSources"]], ["ks-cold-chain-manuals", "ks-fabric-ontology"])
        fabric = next(op for op in plan["operations"] if op["body"].get("kind") == "fabricOntology")
        self.assertEqual(fabric["body"]["fabricOntologyParameters"], {"workspaceId": "ws", "ontologyId": "on"})

    def test_foundry_apply_reads_back(self):
        plan = build_plan("foundry-kb", str(SPEC_PATH))
        session = FakeSession()
        session.add("PUT", r"search.windows.net/", FakeResponse(201, {}))
        session.add("POST", r"/docs/index", FakeResponse(200, {"value": []}))
        session.add("GET", r"/knowledgebases/kb-cold-chain", FakeResponse(200, {
            "knowledgeSources": [{"name": "ks-cold-chain-manuals"}], "retrievalReasoningEffort": {"kind": "low"}}))
        report = apply_plan(plan, api=Api("search", "https://srch-x.search.windows.net", session=session, token_provider=token_provider))
        self.assertEqual(report["status"], "verified")
        uploaded = session.bodies("POST", "docs/index")[0]["value"]
        self.assertEqual(len(uploaded), 3)
        self.assertEqual(uploaded[0]["@search.action"], "mergeOrUpload")

    def test_databricks_apply_creates_genie_once(self):
        plan = build_plan("databricks-genie", str(SPEC_PATH))
        session = FakeSession()
        session.add("POST", r"/sql/statements$", FakeResponse(200, {"statement_id": "s", "status": {"state": "SUCCEEDED"}}))
        session.add("GET", r"/genie/spaces$", FakeResponse(200, {"spaces": []}))
        session.add("POST", r"/genie/spaces$", FakeResponse(200, {"space_id": "sp1"}))
        report = apply_plan(plan, api=Api("databricks", "https://host", session=session, token_provider=token_provider, sleep=no_sleep))
        self.assertEqual(report["status"], "verified")
        self.assertEqual(report["results"][-1]["spaceId"], "sp1")

    def _tmp_spec(self, spec: dict) -> str:
        import tempfile
        directory = tempfile.mkdtemp()
        target = Path(directory) / "spec.json"
        target.write_text(json.dumps(spec), encoding="utf-8")
        (Path(directory) / "cold-chain-manuals.json").write_text(
            (REFERENCES_DIR / "samples" / "cold-chain-manuals.json").read_text(encoding="utf-8"), encoding="utf-8")
        return str(target)


if __name__ == "__main__":
    unittest.main()
