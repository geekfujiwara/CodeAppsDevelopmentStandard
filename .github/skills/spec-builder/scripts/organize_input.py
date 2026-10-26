"""Plan or move explicitly selected root business documents into spec/input."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from document_io import SUPPORTED_EXTENSIONS, sha256_of


PROTECTED_STEMS = {
    "readme", "agents", "license", "licence", "notice", "security",
    "contributing", "code_of_conduct", "changelog", "copilot-instructions", "index",
}


def organize_documents(
    workspace: Path, names: list[str], *, apply: bool = False,
) -> list[tuple[Path, Path]]:
    workspace = workspace.resolve(strict=True)
    if not workspace.is_dir():
        raise ValueError("Workspace must be a directory.")
    if not names:
        raise ValueError("Select at least one root business document.")
    destination_dir = workspace / "spec" / "input"
    for directory in (workspace / "spec", destination_dir):
        if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
            raise ValueError(f"Unsafe input directory: {directory}")

    plan = []
    selected = set()
    for name in names:
        source = workspace / name
        if Path(name).name != name or name.startswith("."):
            raise ValueError(f"Only root business document filenames are allowed: {name}")
        if (
            source.suffix.lower() not in SUPPORTED_EXTENSIONS
            or source.stem.lower().split(".")[0] in PROTECTED_STEMS
        ):
            raise ValueError(f"Not a business document or protected project file: {name}")
        if name.casefold() in selected:
            raise ValueError(f"Duplicate document: {name}")
        selected.add(name.casefold())
        if source.is_symlink() or not source.is_file():
            raise ValueError(f"Source must be an existing regular file: {name}")
        destination = destination_dir / name
        if destination.exists() or destination.is_symlink():
            raise FileExistsError(f"Input document already exists; no files moved: {destination}")
        plan.append((source, destination))

    if apply:
        destination_dir.mkdir(parents=True, exist_ok=True)
        for source, destination in plan:
            original_hash = sha256_of(source)
            # Exclusive creation also prevents overwriting a file created after preflight.
            with destination.open("xb") as output:
                try:
                    with source.open("rb") as input_file:
                        shutil.copyfileobj(input_file, output)
                except OSError:
                    output.close()
                    destination.unlink()
                    raise
            if sha256_of(destination) != original_hash or sha256_of(source) != original_hash:
                raise RuntimeError(f"Document changed during copy; source preserved: {source}")
            shutil.copystat(source, destination)
            source.unlink()
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--file", action="append", required=True, dest="names")
    parser.add_argument("--apply", action="store_true", help="Move after validating the full plan")
    args = parser.parse_args()
    try:
        plan = organize_documents(args.workspace, args.names, apply=args.apply)
    except (OSError, ValueError, RuntimeError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    for source, destination in plan:
        print(f"{'MOVED' if args.apply else 'PLAN'}: {source} -> {destination}")
    if not args.apply:
        print("Plan only. Re-run with --apply to move the selected documents.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
