"""Offline regressions for connection selection, interactive recovery and read-back."""

import contextlib
import io
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, Mock, patch

import pa_cli as cli
import add_data_source as add
import deploy_code_app as deploy
import setup_code_app_auth as auth_setup
with patch.dict(sys.modules, {"auth_helper": Mock()}):
    import setup_connection_reference as setup
    spec = importlib.util.spec_from_file_location(
        "crm_verifier", Path(__file__).resolve().parents[1] / "templates" / "sales-crm" / "scripts" / "verify_crm_crud.py",
    )
    crm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(crm)
sys.modules["setup_connection_reference"] = setup


API = "shared_commondataserviceforapps"
ENV = "test-environment"


def connection(name="new", status="Connected", env=ENV, api=API):
    return {"name": name, "properties": {"apiId": f"/apis/{api}",
            "environment": {"name": env}, "statuses": [{"status": status}]}}


def result(code=0, out="", err=""):
    return subprocess.CompletedProcess([], code, out, err)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cwd = Path.cwd()
        os.chdir(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.chdir, self.cwd)
        self.env = patch.dict(os.environ, {"ENV_ID": ENV, "ENVIRONMENT_ID": ENV}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        Path("power.config.json").write_text(json.dumps({"environmentId": ENV}))
        self.addCleanup(setattr, add, "_allow_interactive", False)

    def test_project_env_precedes_skill_root(self):
        Path(".env").write_text("WORKFLOW_TEST_MARKER=project\n")
        cli.load_project_env()
        self.assertEqual(os.getenv("WORKFLOW_TEST_MARKER"), "project")

    def test_environment_mismatch_stops(self):
        with patch.dict(os.environ, {"ENV_ID": "other"}), self.assertRaises(SystemExit):
            cli.environment_id()

    def test_healthy_connection(self):
        self.assertEqual(cli.require_connection([connection()], "new", API, ENV)["name"], "new")

    def test_invalid_connections_are_rejected(self):
        for row in (connection(status="Error"), connection(env="other"), connection(api="shared_other"),
                    {"name": "new", "properties": {}}):
            with self.subTest(row=row), self.assertRaises(SystemExit):
                cli.require_connection([row], "new", API, ENV)

    def test_duplicate_or_missing_connection_rejected(self):
        for rows in ([], [connection(), connection()]):
            with self.assertRaises(SystemExit):
                cli.require_connection(rows, "new", API, ENV)

    def test_cli_has_no_npx_fallback(self):
        with self.assertRaises(SystemExit):
            cli.cli_command()

    def test_cli_resolves_official_node_entry(self):
        package = Path("node_modules/@microsoft/power-apps-cli")
        package.mkdir(parents=True)
        (package / "package.json").write_text(json.dumps({"name": "@microsoft/power-apps-cli", "bin": {"pa": "Bin.js"}}))
        (package / "Bin.js").write_text("")
        with patch.object(cli.shutil, "which", return_value="node"):
            self.assertEqual(cli.cli_command(), ["node", str((package / "Bin.js").resolve())])

    def test_json_errors_are_not_empty_success(self):
        for out in ("", "not-json", "{bad", '{"success":false,"items":[]}', '{"success":true}'):
            with self.subTest(out=out), self.assertRaises(SystemExit):
                cli.json_items(result(out=out))

    def test_json_empty_list_is_valid(self):
        self.assertEqual(cli.json_items(result(out='{"success":true,"items":[]}')), [])

    def test_silent_success_never_opens_browser(self):
        with patch.object(cli, "run_cli", return_value=result(out="ok")), patch.object(cli, "run_console") as console:
            self.assertEqual(cli.run_with_recovery(["app", "list"], allow_interactive=True).stdout, "ok")
            console.assert_not_called()

    def test_interaction_requires_approval(self):
        expired = result(2, err="Interactive sign-in is required")
        with patch.object(cli, "run_cli", return_value=expired), patch.object(cli, "run_console") as console:
            self.assertEqual(cli.run_with_recovery(["app", "add"], allow_interactive=False), expired)
            console.assert_not_called()

    def test_real_command_not_login_is_recovered_once(self):
        expired = result(2, err="Interactive sign-in is required")
        args = ["app", "add", "data-source", "--non-interactive"]
        with patch.object(cli, "run_cli", return_value=expired) as run, patch.object(cli, "run_console") as console:
            self.assertEqual(cli.run_with_recovery(args, 20, True).returncode, 0)
            console.assert_called_once_with(args, 20)
            self.assertEqual(run.call_count, 1)

    def test_unrelated_failure_does_not_open_browser(self):
        for text in ("Forbidden", "HTTP 429", "HTTP 500", "Invalid input"):
            with patch.object(cli, "run_cli", return_value=result(1, err=text)), patch.object(cli, "run_console") as console:
                self.assertEqual(cli.run_with_recovery([], allow_interactive=True).returncode, 1)
                console.assert_not_called()

    def test_console_failure_is_propagated(self):
        with patch.object(cli, "run_cli", return_value=result(2, err="requires interactive sign-in")), \
             patch.object(cli, "run_console", side_effect=SystemExit("closed")), self.assertRaises(SystemExit):
            cli.run_with_recovery([], allow_interactive=True)

    def test_timeout_is_not_retried(self):
        with patch.object(cli, "cli_command", return_value=["node"]), \
             patch.object(cli.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 1)), \
             patch.object(cli, "run_console") as console, self.assertRaises(SystemExit):
            cli.run_with_recovery([], 1, True)
        console.assert_not_called()

    def test_connection_list_rechecks_cache_after_interaction(self):
        with patch.object(cli, "run_cli", side_effect=[result(2, err="Interactive sign-in is required"),
                                                     result(out='{"items":[]}')]) as run, \
             patch.object(cli, "run_console") as console:
            self.assertEqual(cli.list_connections(20, True), [])
            self.assertEqual(run.call_count, 2)
            self.assertNotIn("--environment-id", run.call_args.args[0])
            console.assert_called_once()

    def saved_approval(self):
        return patch.dict(os.environ, {"PP_AUTH_MODE": "browser", "PP_AUTH_ACCOUNT": "maker@example.com",
                                     "PP_AUTH_EDGE_PROFILE": "Profile 2", "PP_AUTH_ALLOW_INTERACTIVE": "true"})

    def test_saved_permission_recovers_without_flag(self):
        with self.saved_approval(), patch.object(cli, "verify_cli_account") as verify, \
             patch.object(cli, "run_cli", return_value=result(2, err="Interactive sign-in is required")) as run, \
             patch.object(cli, "run_console") as console:
            self.assertEqual(cli.run_with_recovery(["app", "push"]).returncode, 0)
            console.assert_called_once()
            self.assertEqual(run.call_count, 1)
            self.assertEqual(verify.call_count, 2)

    def test_saved_permission_never_opens_browser_in_ci(self):
        with self.saved_approval(), patch.dict(os.environ, {"CI": "true"}), \
             patch.object(cli, "verify_cli_account"), \
             patch.object(cli, "run_cli", return_value=result(2, err="Interactive sign-in is required")), \
             patch.object(cli, "run_console") as console:
            self.assertEqual(cli.run_with_recovery(["app", "push"], allow_interactive=True).returncode, 2)
            console.assert_not_called()

    def test_wrong_cli_account_stops_before_write(self):
        payload = {"success": True, "activeAccount": {"username": "other@example.com"}}
        with self.saved_approval(), patch.object(cli, "run_cli", return_value=result(out=json.dumps(payload))) as run, \
             patch.object(cli, "run_console") as console, self.assertRaises(SystemExit):
            cli.run_with_recovery(["app", "push"])
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][:2], ["auth", "status"])
        console.assert_not_called()

    def test_deploy_auth_check_is_read_only(self):
        with patch("sys.argv", ["deploy", "--check-auth"]), \
             patch.object(deploy, "verify_cli_account"), patch.object(deploy, "list_connections") as connections, \
             patch.object(deploy.subprocess, "run") as npm, patch.object(deploy, "run_with_recovery") as push:
            deploy.main()
        connections.assert_called_once()
        npm.assert_not_called()
        push.assert_not_called()

    def test_deploy_predeploy_failure_never_pushes(self):
        with patch("sys.argv", ["deploy"]), patch.object(deploy, "verify_cli_account"), \
             patch.object(deploy.subprocess, "run", return_value=result(1)), \
             patch.object(deploy, "run_with_recovery") as push, self.assertRaises(SystemExit):
            deploy.main()
        push.assert_not_called()

    def test_deploy_solution_and_noninteractive_arguments(self):
        with patch("sys.argv", ["deploy", "--solution-id", "approved-solution"]), \
             patch.object(deploy, "verify_cli_account"), \
             patch.object(deploy.subprocess, "run", return_value=result()), \
             patch.object(deploy, "run_with_recovery", return_value=result()) as push:
            deploy.main()
        self.assertEqual(push.call_args.args[0],
                         ["app", "push", "--non-interactive", "--solution-id", "approved-solution"])

    def test_auth_setup_save_only_preserves_env_and_does_not_login(self):
        Path(".env").write_text("# existing\nSOLUTION_NAME=Keep\n")
        with patch("sys.argv", ["auth", "--account", "maker@example.com", "--edge-profile", "Profile 2",
                               "--approve-interactive", "--save-only"]), \
             patch("auth_preferences.subprocess.run", return_value=result(128)), \
             patch.object(auth_setup, "run_console") as console, patch.object(auth_setup, "run_cli") as run:
            auth_setup.main()
        self.assertIn("SOLUTION_NAME=Keep", Path(".env").read_text())
        self.assertEqual(os.getenv("PP_AUTH_ALLOW_INTERACTIVE"), "true")
        console.assert_not_called()
        run.assert_not_called()

    def test_auth_setup_requires_explicit_approval(self):
        with patch("sys.argv", ["auth", "--account", "maker@example.com", "--edge-profile", "Profile 2"]), \
             contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            auth_setup.main()
        self.assertFalse(Path(".env").exists())

    def test_auth_setup_rejects_tracked_env_before_writing(self):
        Path(".env").write_text("SOLUTION_NAME=Keep\n")
        with patch("sys.argv", ["auth", "--account", "maker@example.com", "--edge-profile", "Profile 2",
                               "--approve-interactive", "--save-only"]), \
             patch("auth_preferences.subprocess.run", return_value=result()), self.assertRaises(ValueError):
            auth_setup.main()
        self.assertEqual(Path(".env").read_text(), "SOLUTION_NAME=Keep\n")

    def test_scaffold_auth_setup_follows_dependencies_and_warms_after_init(self):
        root = Path(__file__).resolve().parents[1] / "templates"
        for name in ("generic-base", "sales-crm", "store-ordering", "construction-cockpit", "perse3d-studio"):
            with self.subTest(template=name):
                steps = json.loads((root / name / "scaffold.json").read_text(encoding="utf-8"))["nextSteps"]
                dependencies = next(i for i, step in enumerate(steps) if "npm install" in step)
                initial_auth = next(i for i, step in enumerate(steps) if "setup_code_app_auth.py --account" in step)
                init = next(i for i, step in enumerate(steps) if "pa app init" in step)
                warm = next(i for i, step in enumerate(steps) if "setup_code_app_auth.py --approve" in step)
                self.assertLess(dependencies, initial_auth)
                self.assertLess(initial_auth, init)
                self.assertLess(init, warm)

    def test_reference_is_idempotent_even_force_create(self):
        row = {"connectionreferencelogicalname": "your_ref", "connectionid": "new"}
        self.assertEqual(setup.choose_reference([row], "your_ref", "new"), row)

    def test_reference_conflict_never_rebinds(self):
        row = {"connectionreferencelogicalname": "your_ref", "connectionid": "old"}
        with patch.object(setup, "api_post") as post, self.assertRaises(SystemExit):
            setup.choose_reference([row], "your_ref", "new")
        post.assert_not_called()

    def test_arbitrary_shared_reference_is_not_reused(self):
        row = {"connectionreferencelogicalname": "shared_ref", "connectionid": "old"}
        self.assertIsNone(setup.choose_reference([row], "dedicated_ref", ""))

    def test_unbound_reference_not_created(self):
        with patch.object(setup, "api_post") as post, self.assertRaises(SystemExit):
            setup.create_connection_reference(API, "Solution", "your", "")
        post.assert_not_called()

    def test_ss_o_rejection_uses_approved_browser_and_readback(self):
        rejected = result(2, err="The connector service rejected the automatic connection request.")
        with patch.object(setup, "list_connections", side_effect=[[], [], [connection()]]), \
             patch.object(setup, "run_with_recovery", return_value=rejected), \
             patch.object(setup, "run_console") as console, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(setup.create_dedicated_connection(API, "My App", 20, True), "new")
            self.assertNotIn("--use-sso", console.call_args.args[0])

    def test_partial_ss_o_creation_never_duplicates(self):
        rejected = result(2, err="The connector service rejected the automatic connection request.")
        with patch.object(setup, "list_connections", side_effect=[[], [connection(status="Error")]]), \
             patch.object(setup, "run_with_recovery", return_value=rejected), \
             patch.object(setup, "run_console") as console, contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            setup.create_dedicated_connection(API, "My App", 20, True)
        console.assert_not_called()

    def test_creation_ambiguity_stops(self):
        with patch.object(setup, "list_connections", side_effect=[[], [connection("a"), connection("b")]]), \
             patch.object(setup, "run_with_recovery", return_value=result()), self.assertRaises(SystemExit):
            setup.create_dedicated_connection(API, "My App", 20, True)

    def test_no_interactive_creation_without_approval(self):
        with patch.object(setup, "list_connections", return_value=[]), \
             patch.object(setup, "run_with_recovery", return_value=result(2, err="rejected")), \
             patch.object(setup, "run_console") as console, contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            setup.create_dedicated_connection(API, "My App", 20, False)
        console.assert_not_called()

    def test_zero_exit_without_outputs_is_failure(self):
        with self.assertRaises(SystemExit):
            add.verify_generated(API, "your_ref")

    def generated(self):
        Path("power.config.json").write_text(json.dumps({"environmentId": ENV, "connectionReferences": {
            "key": {"id": f"/apis/{API}", "dataSources": ["commondataserviceforapps"],
                    "xrmConnectionReferenceLogicalName": "your_ref"}}}))
        schema = Path(".power/schemas/appschemas/dataSourcesInfo.ts")
        schema.parent.mkdir(parents=True)
        schema.write_text('export const dataSourcesInfo = {"commondataserviceforapps": {}}')
        model = Path("src/generated/models/MicrosoftDataverseModel.ts")
        model.parent.mkdir(parents=True)
        model.write_text("export interface Model {}")
        service = Path("src/generated/services/MicrosoftDataverseService.ts")
        service.parent.mkdir(parents=True)
        service.write_text("ListRecordsWithOrganization GetItemWithOrganization CreateRecordWithOrganization UpdateRecordWithOrganization DeleteRecordWithOrganization")
        return service

    def test_expected_generated_artifacts_pass(self):
        self.generated()
        add.verify_generated(API, "your_ref")

    def test_wrong_generated_reference_stops(self):
        self.generated()
        with self.assertRaises(SystemExit):
            add.verify_generated(API, "other")

    def test_missing_generated_method_stops(self):
        self.generated().write_text("ListRecordsWithOrganization")
        with self.assertRaises(SystemExit):
            add.verify_generated(API, "your_ref")

    def test_missing_generated_schema_entry_stops(self):
        self.generated()
        Path(".power/schemas/appschemas/dataSourcesInfo.ts").write_text("export const dataSourcesInfo = {}")
        with self.assertRaises(SystemExit):
            add.verify_generated(API, "your_ref")

    def test_reference_requires_membership(self):
        with patch.object(setup, "list_connection_references", return_value=[]), self.assertRaises(SystemExit):
            add.validate_reference("your_ref", "solution", API, 20)

    def test_reference_requires_healthy_bound_connection(self):
        row = {"connectionreferencelogicalname": "your_ref", "connectionreferenceid": "ref", "connectionid": "new"}
        with patch.object(setup, "list_connection_references", return_value=[row]), \
             patch.object(setup, "is_in_solution", return_value=True), \
             patch.object(add, "list_connections", return_value=[connection(status="Error")]), self.assertRaises(SystemExit):
            add.validate_reference("your_ref", "solution", API, 20)

    def test_force_create_main_reuses_verified_binding(self):
        row = {"connectionreferencelogicalname": "your_ref", "connectionreferenceid": "ref", "connectionid": "new"}
        with patch("sys.argv", ["setup", "--solution-name", "Solution", "--prefix", "your",
                               "--logical-name", "your_ref", "--connection-id", "new",
                               "--force-create", "--create-connection", "--write-env", ".env"]), \
             patch.object(setup, "get_solution_id", return_value="solution"), \
             patch.object(setup, "list_connection_references", return_value=[row]), \
             patch.object(setup, "is_in_solution", return_value=True), \
             patch.object(setup, "list_connections", return_value=[connection()]), \
             patch.object(setup, "create_dedicated_connection") as create, \
             patch.object(setup, "api_post") as post, contextlib.redirect_stdout(io.StringIO()):
            setup.main()
            create.assert_not_called()
            post.assert_not_called()
            self.assertIn("DATAVERSE_CONNECTION_ID=new", Path(".env").read_text())

    def test_action_rejects_table_input(self):
        with self.assertRaises(SystemExit):
            add.validate_kind("action", "dataset", "table")

    def test_contact_name_and_update_fit_metadata(self):
        crm.validate_name("CRM-TEST-" + "a" * 16, 50)
        with self.assertRaises(ValueError):
            crm.validate_name("a" * 45, 50)

    def test_sdk_list_returns_flat_records_not_pages(self):
        client = Mock()
        client.records.list.return_value = [{"name": "Test", "accountid": "test-id"}]
        rows = crm.read_records(client, "account", "accountid", "test-id", ["name"])
        self.assertEqual(rows, [{"name": "Test", "accountid": "test-id"}])
        client.records.list.assert_called_once_with(
            "account", select=["accountid", "name"], filter="accountid eq test-id",
        )

    def test_lookup_uses_actual_read_attribute(self):
        nav, attribute = crm.resolve_lookup([{
            "ReferencedEntity": "account",
            "ReferencingEntityNavigationPropertyName": "parentcustomerid_account",
            "ReferencingAttribute": "parentcustomerid",
        }], "account", "parentcustomerid_account")
        self.assertEqual(nav, "parentcustomerid_account")
        self.assertEqual(attribute, "parentcustomerid")

    def test_lookup_missing_or_ambiguous_stops(self):
        row = {"ReferencedEntity": "account", "ReferencingEntityNavigationPropertyName": "Nav",
               "ReferencingAttribute": "lookup"}
        for rows in ([], [row, row]):
            with self.assertRaises(ValueError):
                crm.resolve_lookup(rows, "account", "nav")

    def test_existing_dataverse_add_is_idempotent(self):
        self.generated()
        with patch("sys.argv", ["add", "--connector", "dataverse", "--connection-ref", "your_ref",
                               "--solution-id", "solution", "--org-url", "https://example.invalid"]), \
             patch.object(add, "validate_reference"), patch.object(add, "_run_cli") as run, \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(add.main(), 0)
            run.assert_not_called()

    def test_existing_dataverse_wrong_binding_not_duplicated(self):
        self.generated()
        with patch("sys.argv", ["add", "--connector", "dataverse", "--connection-ref", "other",
                               "--solution-id", "solution", "--org-url", "https://example.invalid"]), \
             patch.object(add, "validate_reference"), patch.object(add, "_run_cli") as run, \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            add.main()
        run.assert_not_called()

    def test_reference_readback_failure_never_writes_env(self):
        row = {"connectionreferencelogicalname": "your_ref", "connectionreferenceid": "ref", "connectionid": "new"}
        changed = {**row, "connectionid": "other"}
        with patch("sys.argv", ["setup", "--solution-name", "Solution", "--prefix", "your",
                               "--logical-name", "your_ref", "--connection-id", "new", "--write-env", ".env"]), \
             patch.object(setup, "get_solution_id", return_value="solution"), \
             patch.object(setup, "list_connection_references", side_effect=[[row], [changed]]), \
             patch.object(setup, "is_in_solution", return_value=True), \
             patch.object(setup, "list_connections", return_value=[connection()]), \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            setup.main()
        self.assertFalse(Path(".env").exists())

    def test_environment_mismatch_prevents_reference_api_calls(self):
        with patch.dict(os.environ, {"ENV_ID": "other"}), \
             patch("sys.argv", ["setup", "--solution-name", "Solution", "--prefix", "your"]), \
             patch.object(setup, "get_solution_id") as get, self.assertRaises(SystemExit):
            setup.main()
        get.assert_not_called()

    @staticmethod
    def crm_metadata(path):
        table = path.split("LogicalName='", 1)[1].split("'", 1)[0]
        if "/Attributes" in path:
            return {"MaxLength": 50}
        if "/ManyToOneRelationships" in path:
            target, nav, attribute = (
                ("account", "parentcustomerid_account", "parentcustomerid") if table == "contact" else
                ("your_crmfiscalperiod", "your_fiscalperiodid", "your_fiscalperiodid") if table.endswith("crmsalestarget") else
                ("your_crmopportunity", "your_opportunityid", "your_opportunityid") if table.endswith("crmactivity") else
                ("account", "your_accountid", "your_accountid")
            )
            return {"value": [{"ReferencedEntity": target, "ReferencingEntityNavigationPropertyName": nav,
                               "ReferencingAttribute": attribute}]}
        return {"EntitySetName": table + "s", "PrimaryIdAttribute": table + "id",
                "PrimaryNameAttribute": "fullname" if table == "contact" else "name"}

    def test_crm_default_is_readonly(self):
        credential = Mock()
        with patch.dict(os.environ, {"DATAVERSE_URL": "https://example.invalid", "PUBLISHER_PREFIX": "your"}), \
             patch("sys.argv", ["verify", "--expected-url", "https://example.invalid"]), \
             patch.object(crm, "api_get", side_effect=self.crm_metadata), \
             patch.object(crm, "get_credential", credential), contextlib.redirect_stdout(io.StringIO()):
            crm.main()
        credential.assert_not_called()

    def test_crm_late_metadata_failure_prevents_all_writes(self):
        def metadata(path):
            if "your_crmactivity" in path and "/Attributes" in path:
                return {"MaxLength": 10}
            return self.crm_metadata(path)
        with patch.dict(os.environ, {"DATAVERSE_URL": "https://example.invalid", "PUBLISHER_PREFIX": "your"}), \
             patch("sys.argv", ["verify", "--expected-url", "https://example.invalid", "--apply"]), \
             patch.object(crm, "api_get", side_effect=metadata), \
             patch.object(crm, "get_credential") as credential, \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            crm.main()
        credential.assert_not_called()

    def test_crm_failed_read_still_deletes_only_its_created_id(self):
        client = MagicMock()
        client.records.create.return_value = "created-by-test"
        client.records.list.return_value = []
        sdk = Mock()
        sdk.DataverseClient.return_value.__enter__ = Mock(return_value=client)
        sdk.DataverseClient.return_value.__exit__ = Mock(return_value=False)
        with patch.dict(os.environ, {"DATAVERSE_URL": "https://example.invalid", "PUBLISHER_PREFIX": "your"}), \
             patch("sys.argv", ["verify", "--expected-url", "https://example.invalid", "--apply"]), \
             patch.object(crm, "api_get", side_effect=self.crm_metadata), \
             patch.dict(sys.modules, {"PowerPlatform.Dataverse.client": sdk}), \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
            crm.main()
        client.records.delete.assert_called_once_with("account", "created-by-test")

    def test_scaffold_normal_flow_initializes_before_connection_setup(self):
        root = Path(__file__).resolve().parents[1] / "templates"
        for name in ("sales-crm", "store-ordering", "construction-cockpit", "perse3d-studio"):
            with self.subTest(template=name):
                steps = json.loads((root / name / "scaffold.json").read_text(encoding="utf-8"))["nextSteps"]
                init = next(i for i, step in enumerate(steps) if "pa app init" in step)
                setup_index = next(i for i, step in enumerate(steps) if "setup_connection_reference.py" in step)
                add_index = next(i for i, step in enumerate(steps) if "add_data_source.py" in step)
                self.assertLess(init, setup_index)
                self.assertLess(setup_index, add_index)
                self.assertIn("--allow-interactive", steps[setup_index])
                self.assertIn("--allow-interactive", steps[add_index])

    def test_new_connection_id_saved_for_resume_before_reference_write(self):
        with patch("sys.argv", ["setup", "--solution-name", "Solution", "--prefix", "your",
                               "--create-connection", "--write-env", ".env"]), \
             patch.object(setup, "get_solution_id", return_value="solution"), \
             patch.object(setup, "list_connection_references", return_value=[]), \
             patch.object(setup, "create_dedicated_connection", return_value="new"), \
             patch.object(setup, "list_connections", return_value=[connection()]), \
             patch.object(setup, "create_connection_reference", side_effect=SystemExit("write failed")), \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            setup.main()
        self.assertEqual(Path(".env").read_text(), "DATAVERSE_CONNECTION_ID=new\n")


if __name__ == "__main__":
    unittest.main()
