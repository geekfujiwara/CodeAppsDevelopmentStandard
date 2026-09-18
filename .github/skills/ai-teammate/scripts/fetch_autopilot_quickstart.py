#!/usr/bin/env python3
"""Fetch the Microsoft Foundry Autopilot quickstart into a target directory.

The ``foundry-autopilot`` hosting option does not vendor Microsoft's activity-protocol host into
this skill: that host is large, changes upstream, and forking it would silently freeze the agent
on an old protocol version. Instead the upstream quickstart is downloaded here and the skill's
own delta (Copilot SDK brain, skill sync, image tool, test worker, tooling manifest) is layered
on top by ``scaffold_ai_teammate.py``.

Only files that do not already exist are written unless ``--force`` is given, so re-running this
after local edits is safe.

Usage:
    python scripts/fetch_autopilot_quickstart.py --target . --check
    python scripts/fetch_autopilot_quickstart.py --target .
    python scripts/fetch_autopilot_quickstart.py --target . --ref main --force
"""

from __future__ import annotations

import argparse
import io
import os
import shutil
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

DEFAULT_REPO = "microsoft-foundry/foundry-samples"
DEFAULT_REF = "main"
DEFAULT_SUBPATH = "samples/python/foundry-autopilot-agent"
USER_AGENT = "ai-teammate-autopilot-fetch"
# Everything under the quickstart except files the skill replaces outright or that would
# overwrite scaffolded state.
SKIP_NAMES = {".azure", ".git", ".github"}


def fetch(url: str) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def is_safe_member(name: str) -> bool:
    """Reject archive paths that would escape the staging directory.

    Tar entries use POSIX separators, so ``/etc/passwd`` must be rejected even on Windows, where
    ``Path("/etc/passwd").is_absolute()`` is False because there is no drive letter.
    """
    normalized = name.replace("\\", "/")
    if normalized.startswith("/"):
        return False
    if ".." in PurePosixPath(normalized).parts:
        return False
    return not Path(normalized).is_absolute()


def extract(archive: bytes, subpath: str, destination: Path, force: bool) -> tuple[int, int]:
    written = skipped = 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        members = tar.getmembers()
        if not members:
            raise SystemExit("ダウンロードしたアーカイブが空です")
        # GitHub tarballs are rooted at "<repo>-<sha>/"; strip it so subpath matching works.
        root = members[0].name.split("/", 1)[0]
        prefix = f"{root}/{subpath.strip('/')}/"
        with tempfile.TemporaryDirectory() as staging_dir:
            staging = Path(staging_dir)
            selected = [m for m in members if m.name.startswith(prefix) and m.isfile()]
            if not selected:
                raise SystemExit(f"アーカイブに {subpath} が含まれていません（--subpath を確認してください）")
            for member in selected:
                relative = Path(member.name[len(prefix):])
                if not is_safe_member(str(relative)):
                    continue  # never let an archive path escape the staging directory
                if set(relative.parts) & SKIP_NAMES:
                    continue
                extracted = tar.extractfile(member)
                if extracted is None:
                    continue
                staged = staging / relative
                staged.parent.mkdir(parents=True, exist_ok=True)
                staged.write_bytes(extracted.read())

            for staged in sorted(staging.rglob("*")):
                if not staged.is_file():
                    continue
                relative = staged.relative_to(staging)
                final = destination / relative
                if final.exists() and not force:
                    skipped += 1
                    continue
                final.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(staged, final)
                written += 1
    return written, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", type=Path, default=Path("."), help="展開先ディレクトリ")
    parser.add_argument("--repo", default=os.environ.get("AUTOPILOT_QUICKSTART_REPO", DEFAULT_REPO))
    parser.add_argument("--ref", default=os.environ.get("AUTOPILOT_QUICKSTART_REF", DEFAULT_REF))
    parser.add_argument("--subpath", default=os.environ.get("AUTOPILOT_QUICKSTART_SUBPATH", DEFAULT_SUBPATH))
    parser.add_argument("--force", action="store_true", help="既存ファイルも上書きする")
    parser.add_argument("--check", action="store_true", help="取得可能かだけ確認し、書き込まない")
    args = parser.parse_args()

    url = f"https://codeload.github.com/{args.repo}/tar.gz/refs/heads/{args.ref}"
    print(f"== Foundry Autopilot クイックスタートを取得します ==\n  {args.repo}@{args.ref} : {args.subpath}")
    try:
        archive = fetch(url)
    except urllib.error.HTTPError as exc:
        print(f"ダウンロードに失敗しました: HTTP {exc.code} {url}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        print(f"ダウンロードに失敗しました: {exc}", file=sys.stderr)
        return 2

    if args.check:
        with tempfile.TemporaryDirectory() as probe:
            written, _ = extract(archive, args.subpath, Path(probe), force=True)
        print(f"  OK {written} ファイルを取得できます（--check のため書き込みません）")
        return 0

    target = args.target.resolve()
    target.mkdir(parents=True, exist_ok=True)
    written, skipped = extract(archive, args.subpath, target, args.force)
    print(f"  OK 展開 {written} ファイル / 既存のためスキップ {skipped} ファイル → {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
