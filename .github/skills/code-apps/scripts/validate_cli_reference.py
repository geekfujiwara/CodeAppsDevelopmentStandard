"""Validate the Code Apps CLI reference against the published ``app share --help``.

Usage:
  python validate_cli_reference.py
  python validate_cli_reference.py --help-file path/to/share-help.txt

The default path executes the exact CLI version pinned by generic-base. The
``--help-file`` option supports offline validation and failure-path tests.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

SKILL_ROOT = Path(__file__).resolve().parent.parent
REFERENCE_FILE = SKILL_ROOT / "references" / "cli-reference.md"
TEMPLATE_PACKAGE = SKILL_ROOT / "templates" / "generic-base" / "package.json"

HELP_PATTERNS = {
    "share command description": r"Share the current Power Apps code app with users or service principals\.",
    "principal": r"--principal <principal>",
    "access": r"--access <access>",
    "non-interactive": r"--non-interactive",
    "JSON output": r"--json",
    "play/edit values": r"play \(default\) or edit",
}

REFERENCE_PATTERNS = {
    "principal option": r"--principal <principal>",
    "access option": r"--access <access>",
    "non-interactive option": r"--non-interactive",
    "JSON option": r"--json",
    "user email example": r"pa app share --principal user@contoso\.com",
    "user object ID example": r"pa app share --principal \{USER_OBJECT_ID\}",
    "service principal example": r"pa app share --principal \{SERVICE_PRINCIPAL_OBJECT_ID\}",
    "multiple principals example": (
        r"--principal\s+[\"']user@contoso\.com,\{USER_OBJECT_ID\},\{SERVICE_PRINCIPAL_OBJECT_ID\}[\"']"
    ),
    "least-privilege play guidance": r"通常利用者は既定の `play`",
    "explicit edit example": r"--principal \{DEVELOPER_USER_OBJECT_ID\} --access edit",
    "push before share automation": r"pa app push[\s\S]+pa app share",
}


def pinned_cli_version() -> str:
    package = json.loads(TEMPLATE_PACKAGE.read_text(encoding="utf-8"))
    version = package["devDependencies"]["@microsoft/power-apps-cli"]
    return version.lstrip("~^")


def run_share_help() -> str:
    npx = shutil.which("npx")
    if not npx:
        raise RuntimeError("npx が見つかりません。Node.js 22 以上をインストールしてください。")

    version = pinned_cli_version()
    # bin 名は pa。share は app group 配下（v1.0.0 で power-apps share から変更）。
    command = [
        npx,
        "--yes",
        "--package",
        f"@microsoft/power-apps-cli@{version}",
        "pa",
        "app",
        "share",
        "--help",
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"share --help の取得に失敗しました (exit {result.returncode}): {detail}")
    return result.stdout


def share_section(reference: str) -> str:
    match = re.search(r"^### `app share`\s*$([\s\S]*?)(?=^## |\Z)", reference, re.MULTILINE)
    if not match:
        raise RuntimeError("cli-reference.md に `### `app share`` 節がありません。")
    return match.group(1)


def missing_patterns(text: str, patterns: dict[str, str]) -> list[str]:
    return [label for label, pattern in patterns.items() if not re.search(pattern, text)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--help-file", type=Path, help="保存済み share --help 出力を使用する")
    parser.add_argument("--reference-file", type=Path, default=REFERENCE_FILE, help="検証する CLI リファレンス")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        help_text = args.help_file.read_text(encoding="utf-8") if args.help_file else run_share_help()
        reference = args.reference_file.read_text(encoding="utf-8")
        section = share_section(reference)
    except (OSError, KeyError, RuntimeError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    errors = [f"CLI help にありません: {label}" for label in missing_patterns(help_text, HELP_PATTERNS)]
    errors.extend(
        f"cli-reference.md の share 節にありません: {label}"
        for label in missing_patterns(section, REFERENCE_PATTERNS)
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    source = str(args.help_file) if args.help_file else f"@microsoft/power-apps-cli@{pinned_cli_version()}"
    print(f"OK: share CLI help and documentation are aligned ({source})")
    return 0


if __name__ == "__main__":
    sys.exit(main())