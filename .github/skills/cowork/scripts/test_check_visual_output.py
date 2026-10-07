from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "check_visual_output.py"
SPEC = importlib.util.spec_from_file_location("check_visual_output", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE  # dataclass が自分のモジュールを sys.modules から引くため
SPEC.loader.exec_module(MODULE)

GOOD = """---
name: {name}
---
# 提案

## 結果の出し方（毎回・省略しない）

1. 回答の先頭に文字の棒グラフ。Python を実行できるときは PNG も追加で作る。
2. HTML レポートを出力フォルダーに作る。

## ワークフロー

````
## 提案

```
項目 A  ████  4
```

📄 レポート: 提案_20261030.html（出力フォルダー）
````

### 返す前の確認（毎回）

- [ ] グラフ・表・レポートがそろっている
"""

TEMPLATE_OK = '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body><div class="bar"><b style="width:50%"></b></div></body></html>'


def make(root: Path, name: str, text: str, html: str | None = TEMPLATE_OK) -> None:
    d = root / name
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(text.format(name=name) if "{name}" in text else text, encoding="utf-8")
    if html is not None:
        (d / "report-template.html").write_text(html, encoding="utf-8")


class CheckVisualOutputTest(unittest.TestCase):
    def run_check(self, setup) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            setup(root)
            return [f.message for f in MODULE.check(root)]

    def test_good_skill_passes(self) -> None:
        self.assertEqual(self.run_check(lambda r: make(r, "proposal", GOOD)), [])

    def test_skill_without_visual_output_is_ignored(self) -> None:
        self.assertEqual(self.run_check(lambda r: make(r, "mail", "---\nname: mail\n---\n# メール\n手順だけ。\n", html=None)), [])

    def test_script_in_template_fails(self) -> None:
        msgs = self.run_check(lambda r: make(r, "proposal", GOOD, html=TEMPLATE_OK.replace("</body>", "<script>draw()</script></body>")))
        self.assertTrue(any("<script>" in m for m in msgs), msgs)

    def test_external_load_in_template_fails(self) -> None:
        msgs = self.run_check(lambda r: make(r, "proposal", GOOD, html=TEMPLATE_OK.replace("<head>", '<head><link rel="stylesheet" href="https://cdn.example/x.css">')))
        self.assertTrue(any("外部" in m for m in msgs), msgs)

    def test_missing_check_section_fails(self) -> None:
        msgs = self.run_check(lambda r: make(r, "proposal", GOOD.replace("### 返す前の確認（毎回）", "### 補足")))
        self.assertTrue(any("返す前の確認" in m for m in msgs), msgs)

    def test_template_without_report_line_or_chart_fails(self) -> None:
        text = GOOD.replace("📄 レポート: 提案_20261030.html（出力フォルダー）", "以上").replace("項目 A  ████  4", "| 項目 | 数 |")
        msgs = self.run_check(lambda r: make(r, "proposal", text))
        self.assertTrue(any("ファイル名の行" in m for m in msgs), msgs)
        self.assertTrue(any("グラフの例" in m for m in msgs), msgs)

    def test_reference_to_other_skill_section_fails(self) -> None:
        # 2026-10-07 の実例: 「作り方は <別のスキル> の「グラフとレポートの作り方」と同じ」
        text = GOOD.replace("2. HTML レポート", "2. グラフの作り方は proposal の「グラフとレポートの作り方」と同じ。HTML レポート")

        def setup(root: Path) -> None:
            make(root, "proposal", GOOD)
            make(root, "weekly", text)

        msgs = self.run_check(setup)
        self.assertTrue(any("ほかのスキル（proposal）" in m for m in msgs), msgs)

    def test_conditional_wording_fails(self) -> None:
        # 2026-10-07 の実例: 「コードを実行できるなら…グラフの PNG」「画像を作れないときは文字の横棒」
        text = GOOD.replace("1. 回答の先頭に文字の棒グラフ。", "1. コードを実行できるなら、グラフの PNG を作る。画像を作れないときは文字の横棒。")
        msgs = self.run_check(lambda r: make(r, "proposal", text))
        self.assertGreaterEqual(sum("条件付き" in m for m in msgs), 1, msgs)

    def test_main_exit_codes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make(root, "proposal", GOOD)
            self.assertEqual(MODULE.main(["--skills", str(root)]), 0)
            make(root, "weekly", GOOD.replace("### 返す前の確認（毎回）", "### 補足"))
            self.assertEqual(MODULE.main(["--skills", str(root)]), 1)

RULES = (Path(__file__).resolve().parent.parent / "references" / "display-rules.md").read_text(encoding="utf-8")

PROPOSAL = """---
name: {name}
description: |
  目標とパイプラインから、優先する商談の打ち手を提案するスキル。
---
# 提案

<!-- include: display-rules.md -->

## このスキルのグラフ

| 図 | 種類 | 元の表 |
|---|---|---|
| 目標達成の見通し | `stacked_hbar` | `summary` |

## ワークフロー

````
## プラン

〔Render UI の図: 目標達成の見通し（円）〕

📄 レポート: プラン_20261030.html（出力フォルダー）
````

### このスキルの確認（返す前・毎回）

- [ ] 提案だけでは登録しない
"""


def make_proposal(root: Path, name: str, text: str = PROPOSAL, builder: bool = True, inject: bool = True) -> None:
    d = root / name
    (d / "scripts").mkdir(parents=True)
    body = text.format(name=name)
    if inject:
        body = body.replace("<!-- include: display-rules.md -->", RULES)
    (d / "SKILL.md").write_text(body, encoding="utf-8")
    if builder:
        (d / "scripts" / "report_builder.py").write_text("# stub", encoding="utf-8")
        (d / "scripts" / "report-template.html").write_text(TEMPLATE_OK, encoding="utf-8")


class RenderUiStandardTest(unittest.TestCase):
    def run_check(self, setup) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            setup(root)
            return [f.message for f in MODULE.check(root)]

    def test_proposal_skill_with_shared_rules_passes(self) -> None:
        self.assertEqual(self.run_check(lambda r: make_proposal(r, "target-gap-planner")), [])

    def test_proposal_skill_without_visual_output_fails(self) -> None:
        bare = "---\nname: plan\ndescription: |\n  打ち手を提案するスキル。\n---\n# 提案\n手順だけ。\n"
        msgs = self.run_check(lambda r: make(r, "plan", bare, html=None))
        self.assertTrue(any("提案するスキルなのに" in m for m in msgs), msgs)

    def test_missing_render_ui_steps_fail(self) -> None:
        # 共通ルールを差し込まず、Render UI の名前だけ書いたスキル
        text = PROPOSAL.replace("<!-- include: display-rules.md -->", "## 結果の出し方\n\nRender UI でグラフを出す。\n\n```\n項目 A  ████  4\n```\n\n### 返す前の確認（毎回）\n- [ ] そろっている\n")
        msgs = self.run_check(lambda r: make_proposal(r, "plan", text, inject=False))
        joined = "\n".join(msgs)
        self.assertIn("Render UI）の手順が欠けている", joined)
        for step in ("正式な色", "1 回だけ", "文字のグラフと表に切り替える", "成功と書かない"):
            self.assertIn(step, joined)

    def test_unreplaced_include_fails(self) -> None:
        msgs = self.run_check(lambda r: make_proposal(r, "plan", inject=False))
        self.assertTrue(any("置き換えられていない" in m for m in msgs), msgs)

    def test_missing_builder_fails(self) -> None:
        msgs = self.run_check(lambda r: make_proposal(r, "plan", builder=False))
        self.assertTrue(any("report_builder.py が無い" in m for m in msgs), msgs)

    def test_missing_chart_spec_fails(self) -> None:
        text = PROPOSAL.replace("`stacked_hbar`", "横棒")
        msgs = self.run_check(lambda r: make_proposal(r, "plan", text))
        self.assertTrue(any("このスキルのグラフ" in m for m in msgs), msgs)



if __name__ == "__main__":
    unittest.main()
