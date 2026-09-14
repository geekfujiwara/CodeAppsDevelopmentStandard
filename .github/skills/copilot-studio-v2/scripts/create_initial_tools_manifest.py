"""Create a prevalidated manifest for initial Copilot Studio tool provisioning."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from mcp_tool_plan import canonical_hash


def build_manifest(approvals: list[tuple[Path, str]], output: Path) -> dict:
    if not approvals:
        raise ValueError("At least one --approval PLAN=HASH is required")
    target = None
    tool_keys: set[tuple[str, str]] = set()
    items = []
    for plan_path, expected_hash in approvals:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        if canonical_hash(plan) != expected_hash:
            raise ValueError(f"Approval hash mismatch: {plan_path.name}")
        current_target = (
            str(plan.get("environmentId", "")).lower(),
            str(plan.get("botId", "")).lower(),
        )
        if not all(current_target):
            raise ValueError(f"Plan target is missing: {plan_path.name}")
        if target is None:
            target = current_target
        elif current_target != target:
            raise ValueError("All initial tool plans must target one environment and bot")
        tool_key = (
            str(plan.get("connectorId", "")).lower(),
            str(plan.get("operationId", "")).lower(),
        )
        if not all(tool_key):
            raise ValueError(f"Plan tool identity is missing: {plan_path.name}")
        if tool_key in tool_keys:
            raise ValueError("Duplicate initial tool approval")
        tool_keys.add(tool_key)
        relative_path = os.path.relpath(plan_path.resolve(), output.parent.resolve())
        items.append({"planPath": relative_path, "expectedHash": expected_hash})
    return {
        "contract": "copilot-studio-v2-initial-tools/2026-09-14",
        "approvals": items,
    }


def parse_approval(value: str) -> tuple[Path, str]:
    plan_path, separator, expected_hash = value.rpartition("=")
    if not separator or not plan_path or len(expected_hash) != 64:
        raise argparse.ArgumentTypeError("Use PLAN_FILE=EXPECTED_SHA256")
    return Path(plan_path), expected_hash.lower()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--approval", action="append", type=parse_approval, required=True)
    parser.add_argument("--output", type=Path, default=Path(".mcp/initial-tools.json"))
    args = parser.parse_args()
    manifest = build_manifest(args.approval, args.output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({
        "status": "ready",
        "toolCount": len(manifest["approvals"]),
        "manifest": str(args.output),
    }))


if __name__ == "__main__":
    main()