"""CRM scaffold deployment safety regression; no credentials or tenant writes."""
import base64
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

TEMPLATE = Path(__file__).resolve().parents[1] / "templates" / "sales-crm"


class StageHistoryTests(unittest.TestCase):
    def setUp(self):
        schema = ModuleType("setup_crm_dataverse")
        schema.P, schema.SOLUTION = "test", "TestSolution"
        schema.c = lambda name: f"test_{name}"
        schema.table_exists = Mock(return_value=True)
        schema.attribute_names = Mock(return_value=set())
        schema.validate_stage_column = Mock()
        auth = ModuleType("auth_helper")
        for name in ("api_get", "api_patch", "api_post", "retry_metadata"):
            setattr(auth, name, Mock())
        spec = importlib.util.spec_from_file_location(
            "stage_deployment_test", TEMPLATE / "scripts" / "deploy_opportunity_rules.py")
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"setup_crm_dataverse": schema, "auth_helper": auth}):
            spec.loader.exec_module(self.module)
        self.schema, self.auth = schema, auth
        self.get = auth.api_get
        self.get.return_value = {"value": []}

    def test_incompatible_table_stops_before_write(self):
        self.schema.table_exists.side_effect = ValueError("non-BPF required")
        with self.assertRaises(ValueError):
            self.module.ensure_schema()
        self.auth.api_post.assert_not_called()
        self.auth.api_patch.assert_not_called()

    def test_incompatible_proof_column_stops_before_write(self):
        self.schema.attribute_names.return_value = {"test_historypermit"}
        for metadata in ({"AttributeType": "String", "MaxLength": 64},
                         {"AttributeType": "Memo", "MaxLength": 4000}):
            with self.subTest(metadata=metadata):
                self.get.return_value = metadata
                with self.assertRaisesRegex(ValueError, "proof"):
                    self.module.ensure_schema()
                self.auth.api_post.assert_not_called()

    def test_foreign_plugins_are_never_overwritten(self):
        self.get.side_effect = [
            {"value": [{"pluginassemblyid": "assembly", "publickeytoken": "token"}]},
            {"value": [{"typename": "Other.Plugin"}]},
        ]
        with self.assertRaisesRegex(ValueError, "other plugins"):
            self.module.register()
        self.auth.api_patch.assert_not_called()

    def test_missing_proof_column_blocks_registration(self):
        with self.assertRaisesRegex(ValueError, "publish"):
            self.module.register()
        self.auth.api_patch.assert_not_called()

    def test_existing_signing_config_is_reused(self):
        self.get.side_effect = [
            {"value": [{"name": "SalesCrm: test_crmopportunity Update 40",
                        "_sdkmessageprocessingstepsecureconfigid_value": "existing"}]},
            {"secureconfig": base64.b64encode(bytes(32)).decode("ascii")},
        ]
        self.assertEqual(self.module.ensure_history_signing_config(), "existing")
        self.auth.api_post.assert_not_called()

    def test_conflicting_configs_stop(self):
        self.get.return_value = {"value": [
            {"name": "SalesCrm: test_crmopportunity Update 40",
             "_sdkmessageprocessingstepsecureconfigid_value": "a"},
            {"name": "SalesCrm: test_crmstagehistory Create 20",
             "_sdkmessageprocessingstepsecureconfigid_value": "b"},
        ]}
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.module.ensure_history_signing_config()
        self.auth.api_post.assert_not_called()

    def test_invalid_key_stops(self):
        self.get.side_effect = [
            {"value": [{"name": "SalesCrm: test_crmopportunity Update 40",
                        "_sdkmessageprocessingstepsecureconfigid_value": "existing"}]},
            {"secureconfig": base64.b64encode(bytes(16)).decode("ascii")},
        ]
        with self.assertRaisesRegex(ValueError, "Invalid"):
            self.module.ensure_history_signing_config()

    def test_new_key_is_random_256_bits(self):
        self.get.return_value = {"value": []}
        self.auth.api_post.return_value = "created"
        self.assertEqual(self.module.ensure_history_signing_config(), "created")
        body = self.auth.api_post.call_args.args[1]
        self.assertEqual(len(base64.b64decode(body["secureconfig"], validate=True)), 32)

    def test_different_assembly_signing_identity_stops(self):
        self.get.side_effect = [
            {"value": [{"pluginassemblyid": "assembly", "publickeytoken": "expected"}]},
            {"value": [{"typename": self.module.TYPE}]},
        ]
        with patch.object(Path, "is_file", return_value=True), \
                patch.object(self.module.subprocess, "run", return_value=SimpleNamespace(stdout="different")):
            with self.assertRaisesRegex(ValueError, "signing identity"):
                self.module.preflight()
        self.auth.api_patch.assert_not_called()

    def test_scaffold_includes_build_deploy_verify_as_standard(self):
        manifest = json.loads((TEMPLATE / "scaffold.json").read_text(encoding="utf-8"))
        steps = "\n".join(manifest["nextSteps"])
        for name in ("build_opportunity_rules.ps1", "deploy_opportunity_rules.py", "verify_stage_update.py"):
            self.assertIn(name, steps)
        for name in ("OpportunityRules.cs", "HistoryPermit.cs", "SalesCrm.Plugins.csproj"):
            self.assertTrue((TEMPLATE / "server" / "SalesCrm.Plugins" / name).is_file())
        self.assertFalse((TEMPLATE / "server" / "SalesCrm.Plugins" / "SalesCrm.Plugins.snk").exists())
        source = (TEMPLATE / "server" / "SalesCrm.Plugins" / "OpportunityRules.cs").read_text(encoding="utf-8")
        self.assertIn('target.Attributes.Remove(prefix + "historypermit")', source)
        self.assertNotIn('request["tag"]', source)


if __name__ == "__main__":
    unittest.main()
