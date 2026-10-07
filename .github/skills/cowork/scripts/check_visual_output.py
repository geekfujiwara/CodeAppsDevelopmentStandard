"""Cowork スキルの「結果の見せ方」（チャットのグラフ・HTML レポート）が省かれない書き方かを確かめる（読み取りのみ）。

2026-10-07、SKILL.md に「グラフ（画像）と HTML レポートを必ず付ける」と書いたのに、Cowork では一度も出なかった。
原因は書き方だった。この検査は同じ書き方をビルドの前に止める:

  1. 同梱の HTML（report-template.html など）にスクリプトや外部読み込みがある
     → プレビューではスクリプトが動かないことがあり、グラフが空になる。外部読み込みは情報の持ち出しになる
  2. 結果の見せ方を指示しているのに「返す前の確認」の節が無い → 最後に省かれても気づけない
  3. 回答のひな形（コードブロック）に、グラフとレポートの行が無い → 表だけのひな形がそのまま使われる
  4. ほかのスキルの節を参照している（例: 「<別のスキル> の「グラフの作り方」と同じ」）
     → Cowork は依頼に合うスキルだけを読むので、参照先が読めない
  5. 「コードを実行できるなら」「画像を作れないときは」のような、省いてよい理由になる条件付きの書き方

  python check_visual_output.py --skills <plugin-root>/skills

終了コード: 0 = 問題なし / 1 = 問題あり
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

# 結果の見せ方を指示しているスキルかどうか
VISUAL_MARKERS = ("HTML レポート", "HTML report", "グラフ")
# 回答の前に確かめる節の見出し
CHECK_HEADINGS = ("返す前の確認", "Before replying", "Before you reply")
# 省いてよい理由になる書き方（グラフ・画像・レポートと同じ行にあるとき）
ESCAPE_PHRASES = ("できるなら", "できれば", "可能なら", "可能であれば", "作れないときは", "作れない場合は", "if you can", "if possible")
VISUAL_WORDS = ("グラフ", "画像", "レポート", "HTML", "chart", "image", "report")
FENCE = re.compile(r"^( *)(`{3,})(?!`)[^\n]*\n([\s\S]*?)\n\1\2(?!`)[ \t]*$", re.M)
SCRIPT = re.compile(r"<script\b", re.I)
EXTERNAL = re.compile(r"""(?:src|href)\s*=\s*["']?\s*(?:https?:)?//""", re.I)


@dataclass(frozen=True)
class Finding:
    skill: str
    message: str


def code_blocks(text: str) -> list[str]:
    return [m.group(3) for m in FENCE.finditer(text)]


def check_skill(skill_dir: Path, other_skills: list[str]) -> list[Finding]:
    name = skill_dir.name
    found: list[Finding] = []
    for html in sorted(skill_dir.rglob("*.html")):
        body = html.read_text(encoding="utf-8", errors="replace")
        rel = html.relative_to(skill_dir)
        if SCRIPT.search(body):
            found.append(Finding(name, f"{rel}: <script> がある。グラフは CSS の棒（style=\"width:NN%\"）で描く（プレビューでスクリプトが動かないことがある）"))
        if EXTERNAL.search(body):
            found.append(Finding(name, f"{rel}: 外部の CSS・JS・画像・フォントを読み込んでいる"))

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return found
    text = skill_md.read_text(encoding="utf-8", errors="replace")
    if not any(m in text for m in VISUAL_MARKERS):
        return found

    if not any(h in line for line in text.splitlines() if line.lstrip().startswith("#") for h in CHECK_HEADINGS):
        found.append(Finding(name, "「返す前の確認」の節が無い（グラフ・表・レポートがそろっているかを、回答を返す直前に確かめる節）"))

    blocks = code_blocks(text)
    if "HTML" in text and not any(re.search(r"\S+\.html", b) for b in blocks if not b.lstrip().lower().startswith(("<!doctype", "<html"))):
        found.append(Finding(name, "回答のひな形（コードブロック）に、HTML レポートのファイル名の行が無い（例: 📄 レポート: 発注案_20261030.html）"))
    if "グラフ" in text and not any(re.search(r"[█▇▆▅▄▃▂▁▒░■]{2,}", b) for b in blocks):
        found.append(Finding(name, "回答のひな形（コードブロック）に、グラフの例（文字の棒グラフなど）が無い"))

    for other in other_skills:
        if other == name:
            continue
        for line_no, line in enumerate(text.splitlines(), 1):
            if re.search(rf"{re.escape(other)}\s*の「", line) and any(w in line for w in VISUAL_WORDS):
                found.append(Finding(name, f"SKILL.md:{line_no}: ほかのスキル（{other}）の節を参照している。Cowork はそのスキルを読まないので、手順をこのスキルに書く"))

    for line_no, line in enumerate(text.splitlines(), 1):
        low = line.lower()
        if any(p in low for p in ESCAPE_PHRASES) and any(w.lower() in low for w in VISUAL_WORDS):
            found.append(Finding(name, f"SKILL.md:{line_no}: 条件付きの書き方（{line.strip()[:60]}…）。省いてよい理由になるので、必ず出すもの（文字のグラフ等）と追加で出すものを分けて書く"))
    return found


def check(skills_root: Path) -> list[Finding]:
    dirs = sorted(d for d in skills_root.iterdir() if d.is_dir() and (d / "SKILL.md").exists())
    names = [d.name for d in dirs]
    findings: list[Finding] = []
    for d in dirs:
        findings += check_skill(d, names)
    return findings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skills", required=True, type=Path, help="プラグインの skills フォルダ")
    args = ap.parse_args(argv)
    if not args.skills.is_dir():
        print(f"✖ skills フォルダが見つかりません: {args.skills}")
        return 1
    findings = check(args.skills)
    for f in findings:
        print(f"✖ {f.skill}: {f.message}")
    if findings:
        print(f"結果の見せ方の書き方に {len(findings)} 件の問題があります（references/visual-output.md・troubleshooting.md #52）。")
        return 1
    print("✅ 結果の見せ方（グラフ・HTML レポート）は省かれない書き方になっています")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
