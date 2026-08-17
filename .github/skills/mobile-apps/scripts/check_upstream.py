"""Compare the pinned mobile-apps template commit with upstream main."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "references" / "upstream-template.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--head-commit", help="ネットワークを使わず指定 commit と比較する")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    pinned = snapshot["commit"]
    if args.head_commit:
        head = args.head_commit
    else:
        result = subprocess.run(
            ["git", "ls-remote", f"https://github.com/{snapshot['repository']}.git", "refs/heads/main"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode != 0 or not result.stdout.strip():
            print(f"ERROR: upstream HEAD を取得できません: {result.stderr.strip()}", file=sys.stderr)
            return 1
        head = result.stdout.split()[0]

    if head == pinned:
        print(f"OK: mobile-apps upstream is current ({pinned})")
        return 0
    print(f"UPDATE: pinned={pinned} upstream={head}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
