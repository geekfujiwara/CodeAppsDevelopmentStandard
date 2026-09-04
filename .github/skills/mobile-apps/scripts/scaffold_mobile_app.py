"""Scaffold the pinned Microsoft Power Apps mobile template on Windows or Unix."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

SKILL_ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = SKILL_ROOT / "references" / "upstream-template.json"


def executable(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} が見つかりません。Node.js 22 以上を確認してください。")
    return path


def run(command: list[str], cwd: Path | None = None) -> None:
    print(f"> {' '.join(command)}")
    subprocess.run(command, cwd=cwd, check=True)


def load_snapshot() -> dict[str, object]:
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, required=True, help="作成先。空または未存在であること")
    parser.add_argument("--preview-approved", action="store_true", help="Private Preview／本番禁止への明示承認")
    parser.add_argument("--refresh-approval", action="store_true", help="既存 project の承認 marker だけを再発行する")
    parser.add_argument("--install", action="store_true", help="npm install を実行する")
    parser.add_argument("--type-check", action="store_true", help="npm run type-check を実行する")
    parser.add_argument("--environment-id", help="指定時は MobileApp init を実行する")
    parser.add_argument("--display-name", help="MobileApp の表示名")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = args.target.resolve()
    if not args.preview_approved:
        print("ERROR: --preview-approved が必要です。Preview 利用と本番禁止の明示承認を先に取得してください。", file=sys.stderr)
        return 1
    if target.exists() and any(target.iterdir()) and not args.refresh_approval:
        print(f"ERROR: 作成先が空ではありません: {target}", file=sys.stderr)
        return 1
    if args.refresh_approval and not (target / "package.json").is_file():
        print("ERROR: --refresh-approval の対象に package.json がありません。", file=sys.stderr)
        return 1
    if args.refresh_approval and any((args.install, args.type_check, args.environment_id, args.display_name)):
        print("ERROR: --refresh-approval は他の実行オプションと併用できません。", file=sys.stderr)
        return 1
    if bool(args.environment_id) != bool(args.display_name):
        print("ERROR: --environment-id と --display-name は同時に指定してください。", file=sys.stderr)
        return 1

    snapshot = load_snapshot()
    repository = snapshot["repository"]
    template_path = snapshot["templatePath"]
    commit = snapshot["commit"]
    cli_version = snapshot["cliVersion"]
    degit_version = snapshot["degitVersion"]
    source = f"{repository}/{template_path}#{commit}"

    approval = {
        "previewApproved": True,
        "productionAllowed": False,
        "approvedAt": datetime.now(timezone.utc).isoformat(),
        "upstreamCommit": commit,
    }
    if args.refresh_approval:
        (target / "mobile-preview-approval.json").write_text(
            json.dumps(approval, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"OK: Preview approval refreshed at {target}")
        return 0

    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        run([executable("npx"), "--yes", f"degit@{degit_version}", source, str(target)])
        (target / "mobile-preview-approval.json").write_text(
            json.dumps(approval, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if args.install or args.type_check:
            run([executable("npm"), "install", "--no-audit", "--no-fund"], cwd=target)
        if args.environment_id:
            run(
                [
                    executable("npx"),
                    "--yes",
                    "--package",
                    f"@microsoft/power-apps-cli@{cli_version}",
                    "pa",
                    "app",
                    "init",
                    "-t",
                    "MobileApp",
                    "--display-name",
                    args.display_name,
                    "--environment-id",
                    args.environment_id,
                    "--non-interactive",
                ],
                cwd=target,
            )
        if args.type_check:
            run([executable("npm"), "run", "type-check"], cwd=target)
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"OK: mobile template {commit} scaffolded at {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())