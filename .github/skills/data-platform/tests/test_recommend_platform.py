import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from data_platform_common import read_json  # noqa: E402
from recommend_platform import MATRIX_PATH, main, recommend  # noqa: E402

MATRIX = read_json(MATRIX_PATH)


def needs(**values):
    return {"needs": values}


class RecommendPlatformTest(unittest.TestCase):
    def test_business_crud_selects_dataverse(self):  # DP-U-001
        out = recommend(needs(transactionalCrud=True, powerPlatformApps=True, rowLevelSecurity=True), MATRIX)
        self.assertEqual(out["decision"]["systemOfRecord"], "dataverse")
        self.assertEqual(out["delegates"]["dataverse"], "dataverse")

    def test_existing_sql_app_selects_azure_sql(self):
        out = recommend(needs(transactionalCrud=True, existingSqlApp=True), MATRIX)
        self.assertEqual(out["decision"]["systemOfRecord"], "azure-sql")

    def test_streaming_and_ml_select_databricks(self):  # DP-U-002
        out = recommend(needs(streaming=True, ml=True), MATRIX)
        self.assertEqual(out["decision"]["analytics"], "databricks")
        self.assertTrue(any("streaming(+3)" in reason for reason in out["reasons"]))

    def test_power_bi_and_onelake_select_fabric(self):  # DP-U-003
        out = recommend(needs(powerBi=True, oneLake=True), MATRIX)
        self.assertEqual(out["decision"]["analytics"], "fabric")

    def test_tie_requires_decision(self):  # DP-U-004
        out = recommend(needs(powerBi=True, streaming=True), MATRIX)
        self.assertEqual(out["decision"]["analytics"], "undecided")
        self.assertEqual(out["needsDecision"][0]["candidates"], ["databricks", "fabric"])

    def test_tie_exit_code_is_3(self):  # DP-U-004
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "req.json"
            path.write_text(json.dumps(needs(powerBi=True, streaming=True)), encoding="utf-8")
            with patch("recommend_platform.print_json"):
                self.assertEqual(main(["--requirements", str(path)]), 3)

    def test_ontology_with_databricks_warns(self):  # DP-U-005
        out = recommend(needs(streaming=True, entityRelationshipModel=True, governedMetrics=True), MATRIX)
        self.assertEqual(out["decision"]["semantic"], "databricks-metric-view")
        self.assertTrue(any("Fabric IQ Ontology" in warning for warning in out["warnings"]))

    def test_ontology_with_fabric(self):
        out = recommend(needs(powerBi=True, entityRelationshipModel=True), MATRIX)
        self.assertEqual(out["decision"]["semantic"], "fabric-ontology")

    def test_documents_only_selects_foundry_iq(self):  # DP-U-006
        out = recommend(needs(documents=True), MATRIX)
        self.assertEqual(out["decision"], {"systemOfRecord": "none", "analytics": "none", "semantic": "none", "knowledge": "foundry-iq"})

    def test_large_dataverse_volume_warns(self):  # DP-U-007
        out = recommend(dict(needs(transactionalCrud=True, powerPlatformApps=True), dataVolumeGb=500), MATRIX)
        self.assertTrue(any("Dataverse" in warning for warning in out["warnings"]))

    def test_large_volume_signal_is_derived(self):
        out = recommend(dict(needs(powerBi=True), dataVolumeGb=5000), MATRIX)
        self.assertEqual(out["scores"]["analytics"]["databricks"], 2)

    def test_unknown_signal_is_error(self):  # DP-U-008
        with self.assertRaises(ValueError):
            recommend(needs(unknownThing=True), MATRIX)

    def test_non_boolean_signal_is_error(self):
        with self.assertRaises(ValueError):
            recommend(needs(powerBi="yes"), MATRIX)

    def test_mcp_candidates(self):  # DP-U-009
        requirements = needs(transactionalCrud=True, powerPlatformApps=True, streaming=True, governedMetrics=True, documents=True)
        requirements["exposure"] = {"clients": ["copilot-studio"]}
        out = recommend(requirements, MATRIX)
        platforms = [entry["platform"] for entry in out["mcp"]]
        self.assertEqual(platforms, ["dataverse", "databricks-genie", "foundry-iq"])
        for entry in out["mcp"]:
            self.assertTrue(entry["endpoint"].startswith("https://"))
            self.assertTrue(set(entry["clientSkills"]) <= {"copilot-studio", "copilot-studio-v2"})


if __name__ == "__main__":
    unittest.main()
