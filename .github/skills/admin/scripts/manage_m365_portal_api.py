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
    "agent-lifecycle": {
        "method": "POST",
        "path": "/fd/addins/api/apps",
        "readBack": "/fd/addins/api/agents",
        "required": {
            "Locale",
            "ContentMarket",
            "WorkloadManagementList",
            "UserAssignmentDetails",
            "DeploymentRolloutType",
            "SendEmailToUsers",
        },
        "allowed": {
            "Locale",
            "ContentMarket",
            "WorkloadManagementList",
            "UserAssignmentDetails",
            "DeploymentRolloutType",
            "SendEmailToUsers",
        },
    },
    "agent-publish": {
        "method": "POST",
        "path": "/fd/addins/api/v2/actionableApps",
        "readBack": "/fd/addins/api/agents",
        "required": {"Apps"},
        "allowed": {"Apps"},
    },
    "agent-permission-approve": {
        "method": "POST",
        "path": "/fd/addins/api/agentActions/approve",
        "readBack": "/fd/addins/api/agents",
        "required": {"requestIds"},
        "allowed": {"requestIds"},
    },
}

LIFECYCLE_COMMANDS = {"DEPLOY", "UPDATE", "UNDEPLOY", "ADDINTOMOSUPDATE", "ADDINMOSMERGE"}
WORKLOAD_FIELDS = {
    "AppsourceAssetID",
    "ProductID",
    "Command",
    "ActiveDirectoryAppId",
    "Version",
    "AppType",
    "AppFileName",
    "AppFileUrl",
    "ApplicationTemplateId",
    "Workload",
    "MosOperationId",
    "TitleID",
}
ASSIGNMENT_FIELDS = {"Members", "DeployToEveryone", "UserAssignmentCategory"}
PUBLISH_COMMANDS = {"APPROVE", "FINALIZEPACKAGE", "UPDATESTAGEDAPP"}
PUBLISH_FIELDS = {"AppId", "Command", "Workload", "IterationEtag", "Version", "TitleId", "MosOperationId"}


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
    if operation == "agent-lifecycle":
        workloads = payload["WorkloadManagementList"]
        if not isinstance(workloads, list) or not workloads:
            raise SystemExit("WorkloadManagementList は空でない配列で指定してください。")
        for workload in workloads:
            if not isinstance(workload, dict):
                raise SystemExit("WorkloadManagementList の各要素は JSON object で指定してください。")
            unknown_workload = sorted(set(workload) - WORKLOAD_FIELDS)
            if unknown_workload:
                raise SystemExit(f"未確認の workload field です: {', '.join(unknown_workload)}")
            if workload.get("Command") not in LIFECYCLE_COMMANDS:
                raise SystemExit("未確認の lifecycle Command です。")
            if not workload.get("ProductID") and not workload.get("AppsourceAssetID"):
                raise SystemExit("workload には ProductID または AppsourceAssetID が必要です。")
        assignments = payload["UserAssignmentDetails"]
        if not isinstance(assignments, dict):
            raise SystemExit("UserAssignmentDetails は JSON object で指定してください。")
        unknown_assignments = sorted(set(assignments) - ASSIGNMENT_FIELDS)
        if unknown_assignments:
            raise SystemExit(f"未確認の UserAssignmentDetails field です: {', '.join(unknown_assignments)}")
        if set(assignments) != ASSIGNMENT_FIELDS:
            raise SystemExit("UserAssignmentDetails の field が不足しています。")
        if not isinstance(assignments["Members"], list):
            raise SystemExit("Members は配列で指定してください。")
        for member in assignments["Members"]:
            if not isinstance(member, dict) or set(member) != {"Id", "Type"}:
                raise SystemExit("Members の各要素には Id と Type が必要です。")
            if member["Type"] not in {"User", "Group"}:
                raise SystemExit("Member Type は User または Group で指定してください。")
        if not isinstance(assignments["DeployToEveryone"], bool):
            raise SystemExit("DeployToEveryone は boolean で指定してください。")
        if assignments["UserAssignmentCategory"] not in {"None", "Everyone", "SpecificUsers", "NoOne"}:
            raise SystemExit("未確認の UserAssignmentCategory です。")
        if payload["DeploymentRolloutType"] not in {"None", "FullRollout", "TestRollout"}:
            raise SystemExit("未確認の DeploymentRolloutType です。")
        if not isinstance(payload["SendEmailToUsers"], bool):
            raise SystemExit("SendEmailToUsers は boolean で指定してください。")
    if operation == "agent-publish":
        apps = payload["Apps"]
        if not isinstance(apps, list) or not apps:
            raise SystemExit("Apps は空でない配列で指定してください。")
        for app in apps:
            if not isinstance(app, dict):
                raise SystemExit("Apps の各要素は JSON object で指定してください。")
            unknown_app = sorted(set(app) - PUBLISH_FIELDS)
            if unknown_app:
                raise SystemExit(f"未確認の publish field です: {', '.join(unknown_app)}")
            if not app.get("AppId") or not app.get("Workload"):
                raise SystemExit("publish app には AppId と Workload が必要です。")
            if app.get("Command") not in PUBLISH_COMMANDS:
                raise SystemExit("未確認の publish Command です。")
    if operation == "agent-permission-approve":
        request_ids = payload["requestIds"]
        if not isinstance(request_ids, list) or not request_ids:
            raise SystemExit("requestIds は空でない配列で指定してください。")
        if any(not isinstance(value, str) or not value.strip() for value in request_ids):
            raise SystemExit("requestIds の各要素は空でない文字列で指定してください。")


def build_plan(args: argparse.Namespace) -> dict[str, Any]:
    payload = load_payload(args.payload_file)
    validate_payload(args.operation, payload)
    contract = CONTRACTS[args.operation]
    query: dict[str, str] = {}
    if args.operation == "agent-availability":
        if not args.bot_id or not args.environment_id:
            raise SystemExit("agent-availability では --bot-id と --environment-id が必須です。")
        query = {"botId": args.bot_id, "environmentId": args.environment_id}
    if args.operation == "agent-permission-approve":
        if not args.workload:
            raise SystemExit("agent-permission-approve では --workload が必須です。")
        query = {"workload": args.workload}
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
    parser.add_argument("--workload")
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
