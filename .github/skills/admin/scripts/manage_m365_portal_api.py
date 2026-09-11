"""M365 管理センター private API の承認 plan を検証する。

実送信はログイン済み VS Code 統合ブラウザの同一オリジン fetch で行う。
このスクリプトは観測済み endpoint 以外を拒否し、dry-run の PLAN_HASH を生成する。
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


CONTRACTS = {
    "frontier-access": {
        "method": "POST",
        "path": "/admin/api/settings/company/frontier/access",
        "readBack": "/admin/api/settings/company/frontier/access",
        "required": {"frontierPolicy", "audienceStatus"},
        "allowed": {
            "frontierPolicy",
            "audienceStatus",
            "assignedUsers",
            "unassignedUsers",
            "assignedGroups",
            "unassignedGroups",
        },
    },
    "agent-availability": {
        "method": "POST",
        "path": "/fd/addins/api/availableAgents",
        "readBack": "/fd/addins/api/agents",
        "required": {"Locale", "Market", "WorkloadManagementList", "SendEmailToUsers"},
        "allowed": {"Locale", "Market", "WorkloadManagementList", "SendEmailToUsers"},
    },
}


def canonical_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def load_payload(path: str) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"payload を読み込めません: {error}") from error
    if not isinstance(value, dict):
        raise SystemExit("payload は JSON object で指定してください。")
    return value


def validate_payload(operation: str, payload: dict[str, Any]) -> None:
    contract = CONTRACTS[operation]
    unknown = sorted(set(payload) - contract["allowed"])
    missing = sorted(contract["required"] - set(payload))
    if unknown:
        raise SystemExit(f"未確認の payload field です: {', '.join(unknown)}")
    if missing:
        raise SystemExit(f"必須 payload field がありません: {', '.join(missing)}")
    if operation == "frontier-access":
        for key in ("assignedUsers", "unassignedUsers", "assignedGroups", "unassignedGroups"):
            if key in payload and not isinstance(payload[key], list):
                raise SystemExit(f"{key} は配列で指定してください。")
    if operation == "agent-availability" and not isinstance(payload["WorkloadManagementList"], list):
        raise SystemExit("WorkloadManagementList は配列で指定してください。")


def build_plan(args: argparse.Namespace) -> dict[str, Any]:
    payload = load_payload(args.payload_file)
    validate_payload(args.operation, payload)
    contract = CONTRACTS[args.operation]
    query: dict[str, str] = {}
    if args.operation == "agent-availability":
        if not args.bot_id or not args.environment_id:
            raise SystemExit("agent-availability では --bot-id と --environment-id が必須です。")
        query = {"botId": args.bot_id, "environmentId": args.environment_id}
    return {
        "origin": "https://admin.cloud.microsoft",
        "operation": args.operation,
        "method": contract["method"],
        "path": contract["path"],
        "query": query,
        "payload": payload,
        "readBack": contract["readBack"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=sorted(CONTRACTS))
    parser.add_argument("--payload-file", required=True)
    parser.add_argument("--bot-id")
    parser.add_argument("--environment-id")
    parser.add_argument("--expected-hash")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    plan = build_plan(args)
    digest = canonical_hash(plan)
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"PLAN_HASH={digest}")
    if not args.apply:
        print("DRY-RUN: 変更していません。")
        return
    if args.expected_hash != digest:
        raise SystemExit("承認済み plan hash が一致しません。")
    print("READY_FOR_BROWSER_API")


if __name__ == "__main__":
    main()
