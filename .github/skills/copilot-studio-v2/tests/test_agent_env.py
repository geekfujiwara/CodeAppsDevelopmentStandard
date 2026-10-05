import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from agent_env import attach_env, load_env_file, skill_description, skill_dirs  # noqa: E402


def write_skill(folder: Path, frontmatter: str) -> None:
    folder.mkdir(parents=True)
    (folder / "SKILL.md").write_text(f"---\n{frontmatter}\n---\n\n# body\n", encoding="utf-8")


class AgentEnvTests(unittest.TestCase):
    def setUp(self):
        self._cwd = os.getcwd()
        self._env = os.environ.copy()

    def tearDown(self):
        os.chdir(self._cwd)
        os.environ.clear()
        os.environ.update(self._env)

    def test_skill_dirs_single_and_parent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_skill(root / "single", "name: single")
            write_skill(root / "many" / "b-skill", "name: b-skill")
            write_skill(root / "many" / "a-skill", "name: a-skill")
            (root / "many" / "notes").mkdir()
            self.assertEqual(skill_dirs(root / "single"), [root / "single"])
            self.assertEqual([p.name for p in skill_dirs(root / "many")], ["a-skill", "b-skill"])
            self.assertEqual(skill_dirs(root / "missing"), [])

    def test_skill_description_block_and_inline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_skill(root / "block", "name: block\ndescription: |\n  一行目。\n  Use when 二行目。\nlicense: MIT")
            write_skill(root / "inline", 'name: inline\ndescription: "短い説明"')
            write_skill(root / "none", "name: none")
            self.assertEqual(skill_description(root / "block" / "SKILL.md"), "一行目。 Use when 二行目。")
            self.assertEqual(skill_description(root / "inline" / "SKILL.md"), "短い説明")
            self.assertEqual(skill_description(root / "none" / "SKILL.md"), "")

    def test_attach_env_uses_folder_name_for_child_skills(self):
        os.environ["SKILL_NAME"] = "parent-name"
        os.environ["SKILL_DESCRIPTION"] = "parent description"
        child = attach_env(Path("skills/agm-qa-review"), multi=True)
        self.assertEqual(child["SKILL_NAME"], "agm-qa-review")
        self.assertNotIn("SKILL_DESCRIPTION", child)
        single = attach_env(Path("skill"), multi=False)
        self.assertEqual(single["SKILL_NAME"], "parent-name")
        self.assertEqual(single["SKILL_DESCRIPTION"], "parent description")

    def test_load_env_file_sets_values_and_changes_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / "agent.env"
            env_file.write_text("# comment\nAGENT_NAME=AGM Q&A Author\nSKILL_DIR='skills'\n\n", encoding="utf-8")
            rest = load_env_file(["--defer-publish", "--env-file", str(env_file)])
            self.assertEqual(rest, ["--defer-publish"])
            self.assertEqual(os.environ["AGENT_NAME"], "AGM Q&A Author")
            self.assertEqual(os.environ["SKILL_DIR"], "skills")
            self.assertEqual(Path.cwd().resolve(), Path(tmp).resolve())
            os.chdir(self._cwd)

    def test_load_env_file_without_option_is_noop(self):
        self.assertEqual(load_env_file(["--no-publish"]), ["--no-publish"])
        with self.assertRaises(SystemExit):
            load_env_file(["--env-file", "does-not-exist.env"])


if __name__ == "__main__":
    unittest.main()
