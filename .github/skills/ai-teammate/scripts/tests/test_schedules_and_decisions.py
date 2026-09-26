"""B11 schedules and the Foundry Autopilot scaffold decisions (sharing, sensitive data, mail, photo)."""

import asyncio
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from datetime import datetime, time as dtime, timedelta, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import scaffold_ai_teammate as scaffold  # noqa: E402

MODULE = SCRIPTS.parent / "templates" / "foundry-autopilot" / "__PKG__" / "schedules.py"
sys.modules.setdefault("copilot", types.SimpleNamespace(Tool=object, define_tool=lambda *a, **k: None))
spec = importlib.util.spec_from_file_location("schedules_under_test", MODULE)
schedules = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(schedules)
    from zoneinfo import ZoneInfo

    TOKYO = ZoneInfo("Asia/Tokyo")
    LOADED = True
except Exception:  # pydantic / httpx / tzdata missing in the test environment
    LOADED = False

NOW = datetime(2026, 9, 25, 1, 0, tzinfo=timezone.utc)  # Friday 10:00 in Tokyo
REFERENCE = {"conversation": {"id": "c1"}, "bot": {"id": "b"}, "user": {"id": "u"}}


def run(coro):
    return asyncio.run(coro)


@unittest.skipUnless(LOADED, "schedules.py dependencies are not installed")
class NextRunTests(unittest.TestCase):
    def test_repeats(self):
        at = dtime(9, 0)
        self.assertEqual(schedules.next_run("daily", at, TOKYO, after=NOW).day, 26)
        self.assertEqual(schedules.next_run("weekdays", at, TOKYO, after=NOW).day, 28)
        self.assertEqual(schedules.next_run("weekly", at, TOKYO, after=NOW, weekday=0).day, 28)

    def test_past_one_off_is_rejected(self):
        self.assertIsNone(schedules.next_run("once", dtime(9, 0), TOKYO, after=NOW, on=NOW.date()))

    def test_unknown_repeat_is_a_schedule_error(self):
        with self.assertRaises(schedules.ScheduleError):
            schedules.next_run("hourly", dtime(9, 0), TOKYO, after=NOW)


@unittest.skipUnless(LOADED, "schedules.py dependencies are not installed")
class RunTokenTests(unittest.TestCase):
    def setUp(self):
        self.book = schedules.ScheduleBook(schedules.MemoryRows())

    def create(self, **overrides):
        values = dict(owner_id="u1", owner_name="A", title="t", instruction="do it", repeat="once",
                      at="10:30", on="2026-09-25", zone_name="Asia/Tokyo", reference=REFERENCE, now=NOW)
        values.update(overrides)
        return run(self.book.create(**values))

    def hand_over(self, when):
        tokens = {}

        async def collect(schedule):
            tokens[schedule["id"]] = schedule["run_token"]

        run(schedules.run_due(self.book, collect, when))
        return tokens

    def test_a_run_token_works_once_and_removes_a_one_off(self):
        one = self.create()
        later = NOW + timedelta(minutes=40)
        token = self.hand_over(later)[one["id"]]
        self.assertIsNone(run(self.book.redeem(one["id"], "forged", later)))
        self.assertEqual(run(self.book.redeem(one["id"], token, later))["instruction"], "do it")
        self.assertIsNone(run(self.book.redeem(one["id"], token, later)))
        self.assertEqual(run(self.book.list_for("u1")), [])

    def test_an_expired_token_does_not_run(self):
        daily = self.create(repeat="daily", on="", at="10:15")
        later = NOW + timedelta(minutes=40)
        token = self.hand_over(later)[daily["id"]]
        late = later + schedules.RUN_TOKEN_TTL + timedelta(seconds=1)
        self.assertIsNone(run(self.book.redeem(daily["id"], token, late)))

    def test_only_the_owner_can_delete(self):
        mine = self.create(repeat="daily", on="")
        self.assertFalse(run(self.book.delete("someone-else", mine["id"])))
        self.assertTrue(run(self.book.delete("u1", mine["id"])))

    def test_per_person_limit(self):
        for _ in range(schedules.MAX_PER_OWNER):
            self.create(repeat="daily", on="")
        with self.assertRaises(schedules.ScheduleError):
            self.create(repeat="daily", on="")

    def test_ops_report_schedule_errors_as_data(self):
        body, status = run(schedules.handle_op(self.book, {"op": "create", "args": {
            "owner_id": "u1", "owner_name": "A", "title": "x", "instruction": "y", "repeat": "hourly",
            "at": "10:00", "zone_name": "Asia/Tokyo", "reference": REFERENCE}}))
        self.assertEqual((status, body.get("error_kind")), (200, "schedule"))
        self.assertEqual(run(schedules.handle_op(self.book, {"op": "nope"}))[1], 400)


UPSTREAM_HOST = '''from .agent_interface import AgentInterface, check_agent_inheritance


class Host:
    def notify(self, is_email, response):
        if is_email:
            response_activity = EmailResponse.create_email_response_activity(
                response
            )
            return response_activity

    def start_server(self):
        async def jwt_with_health_bypass(request, handler):
            if request.path in {"/", "/liveness", "/readiness", "/api/health"}:
                return await handler(request)
            return await jwt_authorization_middleware(request, handler)

        app.router.add_get("/api/health", health)
'''


class HostPatchTests(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "host_agent_server.py"
        self.path.write_text(UPSTREAM_HOST, encoding="utf-8")

    def test_schedule_route_and_jwt_bypass(self):
        self.assertTrue(scaffold.patch_schedule_routes(self.path))
        patched = self.path.read_text(encoding="utf-8")
        self.assertIn("from .schedule_host import ROUTE as SCHEDULE_ROUTE, register_schedule_routes", patched)
        self.assertIn('app.router.add_get("/api/health", health)\n        register_schedule_routes(app, self)', patched)
        self.assertIn("if request.path == SCHEDULE_ROUTE:", patched)
        compile(patched, str(self.path), "exec")
        self.assertTrue(scaffold.patch_schedule_routes(self.path), "idempotent")
        self.assertEqual(patched.count("register_schedule_routes(app, self)"), 1)

    def test_empty_mail_reply_is_not_sent(self):
        self.assertTrue(scaffold.patch_silent_email(self.path))
        patched = self.path.read_text(encoding="utf-8")
        self.assertIn("if is_email and not response:\n            return\n        if is_email:", patched)
        compile(patched, str(self.path), "exec")

    def test_unknown_shape_is_reported(self):
        self.path.write_text("class Host:\n    pass\n", encoding="utf-8")
        self.assertFalse(scaffold.patch_schedule_routes(self.path))
        self.assertFalse(scaffold.patch_silent_email(self.path))


class DecisionTests(unittest.TestCase):
    def test_policies_from_answers(self):
        values = scaffold.policy_variables({
            "emailEnabled": False,
            "sharingPolicy": ["本人には自由に渡す", "他部署へは上長の同意"],
            "sensitiveData": "顧客の個人情報\n未発表の決算数値",
        })
        self.assertEqual(values["EMAIL_POLICY"], scaffold.EMAIL_OFF)
        self.assertEqual(values["SHARING_POLICY"], "- 本人には自由に渡す\n- 他部署へは上長の同意")
        self.assertEqual(values["SENSITIVE_DATA_POLICY"], "- 顧客の個人情報\n- 未発表の決算数値")

    def test_defaults_when_unanswered(self):
        values = scaffold.policy_variables({"emailEnabled": True})
        self.assertEqual(values["EMAIL_POLICY"], scaffold.EMAIL_ON)
        self.assertEqual(values["SHARING_POLICY"], scaffold.DEFAULT_SHARING)

    def test_runtime_env_is_merged_without_overwriting(self):
        target = Path(tempfile.mkdtemp())
        (target / ".env").write_text("EMAIL_CHANNEL_ENABLED=true\n", encoding="utf-8")
        plan = types.SimpleNamespace(agent_name="nova", display_name="Nova", blocks=("B3", "B11"))
        scaffold.merge_env(target / ".env", scaffold.runtime_settings(plan, {"emailEnabled": False}))
        env = scaffold.load_dotenv(target / ".env")
        self.assertEqual(env["EMAIL_CHANNEL_ENABLED"], "true")
        self.assertEqual(env["SCHEDULE_ENABLED"], "true")
        self.assertEqual(env["EVAL_AGENT_KEY"], "nova")

    def test_profile_image(self):
        target, here = Path(tempfile.mkdtemp()), Path(tempfile.mkdtemp())
        (here / "face.png").write_bytes(b"png")
        self.assertEqual(scaffold.place_profile_image({"profileImage": "face.png"}, target, here), "file")
        self.assertTrue((target / "assets" / "profile.png").is_file())
        mode = scaffold.place_profile_image(
            {"profileImage": {"mode": "generate", "prompt": "緑の髪の女性"}}, target, here
        )
        self.assertEqual(mode, "generate")
        self.assertEqual(scaffold.place_profile_image({}, target, here), "none")
        with self.assertRaises(ValueError):
            scaffold.place_profile_image({"profileImage": "missing.png"}, target, here)


if __name__ == "__main__":
    unittest.main()
