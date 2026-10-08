"""Usage records and the report query (feature block B15 on Foundry Autopilot)."""

import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[2] / "templates" / "foundry-autopilot" / "__PKG__" / "usage.py"

# The template imports the Copilot SDK and pydantic; only the pure functions are under test here.
sys.modules.setdefault("copilot", types.SimpleNamespace(Tool=object, define_tool=lambda *a, **k: None))
spec = importlib.util.spec_from_file_location("usage_under_test", MODULE)
usage = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(usage)
    LOADED = True
except ModuleNotFoundError:  # pydantic / httpx missing in the test environment
    LOADED = False


@unittest.skipUnless(LOADED, "usage.py dependencies are not installed")
class CostTests(unittest.TestCase):
    PRICES = {
        "USAGE_PRICE_INPUT_PER_1M": "5",
        "USAGE_PRICE_OUTPUT_PER_1M": "30",
        "USAGE_PRICE_CACHED_PER_1M": "0.5",
    }

    def test_cached_tokens_are_billed_at_the_cached_price(self):
        with patch.dict(os.environ, self.PRICES, clear=True):
            cost = usage.cost_usd({"input_tokens": 1_000_000, "cache_read_tokens": 400_000, "output_tokens": 0})
        self.assertAlmostEqual(cost, 600_000 * 5 / 1e6 + 400_000 * 0.5 / 1e6)

    def test_no_prices_means_no_cost(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(usage.cost_usd({"input_tokens": 10, "output_tokens": 10}))


@unittest.skipUnless(LOADED, "usage.py dependencies are not installed")
class QueryTests(unittest.TestCase):
    def test_own_scope_filters_by_user(self):
        query = usage.build_query(days=30, group_by="user", user_id="oid-1")
        self.assertIn('where UserId == "oid-1"', query)
        self.assertIn("by UserName", query)

    def test_everyone_scope_has_no_user_filter(self):
        query = usage.build_query(days=7, group_by="day", user_id=None)
        self.assertNotIn("UserId ==", query)
        self.assertIn("by Day", query)

    def test_days_are_clamped(self):
        self.assertIn("ago(90d)", usage.build_query(days=400, group_by="user", user_id=None))
        self.assertIn("ago(1d)", usage.build_query(days=0, group_by="user", user_id=None))


if __name__ == "__main__":
    unittest.main()
