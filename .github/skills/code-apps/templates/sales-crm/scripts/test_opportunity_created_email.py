"""Offline regression tests for the CRM opportunity-created email flow."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch


SOURCE = Path(__file__).with_name("deploy_opportunity_created_email.py")


def load_module():
    auth = ModuleType("auth_helper")
    auth.DATAVERSE_URL = "https://example.crm.dynamics.com"
    auth.api_get = Mock()
    auth.api_post = Mock()
    auth.get_session = Mock()
    auth.retry_metadata = Mock()
    dotenv = ModuleType("dotenv")
    dotenv.load_dotenv = Mock()
    spec = importlib.util.spec_from_file_location("opportunity_created_flow_test", SOURCE)
    module = importlib.util.module_from_spec(spec)
    environment = {
        "PUBLISHER_PREFIX": "test",
        "SOLUTION_NAME": "TestSolution",
        "CONNECTION_REFERENCE_LOGICAL_NAME": "test_connref_dataverse",
    }
    with patch.dict(os.environ, environment), patch.dict(sys.modules, {
        "auth_helper": auth, "dotenv": dotenv,
    }):
        spec.loader.exec_module(module)
    module._test_auth = auth
    return module


class OpportunityCreatedFlowTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.definition = self.module.build_definition("owner@example.com")

    def test_create_webhook_targets_only_opportunities(self):
        trigger = self.definition["triggers"]["When_Opportunity_Is_Created"]
        params = trigger["inputs"]["parameters"]
        self.assertEqual(trigger["type"], "OpenApiConnectionWebhook")
        self.assertEqual(params["subscriptionRequest/message"], 1)
        self.assertEqual(params["subscriptionRequest/entityname"], "test_crmopportunity")
        self.assertEqual(params["subscriptionRequest/scope"], 4)
        self.assertNotIn("subscriptionRequest/filteringattributes", params)

    def test_html_uses_email_safe_responsive_tables_and_composed_values(self):
        actions = self.definition["actions"]
        html = actions["Send_Opportunity_Email"]["inputs"]["parameters"]["emailMessage/Body"]
        self.assertIn('width="600"', html)
        self.assertIn("style=", html)
        self.assertNotIn("<style", html.lower())
        self.assertNotIn("<script", html.lower())
        self.assertNotIn("http://", html.lower())
        for field in ("Opportunity_Name", "Customer", "Stage", "Amount", "Probability",
                      "Close_Date", "Creator", "Created_On", "Next_Step"):
            self.assertIn(f"@{{outputs('Compose_{field}')}}", html)
            self.assertIn(f"Compose_{field}", actions)
        self.assertIn("replace(replace(replace(", actions["Compose_Opportunity_Name"]["inputs"])

    def test_email_is_sent_to_the_resolved_recipient(self):
        params = self.definition["actions"]["Send_Opportunity_Email"]["inputs"]["parameters"]
        self.assertEqual(params["emailMessage/To"], "owner@example.com")
        self.assertEqual(params["emailMessage/Importance"], "Normal")
        self.assertIn("新規商談", params["emailMessage/Subject"])

    def test_solution_connection_references_are_explicit(self):
        payload = self.module.clientdata(
            self.definition, "test_connref_dataverse", "test_connref_outlook")
        clientdata = __import__("json").loads(payload)
        refs = clientdata["properties"]["connectionReferences"]
        self.assertEqual(set(refs), {self.module.DV, self.module.OUTLOOK})
        self.assertEqual(refs[self.module.OUTLOOK]["api"]["name"], self.module.OUTLOOK)
        self.assertEqual(
            refs[self.module.OUTLOOK]["connection"]["connectionReferenceLogicalName"],
            "test_connref_outlook")

    def test_invalid_recipient_and_timezone_are_rejected(self):
        with self.assertRaises(ValueError):
            self.module.build_definition("owner@example.com\r\nBcc: other@example.com")
        with self.assertRaises(ValueError):
            self.module.build_definition("owner@example.com;bad")
        with self.assertRaises(ValueError):
            self.module.build_definition("owner@example.com", "Tokyo' ); injected")

    def test_existing_flow_outside_solution_is_never_overwritten(self):
        with patch.object(self.module, "api_get", side_effect=[
            {"value": [{"workflowid": "existing"}]},
            {"value": [{"solutionid": "solution"}]},
            {"value": []},
        ]):
            with self.assertRaisesRegex(RuntimeError, "outside the CRM solution"):
                self.module.deploy("environment", self.definition,
                                   "test_connref_dataverse", "test_connref_outlook")

    def test_ambiguous_named_flows_stop_before_mutation(self):
        with patch.object(self.module, "api_get", return_value={"value": [
            {"workflowid": "one"}, {"workflowid": "two"},
        ]}):
            with self.assertRaisesRegex(RuntimeError, "複数"):
                self.module.deploy("environment", self.definition,
                                   "test_connref_dataverse", "test_connref_outlook")


if __name__ == "__main__":
    unittest.main()
