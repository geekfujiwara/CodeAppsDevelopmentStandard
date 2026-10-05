import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import deploy_agent  # noqa: E402


class DeployAgentDetailsTests(unittest.TestCase):
    """新規エージェントの Edit details は公開後でないと通らない（404 / 7513）。公開後に再試行して再公開する"""

    def run_main(self, results: dict[str, list[bool]], argv: list[str] | None = None) -> list[str]:
        calls: list[str] = []

        def fake_run(script, *args, required=True, env=None):
            calls.append(script)
            queue = results.get(script)
            return queue.pop(0) if queue else True

        with mock.patch.object(deploy_agent, "run", side_effect=fake_run), \
                mock.patch.object(deploy_agent, "attach_skills"), \
                mock.patch.object(deploy_agent, "load_env_file", return_value=argv or []), \
                mock.patch.object(deploy_agent.time, "sleep"):
            deploy_agent.main()
        return calls

    def test_retries_details_after_publish_and_republishes(self):
        calls = self.run_main({"set_app_details.py": [False, False, True]})
        self.assertEqual(calls, [
            "create_agent.py", "set_icon.py", "set_app_details.py",
            "publish_agent.py", "set_app_details.py", "set_app_details.py", "publish_agent.py",
        ])

    def test_no_retry_when_details_succeeded_first(self):
        calls = self.run_main({})
        self.assertEqual(calls.count("set_app_details.py"), 1)
        self.assertEqual(calls.count("publish_agent.py"), 1)

    def test_gives_up_without_second_publish(self):
        calls = self.run_main({"set_app_details.py": [False] * 10})
        self.assertEqual(calls.count("set_app_details.py"), 1 + 4)
        self.assertEqual(calls.count("publish_agent.py"), 1)

    def test_defer_publish_does_not_retry(self):
        calls = self.run_main({"set_app_details.py": [False]}, argv=["--defer-publish"])
        self.assertNotIn("publish_agent.py", calls)
        self.assertEqual(calls.count("set_app_details.py"), 1)


if __name__ == "__main__":
    unittest.main()
