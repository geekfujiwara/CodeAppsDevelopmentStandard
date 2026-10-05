import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from publish_skill import removed_template_entrypoints, stale_overwrites


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


class StaleOverwriteTests(unittest.TestCase):
    """PR 先で手元より後に変更されたファイルの上書き（他の人・別の端末の変更を巻き戻す）を止める"""

    def test_flags_files_changed_on_pr_branch_after_local_edit(self):
        # 手元は 1 日前のまま、PR 先では 1 時間前に変更 → 止める
        now = 1_800_000_000.0
        found = stale_overwrites([
            (".github/skills/code-apps/references/troubleshooting.md", now - 3600, now - 86400),
            (".github/skills/code-apps/references/csp.md", now - 86400, now - 600),  # 手元で後から編集 → 通す
        ])
        self.assertEqual(found, [".github/skills/code-apps/references/troubleshooting.md"])

    def test_allows_clock_skew(self):
        self.assertEqual(stale_overwrites([("a.md", 1000.0, 950.0)]), [])
        self.assertEqual(stale_overwrites([("a.md", 1000.0, 800.0)]), ["a.md"])


if __name__ == "__main__":
    unittest.main()
