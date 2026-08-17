"""deploy_security_role の権限定義と payload をローカルで検証する。"""

import ast
import pathlib
import types
import unittest


SCRIPT_PATH = pathlib.Path(__file__).with_name("deploy_security_role.py")


def load_test_targets(api_post):
    tree = ast.parse(SCRIPT_PATH.read_text(encoding="utf-8"))
    target_nodes = []
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id in {"TABLE_VERBS", "VALID_DEPTHS"}
            for target in node.targets
        ):
            target_nodes.append(node)
        if isinstance(node, ast.FunctionDef) and node.name in {
            "validate_role_definitions",
            "set_role_privileges",
        }:
            target_nodes.append(node)

    namespace = {
        "api_post": api_post,
        "requests": types.SimpleNamespace(HTTPError=FakeHttpError),
    }
    module = ast.Module(body=target_nodes, type_ignores=[])
    exec(compile(module, str(SCRIPT_PATH), "exec"), namespace)
    return namespace


class FakeHttpError(Exception):
    response = None


class DeploySecurityRoleTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.targets = load_test_targets(
            lambda path, body, include_solution=True: self.calls.append(
                (path, body, include_solution)
            )
        )

    def test_explicit_table_privilege_is_valid(self):
        self.targets["validate_role_definitions"]([
            {
                "name": "Feature User",
                "table_privileges": {"sample_Feature": {"Read": "Global"}},
            }
        ])

    def test_legacy_extra_privileges_key_is_rejected(self):
        with self.assertRaises(ValueError):
            self.targets["validate_role_definitions"]([
                {
                    "name": "Legacy User",
                    "table_privileges": {"sample_Feature": {"Read": "Global"}},
                    "extra_privileges": [],
                }
            ])

    def test_payload_contains_only_explicit_table_privileges(self):
        self.targets["set_role_privileges"](
            "role-id",
            {
                "name": "Feature User",
                "table_privileges": {
                    "sample_Feature": {"Read": "Global", "Write": None}
                },
            },
            [{"schema_name": "sample_Feature"}],
            {"sample_Feature": {"Read": "read-id", "Write": "write-id"}},
        )

        self.assertEqual(1, len(self.calls))
        self.assertTrue(self.calls[0][0].endswith("ReplacePrivilegesRole"))
        self.assertEqual(
            {"Privileges": [{"PrivilegeId": "read-id", "Depth": "Global"}]},
            self.calls[0][1],
        )

    def test_empty_resolved_privileges_are_rejected(self):
        with self.assertRaises(ValueError):
            self.targets["set_role_privileges"](
                "role-id",
                {
                    "name": "Feature User",
                    "table_privileges": {"sample_Feature": {"Read": None}},
                },
                [{"schema_name": "sample_Feature"}],
                {"sample_Feature": {"Read": "read-id"}},
            )

    def test_replace_failure_does_not_fall_back_to_add(self):
        calls = []

        def failing_api_post(path, body, include_solution=True):
            calls.append(path)
            raise FakeHttpError("replace failed")

        targets = load_test_targets(failing_api_post)
        with self.assertRaises(RuntimeError):
            targets["set_role_privileges"](
                "role-id",
                {
                    "name": "Feature User",
                    "table_privileges": {"sample_Feature": {"Read": "Global"}},
                },
                [{"schema_name": "sample_Feature"}],
                {"sample_Feature": {"Read": "read-id"}},
            )

        self.assertEqual(1, len(calls))
        self.assertTrue(calls[0].endswith("ReplacePrivilegesRole"))


if __name__ == "__main__":
    unittest.main()