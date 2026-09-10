"""Code Apps サンプルの公開前セキュリティ／再利用性スキャナー。

update-skills のサンプルパッケージングに含まれるセキュリティスキャンと
再利用性の機械チェックを 1 コマンドに自動化する。

依存なし（標準ライブラリのみ）。

使い方:
  python scan_sample.py <sample-dir>

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

ALLOWLIST = {
    "00000007-0000-0000-c000-000000000000",
    "00000003-0000-0000-c000-000000000000",
    "00000002-0000-0000-c000-000000000000",
    "00000000-0000-0000-0000-000000000000",
    "00000000-0000-0000-0000-000000000001",
    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "edfdb190-3791-45d8-9a6c-8f90a37c278a",
    "11111111-2222-3333-4444-555555555555",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "00000001-0000-0000-0001-00000000009b",
    "953b9fac-1e5e-e611-80d6-00155ded156f",
    "4273edbd-ac1d-40d3-9fb2-095c621b552d",
}

GUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
CRM_URL_RE = re.compile(r"https://[a-z0-9-]+\.crm[0-9]*\.dynamics\.com", re.IGNORECASE)
CRM_PLACEHOLDER = re.compile(r"https://(<org>|\{org\}|yourorg|\{[^}]+\})\.crm", re.IGNORECASE)
SECRET_RE = re.compile(r"\b[0-9A-Za-z]{2,3}~[0-9A-Za-z._~-]{30,}\b")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
EMAIL_ALLOW = ("example.com", "example.org", "contoso.com", "noreply.github.com")
NON_EMAIL_RE = re.compile(r"@(odata|microsoft|xmlns)\.", re.IGNORECASE)
HARDCODED_TABLE_RE = re.compile(r'"[a-z][a-z0-9]+_[a-z][a-z0-9_]+"')
ODATA_BIND_RE = re.compile(r"@odata\.(bind|type|id)", re.IGNORECASE)
VITE_SECRET_RE = re.compile(r"\bVITE_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|APIKEY|API_KEY|CLIENT_SECRET)\b")

SCAN_EXTS = {".ts", ".tsx", ".js", ".jsx", ".py", ".env", ".example", ".json", ".jsonc", ".md"}
SKIP_DIRS = {".power", "node_modules", "src/generated", "dist", ".git"}
GITIGNORE_REQUIRED = (".env", "power.config.json", ".power/", "src/generated/")


class Report:
    def __init__(self, target: str):
        self.target = target
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def print(self) -> None:
        status = MARK_NG if self.errors else (MARK_WARN if self.warnings else MARK_OK)
        print(f"{status} {self.target}")
        for error in self.errors:
            print(f"   ERROR: {error}")
        for warning in self.warnings:
            print(f"   WARN : {warning}")


def scan_file(path: Path, root: Path, report: Report) -> None:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return
    relative_path = path.relative_to(root).as_posix()
    in_services = "/services/" in f"/{relative_path}" or relative_path.startswith("src/services/")
    for line_number, line in enumerate(lines, 1):
        for guid in GUID_RE.findall(line):
            if guid.lower() not in ALLOWLIST:
                report.err(f"{relative_path}:{line_number}: 実 GUID らしき値 {guid}（プレースホルダーに置換）")
        if CRM_URL_RE.search(line) and not CRM_PLACEHOLDER.search(line):
            report.err(f"{relative_path}:{line_number}: 実 Dataverse URL（<org> 等に置換）: {line.strip()[:80]}")
        if SECRET_RE.search(line):
            report.err(f"{relative_path}:{line_number}: クライアントシークレット様の文字列")
        if VITE_SECRET_RE.search(line):
            report.err(f"{relative_path}:{line_number}: VITE_ 変数に秘匿情報混入の疑い（ビルド成果物に平文で含まれる）")
        for email in EMAIL_RE.findall(line):
            if NON_EMAIL_RE.search(email):
                continue
            if not any(email.lower().endswith(allowed) for allowed in EMAIL_ALLOW):
                report.warn(f"{relative_path}:{line_number}: 実メールらしき値 {email}（admin@example.com 等に置換）")
        if in_services and path.suffix in (".ts", ".tsx"):
            if ODATA_BIND_RE.search(line):
                continue
            for table in HARDCODED_TABLE_RE.findall(line):
                report.warn(
                    f"{relative_path}:{line_number}: テーブル名の直書きの疑い {table}"
                    f"（${{PUBLISHER_PREFIX}}_xxx で動的化を検討）"
                )


def check_gitignore(root: Path, report: Report) -> None:
    """対象から上位へ辿って最初の .gitignore の必須エントリを確認する。"""
    for parent in [root, *root.parents]:
        gitignore = parent / ".gitignore"
        if gitignore.is_file():
            text = gitignore.read_text(encoding="utf-8", errors="ignore")
            missing = [entry for entry in GITIGNORE_REQUIRED if entry not in text]
            if missing:
                report.warn(f"{gitignore}: 必須エントリ未記載: {', '.join(missing)}")
            return
    report.warn(".gitignore が見つからない（.env / power.config.json の除外を確認）")


def main() -> int:
    parser = argparse.ArgumentParser(description="Code Apps サンプルの公開前スキャン")
    parser.add_argument("sample", help="サンプルディレクトリ（例: code-apps/samples/geek-sales）")
    args = parser.parse_args()

    root = Path(args.sample)
    if not root.is_dir():
        print(f"ディレクトリが見つからない: {root}", file=sys.stderr)
        return 2

    report = Report(root.as_posix())
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in SCAN_EXTS:
            continue
        if any(segment in SKIP_DIRS for segment in path.relative_to(root).as_posix().split("/")):
            continue
        scan_file(path, root, report)
    check_gitignore(root, report)

    report.print()
    return 1 if report.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())