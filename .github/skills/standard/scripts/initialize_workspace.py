"""Copy development standards into a workspace without overwriting local customizations."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


COPY_ROOTS = (Path(".github/agents"), Path(".github/skills"))
EXCLUDED_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", "dist"}


def require_safe_destination(target: Path, relative: Path) -> Path:
    destination = target / relative
    for part in (destination, *destination.parents):
        if part == target:
            break
        if part.is_symlink():
            raise ValueError(f"Refusing symlink destination: {relative}")
        if part != destination and part.exists() and not part.is_dir():
            raise ValueError(f"Destination parent is not a directory: {relative}")
    if not destination.resolve().is_relative_to(target):
        raise ValueError(f"Destination escapes workspace: {relative}")
    return destination


def install_workspace(source: Path, target: Path, *, apply: bool = False) -> dict:
    source = source.resolve()
    target = target.resolve()
    for relative in COPY_ROOTS:
        if not require_safe_destination(source, relative).is_dir():
            raise ValueError(f"Missing source directory: {relative}")
    ignore_source = require_safe_destination(
        source, Path(".github/skills/standard/references/gitignore-template")
    )
    ignore_text = ignore_source.read_text(encoding="utf-8")
    files = []
    for relative in COPY_ROOTS:
        for path in sorted((source / relative).rglob("*")):
            if any(part in EXCLUDED_DIRS for part in path.relative_to(source).parts):
                continue
            if path.is_symlink():
                raise ValueError(f"Refusing symlink source: {path.relative_to(source)}")
            if path.is_file():
                if path.name.startswith(".env") and not path.name.endswith(".example"):
                    continue
                files.append(path.relative_to(source))
    prompt = Path(".github/prompts/quickstart.prompt.md")
    if require_safe_destination(source, prompt).is_file():
        files.append(prompt)

    report: dict[str, list[str]] = {"copied": [], "unchanged": [], "conflicts": []}
    pending = []
    for relative in files:
        destination = require_safe_destination(target, relative)
        if destination.exists():
            if destination.is_file() and destination.read_bytes() == (source / relative).read_bytes():
                report["unchanged"].append(relative.as_posix())
            else:
                report["conflicts"].append(relative.as_posix())
        else:
            report["copied"].append(relative.as_posix())
            pending.append(relative)
    ignore_path = require_safe_destination(target, Path(".gitignore"))
    existing_ignore = ignore_path.read_text(encoding="utf-8") if ignore_path.exists() else ""
    missing_lines = [
        line for line in dict.fromkeys(ignore_text.splitlines())
        if line and line not in existing_ignore.splitlines()
    ]
    if apply:
        for relative in pending:
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / relative, destination)
        if missing_lines:
            target.mkdir(parents=True, exist_ok=True)
            separator = "" if not existing_ignore or existing_ignore.endswith("\n") else "\n"
            with ignore_path.open("a", encoding="utf-8") as handle:
                handle.write(separator + "\n# Development standard\n" + "\n".join(missing_lines) + "\n")
    report["gitignore_added"] = missing_lines
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Downloaded standard repository root")
    parser.add_argument("--target", type=Path, default=Path.cwd())
    parser.add_argument("--apply", action="store_true", help="Copy missing files and merge .gitignore")
    args = parser.parse_args()
    try:
        report = install_workspace(args.source, args.target, apply=args.apply)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    for key, values in report.items():
        print(f"{key}: {len(values)}")
        if key == "conflicts":
            for path in values:
                print(f"  PRESERVED: {path}")
    if report["conflicts"]:
        print("Local files were preserved. Review and merge relevant differences before continuing.")
        return 2
    print("Workspace files ready. Continue with authentication, document discovery and architecture; do not stop here."
          if args.apply else "Plan only. Re-run with --apply to install.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
