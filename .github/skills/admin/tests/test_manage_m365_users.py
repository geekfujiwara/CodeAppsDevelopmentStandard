from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "manage_m365_users.py"
SPEC = importlib.util.spec_from_file_location("manage_m365_users", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ManageM365UsersTests(unittest.TestCase):
    def test_plan_hash_is_order_independent(self):
        left = {"method": "PATCH", "body": {"accountEnabled": False}, "path": "/users/example"}
        right = {"path": "/users/example", "body": {"accountEnabled": False}, "method": "PATCH"}

        self.assertEqual(MODULE.canonical_hash(left), MODULE.canonical_hash(right))

    def test_redact_removes_nested_passwords(self):
        body = {"passwordProfile": {"password": "not-for-output"}, "displayName": "Example"}

        redacted = MODULE.redact(body)

        self.assertEqual(redacted["passwordProfile"]["password"], "<redacted>")
        self.assertEqual(redacted["displayName"], "Example")


if __name__ == "__main__":
    unittest.main()