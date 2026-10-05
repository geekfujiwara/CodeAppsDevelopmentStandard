import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from publish_skill import removed_template_entrypoints


def diff(path: str, removed: list[str], added: list[str]) -> str:
    lines = [f"diff --git a/{path} b/{path}", f"--- a/{path}", f"+++ b/{path}", "@@ -1 +1 @@"]
    lines += [f"-{text}" for text in removed] + [f"+{text}" for text in added]
    return "\n".join(lines)


class RemovedTemplateEntrypointTests(unittest.TestCase):
    def test_flags_removed_argument_parser_in_template(self):
        found = removed_template_entrypoints(diff(
            ".github/skills/code-apps/templates/demo/scripts/setup.py",
            ['    parser.add_argument("--apply", action="store_true")', '    if PREFIX != TEMPLATE_PREFIX:'],
            ["    create_schema()"],
        ))
        self.assertEqual(len(found), 2)

    def test_ignores_moved_lines_within_same_file(self):
        line = '    parser.add_argument("--apply", action="store_true")'
        found = removed_template_entrypoints(diff(".github/skills/x/templates/t/setup.py", [line], [line]))
        self.assertEqual(found, [])

    def test_ignores_files_outside_templates(self):
        found = removed_template_entrypoints(diff(".github/skills/x/scripts/setup.py", ['    parser.add_argument("--apply")'], []))
        self.assertEqual(found, [])

    def test_ignores_unrelated_removed_lines(self):
        found = removed_template_entrypoints(diff(".github/skills/x/templates/t/app.ts", ["const a = 1"], ["const a = 2"]))
        self.assertEqual(found, [])


if __name__ == "__main__":
    unittest.main()
