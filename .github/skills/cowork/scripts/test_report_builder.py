from __future__ import annotations

import importlib.util
import json
import re
import sys
import tempfile
import uuid
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("report_builder", HERE / "report_builder.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
TEMPLATE = HERE.parent / "references" / "report-template.html"


def base() -> dict:
    """提案の見本（汎用）。個と本が混ざる発注の表と、参考の表。"""
    return {
        "title": "提案 10/30", "subtitle": "対象 A", "file_name": "提案_20261030.html", "conclusion": "項目 A と B を増やします。",
        "cards": [{"label": "追加", "total": "order", "tone": "up"}],
        "notes": ["データは架空です。"],
        "fetch": [{"name": "在庫", "expected": 3, "received": 3}],
        "tables": [
            {"id": "order", "title": "追加の提案", "kind": "order", "unit_key": "unit", "qty_key": "add", "lot_key": "lot", "max_qty": 200, "count_label": "品目",
             "empty_text": "追加する項目はありません。",
             "columns": [{"key": "name", "label": "項目"}, {"key": "unit", "label": "単位"}, {"key": "now", "label": "現状（08:30 時点）", "num": True},
                         {"key": "add", "label": "追加提案", "num": True}, {"key": "lot", "label": "単位数", "num": True}],
             "rows": [{"name": "項目 A", "unit": "個", "now": 18, "add": 6, "lot": 2},
                      {"name": "項目 B", "unit": "個", "now": 3, "add": 4, "lot": 2},
                      {"name": "項目 C", "unit": "本", "now": 2, "add": 4, "lot": 1}]},
            {"id": "prep", "title": "社内で用意する量（登録しない）", "kind": "prep", "unit_key": "unit",
             "columns": [{"key": "name", "label": "項目"}, {"key": "unit", "label": "単位"}, {"key": "qty", "label": "量", "num": True}],
             "rows": [{"name": "項目 D", "unit": "個", "qty": 10}]},
        ],
        "charts": [{"id": "now-add", "type": "stacked_hbar", "title": "項目別の現状と追加提案", "table": "order", "label_key": "name",
                    "note": "棒の合計は将来の見込みではありません。",
                    "series": [{"key": "now", "name": "現状（08:30 時点）"}, {"key": "add", "name": "追加提案"}]}],
    }


def build(data: dict) -> tuple[dict, Path]:
    out = Path(tempfile.mkdtemp())
    return MODULE.build(data, out, TEMPLATE), out


class ReportBuilderTest(unittest.TestCase):
    def test_normal_three_outputs_match(self) -> None:
        s, out = build(base())
        self.assertEqual(s["status"], "ok", s["errors"])
        self.assertEqual(s["consistency"], "ok")
        payload = json.loads((out / "render_payload.json").read_text(encoding="utf-8"))
        html = (out / "提案_20261030.html").read_text(encoding="utf-8")
        values = [v for c in payload["charts"] for i in range(len(c["categories"])) for v in (x["values"][i] for x in c["series"])]
        self.assertEqual([float(x) for x in re.findall(r'data-v="([-\d.]+)"', html)], [float(v) for v in values])
        self.assertNotIn("<script", html)

    def test_mixed_units_are_split(self) -> None:
        s, out = build(base())
        payload = json.loads((out / "render_payload.json").read_text(encoding="utf-8"))
        self.assertEqual([c["unit"] for c in payload["charts"]], ["個", "本"])
        self.assertEqual(s["tables"][0]["totals_by_unit"], {"個": 10, "本": 4})
        self.assertIn("3 品目・10 個・4 本", (out / "提案_20261030.html").read_text(encoding="utf-8"))

    def test_zero_rows_skip_chart(self) -> None:
        d = base()
        d["tables"][0]["rows"] = []
        s, out = build(d)
        self.assertEqual(s["status"], "ok")
        self.assertEqual(json.loads((out / "render_payload.json").read_text(encoding="utf-8"))["charts"], [])
        self.assertIn("追加する項目はありません。", (out / "fallback.md").read_text(encoding="utf-8"))

    def test_shortfall_stops(self) -> None:
        d = base()
        d["fetch"][0]["received"] = 2
        s, _ = build(d)
        self.assertEqual(s["status"], "ng")
        self.assertTrue(any("取得不足" in e for e in s["errors"]))

    def test_missing_unit_lot_and_limit(self) -> None:
        d = base()
        del d["tables"][0]["rows"][2]["unit"]
        d["tables"][0]["rows"][0]["add"] = 5
        d["tables"][0]["rows"][1]["add"] = 202
        errors = "\n".join(build(d)[0]["errors"])
        self.assertIn("単位がありません", errors)
        self.assertIn("倍数ではありません", errors)
        self.assertIn("上限 200", errors)

    def test_internal_ids_rejected(self) -> None:
        for mutate in (
            lambda d: d["notes"].append("元のテーブル: cr123_order"),
            lambda d: d["notes"].append(str(uuid.uuid4())),  # レコード ID の形
            lambda d: d["tables"][0]["columns"].insert(0, {"key": "sku", "label": "商品コード"}),
        ):
            d = base()
            mutate(d)
            self.assertEqual(build(d)[0]["status"], "ng")

    def test_prep_is_not_counted_or_charted(self) -> None:
        d = base()
        d["charts"].append({"id": "p", "type": "grouped_bar", "title": "量", "table": "prep", "label_key": "name", "series": [{"key": "qty", "name": "量"}]})
        self.assertTrue(any("kind: prep" in e for e in build(d)[0]["errors"]))
        self.assertEqual(build(base())[0]["tables"][1]["totals_by_unit"], {})

    def test_text_in_data_is_escaped(self) -> None:
        d = base()
        d["tables"][0]["rows"][0]["name"] = "<script>alert(1)</script>"
        s, out = build(d)
        html = (out / "提案_20261030.html").read_text(encoding="utf-8")
        self.assertNotIn("<script>alert", html)
        self.assertIn("&lt;script&gt;", html)

    def test_aggregate_counts_from_rows(self) -> None:
        d = {
            "title": "やること", "file_name": "やること_20261030.html", "conclusion": "今日は 2 件。",
            "tables": [{"id": "tasks", "title": "やること", "kind": "info",
                        "columns": [{"key": "owner", "label": "担当"}, {"key": "due", "label": "期限の区分"}, {"key": "what", "label": "やること"}],
                        "rows": [{"owner": "A", "due": "今日中", "what": "x"}, {"owner": "A", "due": "今週中", "what": "y"}, {"owner": "B", "due": "今日中", "what": "z"}]}],
            "charts": [{"id": "by-owner", "type": "stacked_hbar", "title": "担当ごとのやること", "note": "1 件 = やること 1 つ", "table": "tasks",
                        "aggregate": {"group_key": "owner", "series_key": "due", "unit": "件"},
                        "series": [{"name": "今日中", "match": "今日中"}, {"name": "今週中", "match": "今週中"}]}],
        }
        s, out = build(d)
        self.assertEqual(s["status"], "ok", s["errors"])
        c = json.loads((out / "render_payload.json").read_text(encoding="utf-8"))["charts"][0]
        self.assertEqual((c["categories"], [x["values"] for x in c["series"]]), (["A", "B"], [[1, 1], [1, 0]]))


if __name__ == "__main__":
    unittest.main()
