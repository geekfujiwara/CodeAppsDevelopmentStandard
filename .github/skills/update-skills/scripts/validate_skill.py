"""スキル構成と秘匿情報を検証する汎用バリデーター。

検証項目:
  1. SKILL.md が存在し、frontmatter の name がフォルダ名と一致する（kebab-case）。
  2. frontmatter に description / category / triggers がある。
  3. Step 見出し（## / ### Step N）が整数で連番になっている（飛び・重複なし）。
  4. references/ と scripts/ の有無（無ければ警告）。
  5. 秘匿情報スキャン（実 GUID / *.crm*.dynamics.com / 実メール / クライアントシークレット様）。

依存なし（標準ライブラリのみ）。どのリポジトリでも動く。

使い方:
  python validate_skill.py <skill-dir>      # 単一スキルを検証
  python validate_skill.py --all            # SKILLS_DIR 配下を一括検証
  python validate_skill.py --all --skills-dir .github/skills

終了コード: 問題（error）が1件以上なら 1、それ以外は 0。warning は 0 のまま。
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# --- 設定（環境変数 .env で上書き可能） ---------------------------------------

DEFAULT_SKILLS_DIR = ".github/skills"

# 誤検出を避けるための許可リスト（公式の well-known なシステム GUID 等）
ALLOWLIST = {
    "00000007-0000-0000-c000-000000000000",  # Dynamics CRM first-party app
    "00000003-0000-0000-c000-000000000000",  # Microsoft Graph
    "00000002-0000-0000-c000-000000000000",  # Azure AD Graph
    "a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a",  # Dynamics CRM mcp.tools 委任スコープ ID（固定）
    "ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b",  # Enterprise Token Store アプリ ID（固定）
    "6ab48b67-cd74-4ad4-81af-5932984589be",  # Cowork/Token Store 関連の well-known ID（固定）
    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   # プレースホルダー
}

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FM_NAME_RE = re.compile(r"^name:\s*(.+?)\s*$", re.MULTILINE)
FM_KEY_RE = lambda k: re.compile(rf"^{k}:\s*", re.MULTILINE)
STEP_RE = re.compile(r"^#{2,3}\s+Step\s+(\d+)\b", re.MULTILINE)

GUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
CRM_URL_RE = re.compile(r"https://[a-z0-9-]+\.crm[0-9]*\.dynamics\.com", re.IGNORECASE)
SECRET_RE = re.compile(r"\b[0-9A-Za-z]{2,3}~[0-9A-Za-z._~-]{30,}\b")  # client secret 様
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
EMAIL_ALLOW = ("example.com", "example.org", "contoso.com")
# プレースホルダー的な組織名（<org> / {org} / yourorg）は許容
CRM_PLACEHOLDER = re.compile(r"https://(<org>|\{org\}|yourorg|\{[^}]+\})\.crm", re.IGNORECASE)


def load_env(start: Path) -> None:
    """リポジトリルートの .env を環境変数へ読み込む（既存値は上書きしない）。"""
    for parent in [start, *start.parents]:
        envf = parent / ".env"
        if envf.is_file():
            for line in envf.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
            return


class Report:
    def __init__(self, skill: str):
        self.skill = skill
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def print(self) -> None:
        status = "❌" if self.errors else ("⚠️ " if self.warnings else "✅")
        print(f"{status} {self.skill}")
        for e in self.errors:
            print(f"   ERROR: {e}")
        for w in self.warnings:
            print(f"   WARN : {w}")


def scan_secrets(path: Path, rep: Report) -> None:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return
    rel = path.name
    for m in GUID_RE.findall(text):
        if m.lower() not in ALLOWLIST:
            rep.err(f"{rel}: 実 GUID らしき値 {m}（プレースホルダーに置換）")
    for line in text.splitlines():
        if CRM_URL_RE.search(line) and not CRM_PLACEHOLDER.search(line):
            rep.err(f"{rel}: 実 Dataverse URL らしき値（<org> 等に置換）: {line.strip()[:80]}")
    for m in SECRET_RE.findall(text):
        rep.err(f"{rel}: クライアントシークレット様の文字列を検出")
    for m in EMAIL_RE.findall(text):
        if not any(m.lower().endswith(a) for a in EMAIL_ALLOW):
            rep.warn(f"{rel}: 実メールアドレスらしき値 {m}（admin@example.com 等に置換）")


def validate_skill(skill_dir: Path) -> Report:
    rep = Report(skill_dir.name)
    folder = skill_dir.name
    skill_md = skill_dir / "SKILL.md"

    if not skill_md.is_file():
        rep.err("SKILL.md が存在しない")
        return rep

    text = skill_md.read_text(encoding="utf-8", errors="ignore")

    # frontmatter name 一致
    m = FM_NAME_RE.search(text)
    if not m:
        rep.err("frontmatter に name がない")
    else:
        name = m.group(1).strip().strip('"').strip("'")
        if not NAME_RE.match(name):
            rep.err(f"name '{name}' が kebab-case ではない")
        if name != folder:
            rep.err(f"name '{name}' がフォルダ名 '{folder}' と不一致")

    # 必須 frontmatter キー
    for key in ("description", "category", "triggers"):
        if not FM_KEY_RE(key).search(text):
            rep.err(f"frontmatter に {key} がない")

    # Step 整数連番
    steps = [int(x) for x in STEP_RE.findall(text)]
    if steps:
        if len(steps) != len(set(steps)):
            rep.err(f"Step 番号に重複がある: {steps}")
        expected = list(range(steps[0], steps[0] + len(steps)))
        if steps != expected:
            rep.err(f"Step 番号が整数連番でない: {steps}（期待: {expected}）")

    # references / scripts の有無
    if not (skill_dir / "references").is_dir():
        rep.warn("references/ が無い（参考情報・異常系の置き場）")
    if not (skill_dir / "scripts").is_dir():
        rep.warn("scripts/ が無い（利用スクリプトの置き場）")

    # 秘匿情報スキャン（テキスト系ファイルのみ）
    exts = {".md", ".py", ".ps1", ".json", ".jsonc", ".ts", ".tsx", ".env", ".example"}
    for p in skill_dir.rglob("*"):
        if p.is_file() and (p.suffix in exts or p.name == ".env.example"):
            scan_secrets(p, rep)

    return rep


def main() -> int:
    ap = argparse.ArgumentParser(description="スキル構成と秘匿情報を検証する")
    ap.add_argument("skill", nargs="?", help="検証するスキルディレクトリ")
    ap.add_argument("--all", action="store_true", help="SKILLS_DIR 配下を一括検証")
    ap.add_argument("--skills-dir", help="スキルのルート（既定: .env の SKILLS_DIR または .github/skills）")
    args = ap.parse_args()

    here = Path.cwd()
    load_env(here)
    skills_dir = Path(args.skills_dir or os.environ.get("SKILLS_DIR", DEFAULT_SKILLS_DIR))

    targets: list[Path] = []
    if args.all:
        if not skills_dir.is_dir():
            print(f"SKILLS_DIR が見つからない: {skills_dir}", file=sys.stderr)
            return 2
        targets = [d for d in sorted(skills_dir.iterdir()) if (d / "SKILL.md").is_file()]
    elif args.skill:
        targets = [Path(args.skill)]
    else:
        ap.print_help()
        return 2

    had_error = False
    for t in targets:
        rep = validate_skill(t)
        rep.print()
        if rep.errors:
            had_error = True
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
