"""Validate a Power Apps Native Mobile Code App without requiring authentication."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = SKILL_ROOT / "references" / "upstream-template.json"
GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
REQUIRED_FILES = ("package.json", "app.config.js", "auth.config.json", "tsconfig.json", "app/_layout.tsx")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("--template-only", action="store_true", help="未設定の公式 scaffold の構造だけを検証する")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def source_text(root: Path) -> str:
    files: list[Path] = []
    for directory in (root / "app", root / "src"):
        if directory.exists():
            files.extend(directory.rglob("*.ts"))
            files.extend(directory.rglob("*.tsx"))
    return "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in files)


def claims_offline_runtime_support(source: str) -> bool:
    patterns = (
        r"\b(?:is)?offline(?:Ready|Supported|Complete)\s*=\s*true\b",
        r"[\"'](?:is)?offline(?:Ready|Supported|Complete)[\"']\s*:\s*true\b",
    )
    return any(re.search(pattern, source, re.I) for pattern in patterns)


def main() -> int:
    args = parse_args()
    root = args.project.resolve()
    errors: list[str] = []
    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            errors.append(f"必須ファイルがありません: {relative}")

    try:
        snapshot = load_json(SNAPSHOT)
        package = load_json(root / "package.json")
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    dependencies = package.get("dependencies", {})
    dev_dependencies = package.get("devDependencies", {})
    if not isinstance(dependencies, dict) or not isinstance(dev_dependencies, dict):
        errors.append("package.json の dependencies / devDependencies が不正です")
        dependencies = {}
        dev_dependencies = {}
    expected_dependencies = snapshot.get("dependencies", {})
    if not isinstance(expected_dependencies, dict):
        errors.append("upstream-template.json の dependencies が不正です")
        expected_dependencies = {}
    for name, version in expected_dependencies.items():
        actual = dev_dependencies.get(name) if name == "typescript" else dependencies.get(name)
        if actual != version:
            errors.append(f"依存バージョン不一致: {name} expected={version} actual={actual}")

    approval_path = root / "mobile-preview-approval.json"
    if not approval_path.is_file():
        errors.append("mobile-preview-approval.json がありません")
    else:
        try:
            approval = load_json(approval_path)
            if approval.get("previewApproved") is not True:
                errors.append("Preview 利用が承認されていません")
            if approval.get("productionAllowed") is not False:
                errors.append("Private Preview では productionAllowed は false 必須です")
            if approval.get("upstreamCommit") != snapshot.get("commit"):
                errors.append("Preview marker と upstream snapshot の commit が一致しません")
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"Preview marker が不正です: {error}")

    auth_path = root / "auth.config.json"
    if auth_path.is_file() and not args.template_only:
        try:
            msal = load_json(auth_path).get("msal", {})
            for key in ("clientId", "tenantId"):
                value = msal.get(key) if isinstance(msal, dict) else None
                if not isinstance(value, str) or not GUID.fullmatch(value):
                    errors.append(f"auth.config.json の msal.{key} が未設定または GUID ではありません")
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"auth.config.json が不正です: {error}")

    layout_path = root / "app" / "_layout.tsx"
    if layout_path.is_file():
        layout = layout_path.read_text(encoding="utf-8", errors="ignore")
        if "PowerAppsProvider" not in layout:
            errors.append("app/_layout.tsx に PowerAppsProvider がありません")
        if not args.template_only and "SafeAreaProvider" not in layout:
            errors.append("app/_layout.tsx に SafeAreaProvider がありません")

    source = source_text(root)
    native_imports = re.findall(
        r"from\s+['\"](expo-[^/'\"]+|@microsoft/power-apps-native-[^/'\"]+)", source
    )
    for module in native_imports:
        if module not in dependencies:
            errors.append(f"allowlist 外の native module import: {module}")
    if re.search(r"\bfetch\s*\(|\baxios(?:\.|\s*\()", source):
        errors.append("connector-first 違反: fetch/axios の直接呼び出しがあります")
    if claims_offline_runtime_support(source):
        errors.append("未検証 offline runtime を対応済みとして扱う記述があります")

    power_config = root / "power.config.json"
    if not args.template_only and not power_config.is_file():
        errors.append("power.config.json がありません。MobileApp init を実行してください")
    elif power_config.is_file():
        try:
            config = load_json(power_config)
            app_type = config.get("appType")
            if app_type is not None and app_type != "MobileApp":
                errors.append("power.config.json の appType が MobileApp ではありません")
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"power.config.json が不正です: {error}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    mode = "template" if args.template_only else "project"
    print(f"OK: Native Mobile Code App {mode} validated ({root})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
