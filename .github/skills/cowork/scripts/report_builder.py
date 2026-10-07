"""Cowork スキルの結果（チャットのグラフ・表・HTML レポート）を、1 つの計算結果から作る（cowork スキル同梱。スキルの scripts/ に置く）。

  python report_builder.py results.json --out <出力フォルダー> [--template report-template.html]

入力 results.json（スキルが read_query の結果から作る。数字はここにだけ書く）:
  title / subtitle / file_name / conclusion / cards / conditions / reasoning / notes
  fetch   : [{"name": "<データの名前>", "expected": <COUNT の件数>, "received": <読めた行数>}]  … 件数の照合
  tables  : [{"id", "title", "kind": "order|prep|info", "unit_key", "qty_key", "lot_key",
              "max_qty", "count_label", "columns": [{"key", "label", "num"}], "rows": [...], "empty_text"}]
            kind: order = 発注・登録する数量の表（qty_key 必須。lot_key の倍数・max_qty 以下を検査）
                  prep  = 発注・登録の数に数えない数量の表（例: 仕込み・社内の移動）。グラフにしない
                  info  = 参考の数字（根拠・集計・一覧）
  charts  : [{"id", "type": "stacked_hbar|grouped_bar", "title", "note", "table",
              "label_key", "series": [{"key", "name"}]}]
            明細の表を集計して描くときは label_key / series[].key の代わりに
              "aggregate": {"group_key": "category", "series_key": "slot", "value_key": "qty"}  … value_key を省くと件数
              "series": [{"name": "夕方便", "match": "夕方便"}, ...]
            を書く（集計は report_builder.py が行うので、明細とグラフの数字がずれない）。
  cards[].total に表の id を書くと「n 品目・30 個・4 本」のように単位ごとの合計を入れる（「品目」は表の count_label。既定は「件」）。

出力（--out）:
  <file_name>          保存・印刷・共有用の HTML（スクリプトなし・外部読み込みなし）
  render_payload.json  チャットのグラフ（Render UI に写す元。単位ごとに分けた図）
  fallback.md          Render UI で表示できないときの文字のグラフと表
  summary.json         検査結果（status・errors・warnings・合計・3 つの出力の数値照合）
標準出力にも summary.json を出す。終了コード 0 = ok / 1 = ng（ng のときはグラフもレポートも出さない）
"""
from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

CHART_TYPES = {"stacked_hbar", "grouped_bar"}
TABLE_KINDS = {"order", "prep", "info"}
TEXT_MARKS = ["█", "▒", "░", "▓"]
TEXT_MAX = 30  # 文字のグラフの最大の長さ
GUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
# Dataverse のテーブル名・列名（<接頭辞>_<名前>）や OData の注釈。保存用レポートに出さない
LOGICAL_NAME = re.compile(r"(?<![A-Za-z0-9_])[a-z][a-z0-9]{1,7}_[a-z][a-z0-9_]*(?![A-Za-z0-9_])|@odata|_value\b")
EXTRA_CSS = """
  .bars .bar.stack { gap:0; }
  .bars .bar.stack span { margin-left:6px; }
  .unit { color:var(--muted); font-size:.85rem; }
"""
FALLBACK_CSS = """
  :root { --accent:#0E7C66; --muted:#5B6770; --line:#D9E2E7; --bg:#F6F8F9; --ink:#1F2933; }
  body { margin:0; font-family:"Segoe UI","Yu Gothic UI","Meiryo",sans-serif; color:var(--ink); background:var(--bg); line-height:1.7; }
  header { background:var(--accent); color:#fff; padding:24px 28px; } main { max-width:1080px; margin:0 auto; padding:20px; }
  section { background:#fff; border:1px solid var(--line); border-radius:12px; padding:18px 22px; margin:0 0 16px; }
  table { width:100%; border-collapse:collapse; } th, td { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; }
  td.num, th.num { text-align:right; } .cards { display:flex; gap:12px; flex-wrap:wrap; } .card { background:#E3F4EF; border-radius:10px; padding:12px 14px; }
  .legend { display:flex; gap:14px; color:var(--muted); font-size:.85rem; } .legend i { display:inline-block; width:12px; height:12px; margin-right:5px; }
  .bars { display:grid; grid-template-columns:minmax(90px,170px) 1fr; gap:3px 10px; align-items:center; font-size:.88rem; }
  .bars .lbl { text-align:right; } .bars .grp { display:grid; gap:2px; } .bars .bar { display:flex; align-items:center; gap:6px; }
  .bars .bar b { display:block; height:13px; min-width:2px; border-radius:3px; }
  .s1 { background:#0E7C66; } .s2 { background:#F59E0B; } .s3 { background:#1D4ED8; } .s4 { background:#9CA3AF; }
"""


def fmt(v) -> str:
    if v is None:
        return "―"
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, (int, float)):
        if float(v).is_integer():
            return f"{int(v):,}"
        return f"{v:,.1f}"
    return str(v)


def raw(v) -> str:
    """属性に書く数（8 と 8.0 を同じ書き方にする）。"""
    return str(int(v)) if float(v).is_integer() else repr(float(v))


def width(text: str) -> int:
    return sum(2 if unicodedata.east_asian_width(c) in ("F", "W") else 1 for c in text)


def pad(text: str, w: int) -> str:
    return text + " " * max(0, w - width(text))


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


class Builder:
    def __init__(self, data: dict):
        self.d = data
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.tables = {t.get("id"): t for t in data.get("tables", [])}

    # ---------- 検査 ----------
    def check(self) -> None:
        d = self.d
        for key in ("title", "file_name", "conclusion"):
            if not d.get(key):
                self.errors.append(f"{key} がありません")
        if d.get("file_name") and not str(d["file_name"]).endswith(".html"):
            self.errors.append("file_name は .html で終える")
        for f in d.get("fetch", []):
            exp, got = f.get("expected"), f.get("received")
            if not (is_num(exp) and is_num(got)):
                self.errors.append(f"取得件数が数字ではありません: {f.get('name')}")
            elif got < exp:
                self.errors.append(f"取得不足: {f.get('name')} {fmt(got)}/{fmt(exp)} 件。続き（キーより後）を読んでから作り直す。読めなければ足りない件数を報告して止める")
            elif got > exp:
                self.errors.append(f"件数が合いません: {f.get('name')} は {fmt(exp)} 件のはずが {fmt(got)} 件。重複して読んでいないか確かめる")
        for t in d.get("tables", []):
            self.check_table(t)
        for c in d.get("charts", []):
            self.check_chart(c)
        for t in d.get("tables", []):
            for col in t.get("columns", []):
                if col.get("key") in ("sku", "id") or "コード" in str(col.get("label", "")) or "ID" in str(col.get("label", "")):
                    self.errors.append(f"表 {t.get('id')}: 列「{col.get('label')}」は内部の識別子。保存用レポートには名前（品名・案件名など）を書き、この列は columns に入れない")
        for card in d.get("cards", []):
            if card.get("total") and card["total"] not in self.tables:
                self.errors.append(f"カードの total が表にありません: {card['total']}")
        for text in self.display_texts():
            if GUID.search(text) or LOGICAL_NAME.search(text):
                self.errors.append(f"内部識別子（レコード ID・テーブル名・列名）が表示する文字に入っています: 「{text[:40]}」。名前（品名・案件名など）にする")

    def check_table(self, t: dict) -> None:
        tid = t.get("id")
        kind = t.get("kind", "info")
        if kind not in TABLE_KINDS:
            self.errors.append(f"表 {tid}: kind は order / prep / info のどれか")
        keys = {c["key"]: c for c in t.get("columns", [])}
        unit_key = t.get("unit_key")
        if unit_key and unit_key not in keys:
            self.errors.append(f"表 {tid}: unit_key の列 {unit_key} が columns にありません（単位は表に見せる）")
        if kind == "order" and not t.get("qty_key"):
            self.errors.append(f"表 {tid}: 発注・登録の表（kind: order）には qty_key（数量の列）が要ります")
        if kind == "order" and not unit_key:
            self.errors.append(f"表 {tid}: 発注・登録の表（kind: order）には unit_key（単位）が要ります")
        if kind == "prep" and t.get("qty_key"):
            self.errors.append(f"表 {tid}: kind: prep の表に qty_key を付けない（仕込みなどの量を発注・登録の数に数えない）")
        for i, r in enumerate(t.get("rows", []), 1):
            if unit_key and not str(r.get(unit_key) or "").strip():
                self.errors.append(f"表 {tid} の {i} 行目: 単位がありません（個・本・パック・円・件など。データの単位の列を読む。推測で決めない）")
            for k, c in keys.items():
                if c.get("num") and r.get(k) is not None and not is_num(r.get(k)):
                    self.errors.append(f"表 {tid} の {i} 行目: {c['label']} が数字ではありません")
            if kind == "order":
                q = r.get(t["qty_key"]) if t.get("qty_key") else None
                if not is_num(q) or q < 0:
                    self.errors.append(f"表 {tid} の {i} 行目: 数量が 0 以上の数字ではありません")
                    continue
                lot = r.get(t.get("lot_key")) if t.get("lot_key") else None
                if is_num(lot) and lot > 0 and q % lot != 0:
                    self.errors.append(f"表 {tid} の {i} 行目: 数量 {fmt(q)} が単位数 {fmt(lot)} の倍数ではありません")
                mx = t.get("max_qty")
                if is_num(mx) and q > mx:
                    self.errors.append(f"表 {tid} の {i} 行目: 数量 {fmt(q)} が上限 {fmt(mx)} を超えています")

    def check_chart(self, c: dict) -> None:
        cid = c.get("id")
        if c.get("type") not in CHART_TYPES:
            self.errors.append(f"グラフ {cid}: type は stacked_hbar / grouped_bar のどれか")
        t = self.tables.get(c.get("table"))
        if not t:
            self.errors.append(f"グラフ {cid}: 表 {c.get('table')} がありません（グラフは表の数字から作る）")
            return
        if t.get("kind") == "prep":
            self.errors.append(f"グラフ {cid}: kind: prep の表はグラフにしない（発注・登録の数と混同させない）")
        cols = {col["key"]: col for col in t.get("columns", [])}
        agg = c.get("aggregate")
        if agg:
            for k in ("group_key", "series_key"):
                if agg.get(k) not in cols:
                    self.errors.append(f"グラフ {cid}: aggregate.{k} の列が表にありません")
            if agg.get("value_key") and (agg["value_key"] not in cols or not cols[agg["value_key"]].get("num")):
                self.errors.append(f"グラフ {cid}: aggregate.value_key が表の数字の列にありません")
            for s in c.get("series", []):
                if "match" not in s:
                    self.errors.append(f"グラフ {cid}: 集計のグラフの系列 {s.get('name')} に match（どの値を数えるか）がありません")
            values = {str(r.get(agg.get("series_key"))) for r in t.get("rows", [])}
            unknown = values - {str(s.get("match")) for s in c.get("series", [])}
            if unknown:
                self.errors.append(f"グラフ {cid}: 系列に無い値があります（数え漏れになる）: {'・'.join(sorted(unknown))}")
        else:
            for s in c.get("series", []):
                if s.get("key") not in cols or not cols[s["key"]].get("num"):
                    self.errors.append(f"グラフ {cid}: 系列 {s.get('name')} の列 {s.get('key')} が表の数字の列にありません")
            if c.get("label_key") not in cols:
                self.errors.append(f"グラフ {cid}: label_key の列が表にありません")
        if not t.get("unit_key") and not (agg and agg.get("unit")):
            self.errors.append(f"グラフ {cid}: 表 {t.get('id')} に単位の列がありません（グラフには単位を付ける）")
        if c.get("type") == "stacked_hbar" and not c.get("note"):
            self.errors.append(f"グラフ {cid}: 積み上げのグラフには note（棒の合計が何を表し、何を表さないか）を書く")

    def display_texts(self):
        d = self.d
        for key in ("title", "subtitle", "conclusion"):
            if d.get(key):
                yield str(d[key])
        for card in d.get("cards", []):
            yield str(card.get("label", ""))
            yield str(card.get("value", ""))
        for row in d.get("conditions", []):
            yield from (str(row.get(k, "")) for k in ("item", "content", "effect"))
        for row in d.get("reasoning", []):
            yield from (str(row.get(k, "")) for k in ("rule", "summary", "applied"))
        yield from (str(n) for n in d.get("notes", []))
        for t in d.get("tables", []):
            yield str(t.get("title", ""))
            yield str(t.get("empty_text", ""))
            for col in t.get("columns", []):
                yield str(col.get("label", ""))
            for r in t.get("rows", []):
                for col in t.get("columns", []):
                    v = r.get(col["key"])
                    if isinstance(v, str):
                        yield v
        for c in d.get("charts", []):
            yield str(c.get("title", ""))
            yield str(c.get("note", ""))
            for s in c.get("series", []):
                yield str(s.get("name", ""))

    # ---------- 計算 ----------
    def totals_by_unit(self, t: dict) -> dict[str, float]:
        out: dict[str, float] = {}
        qk, uk = t.get("qty_key"), t.get("unit_key")
        if not qk or not uk:
            return out
        for r in t.get("rows", []):
            q = r.get(qk)
            if is_num(q) and q > 0:
                out[str(r[uk])] = out.get(str(r[uk]), 0) + q
        return out

    def total_text(self, t: dict) -> str:
        tot = self.totals_by_unit(t)
        n = sum(1 for r in t.get("rows", []) if is_num(r.get(t.get("qty_key"))) and r[t["qty_key"]] > 0)
        label = t.get("count_label", "件")
        return f"{n} {label}・" + "・".join(f"{fmt(v)} {u}" for u, v in tot.items()) if tot else f"0 {label}"

    def charts(self) -> list[dict]:
        """表の数字から、単位ごとに分けた図を作る（単位の違う数を 1 つの軸に載せない）。"""
        out: list[dict] = []
        for c in self.d.get("charts", []):
            t = self.tables[c["table"]]
            if c.get("aggregate"):
                c, rows, uk = self.aggregate(c, t)
            else:
                uk = t["unit_key"]
                rows = [r for r in t.get("rows", []) if all(is_num(r.get(s["key"])) for s in c["series"])]
            if not rows:
                self.warnings.append(f"データ 0 件: {c['title']}（グラフは出さず「{t.get('empty_text') or '該当なし'}」と書く）")
                continue
            units: list[str] = []
            for r in rows:
                if str(r[uk]) not in units:
                    units.append(str(r[uk]))
            if len(units) > 1:
                self.warnings.append(f"単位混在: {c['title']} は {'・'.join(units)} に分けて表示（同じ軸に載せない）")
            for u in units:
                part = [r for r in rows if str(r[uk]) == u]
                out.append({
                    "id": c["id"] if len(units) == 1 else f"{c['id']}-{units.index(u) + 1}",
                    "type": c["type"],
                    "title": c["title"] if len(units) == 1 else f"{c['title']}（{u}）",
                    "unit": u,
                    "note": c.get("note", ""),
                    "categories": [str(r[c["label_key"]]) for r in part],
                    "series": [{"name": s["name"], "values": [r[s["key"]] for r in part]} for s in c["series"]],
                })
        return out

    def aggregate(self, c: dict, t: dict):
        """明細の行を group_key × 単位 ごとに、series_key の値で分けて合計（value_key が無ければ件数）する。"""
        agg = c["aggregate"]
        uk = t.get("unit_key")
        fixed_unit = agg.get("unit")
        groups: dict[tuple, dict] = {}
        for r in t.get("rows", []):
            unit = fixed_unit or str(r.get(uk))
            key = (str(r.get(agg["group_key"])), unit)
            g = groups.setdefault(key, {"__label": key[0], "__unit": unit, **{f"__s{i}": 0 for i in range(len(c["series"]))}})
            for i, s in enumerate(c["series"]):
                if str(r.get(agg["series_key"])) == str(s["match"]):
                    g[f"__s{i}"] += r.get(agg["value_key"], 0) if agg.get("value_key") else 1
        rows = list(groups.values())
        chart = {**c, "label_key": "__label", "series": [{"name": s["name"], "key": f"__s{i}"} for i, s in enumerate(c["series"])]}
        return chart, rows, "__unit"

    # ---------- 出力 ----------
    def text_chart(self, ch: dict) -> str:
        cats, series, unit = ch["categories"], ch["series"], ch["unit"]
        stacked = ch["type"] == "stacked_hbar"
        peak = max((sum(s["values"][i] for s in series) if stacked else max(s["values"][i] for s in series)) for i in range(len(cats)))
        scale = max(1, math.ceil(peak / TEXT_MAX)) if peak > 0 else 1
        lw = max(width(c) for c in cats) + 2
        legend = "  ".join(f"{TEXT_MARKS[i % 4]} {s['name']}" for i, s in enumerate(series))
        lines = [f"{ch['title']}（1 文字 = {scale} {unit}）", f"凡例: {legend}"]
        for i, cat in enumerate(cats):
            vals = [s["values"][i] for s in series]
            if stacked:
                bar = "".join(TEXT_MARKS[j % 4] * math.ceil(max(v, 0) / scale) for j, v in enumerate(vals))
                lines.append(f"{pad(cat, lw)}{bar}  {' + '.join(fmt(v) for v in vals)} {unit}")
            else:
                for j, v in enumerate(vals):
                    bar = TEXT_MARKS[j % 4] * math.ceil(max(v, 0) / scale)
                    lines.append(f"{pad(cat if j == 0 else '', lw)}{bar}  {fmt(v)} {unit}")
        if ch.get("note"):
            lines.append(f"※ {ch['note']}")
        return "\n".join(lines)

    def md_table(self, t: dict) -> str:
        cols = t.get("columns", [])
        if not t.get("rows"):
            return f"### {t['title']}\n{t.get('empty_text') or '該当なし'}\n"
        esc = lambda s: str(s).replace("|", "\\|").replace("\n", " ")  # noqa: E731
        head = "| " + " | ".join(esc(c["label"]) for c in cols) + " |"
        sep = "|" + "|".join("---:" if c.get("num") else "---" for c in cols) + "|"
        body = ["| " + " | ".join(esc(fmt(r.get(c["key"]))) for c in cols) + " |" for r in t["rows"]]
        foot = []
        if t.get("kind") == "order" and self.totals_by_unit(t):
            foot.append(f"合計 {self.total_text(t)}")
        return "\n".join([f"### {t['title']}", head, sep, *body, *foot]) + "\n"

    def fallback_md(self, charts: list[dict]) -> str:
        parts = []
        if charts:
            parts.append("```\n" + "\n\n".join(self.text_chart(ch) for ch in charts) + "\n```\n")
        parts += [self.md_table(t) for t in self.d.get("tables", [])]
        return "\n".join(parts)

    def html_chart(self, ch: dict) -> str:
        e = html.escape
        stacked = ch["type"] == "stacked_hbar"
        n = len(ch["categories"])
        peak = max((sum(s["values"][i] for s in ch["series"]) if stacked else max(s["values"][i] for s in ch["series"])) for i in range(n)) or 1
        legend = "".join(f'<span><i class="s{j % 4 + 1}"></i>{e(s["name"])}</span>' for j, s in enumerate(ch["series"]))
        rows = []
        for i, cat in enumerate(ch["categories"]):
            rows.append(f'        <div class="lbl">{e(cat)}</div>')
            if stacked:
                segs = "".join(
                    f'<b class="s{j % 4 + 1}" style="width:{round(max(s["values"][i], 0) / peak * 100)}%" data-series="{j}" data-v="{raw(s["values"][i])}"></b>'
                    for j, s in enumerate(ch["series"])
                )
                label = " + ".join(fmt(s["values"][i]) for s in ch["series"])
                rows.append(f'        <div class="grp"><div class="bar stack">{segs}<span>{e(label)} {e(ch["unit"])}</span></div></div>')
            else:
                bars = "".join(
                    f'<div class="bar"><b class="s{j % 4 + 1}" style="width:{round(max(s["values"][i], 0) / peak * 100)}%" data-series="{j}" data-v="{raw(s["values"][i])}"></b><span>{e(fmt(s["values"][i]))} {e(ch["unit"])}</span></div>'
                    for j, s in enumerate(ch["series"])
                )
                rows.append(f'        <div class="grp">{bars}</div>')
        note = f'\n      <p class="note">{e(ch["note"])}</p>' if ch.get("note") else ""
        return (f'    <div class="chart" data-chart="{e(ch["id"])}">\n      <h3>{e(ch["title"])} <span class="unit">（単位: {e(ch["unit"])}）</span></h3>{note}\n'
                f'      <div class="legend">{legend}</div>\n      <div class="bars">\n' + "\n".join(rows) + "\n      </div>\n    </div>")

    def html_table(self, t: dict) -> str:
        e = html.escape
        cols = t.get("columns", [])
        if not t.get("rows"):
            return f'    <h3>{e(t["title"])}</h3>\n    <p>{e(t.get("empty_text") or "該当なし")}</p>'
        head = "".join(f'<th{" class=num" if c.get("num") else ""}>{e(c["label"])}</th>' for c in cols)
        body = "\n".join(
            "      <tr>" + "".join(f'<td{" class=num" if c.get("num") else ""}>{e(fmt(r.get(c["key"])))}</td>' for c in cols) + "</tr>"
            for r in t["rows"]
        )
        foot = f'\n    <p><b>合計 {e(self.total_text(t))}</b></p>' if t.get("kind") == "order" and self.totals_by_unit(t) else ""
        return f'    <h3>{e(t["title"])}</h3>\n    <table data-table="{e(t["id"])}">\n      <tr>{head}</tr>\n{body}\n    </table>{foot}'

    def html(self, charts: list[dict], template: Path | None) -> str:
        e = html.escape
        d = self.d
        css = FALLBACK_CSS
        if template and template.exists():
            m = re.search(r"<style>(.*?)</style>", template.read_text(encoding="utf-8"), re.S)
            if m:
                css = m.group(1)
        cards = []
        for card in d.get("cards", []):
            value = self.total_text(self.tables[card["total"]]) if card.get("total") else card.get("value", "")
            tone = {"up": " warn", "down": " down"}.get(card.get("tone", ""), "")
            cards.append(f'<div class="card{tone}"><div class="k">{e(card.get("label", ""))}</div><div class="v">{e(value)}</div></div>')
        cond = "\n".join(f'      <tr><td>{e(r.get("item", ""))}</td><td>{e(r.get("content", ""))}</td><td>{e(r.get("effect", ""))}</td></tr>' for r in d.get("conditions", []))
        reasoning = "\n".join(f'    <div class="rule"><b>{e(r.get("rule", ""))}</b>　{e(r.get("summary", ""))}<br>→ {e(r.get("applied", ""))}</div>' for r in d.get("reasoning", []))
        notes = "\n".join(f"      <li>{e(n)}</li>" for n in d.get("notes", []))
        sections = [
            f'  <section id="summary">\n    <h2>結論</h2>\n    <p class="lead">{e(d["conclusion"])}</p>\n    <div class="cards">{"".join(cards)}</div>\n  </section>',
        ]
        if cond:
            sections.append(f'  <section id="conditions">\n    <h2>何を見たか</h2>\n    <table>\n      <tr><th>項目</th><th>内容</th><th>判断への影響</th></tr>\n{cond}\n    </table>\n  </section>')
        if charts:
            sections.append('  <section id="charts">\n    <h2>グラフ</h2>\n' + "\n".join(self.html_chart(c) for c in charts) + "\n  </section>")
        if reasoning:
            sections.append(f'  <section id="reasoning">\n    <h2>なぜそうするか</h2>\n{reasoning}\n  </section>')
        sections.append('  <section id="details">\n    <h2>明細</h2>\n' + "\n".join(self.html_table(t) for t in d.get("tables", [])) + "\n  </section>")
        if notes:
            sections.append(f'  <section id="notes">\n    <h2>前提・注意</h2>\n    <ul>\n{notes}\n    </ul>\n  </section>')
        return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>{e(d["title"])}</title>
<style>{css}{EXTRA_CSS}</style>
</head>
<body>
<header>
  <h1>{e(d["title"])}</h1>
  <p>{e(d.get("subtitle", ""))}</p>
</header>
<main>
{chr(10).join(sections)}
</main>
<footer>{e(d.get("footer", "このレポートは Cowork が作成した下書きです。最終判断は利用者が行います。"))}</footer>
</body>
</html>
"""


def numbers_in_text_chart(block: str) -> list[float]:
    vals = []
    for line in block.splitlines():
        m = re.search(r"[█▒░▓]*\s+([-\d,.]+(?:\s\+\s[-\d,.]+)*)\s\S+$", line)
        if m and re.search(r"[█▒░▓]|\s{2}", line) and not line.startswith(("凡例", "※")):
            vals += [float(x.replace(",", "")) for x in m.group(1).split(" + ")]
    return vals


def cross_check(charts: list[dict], html_text: str, fallback: str) -> list[str]:
    """グラフ（Render UI に渡す値）・HTML の棒・文字のグラフの数字が同じかを確かめる。"""
    problems = []
    for ch in charts:
        expect = [v for i in range(len(ch["categories"])) for v in (s["values"][i] for s in ch["series"])]
        m = re.search(rf'<div class="chart" data-chart="{re.escape(ch["id"])}">(.*?)\n    </div>', html_text, re.S)
        got_html = [float(x) for x in re.findall(r'data-v="([-\d.]+)"', m.group(1))] if m else []
        if [float(v) for v in expect] != got_html:
            problems.append(f"HTML の棒の値がグラフと違います: {ch['title']}")
    block = re.search(r"```\n(.*?)\n```", fallback, re.S)
    want = [float(v) for ch in charts for i in range(len(ch["categories"])) for v in (s["values"][i] for s in ch["series"])]
    got = numbers_in_text_chart(block.group(1)) if block else []
    if charts and [round(v, 1) for v in want] != [round(v, 1) for v in got]:
        problems.append("文字のグラフの値がグラフと違います")
    return problems


def build(data: dict, out: Path, template: Path | None) -> dict:
    b = Builder(data)
    b.check()
    summary: dict = {"status": "ng", "errors": b.errors, "warnings": b.warnings}
    if b.errors:
        return summary
    charts = b.charts()
    fallback = b.fallback_md(charts)
    page = b.html(charts, template)
    for text in (page,):
        if GUID.search(text):
            b.errors.append("HTML に GUID が入っています")
    problems = cross_check(charts, page, fallback)
    b.errors += problems
    out.mkdir(parents=True, exist_ok=True)
    summary.update({
        "status": "ng" if b.errors else "ok",
        "charts": [{"id": c["id"], "title": c["title"], "unit": c["unit"], "rows": len(c["categories"]),
                    "totals": {s["name"]: round(sum(s["values"]), 1) for s in c["series"]}} for c in charts],
        "tables": [{"id": t["id"], "rows": len(t.get("rows", [])), "kind": t.get("kind", "info"),
                    "totals_by_unit": b.totals_by_unit(t)} for t in data.get("tables", [])],
        "consistency": "ok" if not problems else "ng",
        "files": {},
    })
    if b.errors:
        return summary
    files = {
        "html": out / data["file_name"],
        "render_payload": out / "render_payload.json",
        "fallback": out / "fallback.md",
    }
    files["html"].write_text(page, encoding="utf-8")
    files["render_payload"].write_text(json.dumps({"charts": charts}, ensure_ascii=False, indent=2), encoding="utf-8")
    files["fallback"].write_text(fallback, encoding="utf-8")
    summary["files"] = {k: str(v) for k, v in files.items()}
    return summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("results", type=Path, help="計算結果の JSON")
    ap.add_argument("--out", type=Path, required=True, help="出力フォルダー")
    ap.add_argument("--template", type=Path, help="report-template.html（省略時は同じフォルダのもの）")
    args = ap.parse_args(argv)
    here = Path(__file__).resolve().parent
    # 同じフォルダ（パッケージの scripts/）→ cowork スキルの references/ の順に探す
    template = args.template or next((p for p in (here / "report-template.html", here.parent / "references" / "report-template.html") if p.exists()), None)
    try:
        data = json.loads(args.results.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "ng", "errors": [f"計算結果を読めません: {exc}"], "warnings": []}, ensure_ascii=False))
        return 1
    summary = build(data, args.out, template)
    (args.out).mkdir(parents=True, exist_ok=True)
    (args.out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
