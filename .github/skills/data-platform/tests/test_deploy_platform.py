import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import Api  # noqa: E402
from deploy_platform import apply_plan, build_plan, derive_names, ensure_fabric_items, ensure_warehouse  # noqa: E402
from fakes import FakeResponse, FakeSession, no_sleep, token_provider  # noqa: E402

ENV = {
    "DP_NAME_PREFIX": "Contoso-Data", "DP_LOCATION": "japaneast", "AZURE_SUBSCRIPTION_ID": "sub",
    "FABRIC_CAPACITY_ADMIN": "admin@example.com",
}


def api(kind, session, base=None):
    return Api(kind, base, session=session, token_provider=token_provider, sleep=no_sleep)


@patch.dict(os.environ, ENV, clear=True)
class DeployPlatformTest(unittest.TestCase):
    def test_name_derivation(self):  # DP-U-015 / DP-U-019
        names = derive_names("Contoso-Data")
        self.assertEqual(names["fabric"]["capacityName"], "contosodatafabric")
        self.assertEqual(names["fabric"]["ontologyName"], "contoso_data_ontology")
        self.assertEqual(names["databricks"]["workspaceName"], "dbw-contoso-data")
        groups = [names[p]["resourceGroup"] for p in names] + [names["databricks"]["managedResourceGroupName"]]
        self.assertEqual(len(groups), len(set(groups)))

    def test_duplicate_resource_group_is_rejected(self):  # DP-U-019
        with patch.dict(os.environ, {"FABRIC_RESOURCE_GROUP": "rg-x", "DATABRICKS_RESOURCE_GROUP": "rg-x"}):
            with self.assertRaises(ValueError):
                derive_names("Contoso-Data")

    def test_invalid_capacity_name_is_rejected(self):  # DP-U-015
        with patch.dict(os.environ, {"FABRIC_CAPACITY_NAME": "bad-name"}):
            with self.assertRaises(ValueError):
                derive_names("Contoso-Data")

    def test_foundry_plan_uses_signed_in_object_id(self):
        plan = build_plan("foundry", token_provider=token_provider)
        self.assertEqual(plan["parameters"]["operatorPrincipalId"], "user-oid")
        self.assertEqual(plan["resourceGroup"], "rg-contoso-data-foundry")
        self.assertEqual(len(plan["planHash"]), 64)

    def test_template_change_blocks_apply(self):  # DP-U-017
        plan = build_plan("fabric")
        plan["templateHash"] = "0" * 64
        with self.assertRaises(SystemExit):
            apply_plan(plan, arm=api("arm", FakeSession()))

    def test_foreign_managed_rg_blocks_apply(self):  # DP-U-018
        plan = build_plan("databricks")
        session = FakeSession().add("GET", r"resourcegroups/rg-contoso-data-databricks-managed",
                                    FakeResponse(200, {"name": "managed", "managedBy": None}))
        with self.assertRaises(SystemExit):
            apply_plan(plan, arm=api("arm", session))
        self.assertFalse([call for call in session.calls if call["method"] == "PUT"])

    def test_fabric_apply_end_to_end(self):  # DP-L-001 のモック
        plan = build_plan("fabric")
        arm_session = FakeSession()
        arm_session.add("PUT", r"resourcegroups/rg-contoso-data-fabric\?", FakeResponse(201, {}))
        arm_session.add("PUT", r"deployments/data-platform-fabric", FakeResponse(201, {}, headers={"Azure-AsyncOperation": "https://management.azure.com/op"}))
        arm_session.add("GET", r"/op$", FakeResponse(200, {"status": "Succeeded"}))
        arm_session.add("GET", r"deployments/data-platform-fabric", FakeResponse(200, {"properties": {
            "provisioningState": "Succeeded", "outputs": {"capacityId": {"value": "/arm/capacity"}}}}))
        fabric_session = self._fabric_session(existing=False)
        report = apply_plan(plan, arm=api("arm", arm_session), fabric=api("fabric", fabric_session))
        self.assertEqual(report["status"], "verified")
        step = report["postSteps"][0]
        self.assertEqual(step["created"], ["workspace", "Lakehouse", "Ontology"])
        ontology_body = fabric_session.bodies("POST", r"/items$")[0]
        self.assertEqual(ontology_body, {"displayName": "contoso_data_ontology", "type": "Ontology"})
        deploy_body = arm_session.bodies("PUT", "deployments")[0]
        self.assertEqual(deploy_body["properties"]["parameters"]["capacityName"]["value"], "contosodatafabric")

    def test_fabric_items_are_idempotent(self):  # DP-U-020
        session = self._fabric_session(existing=True)
        step = {"capacityName": "contosodatafabric", "workspaceName": "contoso-data-workspace",
                "lakehouseName": "contoso_data_lakehouse", "ontologyName": "contoso_data_ontology"}
        out = ensure_fabric_items(api("fabric", session), step)
        self.assertEqual(out["created"], [])
        self.assertFalse([call for call in session.calls if call["method"] == "POST"])

    def test_warehouse_created_once(self):
        session = FakeSession()
        session.add("GET", r"/sql/warehouses$", FakeResponse(200, {"warehouses": []}))
        session.add("POST", r"/sql/warehouses$", FakeResponse(200, {"id": "wh1"}))
        out = ensure_warehouse(api("databricks", session, "https://host"), {"warehouseName": "w", "clusterSize": "2X-Small", "autoStopMins": 10})
        self.assertEqual(out["warehouseId"], "wh1")
        body = session.bodies("POST", "warehouses")[0]
        self.assertTrue(body["enable_serverless_compute"])
        self.assertEqual(body["warehouse_type"], "PRO")

    @staticmethod
    def _fabric_session(existing: bool) -> FakeSession:
        session = FakeSession()
        session.add("GET", r"/v1/capacities$", FakeResponse(200, {"value": [{"id": "cap-id", "displayName": "contosodatafabric"}]}))
        workspace = {"id": "ws", "displayName": "contoso-data-workspace", "capacityId": "cap-id"}
        session.add("GET", r"/v1/workspaces$", FakeResponse(200, {"value": [workspace] if existing else []}))
        session.add("POST", r"/v1/workspaces$", FakeResponse(201, workspace))
        lakehouse = {"id": "lh", "displayName": "contoso_data_lakehouse"}
        ontology = {"id": "on", "displayName": "contoso_data_ontology"}
        session.add("GET", r"type=Lakehouse", FakeResponse(200, {"value": [lakehouse] if existing else []}))
        session.add("GET", r"type=Ontology", FakeResponse(200, {"value": [ontology] if existing else []}))
        session.add("POST", r"/lakehouses$", FakeResponse(201, lakehouse))
        session.add("POST", r"/items$", FakeResponse(201, ontology))
        return session


if __name__ == "__main__":
    unittest.main()
