import contextlib
import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


schema = load_module("field_service_schema", "setup_field_service.py")
flow = load_module("field_service_flow", "deploy_demo_schedule_flow.py")

APP_PAGE_REQUIRED_COLUMNS = {
    "customer": {"address", "phone", "email", "satier"},
    "engineer": {"area", "skill", "skilllevel", "workstatus", "areaid", "userid"},
    "area": set(),
    "equipment": {
        "model", "serialno", "location", "status", "installdate", "eoldate",
        "remainingyears", "monthlyvolume", "totalcount", "lifecycleaction", "customerid",
    },
    "maintenancecontract": {"contracttype", "slacondition", "startdate", "enddate", "customerid", "equipmentid"},
    "call": {"channel", "description", "priority", "status", "receiveddate", "customerid", "equipmentid"},
    "workorder": {
        "worktype", "scheduleddate", "status", "workdetail", "callid", "engineerid",
        "customersigned", "dailyreportid", "customerid", "equipmentid", "installationlocation",
        "modeltype", "serialnumber", "faultsummary", "symptoms", "errorcode", "faultpart",
        "estimatedcause", "countermeasure", "replacedparts", "workstart", "workend", "worktime",
        "traveltime", "prevention", "satisfaction", "notes", "visittime",
    },
    "maintenancereport": {"workcontent", "partsused", "completeddate", "customersigned", "workorderid"},
    "dailyreport": {
        "reportdate", "department", "weather", "approvalstatus", "approvalcomment", "visitcount",
        "completedcount", "revisitcount", "partsexchangecount", "totalworktime", "avgsatisfaction",
    },
    "consumptionrecord": {"yearmonth", "printcount", "tonercount", "papercount", "consumablecost", "equipmentid"},
    "annualkpi": {
        "targetyear", "requestcount", "slaachievement", "avgresponse", "avgresolution",
        "uptimerate", "satisfaction", "downtimehours", "maintenancecost", "customerid",
    },
    "recommendation": {"category", "detail", "expectedeffect", "priority", "targetperiod", "customerid", "equipmentid"},
}


class SchemaContractTests(unittest.TestCase):
    def test_prefix_is_validated_and_applied_to_every_custom_table(self):
        prefix = schema.validate_prefix("acme7")
        tables, lookups = schema.schema_for(prefix)
        self.assertTrue(all(table["logical"].startswith("acme7_") for table in tables))
        self.assertTrue(all(item["source"].startswith("acme7_") for item in lookups))
        self.assertTrue(all(
            item["target"] == "systemuser" or item["target"].startswith("acme7_")
            for item in lookups
        ))
        for invalid in ("", "BadPrefix", "a", "prefix_with_underscores", "1abc"):
            with self.subTest(prefix=invalid), self.assertRaises(ValueError):
                schema.validate_prefix(invalid)

    def test_app_parity_includes_area_user_link_daily_report_signature_and_derived_fields(self):
        tables, lookups = schema.schema_for("acme")
        by_suffix = {table["suffix"]: table for table in tables}
        area_names = {column["logical"] for column in by_suffix["area"]["columns"]}
        engineer_names = {column["logical"] for column in by_suffix["engineer"]["columns"]}
        equipment_names = {column["logical"] for column in by_suffix["equipment"]["columns"]}
        workorder_names = {column["logical"] for column in by_suffix["workorder"]["columns"]}
        daily_names = {column["logical"] for column in by_suffix["dailyreport"]["columns"]}
        self.assertIn("acme_description", area_names)
        self.assertIn("acme_area", engineer_names)
        self.assertIn("acme_remainingyears", equipment_names)
        self.assertIn("acme_lifecycleaction", equipment_names)
        self.assertIn("acme_customersigned", workorder_names)
        self.assertIn("acme_worktime", workorder_names)
        self.assertIn("acme_traveltime", workorder_names)
        self.assertIn("acme_approvalstatus", daily_names)
        self.assertIn("acme_avgsatisfaction", daily_names)
        self.assertIn(
            ("acme_engineer", "acme_areaid"),
            {(item["source"], item["attribute"]) for item in lookups},
        )
        self.assertIn(
            ("acme_engineer", "acme_userid"),
            {(item["source"], item["attribute"]) for item in lookups},
        )
        self.assertIn(
            ("acme_workorder", "acme_dailyreportid"),
            {(item["source"], item["attribute"]) for item in lookups},
        )

    def test_all_app_page_column_contracts_are_provisioned(self):
        prefix = "contract"
        tables, lookups = schema.schema_for(prefix)
        table_columns = {
            table["suffix"]: {"name"} | {column["suffix"] for column in table["columns"]}
            for table in tables
        }
        table_lookups = {
            table["suffix"]: set() for table in tables
        }
        for lookup in lookups:
            table_suffix = lookup["source"][len(prefix) + 1:]
            table_lookups[table_suffix].add(lookup["attribute"][len(prefix) + 1:])
        for table_suffix, required in APP_PAGE_REQUIRED_COLUMNS.items():
            with self.subTest(table=table_suffix):
                provisioned = table_columns[table_suffix] | table_lookups[table_suffix]
                self.assertEqual(required - provisioned, set())

    def test_synthetic_seed_contract_has_no_company_or_person_identifiers(self):
        source = (SCRIPTS / "setup_field_service.py").read_text(encoding="utf-8")
        self.assertIn("Sample Customer {number}", source)
        self.assertIn("Demo Engineer {number}", source)
        self.assertIn("@example.invalid", source)
        self.assertNotIn("yamada", source.lower())
        self.assertNotIn("sato-corp", source.lower())
        self.assertNotIn("井上", source)

    def test_seed_requires_explicit_apply(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            schema.main(["--seed-demo"])
        self.assertEqual(error.exception.code, 2)

    def test_schema_command_defaults_to_read_only_without_demo_seed(self):
        with patch.object(schema, "run", return_value=0) as run:
            self.assertEqual(schema.main([]), 0)
        run.assert_called_once_with(apply=False, seed_demo=False)


class FlowContractTests(unittest.TestCase):
    def test_replacement_uses_arbitrary_prefix_in_fields_metadata_and_expressions(self):
        prefix = "acme7"
        nav = {"acme7_engineerid": "acme7_engineerid", "acme7_customerid": "acme7_customerid"}
        definition = flow.build_definition(prefix, nav)
        flow.validate_definition(definition, prefix)
        text = json.dumps(definition, ensure_ascii=False)
        self.assertIn("acme7_workorders", text)
        self.assertIn("_acme7_engineerid_value", text)
        self.assertIn("acme7_scheduleddate", text)
        self.assertNotIn("geek_", text)
        self.assertNotRegex(
            json.dumps({key: value for key, value in definition.items() if key != "$schema"}),
            r"\b20\d\d-\d\d-\d\d\b",
        )
        self.assertEqual(flow.connection_reference(prefix), "acme7_fieldservicedemo_dataverse")
        recurrence = definition["triggers"]["Recurrence"]["recurrence"]
        self.assertEqual(recurrence["schedule"], {"hours": ["6"], "minutes": [0]})
        self.assertEqual(
            sum(key.startswith("Ensure_Unassigned_Order_Count_") for key in definition["actions"]),
            3,
        )

    def test_default_flow_command_is_plan_only_and_run_requires_apply(self):
        with patch.object(flow, "deploy") as deploy:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(flow.main(["--prefix", "acme"]), 0)
            deploy.assert_not_called()
            self.assertIn("Use --apply to deploy", output.getvalue())
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            flow.main(["--prefix", "acme", "--run"])
        self.assertEqual(error.exception.code, 2)

    def test_flow_builder_rejects_missing_relationship_metadata(self):
        with self.assertRaises(ValueError):
            flow.build_definition("acme", {"acme_engineerid": "engineer_navigation"})


if __name__ == "__main__":
    unittest.main()
