"""customize_views_forms の FormXML コントロール生成をローカルで検証する。"""

import ast
import pathlib
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("customize_views_forms.py")


def load_test_targets():
    tree = ast.parse(SCRIPT_PATH.read_text(encoding="utf-8"))
    target_nodes = []
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name)
            and target.id in {"CLASSID_STANDARD", "CLASSID_LOOKUP"}
            for target in node.targets
        ):
            target_nodes.append(node)
        if isinstance(node, ast.FunctionDef) and node.name in {
            "new_guid",
            "_build_cell",
        }:
            target_nodes.append(node)

    namespace = {"uuid": __import__("uuid")}
    module = ast.Module(body=target_nodes, type_ignores=[])
    exec(compile(module, str(SCRIPT_PATH), "exec"), namespace)
    return namespace


class BuildCellClassidTests(unittest.TestCase):
    def setUp(self):
        self.targets = load_test_targets()

    def test_lookup_column_uses_lookup_classid(self):
        attr = {
            "logical_name": "new_relatedrecordid",
            "display_name": "Related Record",
            "is_lookup": True,
            "is_custom": True,
            "is_autonumber": False,
            "is_multiline": False,
        }
        cell_xml = self.targets["_build_cell"](attr, "account")
        self.assertIn(self.targets["CLASSID_LOOKUP"], cell_xml)
        self.assertNotIn(self.targets["CLASSID_STANDARD"], cell_xml)

    def test_standard_column_uses_standard_classid(self):
        attr = {
            "logical_name": "new_name",
            "display_name": "Name",
            "is_lookup": False,
            "is_custom": True,
            "is_autonumber": False,
            "is_multiline": False,
        }
        cell_xml = self.targets["_build_cell"](attr, "account")
        self.assertIn(self.targets["CLASSID_STANDARD"], cell_xml)
        self.assertNotIn(self.targets["CLASSID_LOOKUP"], cell_xml)


if __name__ == "__main__":
    unittest.main()
