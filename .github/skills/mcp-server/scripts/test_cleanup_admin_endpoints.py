import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cleanup_admin_endpoints as cleanup


class CleanupTests(unittest.TestCase):
    def test_import_cleanup_preserves_similarly_named_modules_and_comments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            entry = root / "src" / "index.ts"
            retained = 'import "./functions/seedSqlReport.js";\n// functions/seedSql\nimport "./functions/mcp.js";\n'
            entry.write_text('import "./functions/seedSql.js";\n' + retained, encoding="utf-8")
            cleanup.strip_entrypoint_imports(root, [root / "src" / "functions" / "seedSql.ts"])
            self.assertEqual(entry.read_text(encoding="utf-8"), retained)

    def test_missing_routes_stops_before_deletion(self):
        with patch.object(sys, "argv", ["cleanup", "--project", ".", "--app", "example"]):
            with patch.object(cleanup, "find_admin_sources") as discover:
                with self.assertRaises(SystemExit) as raised:
                    cleanup.main()
                self.assertEqual(raised.exception.code, 2)
                discover.assert_not_called()

    def test_sql_and_file_seed_are_discovered_without_mcp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            functions = root / "src" / "functions"
            functions.mkdir(parents=True)
            for name in ["seedSql.ts", "seedUpload.ts", "mcp.ts"]:
                (functions / name).touch()
            self.assertEqual({path.name for path in cleanup.find_admin_sources(root)}, {"seedSql.ts", "seedUpload.ts"})


if __name__ == "__main__":
    unittest.main()