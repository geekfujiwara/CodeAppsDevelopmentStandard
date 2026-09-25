import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import Api  # noqa: E402
from fakes import FakeResponse, FakeSession, no_sleep, token_provider  # noqa: E402
from manage_compute import databricks, fabric  # noqa: E402

ENV = {"DP_NAME_PREFIX": "contoso", "AZURE_SUBSCRIPTION_ID": "sub", "DATABRICKS_WAREHOUSE_ID": "wh"}


def api(kind, session, base=None):
    return Api(kind, base, session=session, token_provider=token_provider, sleep=no_sleep)


@patch.dict(os.environ, ENV, clear=True)
class ManageComputeTest(unittest.TestCase):
    def test_stop_running_warehouse(self):  # DP-U-029
        session = FakeSession()
        session.add("GET", r"/warehouses/wh$", FakeResponse(200, {"state": "RUNNING"}), FakeResponse(200, {"state": "STOPPING"}),
                    FakeResponse(200, {"state": "STOPPED"}))
        session.add("POST", r"/warehouses/wh/stop", FakeResponse(200, {}))
        out = databricks("stop", api("databricks", session, "https://host"), sleep=no_sleep)
        self.assertEqual(out["state"], "STOPPED")
        self.assertTrue(out["changed"])

    def test_stop_already_stopped_is_noop(self):  # DP-U-029
        session = FakeSession().add("GET", r"/warehouses/wh$", FakeResponse(200, {"state": "STOPPED"}))
        out = databricks("stop", api("databricks", session, "https://host"), sleep=no_sleep)
        self.assertFalse(out["changed"])
        self.assertFalse([call for call in session.calls if call["method"] == "POST"])

    def test_fabric_suspend_waits_for_paused(self):  # DP-U-030
        session = FakeSession()
        session.add("GET", r"capacities/contosofabric\?", FakeResponse(200, {"properties": {"state": "Active"}}),
                    FakeResponse(200, {"properties": {"state": "Pausing"}}), FakeResponse(200, {"properties": {"state": "Paused"}}))
        session.add("POST", r"/suspend\?", FakeResponse(202, {}))
        out = fabric("stop", api("arm", session), sleep=no_sleep)
        self.assertEqual(out["state"], "Paused")
        self.assertIn("rg-contoso-fabric", session.calls[0]["url"])


if __name__ == "__main__":
    unittest.main()
