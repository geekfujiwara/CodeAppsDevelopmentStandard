#!/usr/bin/env python3
"""Build an approval-bound plan for staging an Agent template package."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import uuid
import zipfile
from pathlib import Path
from typing import Any


ORIGIN = "https://admin.cloud.microsoft"
CONTRACT = "m365-agent-template-upload/2026-09-14"
UPLOAD_PATH = "/fd/addins/api/apps/uploadCustomApp"
UPLOAD_QUERY = "workloads=AzureActiveDirectory,WXPO,MetaOS,SharePoint"
TENANT_PATH = "/api/tenantauthorization/GetTenantInfoV2"
FINALIZE_PATH = "/fd/addins/api/v2/actionableApps"
READ_BACK_PATH = "/fd/addins/api/agents"
EXPECTED_FILES = {"manifest.json", "agenticUser.json", "color.png", "outline.png"}
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")


def canonical_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def require_guid(value: str, label: str) -> str:
    try:
        parsed = uuid.UUID(value)
    except ValueError as error:
        raise SystemExit(f"{label} は GUID で指定してください。") from error
    if parsed.int == 0:
        raise SystemExit(f"{label} に zero GUID は指定できません。")
    return str(parsed)


def read_json_entry(package: zipfile.ZipFile, name: str) -> dict[str, Any]:
    try:
        value = json.loads(package.read(name).decode("utf-8-sig"))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"{name} を読み込めません: {error}") from error
    if not isinstance(value, dict):
        raise SystemExit(f"{name} は JSON object である必要があります。")
    return value


def inspect_package(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SystemExit(f"package が見つかりません: {path}")
    package_bytes = path.read_bytes()
    try:
        with zipfile.ZipFile(path) as package:
            names = package.namelist()
            if len(names) != len(set(names)):
                raise SystemExit("package に重複する ZIP entry が含まれています。")
            if len(names) != len(EXPECTED_FILES) or set(names) != EXPECTED_FILES:
                raise SystemExit(
                    "package files が一致しません: "
                    f"expected={sorted(EXPECTED_FILES)}, actual={sorted(names)}"
                )
            manifest = read_json_entry(package, "manifest.json")
            agentic_user = read_json_entry(package, "agenticUser.json")
    except zipfile.BadZipFile as error:
        raise SystemExit("package は有効な ZIP ではありません。") from error

    if manifest.get("manifestVersion") != "devPreview":
        raise SystemExit("manifestVersion は devPreview である必要があります。")
    manifest_id = require_guid(str(manifest.get("id", "")), "manifest id")
    version = manifest.get("version")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise SystemExit("manifest version は x.y.z 形式である必要があります。")
    title = manifest.get("name", {}).get("short")
    if not isinstance(title, str) or not title.strip():
        raise SystemExit("manifest name.short が必要です。")

    templates = manifest.get("agenticUserTemplates")
    if not isinstance(templates, list) or len(templates) != 1:
        raise SystemExit("agenticUserTemplates は 1 件である必要があります。")
    template = templates[0]
    if not isinstance(template, dict) or template.get("file") != "agenticUser.json":
        raise SystemExit("agenticUserTemplates[].file は agenticUser.json である必要があります。")
    template_id = template.get("id")
    if not isinstance(template_id, str) or not template_id or agentic_user.get("id") != template_id:
        raise SystemExit("agenticUser template id が一致しません。")
    blueprint_id = require_guid(
        str(agentic_user.get("agentIdentityBlueprintId", "")), "agentIdentityBlueprintId"
    )

    return {
        "sha256": hashlib.sha256(package_bytes).hexdigest(),
        "size": len(package_bytes),
        "manifestId": manifest_id,
        "version": version,
        "title": title,
        "agenticUserTemplateId": template_id,
        "blueprintId": blueprint_id,
    }


def build_plan(package_path: Path, tenant_id: str) -> dict[str, Any]:
    return {
        "contract": CONTRACT,
        "origin": ORIGIN,
        "operation": "agent-template-stage",
        "tenantId": require_guid(tenant_id, "tenant id"),
        "package": inspect_package(package_path),
        "upload": {
            "method": "POST",
            "path": UPLOAD_PATH,
            "query": UPLOAD_QUERY,
            "fieldName": "AppFile",
            "contentType": "application/x-zip-compressed",
        },
        "tenantRead": TENANT_PATH,
        "finalize": {
            "method": "POST",
            "path": FINALIZE_PATH,
            "command": "FINALIZEPACKAGE",
            "workload": "MetaOS",
        },
        "readBack": READ_BACK_PATH,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", required=True)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-hash")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    plan = build_plan(Path(args.package), args.tenant_id)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    digest = canonical_hash(plan)
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"PLAN_HASH={digest}")
    if not args.apply:
        print("DRY-RUN: upload も publish も実行していません。")
        return
    if args.expected_hash != digest:
        raise SystemExit("承認済み plan hash が一致しません。")
    print("READY_FOR_BROWSER_STAGE")


if __name__ == "__main__":
    main()