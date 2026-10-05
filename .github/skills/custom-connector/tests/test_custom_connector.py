"""create_connection.py / deploy_connector.py の純粋関数のテスト（ネットワークを使わない）。

実行: python -m unittest discover -s .github/skills/custom-connector/tests -v
"""

import base64
import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL / "scripts"


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
    "mode": "consent",
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


class OboTest(unittest.TestCase):
    def _props(self, supported, enabled):
        return {"connectionParameters": {"token": {"type": "oauthSetting", "oAuthSettings": {
            "properties": {"IsOnbehalfofLoginSupported": supported},
            "customParameters": {"enableOnbehalfOfLogin": {"value": enabled}},
        }}}}

    def test_supports_obo_requires_both_flags(self):
        # 実測: サーバーは IsOnbehalfofLoginSupported を真偽値、enableOnbehalfOfLogin を文字列で返す
        self.assertTrue(cc.supports_obo(self._props(True, "true")))
        self.assertFalse(cc.supports_obo(self._props(True, "false")))
        self.assertFalse(cc.supports_obo(self._props(False, "true")))
        self.assertFalse(cc.supports_obo({"connectionParameters": {}}))

    def test_obo_plan_has_no_client_connection_name(self):
        cc.validate_plan({**PLAN, "mode": "obo", "connectionName": None})
        with self.assertRaises(ValueError):
            cc.validate_plan({**PLAN, "mode": "obo"})

    def test_consent_plan_requires_connection_name(self):
        with self.assertRaises(ValueError):
            cc.validate_plan({**PLAN, "mode": "consent", "connectionName": None})

    def test_rejects_unknown_mode(self):
        with self.assertRaises(ValueError):
            cc.validate_plan({**PLAN, "mode": "silent"})


class OboConflictTest(unittest.TestCase):
    RESOURCE = "-".join(["a" * 8, "b" * 4, "c" * 4, "d" * 4, "e" * 12])

    def _row(self, cid, enabled, resource=RESOURCE):
        params = {"token": {"oAuthSettings": {
            "properties": {"IsOnbehalfofLoginSupported": True, "AzureActiveDirectoryResourceId": resource},
            "customParameters": {"resourceUri": {"value": resource}, "enableOnbehalfOfLogin": {"value": "true" if enabled else "false"}},
        }}}
        return {"connectorid": cid, "displayname": f"c-{cid}", "connectionparameters": json.dumps(params)}

    def test_obo_settings_reads_rendered_template(self):
        props = json.loads((SKILL / "templates" / "oauth-api" / "connector" / "apiProperties.json").read_text(encoding="utf-8"))
        enabled, resource = dc.obo_settings(props)
        self.assertTrue(enabled)
        self.assertEqual(resource, "{{API_APP_ID}}")

    def test_detects_other_obo_connector_for_same_resource(self):
        rows = [self._row("a", True), self._row("b", False), self._row("c", True, resource="other")]
        self.assertEqual(dc.find_obo_conflicts(rows, self.RESOURCE, "own"), ["c-a（connectorid=a）"])

    def test_ignores_own_connector(self):
        self.assertEqual(dc.find_obo_conflicts([self._row("OWN", True)], self.RESOURCE, "own"), [])


class DescribeShapeTest(unittest.TestCase):
    def test_hides_values(self):
        shape = cc.describe_shape({"token": "secret-value", "n": 1, "items": [1, 2], "nested": {"a": "xy"}})
        self.assertEqual(shape, {"token": "str(12)", "n": "int", "items": "list[2]", "nested": {"a": "str(2)"}})
        self.assertNotIn("secret-value", str(shape))



TEMPLATES = SKILL / "templates"


def _public_definition(**over):
    d = json.loads((TEMPLATES / "public-site" / "connector" / "apiDefinition.swagger.json").read_text(encoding="utf-8-sig"))
    d = json.loads(dc.render(json.dumps(d), {"API_HOST": "example.com", "CONNECTOR_TITLE": "Example-Site", "PUBLISHER": "Example"}))
    d.update(over)
    return d


class PublicSiteConnectorTest(unittest.TestCase):
    """認証なし（公開サイト）のコネクタ: 作成前の検査と、接続の mode の判定"""

    def test_template_passes_and_is_no_auth(self):
        props = json.loads((TEMPLATES / "public-site" / "connector" / "apiProperties.json").read_text(encoding="utf-8-sig"))
        self.assertTrue(dc.validate_definition(_public_definition(), props))

    def test_title_must_be_alphanumeric(self):
        # pac はコネクタ名を info.title から作る。日本語・空白は「Connector name must be alphanumeric」で止まる
        for title in ("物件概要の取り込み", "Example Site", "-start", ""):
            with self.subTest(title=title), self.assertRaises(SystemExit):
                dc.validate_definition(_public_definition(info={"title": title}), {"properties": {"connectionParameters": {}}})
        oauth = json.loads((TEMPLATES / "oauth-api" / "connector" / "apiProperties.json").read_text(encoding="utf-8-sig"))
        self.assertFalse(dc.validate_definition(_public_definition(info={"title": "Example_API-2"}), oauth))

    def test_no_auth_is_https_get_only(self):
        props = {"properties": {"connectionParameters": {}}}
        with self.assertRaises(SystemExit):
            dc.validate_definition(_public_definition(schemes=["http", "https"]), props)
        with self.assertRaises(SystemExit):
            dc.validate_definition(_public_definition(host="https://example.com/x"), props)
        post = _public_definition()
        post["paths"]["/items/{id}/"]["post"] = {"operationId": "Write"}
        with self.assertRaises(SystemExit):
            dc.validate_definition(post, props)

    def test_non_json_response_must_be_default_only(self):
        # text/html を "200" で宣言すると、Code Apps の SDK が本文を JSON.parse して画面で必ず失敗する（troubleshooting #15）
        props = {"properties": {"connectionParameters": {}}}
        coded = _public_definition()
        coded["paths"]["/items/{id}/"]["get"]["responses"] = {"200": {"description": "HTML", "schema": {"type": "string"}}}
        with self.assertRaises(SystemExit):
            dc.validate_definition(coded, props)
        no_schema = _public_definition()
        no_schema["paths"]["/items/{id}/"]["get"]["responses"] = {"200": {"description": "HTML"}}
        with self.assertRaises(SystemExit):
            dc.validate_definition(no_schema, props)
        # JSON を返す操作は状態コードで宣言してよい
        as_json = _public_definition(produces=["application/json"])
        as_json["paths"]["/items/{id}/"]["get"]["responses"] = {"200": {"description": "JSON", "schema": {"type": "object"}}}
        self.assertTrue(dc.validate_definition(as_json, props))

    def test_requires_auth_and_noauth_plan(self):
        self.assertFalse(cc.requires_auth({"connectionParameters": {}}))
        self.assertTrue(cc.requires_auth({"connectionParameters": {"token": {"type": "oauthSetting"}}}))
        plan = {**PLAN, "mode": "noauth"}
        cc.validate_plan(plan)
        with self.assertRaises(ValueError):
            cc.validate_plan({**plan, "connectionName": None})

    def test_transient_errors(self):
        class SSLEOFError(Exception):
            pass

        class SSLError(Exception):
            pass

        wrapped = SSLError("outer")
        wrapped.__context__ = SSLEOFError("eof")
        self.assertTrue(cc.is_transient(wrapped))
        self.assertTrue(cc.is_transient(SSLEOFError("eof")))
        self.assertFalse(cc.is_transient(ValueError("bad")))

if __name__ == "__main__":
    unittest.main()
