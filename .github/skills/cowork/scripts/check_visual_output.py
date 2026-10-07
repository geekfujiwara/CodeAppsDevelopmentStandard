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
  6. 提案するスキル（description に 提案・助言・打ち手・対策案・推奨 など）に、チャットのグラフの手順が無い
  7. チャットのグラフを Render UI で出す手順が欠けている（使えるかの確認・正式な色だけ・表示の確認・1 回だけ直す・
     文字のグラフへの切り替え）、または「このスキルのグラフ」（図の種類と元の表）が無い、または同梱の
     scripts/report_builder.py が無い（troubleshooting #53）
  ビルドでは、`<!-- include: display-rules.md -->` を共通ルールに置き換えた後の本文を検査する。

  python check_visual_output.py --skills <plugin-root>/skills
  python check_visual_output.py --skills <plugin-root>/skills --compose   # 書いている途中の SKILL.md を、ビルドと同じ差し込みをした写しで検査

終了コード: 0 = 問題なし / 1 = 問題あり
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
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
# 提案するスキル（description にこの言葉があれば、チャットのグラフを標準で組み込む）
PROPOSAL_WORDS = re.compile(r"提案|助言|打ち手|対策案|プランナー|推奨|おすすめ|recommend|propos", re.I)
# Render UI で出すときに欠かせない手順（共通ルール display-rules.md の要点）
RENDER_UI_STEPS = {
    "Render UI を使えるかを確かめる": r"Render UI（`render-ui`）があるか",
    "Render UI の説明に書かれた正式な色だけを使う": r"正式な色",
    "表示できたことを確かめるまで成功と書かない": r"確かめるまで",
    "失敗したら 1 回だけ直して再表示する": r"1 回だけ",
    "使えない・直らないときは文字のグラフと表に切り替える": r"文字のグラフ(と表)?に切り替え",
    "表示できたグラフと同じ文字のグラフを重ねない": r"重ねない|載せない",
}
INCLUDE_MARKER = "<!-- include: display-rules.md -->"
CHART_TYPES = re.compile(r"`(stacked_hbar|grouped_bar)`")
FENCE = re.compile(r"^( *)(`{3,})(?!`)[^\n]*\n([\s\S]*?)\n\1\2(?!`)[ \t]*$", re.M)
SCRIPT = re.compile(r"<script\b", re.I)
EXTERNAL = re.compile(r"""(?:src|href)\s*=\s*["']?\s*(?:https?:)?//""", re.I)


@dataclass(frozen=True)
class Finding:
    skill: str
    message: str


def description(text: str) -> str:
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return ""
    d = re.search(r"^description:(.*?)(?=^\S[^:\n]*:|\Z)", m.group(1), re.S | re.M)
    return d.group(1) if d else ""


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
    proposal = bool(PROPOSAL_WORDS.search(description(text)))
    if not any(m in text for m in VISUAL_MARKERS):
        if proposal:
            found.append(Finding(name, "提案するスキルなのに、結果の見せ方（チャットのグラフ・表・HTML レポート）の手順が無い。`<!-- include: display-rules.md -->` と「このスキルのグラフ」の節を入れる（references/visual-output.md）"))
        return found
    if INCLUDE_MARKER in text:
        found.append(Finding(name, "`<!-- include: display-rules.md -->` が置き換えられていない（build_agent_package.ps1 で作ったパッケージを検査する）"))
    if proposal or "Render UI" in text:
        missing = [k for k, pat in RENDER_UI_STEPS.items() if not re.search(pat, text)]
        if missing:
            found.append(Finding(name, "チャットのグラフ（Render UI）の手順が欠けている: " + "・".join(missing)))
        own = re.search(r"^## このスキルのグラフ[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
        if not own or not CHART_TYPES.search(own.group(1)):
            found.append(Finding(name, "「このスキルのグラフ」の節（図の題名・種類 `stacked_hbar` / `grouped_bar`・元の表・単位）が無い"))
        if "report_builder.py" in text and not (skill_dir / "scripts" / "report_builder.py").exists():
            found.append(Finding(name, "scripts/report_builder.py が無い（build_agent_package.ps1 が include のあるスキルに同梱する）"))

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


def compose(skills_root: Path, dest: Path, assets: Path | None = None) -> Path:
    """build_agent_package.ps1 と同じ差し込み（共通ルール・report_builder.py・ひな形）をした写しを作る。"""
    here = Path(__file__).resolve().parent
    part = lambda name, fallback: (assets / name) if assets and (assets / name).exists() else fallback  # noqa: E731
    rules = part("display-rules.md", here.parent / "references" / "display-rules.md").read_text(encoding="utf-8").rstrip()
    builder = part("report_builder.py", here / "report_builder.py")
    template = part("report-template.html", here.parent / "references" / "report-template.html")
    out = dest / "skills"
    shutil.copytree(skills_root, out)
    for md in out.rglob("SKILL.md"):
        text = md.read_text(encoding="utf-8")
        if INCLUDE_MARKER not in text:
            continue
        md.write_text(text.replace(INCLUDE_MARKER, rules), encoding="utf-8")
        (md.parent / "scripts").mkdir(exist_ok=True)
        shutil.copyfile(builder, md.parent / "scripts" / "report_builder.py")
        shutil.copyfile(template, md.parent / "scripts" / "report-template.html")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skills", required=True, type=Path, help="プラグインの skills フォルダ")
    ap.add_argument("--compose", action="store_true", help="ビルドと同じ差し込みをした写しを検査する（プラグインの assets/ があればそれを使う）")
    args = ap.parse_args(argv)
    if not args.skills.is_dir():
        print(f"✖ skills フォルダが見つかりません: {args.skills}")
        return 1
    if args.compose:
        with tempfile.TemporaryDirectory() as tmp:
            assets = args.skills.resolve().parent / "assets"
            findings = check(compose(args.skills, Path(tmp), assets if assets.is_dir() else None))
    else:
        findings = check(args.skills)
    for f in findings:
        print(f"✖ {f.skill}: {f.message}")
    if findings:
        print(f"結果の見せ方の書き方に {len(findings)} 件の問題があります（references/visual-output.md・troubleshooting.md #52・#53）。")
        return 1
    print("✅ 結果の見せ方（グラフ・HTML レポート）は省かれない書き方になっています")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
