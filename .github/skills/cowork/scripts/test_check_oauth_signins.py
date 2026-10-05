from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "check_oauth_signins.py"
SPEC = importlib.util.spec_from_file_location("check_oauth_signins", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def row(error: int = 0, when: str = "2026-01-01T00:00:00Z") -> dict:
    return {"createdDateTime": when, "resourceDisplayName": "Dataverse", "conditionalAccessStatus": "notApplied",
            "status": {"errorCode": error}}


class CheckOauthSigninsTests(unittest.TestCase):
    def test_no_rows(self):
        self.assertEqual(MODULE.summarize([])["verdict"], "no-signins")

    def test_all_success_points_to_cowork_side(self):
        summary = MODULE.summarize([row(when="2026-01-01T00:00:00Z"), row(when="2026-01-02T00:00:00Z")])
        self.assertEqual(summary["verdict"], "tokens-ok")
        self.assertEqual(summary["succeeded"], 2)
        self.assertEqual(summary["latest"], "2026-01-02T00:00:00Z")
        self.assertEqual(summary["resources"], {"Dataverse": 2})

    def test_failures_are_listed_by_code(self):
        summary = MODULE.summarize([row(), row(error=53003), row(error=53003)])
        self.assertEqual(summary["verdict"], "token-failures")
        self.assertEqual(summary["errors"], {"AADSTS53003": 2})

    def test_every_verdict_has_guidance(self):
        self.assertEqual(set(MODULE.VERDICT_TEXT), {"no-signins", "token-failures", "tokens-ok"})


if __name__ == "__main__":
    unittest.main()
