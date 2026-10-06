"""setup_dataverse_search.py の応答解析と、簡易検索ビューを変更しないこと（#29 の恒久対策）をローカルで確かめる。"""

import ast
import json
import pathlib
import sys
import types
import unittest

SCRIPT_PATH = pathlib.Path(__file__).with_name("setup_dataverse_search.py")


def load_parser():
    """auth_helper を読み込まずに parse_search_response だけを取り出す"""
    tree = ast.parse(SCRIPT_PATH.read_text(encoding="utf-8"))
    node = next(item for item in tree.body if isinstance(item, ast.FunctionDef) and item.name == "parse_search_response")
    module = types.ModuleType("search_under_test")
    module.json = json
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(SCRIPT_PATH), "exec"), module.__dict__)
    return module.parse_search_response


class SearchSetupTests(unittest.TestCase):
    def test_parses_rows_from_json_string_response(self):
        parse = load_parser()
        body = {"response": json.dumps({"Error": None, "Value": [{"Id": "1", "EntityName": "x_project", "Attributes": {"x_name": "港南"}}]})}
        self.assertEqual(parse(body), [{"id": "1", "entity": "x_project", "attributes": {"x_name": "港南"}}])

    def test_empty_and_error_responses(self):
        parse = load_parser()
        self.assertEqual(parse({"response": json.dumps({"Value": []})}), [])
        with self.assertRaises(RuntimeError):
            parse({"response": json.dumps({"Error": {"code": "SearchableEntityNotFound"}})})

    def test_never_patches_saved_queries(self):
        source = SCRIPT_PATH.read_text(encoding="utf-8")
        code = "\n".join(line for line in source.splitlines() if not line.lstrip().startswith("#"))
        self.assertNotIn("savedqueries(", code, "簡易検索ビューの更新は 400（0x80040216）になるため行わない")
        self.assertIn("SyncToExternalSearchIndex", code)


if __name__ == "__main__":
    sys.exit(unittest.main())
