"""First-stage contracts are tested offline; never call a tenant from unit tests."""
from __future__ import annotations

import importlib.util
import asyncio
import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import scaffold_ai_teammate as scaffold
import run_first_stage as runner

spec = importlib.util.spec_from_file_location("first_stage_acceptance", SCRIPTS / "test_first_stage.py")
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)


def answers(**updates):
    values = {
        "agentName": "sample-colleague", "displayName": "Sample",
        "externalEmailEnabled": False, "imageGenerationEnabled": False,
        "profileImage": {"mode": "file", "path": "icon.png"},
        "communicationStyle": {"internal": {"tone": "friendly", "emoji": True},
                               "external": {"tone": "formal", "emoji": False}},
    }
    values.update(updates)
    return values


class DecisionTests(unittest.TestCase):
    def test_minimal_answers_need_no_cost_goal_or_feature_choices(self):
        runner.validate_decisions(answers())
        self.assertIn("フレンドリー", scaffold.communication_style(answers()))

    def test_opt_ins_require_real_boolean_answers(self):
        for key in ("externalEmailEnabled", "imageGenerationEnabled"):
            for invalid in (None, "false", 1):
                with self.subTest(key=key, invalid=invalid), self.assertRaises(ValueError):
                    runner.validate_decisions(answers(**{key: invalid}))

    def test_no_non_autopilot_fallback(self):
        for change in ({"hosting": "self-hosted"}, {"runtime": "agents-sdk"}):
            with self.assertRaises(ValueError):
                runner.validate_decisions(answers(**change))

    def test_no_optional_reduction_of_standard_features(self):
        blocks = scaffold.resolve_blocks(answers(blocks=["B1"], preset="role"))
        self.assertEqual(set(blocks), set(scaffold.ALL_BLOCKS) - {"B17"})
        self.assertIn("B17", scaffold.resolve_blocks(answers(imageGenerationEnabled=True)))

    def test_generated_env_carries_safety_and_image_answers(self):
        plan = scaffold.build_plan(answers(), Path("unused"))
        env = scaffold.runtime_settings(plan, answers())
        self.assertEqual(env["EXTERNAL_EMAIL_ENABLED"], "false")
        self.assertEqual(env["IMAGE_GENERATION_ENABLED"], "false")
        self.assertEqual(env["SCHEDULE_ENABLED"], "true")

    def test_runnable_test_and_answers_are_scaffolded(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary)
            (target / "regression").mkdir()
            plan = scaffold.build_plan(answers(), target)
            scaffold.copy_first_stage(SCRIPTS.parent, plan, answers())
            self.assertTrue((target / "scripts" / "test_first_stage.py").is_file())
            self.assertTrue((target / "scripts" / "run_first_stage.py").is_file())
            self.assertEqual(runner.skill_root(target), SCRIPTS.parent)
            self.assertIn("autopilot-approval.json", (target / ".gitignore").read_text())

    def test_generated_deploy_uses_shared_build_and_preflight(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary)
            scaffold.write_deploy_script(target, target / "src" / "package")
            generated = (target / "deploy.ps1").read_text()
        self.assertIn("build_autopilot_image.py", generated)
        self.assertIn("--check --env $envFile", generated)
        self.assertIn("$ConfirmExistingTemplate", generated)


class ApprovalTests(unittest.TestCase):
    def evidence(self, root: Path, **overrides):
        published = {"agentName": "sample", "version": "2", "blueprintClientId": "blueprint",
                     "teamsAppId": "app", "titleId": "title"}
        (root / "autopilot-publication.json").write_text(json.dumps(published))
        evidence = {**published, "templateType": "Agent template", "hiredUserId": "agent-user",
                    "frontierLicenseAssigned": True, **overrides}
        (root / "autopilot-approval.json").write_text(json.dumps(evidence))

    def test_requires_same_version_and_real_template_and_license(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.evidence(root)
            self.assertEqual(runner.approval(root)["hiredUserId"], "agent-user")
            for invalid in ({"version": "1"}, {"templateType": "Agent"}, {"hiredUserId": ""},
                            {"frontierLicenseAssigned": False}):
                self.evidence(root, **invalid)
                with self.assertRaises(ValueError):
                    runner.approval(root)


class ExecutionTests(unittest.TestCase):
    def test_hub_warms_cli_auth_before_environment_schema_or_init(self):
        deploy = Mock()
        deploy.run.return_value = (True, "[]")
        deploy.load_dotenv.return_value = {}
        deploy.build_post_connection_steps.return_value = []
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary)
            app = target / "evaluation-app"
            (app / "node_modules").mkdir(parents=True)
            (app / "power.config.json").write_text(json.dumps({"environmentId": "test-environment"}))
            env = {"ENV_ID": "test-environment", "PP_AUTH_ACCOUNT": "user@example.com",
                   "PP_AUTH_EDGE_PROFILE": "Default"}
            with patch.object(runner.importlib, "import_module", return_value=deploy):
                runner.deploy_hub(SCRIPTS.parent, target, env)
        calls = deploy.run.call_args_list
        self.assertEqual(calls[0].args[2], "Hub authentication cache")
        self.assertIn("--approve-interactive", calls[0].args[0])
        self.assertEqual(calls[1].args[2], "Hub schema")

    def test_explicit_answer_overrides_stale_switch_but_preserves_other_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".env"
            path.write_text("EXTERNAL_EMAIL_ENABLED=true\nUNRELATED=keep\n", encoding="utf-8")
            runner.apply_decision_env(path, {"EXTERNAL_EMAIL_ENABLED": "false"})
            self.assertEqual(scaffold.load_dotenv(path),
                             {"EXTERNAL_EMAIL_ENABLED": "false", "UNRELATED": "keep"})

    def test_shared_hub_inventory_reuses_one_exact_match(self):
        payload = [{"name": "existing", "properties": {"displayName": "AI Hub"}},
                   {"name": "another", "properties": {"displayName": "Other App"}}]
        self.assertEqual(runner.select_hub(payload, "AI Hub", ""), "existing")
        self.assertEqual(runner.select_hub({"value": payload}, "Unused", "existing"), "existing")
        self.assertEqual(runner.select_hub([], "AI Hub", ""), "")
        for invalid in ({}, [{"name": "missing display name"}], payload + payload):
            with self.assertRaises(ValueError):
                runner.select_hub(invalid, "AI Hub", "")

    def test_default_runs_through_publish_then_stops_for_real_approval(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "agent"
            decision_file = Path(temporary) / "answers.json"
            decision_file.write_text(json.dumps(answers()), encoding="utf-8")
            with (patch.object(sys, "argv", ["run_first_stage.py", "--target", str(target),
                                            "--decisions", str(decision_file)]),
                  patch.object(runner.importlib, "import_module", return_value=scaffold),
                  patch.object(scaffold, "scaffold"),
                  patch.object(scaffold, "skills_root", return_value=target / "skills"),
                  patch.object(scaffold, "install_skills"),
                  patch.object(runner, "apply_decision_env"),
                  patch.object(runner, "deploy_hub"),
                  patch.object(runner.subprocess, "run", return_value=Mock(returncode=0)) as execute):
                self.assertEqual(runner.main(), 2)
            commands = [call.args[0] for call in execute.call_args_list]
            self.assertTrue(commands[0][1].endswith("prepare_first_stage.py"))
            self.assertIn("--check", commands[1])
            self.assertIn("-File", commands[2])
            state = json.loads((target / "first-stage-state.json").read_text())
            self.assertEqual(state["status"], "awaiting-approval-and-hire")
            self.assertNotEqual(state["status"], "passed")

    def test_plan_has_no_cloud_or_filesystem_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "agent"
            decision_file = Path(temporary) / "answers.json"
            decision_file.write_text(json.dumps(answers()), encoding="utf-8")
            with (patch.object(sys, "argv", ["run_first_stage.py", "--target", str(target),
                                            "--decisions", str(decision_file), "--plan"]),
                  patch.object(runner.subprocess, "run") as execute):
                self.assertEqual(runner.main(), 0)
                execute.assert_not_called()
                self.assertFalse(target.exists())


class AcceptanceTests(unittest.TestCase):
    def test_does_not_accept_a_progress_message_as_final_answer(self):
        env = {"DATAVERSE_URL": "https://example.com", "PUBLISHER_PREFIX": "sample",
               "AGENTIC_USER_ID": "agent", "EVAL_AGENT_KEY": "sample"}
        test = acceptance.Acceptance(env, Mock(), timeout=1, poll=0)
        test.collection = Mock(return_value=[
            {"id": "ack", "from": {"user": {"id": "agent"}}, "createdDateTime": "2026-10-26",
             "body": {"content": "Working on it"}},
            {"id": "human", "from": {"user": {"id": "owner"}}, "createdDateTime": "2026-10-26",
             "body": {"content": "<p>The final answer</p>"}},
            {"id": "final", "from": {"user": {"id": "agent"}}, "createdDateTime": "2026-10-26",
             "body": {"content": "<p>The <strong>final</strong> answer</p>"}},
        ])
        self.assertEqual(test.wait_reply({"sample_response": "The **final** answer"}, "2026-10-25")["id"], "final")

    def test_tools_and_this_runs_query_are_required(self):
        turn = {"sample_response": "Completed", "sample_query": "run-123",
                "sample_toolcalls": '[{"name":"skill"},{"name":"deliver_file"}]'}
        case = {"id": "document", "tools": ["skill", "deliver_file|upload"]}
        acceptance.assert_case(case, turn, "sample", "run-123")
        with self.assertRaises(ValueError):
            acceptance.assert_case(case, turn, "sample", "old-run")
        with self.assertRaises(ValueError):
            acceptance.assert_case(case, {**turn, "sample_toolcalls": "[]"}, "sample", "run-123")

    def test_html_is_an_actual_marked_artifact_not_a_link_or_plain_text(self):
        content = ('<html><head><meta name="viewport" content="width=device-width"><style>'
                   'body { margin: 2rem }</style></head><body><h1>run-123</h1><table></table>'
                   '<a href="https://example.com">Source</a></body></html>')
        acceptance.assert_html(content, "run-123")
        for invalid in ("<html>run-123</html>", content.replace("run-123", "old-run"),
                        content + "<script>alert(1)</script>"):
            with self.assertRaises(ValueError):
                acceptance.assert_html(invalid, "run-123")

    def test_cross_origin_paging_never_sends_auth_elsewhere(self):
        env = {"DATAVERSE_URL": "https://example.com", "PUBLISHER_PREFIX": "sample",
               "AGENTIC_USER_ID": "agent", "EVAL_AGENT_KEY": "sample"}
        test = acceptance.Acceptance(env, Mock(), timeout=1, poll=0)
        test.request = Mock(return_value={"value": [], "@odata.nextLink": "https://other.example.com/page"})
        with self.assertRaises(ValueError):
            test.collection(test.graph, "https://graph.microsoft.com/v1.0/me/chats")
        self.assertEqual(test.request.call_count, 1)

    def test_meeting_refusal_with_a_tool_call_is_not_success(self):
        turn = {"sample_query": "run", "sample_response": "予定表を参照できません",
                "sample_toolcalls": '[{"name":"Calendar"}]'}
        with self.assertRaises(ValueError):
            acceptance.assert_case({"id": "workiq-calendar", "tools": ["Calendar"]}, turn, "sample", "run")

    def test_meeting_requires_a_real_invitation_and_cancellation(self):
        env = {"DATAVERSE_URL": "https://example.com", "PUBLISHER_PREFIX": "sample",
               "AGENTIC_USER_ID": "agent", "EVAL_AGENT_KEY": "sample",
               "AGENT_OWNER_UPN": "owner@example.com", "AGENT_UPN": "agent@example.com"}
        test = acceptance.Acceptance(env, Mock(), timeout=1, poll=0)
        test.case = Mock()
        test.collection = Mock(return_value=[{
            "id": "event-id", "organizer": {"emailAddress": {"address": "agent@example.com"}},
            "start": {"dateTime": "2026-10-27T09:00:00"}, "end": {"dateTime": "2026-10-27T09:30:00"},
            "attendees": [{"emailAddress": {"address": "owner@example.com"}}],
        }])
        response = Mock(status_code=200)
        response.json.return_value = {"isCancelled": True}
        test.graph.get.return_value = response
        test.meeting(test.run_id + "-meeting")
        self.assertEqual(test.case.call_count, 2)
        self.assertIn("meeting-cancel", test.case.call_args.args[0]["id"])
        test.collection.return_value[0]["organizer"]["emailAddress"]["address"] = "someone@example.com"
        with self.assertRaises(ValueError):
            test.meeting(test.run_id + "-meeting")

    def test_failed_case_keeps_a_non_green_persistent_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "regression").mkdir()
            source = SCRIPTS.parent / "templates" / "regression" / "first-stage.json"
            (root / "regression" / "first-stage.json").write_bytes(source.read_bytes())
            (root / "first-stage.local.json").write_text(json.dumps({"skillRoot": str(SCRIPTS.parent)}))
            with patch.object(sys, "argv", ["test_first_stage.py", "--target", str(root), "--execute"]):
                self.assertEqual(acceptance.main(), 2)
            report = json.loads((root / "regression" / "first-stage-results.json").read_text())
            self.assertEqual(report["status"], "unmeasured")
            self.assertIn("error", report)


class PresenceTests(unittest.TestCase):
    def module(self):
        path = SCRIPTS.parent / "templates" / "foundry-autopilot" / "__PKG__" / "presence.py"
        spec = importlib.util.spec_from_file_location("first_stage_presence", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_presence_session_uses_the_authenticated_application_id(self):
        module = self.module()
        payload = base64.urlsafe_b64encode(json.dumps({"azp": "app-id"}).encode()).decode().rstrip("=")
        self.assertEqual(module.application_id(f"header.{payload}.signature"), "app-id")

    def test_presence_cannot_change_a_humans_status(self):
        module = self.module()

        class Response:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            def raise_for_status(self):
                pass

            async def json(self):
                return {"id": "human"}

        class Session(Response):
            def get(self, *args):
                return Response()

            def post(self, *args, **kwargs):
                raise AssertionError("Must never change a human user's presence")

        with patch.object(module.aiohttp, "ClientSession", return_value=Session()):
            with self.assertRaises(ValueError):
                asyncio.run(module.refresh("not-inspected-for-a-human"))


if __name__ == "__main__":
    unittest.main()
