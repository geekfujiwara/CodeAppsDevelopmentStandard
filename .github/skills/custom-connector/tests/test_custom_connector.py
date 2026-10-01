"""create_connection.py / deploy_connector.py の純粋関数のテスト（ネットワークを使わない）。

実行: python -m unittest discover -s .github/skills/custom-connector/tests -v
"""

import base64
import copy
import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


cc = _load("create_connection")
dc = _load("deploy_connector")

# 実 GUID と取り違えないよう、桁ごとの並びから組み立てる
ENV = "-".join(["0" * 8, "1" * 4, "2" * 4, "3" * 4, "4" * 10 + "55"])
PLAN = {
    "contractVersion": cc.CONTRACT_VERSION,
    "environment": ENV,
    "host": "https://000000001111222233334444444444.55.environment.api.powerplatform.com",
    "connector": "shared_new-5fexample-20api-5f0123456789abcdef",
    "connectionName": "0123456789abcdef0123456789abcdef",
    "displayName": "Example connection",
    "redirectPort": 53682,
    "connectionReference": "pfx_connref_example",
}


class EnvironmentHostTest(unittest.TestCase):
    def test_inserts_dot_before_last_two_characters(self):
        # 実測した規則: ハイフンを除いた 32 文字の末尾 2 文字の前に . を入れる
        self.assertEqual(cc.environment_host(ENV), PLAN["host"])

    def test_rejects_non_guid(self):
        with self.assertRaises(ValueError):
            cc.environment_host("Default-" + ENV)


class PlanTest(unittest.TestCase):
    def test_valid_plan(self):
        cc.validate_plan(copy.deepcopy(PLAN))

    def test_hash_is_stable_and_detects_change(self):
        h = cc.canonical_hash(PLAN)
        reordered = dict(reversed(list(PLAN.items())))
        self.assertEqual(h, cc.canonical_hash(reordered))
        changed = {**PLAN, "displayName": "Other"}
        self.assertNotEqual(h, cc.canonical_hash(changed))

    def test_rejects_unknown_or_missing_keys(self):
        with self.assertRaises(ValueError):
            cc.validate_plan({**PLAN, "extra": 1})
        partial = dict(PLAN)
        partial.pop("redirectPort")
        with self.assertRaises(ValueError):
            cc.validate_plan(partial)

    def test_rejects_host_drift(self):
        with self.assertRaises(ValueError):
            cc.validate_plan({**PLAN, "host": "https://evil.example.com"})

    def test_rejects_contract_drift(self):
        with self.assertRaises(ValueError):
            cc.validate_plan({**PLAN, "contractVersion": "2000-01-01"})

    def test_rejects_bad_values(self):
        for key, value in [
            ("connector", "not-shared"),
            ("connectionName", "ABC"),
            ("displayName", ""),
            ("displayName", "line\nbreak"),
            ("redirectPort", 80),
            ("redirectPort", True),
            ("connectionReference", "has-hyphen"),
        ]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                cc.validate_plan({**PLAN, key: value})

    def test_connection_reference_is_optional(self):
        cc.validate_plan({**PLAN, "connectionReference": None})


class ConsentTest(unittest.TestCase):
    def test_decodes_base64_error(self):
        text = "Failure passed to redirect url.\r\nerror=invalid_request\r\nerror_description=AADSTS90008: ..."
        encoded = base64.b64encode(text.encode()).decode().rstrip("=")
        self.assertIn("AADSTS90008", cc.decode_consent_error(encoded))

    def test_returns_plain_error_as_is(self):
        self.assertEqual(cc.decode_consent_error("access_denied"), "access_denied")


class ConnectionStatusTest(unittest.TestCase):
    def _conn(self, name, status):
        return {"name": name, "properties": {"statuses": [{"status": status}]}}

    def test_status(self):
        self.assertEqual(cc.connection_status(self._conn("a", "Connected")), "Connected")
        self.assertEqual(cc.connection_status({"name": "a", "properties": {}}), "Unknown")
        self.assertEqual(cc.connection_status(None), "Missing")

    def test_new_connected_ignores_existing_and_unauthenticated(self):
        before = [self._conn("old", "Connected")]
        after = before + [self._conn("pending", "Error"), self._conn("new", "Connected")]
        self.assertEqual([c["name"] for c in cc.new_connected(before, after)], ["new"])


class DeployConnectorTest(unittest.TestCase):
    def test_render_replaces_and_detects_missing(self):
        self.assertEqual(dc.render('{"h":"{{FUNCTION_HOST}}"}', {"FUNCTION_HOST": "x.example.net"}), '{"h":"x.example.net"}')
        with self.assertRaises(SystemExit):
            dc.render("{{FUNCTION_HOST}} {{UNKNOWN}}", {"FUNCTION_HOST": "x"})

    def test_parse_vars(self):
        self.assertEqual(dc.parse_vars(["A_B=1", "TITLE=Hello = World"]), {"A_B": "1", "TITLE": "Hello = World"})
        with self.assertRaises(SystemExit):
            dc.parse_vars(["lower=1"])

    def test_redirect_uri_for(self):
        # 実測した規則: connectorinternalid から shared_ を除いた値がリダイレクト URI の末尾になる
        self.assertEqual(
            dc.redirect_uri_for("shared_new-5fexample-5f0123"),
            "https://global.consent.azure-apim.net/redirect/new-5fexample-5f0123",
        )
        with self.assertRaises(SystemExit):
            dc.redirect_uri_for("new-5fexample")

    def test_inject_secret_requires_aad(self):
        props = {"properties": {"connectionParameters": {"token": {"oAuthSettings": {"identityProvider": "aad"}}}}}
        out = dc.inject_secret(props, {"clientSecret": "s"})
        self.assertEqual(out["properties"]["connectionParameters"]["token"]["oAuthSettings"]["clientSecret"], "s")
        props["properties"]["connectionParameters"]["token"]["oAuthSettings"]["identityProvider"] = "oauth2generic"
        with self.assertRaises(SystemExit):
            dc.inject_secret(props, {"clientSecret": "s"})


if __name__ == "__main__":
    unittest.main()
