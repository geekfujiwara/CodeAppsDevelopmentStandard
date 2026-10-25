"""Regression checks for ordinary-table CRM scaffolds; no tenant calls."""
import importlib.util
import os
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from requests import Response
from requests.exceptions import HTTPError


SOURCE = Path(__file__).resolve().parents[1] / "templates" / "sales-crm" / "scripts" / "setup_crm_dataverse.py"


class TableTypeTests(unittest.TestCase):
    def setUp(self):
        auth = ModuleType("auth_helper")
        auth.api_get = Mock()
        auth.api_post = Mock()
        auth.retry_metadata = Mock()
        spec = importlib.util.spec_from_file_location("crm_schema_test", SOURCE)
        self.schema = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"auth_helper": auth}), patch.dict(os.environ, {
            "PUBLISHER_PREFIX": "test", "SOLUTION_NAME": "Test", "DATAVERSE_URL": "https://example.invalid",
        }), patch("dotenv.load_dotenv"):
            spec.loader.exec_module(self.schema)
        self.get = auth.api_get
        self.post = auth.api_post
        self.normal = {"IsBPFEntity": False, "IsActivity": False, "TableType": "Standard"}

    def test_standard_table_accepted(self):
        self.get.return_value = self.normal
        self.assertTrue(self.schema.table_exists("test_crmopportunity"))

    def test_incompatible_or_unknown_metadata_rejected(self):
        for change in ({"IsBPFEntity": True}, {"IsActivity": True}, {"TableType": "Elastic"},
                       {"IsBPFEntity": None}, {"TableType": None}):
            with self.subTest(change=change):
                self.get.return_value = {**self.normal, **change}
                with self.assertRaisesRegex(ValueError, "non-BPF"):
                    self.schema.table_exists("test_crmopportunity")

    def test_only_404_means_missing(self):
        for status in (404, 403, 500):
            with self.subTest(status=status):
                response = Response()
                response.status_code = status
                self.get.side_effect = HTTPError(response=response)
                if status == 404:
                    self.assertFalse(self.schema.table_exists("test_crmopportunity"))
                else:
                    with self.assertRaises(HTTPError):
                        self.schema.table_exists("test_crmopportunity")

    def test_choice_stage_only(self):
        for kind in ("Picklist", "Lookup", None):
            with self.subTest(kind=kind), patch.object(self.schema, "table_exists", return_value=True), \
                    patch.object(self.schema, "attribute_names", return_value={"test_stage"}):
                self.get.return_value = {"AttributeType": kind}
                if kind == "Picklist":
                    self.schema.validate_stage_column()
                else:
                    with self.assertRaisesRegex(ValueError, "Choice"):
                        self.schema.validate_stage_column()

    def test_preflight_rejects_before_any_write(self):
        for operation in (self.schema.check, self.schema.apply):
            with self.subTest(operation=operation.__name__):
                self.get.return_value = {**self.normal, "IsBPFEntity": True}
                with self.assertRaises(ValueError):
                    operation()
                self.post.assert_not_called()

    def test_late_incompatible_table_blocks_entire_apply(self):
        self.get.side_effect = [self.normal] * (len(self.schema.TABLES) - 1) + [
            {**self.normal, "IsBPFEntity": True}]
        with self.assertRaises(ValueError):
            self.schema.apply()
        self.post.assert_not_called()

    def test_creation_explicitly_disables_bpf(self):
        self.get.return_value = {"value": [{"solutionid": "test"}]}
        bodies = []
        with patch.object(self.schema, "table_exists", return_value=False), \
                patch.object(self.schema, "attribute_names", return_value=set()), \
                patch.object(self.schema, "validate_stage_column"), \
                patch.object(self.schema.time, "sleep"), \
                patch.object(self.schema, "retry_metadata", side_effect=lambda fn, desc: fn()), \
                patch.object(self.schema, "api_post", side_effect=lambda path, body, **kw: bodies.append((path, body))):
            self.schema.apply()
        tables = [body for path, body in bodies if path == "EntityDefinitions"]
        self.assertEqual(len(tables), len(self.schema.TABLES))
        self.assertTrue(all(body["IsBPFEntity"] is False and body["IsActivity"] is False for body in tables))


if __name__ == "__main__":
    unittest.main()
