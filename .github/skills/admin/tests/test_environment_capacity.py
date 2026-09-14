import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import set_environment_capacity as capacity


class EnvironmentCapacityTests(unittest.TestCase):
    def test_set_allocation_uses_complete_observed_payload(self):
        response = Mock(ok=True)
        with patch.object(capacity, "_request", return_value=response) as request:
            self.assertIs(capacity.set_allocation("https://example.test", "env", "MCSMessages", 500), response)

        request.assert_called_once_with(
            "https://example.test",
            "PATCH",
            "/licensing/environments/env/allocations",
            {"currencyAllocations": [{"currencyType": "MCSMessages", "allocated": 500, "autoAllocated": 0.0}]},
        )

    def test_get_allocation_accepts_array_and_value_wrapper(self):
        allocation = {"environmentId": "env", "currencyAllocations": [{"currencyType": "MCSMessages", "allocated": 500}]}
        for data in ([allocation], {"value": [allocation]}):
            response = Mock(ok=True)
            response.json.return_value = data
            with patch.object(capacity, "_request", return_value=response):
                self.assertEqual(capacity.get_allocation("https://example.test", "env", "MCSMessages"), 500)

    def test_get_allocation_fails_closed_for_missing_value(self):
        response = Mock(ok=True)
        response.json.return_value = []
        with patch.object(capacity, "_request", return_value=response):
            self.assertIsNone(capacity.get_allocation("https://example.test", "env", "MCSMessages"))


if __name__ == "__main__":
    unittest.main()