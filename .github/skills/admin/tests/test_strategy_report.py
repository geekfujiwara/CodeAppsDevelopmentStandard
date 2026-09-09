import json
import subprocess
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import generate_strategy_report as report


class StrategyReportTests(unittest.TestCase):
    def test_all_embedded_scripts_parse(self):
        class Scripts(HTMLParser):
            def __init__(self):
                super().__init__()
                self.scripts = []
                self.active = False

            def handle_starttag(self, tag, attrs):
                self.active = tag == "script" and dict(attrs).get("type") != "application/json"
                if self.active:
                    self.scripts.append("")

            def handle_endtag(self, tag):
                if tag == "script":
                    self.active = False

            def handle_data(self, data):
                if self.active:
                    self.scripts[-1] += data

        parser = Scripts()
        parser.feed(report.render({}))
        self.assertEqual(len(parser.scripts), 3)
        subprocess.run(["node", "-e", "const vm=require('node:vm');for(const script of JSON.parse(require('node:fs').readFileSync(0,'utf8')))new vm.Script(script);"],
                       input=json.dumps(parser.scripts), text=True, check=True)

    def test_prompt_requires_decisions_and_preserves_scope(self):
        script = """
const assert = require('node:assert/strict');
require('node:vm').runInThisContext(require('node:fs').readFileSync(process.argv[1], 'utf8'));
const {buildPrompt} = globalThis.StrategyReview;
const report = {scan:{tenantId:'test'},findings:[{id:'one',title:'First'},{id:'two',title:'Second'},{id:'three',title:'Third'}]};
assert.equal(buildPrompt(report, {}, ''), '');
const prompt = buildPrompt(report, {one:{status:'ok',note:'limit <script> and ```'},two:{status:'skip'}}, 'additional');
assert(prompt.includes('First'));
assert(prompt.includes('Second'));
assert(!prompt.includes('Third'));
assert(prompt.includes('見送り: 変更しない'));
assert(prompt.includes('明示的な実行承認'));
assert(prompt.includes('additional'));
assert.equal(prompt.split('```').length, 3);
assert(buildPrompt(report, {one:{note:'question'}}, '').includes('未回答: 未承認'));
assert(buildPrompt(report, {}, 'free text').includes('free text'));
"""
        subprocess.run(["node", "-e", script, str(SCRIPTS / "strategy-review.js")], check=True)

    def test_routing_report_and_safe_payload(self):
        blueprint = json.loads(report.BLUEPRINT.read_text(encoding="utf-8"))
        scan = {"readOnly": True, "tenantId": "test", "routingRecommendation": {
            "targetGroup": {"displayName": "Personal"}, "rules": [{"changeRequired": True}],
            "legacyChange": {"changeRequired": False}}}
        payload = report.build_payload(scan, blueprint, None)
        self.assertEqual(payload["scope"], "routing-only")
        self.assertEqual(len(payload["findings"]), 1)
        self.assertIn("統一", payload["findings"][0]["title"])
        self.assertEqual(payload["findings"][0]["id"], report.build_payload(scan, blueprint, None)["findings"][0]["id"])
        payload["scan"]["tenantId"] = "</script><script>alert(1)</script>"
        self.assertNotIn(payload["scan"]["tenantId"], report.render(payload))


if __name__ == "__main__":
    unittest.main()