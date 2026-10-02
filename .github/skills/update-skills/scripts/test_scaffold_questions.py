"""scaffold_from_template.py の質問（--questions）と .env への書き出し（--write-env）を検証する。

実行: python -m unittest discover -s .github/skills/update-skills/scripts -p "test_scaffold_questions.py"
"""

import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

SCRIPT = pathlib.Path(__file__).with_name("scaffold_from_template.py")
spec = importlib.util.spec_from_file_location("scaffold", SCRIPT)
scaffold = importlib.util.module_from_spec(spec)
sys.modules["scaffold"] = scaffold  # dataclass は定義したモジュールを sys.modules から引く
spec.loader.exec_module(scaffold)  # type: ignore[union-attr]


def make_template(root: pathlib.Path) -> pathlib.Path:
    template = root / "tpl"
    template.mkdir()
    (template / "scaffold.json").write_text(
        json.dumps(
            {
                "variables": ["APP_TITLE", "ENV_ID", "PREFIX", "VITE_PREFIX"],
                "optionalVariables": ["MEETING_DATE"],
                "questions": [
                    {"variable": "APP_TITLE", "question": "アプリの名前は？", "default": "Q&A アシスト"},
                    {"variable": "PREFIX", "question": "プレフィックスは？", "choices": ["geek", "contoso"]},
                    {"variable": "MEETING_DATE", "question": "開催日は？"},
                    {"variable": "VITE_PREFIX", "question": "（PREFIX と同じ）", "sameAs": "PREFIX"},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (template / "app.txt").write_text("${APP_TITLE} / ${ENV_ID} / ${PREFIX} / ${MEETING_DATE} / ${VITE_PREFIX}\n", encoding="utf-8")
    return template


def run(argv: list[str]) -> tuple[int, str]:
    out = io.StringIO()
    with redirect_stdout(out):
        code = scaffold.main(argv)
    return code, out.getvalue()


class ScaffoldQuestionsTests(unittest.TestCase):
    def test_questions_in_declared_order_and_unasked_required_variables_are_added(self):
        with tempfile.TemporaryDirectory() as tmp:
            template = make_template(pathlib.Path(tmp))
            code, out = run(["--template", str(template), "--questions", "--env", str(pathlib.Path(tmp) / "none.env")])
            self.assertEqual(0, code)
            questions = json.loads(out)
            self.assertEqual(["APP_TITLE", "PREFIX", "MEETING_DATE", "ENV_ID"], [q["variable"] for q in questions])
            self.assertEqual(["geek", "contoso"], questions[1]["choices"])
            self.assertFalse(questions[2]["required"])
            self.assertTrue(questions[3]["required"])

    def test_answered_variables_are_not_asked_again(self):
        with tempfile.TemporaryDirectory() as tmp:
            template = make_template(pathlib.Path(tmp))
            answers = pathlib.Path(tmp) / "answers.env"
            answers.write_text("APP_TITLE=株主総会\nPREFIX=geek\n", encoding="utf-8")
            code, out = run(["--template", str(template), "--questions", "--env", str(answers), "--var", "ENV_ID=env-1"])
            self.assertEqual(0, code)
            self.assertEqual(["MEETING_DATE"], [q["variable"] for q in json.loads(out)])

    def test_write_env_appends_only_missing_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            template = make_template(root)
            answers = root / "answers.env"
            answers.write_text("APP_TITLE=株主総会\nPREFIX=geek\nENV_ID=env-1\nMEETING_DATE=2026-06-25\n", encoding="utf-8")
            target = root / "out"
            target.mkdir()
            (target / ".env").write_text("PREFIX=keep\n", encoding="utf-8")
            code, _ = run(["--template", str(template), "--target", str(target), "--env", str(answers), "--write-env", str(target / ".env")])
            self.assertEqual(0, code)
            env = (target / ".env").read_text(encoding="utf-8")
            self.assertIn("PREFIX=keep", env)
            self.assertNotIn("PREFIX=geek", env.splitlines())
            self.assertIn("APP_TITLE=株主総会", env)
            self.assertIn("MEETING_DATE=2026-06-25", env)
            self.assertEqual("株主総会 / env-1 / geek / 2026-06-25 / geek\n", (target / "app.txt").read_text(encoding="utf-8"))
            self.assertIn("VITE_PREFIX=geek", env)

    def test_optional_variable_without_answer_becomes_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            template = make_template(root)
            answers = root / "answers.env"
            answers.write_text("APP_TITLE=a\nPREFIX=p\nENV_ID=e\n", encoding="utf-8")
            code, _ = run(["--template", str(template), "--target", str(root / "out"), "--env", str(answers)])
            self.assertEqual(0, code)
            self.assertEqual("a / e / p /  / p\n", (root / "out" / "app.txt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
