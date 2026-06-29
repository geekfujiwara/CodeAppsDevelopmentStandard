"""Code Apps サンプルの公開前セキュリティ／再利用性スキャナー。

package-sample フェーズ 1（セキュリティスキャン）とフェーズ 2 の機械チェックを
1 コマンドに自動化する。SKILL.md のインライン grep 手順を置き換える。

検出項目:
  1. 実 GUID（テナント/環境/Bot/フロー/接続 ID）— allowlist とプレースホルダーは除外。
  2. 実 Dataverse URL（*.crm*.dynamics.com）— <org>/{org} 等のプレースホルダーは除外。
  3. 実メールアドレス（example.com 等の許可ドメイン以外）。
  4. クライアントシークレット様文字列。
  5. テーブル名のハードコード（src/services/ で "{prefix}_xxx" 直書き＝動的化漏れ）。
     OData バインド注釈（"..._id@odata.bind"）は仕様上の例外として除外。
  6. VITE_ 変数への秘匿情報混入（VITE_*SECRET/TOKEN/KEY/PASSWORD）。
  7. ルート .gitignore に .env / power.config.json / .power/ / src/generated/ があるか。

依存なし（標準ライブラリのみ）。

使い方:
  python scan_sample.py <sample-dir>          # 例: .github/skills/code-apps/samples/geek-sales

終了コード: error が1件以上なら 1、それ以外は 0（warning は 0 のまま）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

_UTF8_OUT = (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf")
MARK_NG = "❌" if _UTF8_OUT else "[NG]"
MARK_WARN = "⚠️ " if _UTF8_OUT else "[WARN]"
MARK_OK = "✅" if _UTF8_OUT else "[OK]"

# validate_skill.py と同じ allowlist（公式 well-known GUID / プレースホルダー）
ALLOWLIST = {
    "00000007-0000-0000-c000-000000000000",
    "00000003-0000-0000-c000-000000000000",
    "00000002-0000-0000-c000-000000000000",
    "00000000-0000-0000-0000-000000000000",
    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
}

GUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
CRM_URL_RE = re.compile(r"https://[a-z0-9-]+\.crm[0-9]*\.dynamics\.com", re.IGNORECASE)
CRM_PLACEHOLDER = re.compile(r"https://(<org>|\{org\}|yourorg|\{[^}]+\})\.crm", re.IGNORECASE)
SECRET_RE = re.compile(r"\b[0-9A-Za-z]{2,3}~[0-9A-Za-z._~-]{30,}\b")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
EMAIL_ALLOW = ("example.com", "example.org", "contoso.com", "noreply.github.com")
NON_EMAIL_RE = re.compile(r"@(odata|microsoft|xmlns)\.", re.IGNORECASE)
# src/services/ のテーブル名直書き検出（"abc_customers" 形式）。OData バインドは除外。
HARDCODED_TABLE_RE = re.compile(r'"[a-z][a-z0-9]+_[a-z][a-z0-9_]+"')
ODATA_BIND_RE = re.compile(r'@odata\.(bind|type|id)', re.IGNORECASE)
# VITE_ への秘匿情報混入
VITE_SECRET_RE = re.compile(r"\bVITE_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|APIKEY|API_KEY|CLIENT_SECRET)\b")

SCAN_EXTS = {".ts", ".tsx", ".js", ".jsx", ".py", ".env", ".example", ".json", ".jsonc", ".md"}
SKIP_DIRS = {".power", "node_modules", "src/generated", "dist", ".git"}
GITIGNORE_REQUIRED = (".env", "power.config.json", ".power/", "src/generated/")


class Report:
    def __init__(self, target: str):
        self.target = target
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, m: str) -> None:
        self.errors.append(m)

    def warn(self, m: str) -> None:
        self.warnings.append(m)

    def print(self) -> None:
        status = MARK_NG if self.errors else (MARK_WARN if self.warnings else MARK_OK)
        print(f"{status} {self.target}")
        for e in self.errors:
            print(f"   ERROR: {e}")
        for w in self.warnings:
            print(f"   WARN : {w}")


def _skip(p: Path, root: Path) -> bool:
    rel = p.relative_to(root).as_posix()
    return any(part in SKIP_DIRS or rel.startswith(part) for part in SKIP_DIRS for _ in [0]) or any(
        seg in SKIP_DIRS for seg in rel.split("/")
    )


def scan_file(path: Path, root: Path, rep: Report) -> None:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return
    rel = path.relative_to(root).as_posix()
    in_services = "/services/" in f"/{rel}" or rel.startswith("src/services/")
    for i, line in enumerate(lines, 1):
        for g in GUID_RE.findall(line):
            if g.lower() not in ALLOWLIST:
                rep.err(f"{rel}:{i}: 実 GUID らしき値 {g}（プレースホルダーに置換）")
        if CRM_URL_RE.search(line) and not CRM_PLACEHOLDER.search(line):
            rep.err(f"{rel}:{i}: 実 Dataverse URL（<org> 等に置換）: {line.strip()[:80]}")
        if SECRET_RE.search(line):
            rep.err(f"{rel}:{i}: クライアントシークレット様の文字列")
        if VITE_SECRET_RE.search(line):
            rep.err(f"{rel}:{i}: VITE_ 変数に秘匿情報混入の疑い（ビルド成果物に平文で含まれる）")
        for em in EMAIL_RE.findall(line):
            if NON_EMAIL_RE.search(em):
                continue
            if not any(em.lower().endswith(a) for a in EMAIL_ALLOW):
                rep.warn(f"{rel}:{i}: 実メールらしき値 {em}（admin@example.com 等に置換）")
        if in_services and path.suffix in (".ts", ".tsx"):
            if ODATA_BIND_RE.search(line):
                continue
            for tbl in HARDCODED_TABLE_RE.findall(line):
                rep.warn(
                    f"{rel}:{i}: テーブル名の直書きの疑い {tbl}"
                    f"（${{PUBLISHER_PREFIX}}_xxx で動的化を検討）"
                )


def check_gitignore(root: Path, rep: Report) -> None:
    """サンプルの上位に辿れる範囲で .gitignore を探し、必須エントリを確認する。"""
    for parent in [root, *root.parents]:
        gi = parent / ".gitignore"
        if gi.is_file():
            text = gi.read_text(encoding="utf-8", errors="ignore")
            missing = [e for e in GITIGNORE_REQUIRED if e not in text]
            if missing:
                rep.warn(f"{gi}: 必須エントリ未記載: {', '.join(missing)}")
            return
    rep.warn(".gitignore が見つからない（.env / power.config.json の除外を確認）")


def main() -> int:
    ap = argparse.ArgumentParser(description="Code Apps サンプルの公開前スキャン")
    ap.add_argument("sample", help="サンプルディレクトリ（例: code-apps/samples/geek-sales）")
    args = ap.parse_args()

    root = Path(args.sample)
    if not root.is_dir():
        print(f"ディレクトリが見つからない: {root}", file=sys.stderr)
        return 2

    rep = Report(root.as_posix())
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix not in SCAN_EXTS:
            continue
        if any(seg in SKIP_DIRS for seg in p.relative_to(root).as_posix().split("/")):
            continue
        scan_file(p, root, rep)
    check_gitignore(root, rep)

    rep.print()
    return 1 if rep.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
