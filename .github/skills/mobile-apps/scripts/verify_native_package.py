"""Verify app ID and native Wrap artifacts for a Mobile Code App."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
HERMES_MAGIC = bytes.fromhex("c61fbc03")
ARTIFACTS = (
    ("android", "index.android.bundle.hbc", "powerapps-customer-assets-android/manifest.json"),
    ("ios", "main.jsbundle.hbc", "powerapps-customer-assets-ios/manifest.json"),
)


def load_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON object required: {path}")
    return value


def app_id(root: Path) -> str:
    config = load_json(root / "power.config.json")
    value = config.get("appId")
    return value.strip() if isinstance(value, str) else ""


def preflight(root: Path) -> int:
    try:
        value = app_id(root)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: power.config.json を読み込めません: {error}", file=sys.stderr)
        return 1
    if not value:
        print("FIRST_DEPLOY: appId が未発行です。bundle → push を2サイクル実行してください。")
        return 2
    if not GUID.fullmatch(value):
        print(f"ERROR: power.config.json の appId が GUID ではありません: {value}", file=sys.stderr)
        return 1
    print(f"OK: appId={value}")
    return 0


def verify(root: Path) -> int:
    dist = root / "dist"
    errors: list[str] = []
    if not (dist / "index.html").is_file():
        errors.append("dist/index.html がありません。npm run bundle:web を実行してください")
    for platform, bundle_name, manifest_name in ARTIFACTS:
        bundle = dist / bundle_name
        manifest = dist / manifest_name
        if not bundle.is_file():
            errors.append(f"{platform} Hermes bundle がありません: dist/{bundle_name}")
        else:
            with bundle.open("rb") as stream:
                if stream.read(4) != HERMES_MAGIC:
                    errors.append(f"{platform} bundle の Hermes magic bytes が不正です: dist/{bundle_name}")
        if not manifest.is_file():
            errors.append(f"{platform} customer assets manifest がありません: dist/{manifest_name}")
            continue
        try:
            content = load_json(manifest)
            if not isinstance(content.get("assets"), list):
                errors.append(f"{platform} manifest の assets が配列ではありません")
        except (OSError, json.JSONDecodeError, ValueError) as error:
            errors.append(f"{platform} manifest が不正です: {error}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("OK: web bundle and Android/iOS native packages verified")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("preflight", "verify"))
    parser.add_argument("project", type=Path)
    args = parser.parse_args()
    root = args.project.resolve()
    return preflight(root) if args.command == "preflight" else verify(root)


if __name__ == "__main__":
    sys.exit(main())
