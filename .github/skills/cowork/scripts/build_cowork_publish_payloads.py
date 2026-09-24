"""Cowork プラグインを private API で新規公開 / 更新するための plan 用 payload を生成する。

入力は admin スキルの m365_portal_browser_runner.mjs の stageCustomApp() が返した JSON
（titleId / mosOperationId / currentVersion / latestVersion）。書き込みは行わない。
生成した各 payload は admin の manage_m365_portal_api.py で dry-run → PLAN_HASH 承認 → apply し、
runner で順番に送信する。

  新規 (--mode new):    1-finalize.json (agent-publish FINALIZEPACKAGE)
                        2-allow.json    (agent-allow ALLOW: インストールできる利用者)
                        3-deploy.json   (agent-lifecycle DEPLOY: 事前インストールする利用者。--install-to 無しなら省略)
  更新 (--mode update): 1-update-app.json (agent-update-app UPDATEAPP。公開対象と利用者の Connect は維持)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
TITLE_ID = re.compile(r"^T_[0-9a-f-]{36}$", re.IGNORECASE)


def load_stage(path: str) -> dict[str, Any]:
    stage = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not stage.get("ok"):
        raise SystemExit(f"ステージが成功していません: {stage.get('statusCode')} {stage.get('errorMessage')}")
    if not TITLE_ID.match(stage.get("titleId") or ""):
        raise SystemExit("titleId（T_...）がありません。")
    if not GUID.match(stage.get("mosOperationId") or ""):
        raise SystemExit("mosOperationId がありません。")
    return stage


def assignment(object_ids: list[str], group_ids: list[str]) -> dict[str, Any]:
    for value in object_ids + group_ids:
        if not GUID.match(value):
            raise SystemExit(f"オブジェクト ID が GUID ではありません: {value}")
    members = [{"Id": value, "Type": "User"} for value in object_ids] + [{"Id": value, "Type": "Group"} for value in group_ids]
    if not members:
        raise SystemExit("公開対象のユーザーまたはグループを 1 件以上指定してください（全員公開はこのスクリプトでは扱わない）。")
    return {"Members": members, "DeployToEveryone": False, "UserAssignmentCategory": "SpecificUsers"}


def workload(stage: dict[str, Any], command: str, workload_name: str, version: str) -> dict[str, Any]:
    title_id = stage["titleId"]
    return {
        "AppsourceAssetID": title_id,
        "ProductID": title_id,
        "Command": command,
        "Version": version,
        "AppType": stage.get("appType") or "LOB",
        "ApplicationTemplateId": None,
        "Workload": workload_name,
        "TitleID": title_id,
    }


def build_new(stage: dict[str, Any], args: argparse.Namespace) -> dict[str, dict[str, Any]]:
    version = stage.get("currentVersion") or stage.get("latestVersion")
    if not version:
        raise SystemExit("version がありません。")
    publish_to = assignment(args.publish_to, args.publish_group)
    payloads = {
        "1-finalize.json": {
            "Apps": [
                {
                    "AppId": stage["titleId"],
                    "Command": "FINALIZEPACKAGE",
                    "Workload": "MetaOS",
                    "Version": version,
                    "MosOperationId": stage["mosOperationId"],
                }
            ]
        },
        "2-allow.json": {
            "Locale": args.locale,
            "ContentMarket": args.locale,
            "WorkloadManagementList": [workload(stage, "ALLOW", "SharedAgent", version)],
            "UserAssignmentDetails": publish_to,
            "SendEmailToUsers": False,
        },
    }
    if args.install_to or args.install_group:
        deploy_item = workload(stage, "DEPLOY", "MetaOS", version)
        # MosOperationId が無いと DEPLOY は "OperationId is null or empty" で Failed になる
        deploy_item["MosOperationId"] = stage["mosOperationId"]
        payloads["3-deploy.json"] = {
            "Locale": args.locale,
            "ContentMarket": args.locale,
            "WorkloadManagementList": [deploy_item],
            "UserAssignmentDetails": assignment(args.install_to, args.install_group),
            "DeploymentRolloutType": "FullRollout",
            "SendEmailToUsers": False,
        }
    return payloads


def build_update(stage: dict[str, Any], args: argparse.Namespace) -> dict[str, dict[str, Any]]:
    version = stage.get("latestVersion")
    if not version or version == stage.get("currentVersion"):
        raise SystemExit("latestVersion が currentVersion と同じです。manifest の version を上げて再ステージしてください。")
    item = workload(stage, "UPDATEAPP", "MetaOS", version)
    item.update({"AppsourceAssetID": None, "ActiveDirectoryAppId": None, "MosOperationId": stage["mosOperationId"]})
    return {
        "1-update-app.json": {
            "Locale": args.locale,
            "ContentMarket": args.locale,
            "SendEmailToUsers": False,
            "WorkloadManagementList": [item],
        }
    }


OPERATIONS = {
    "1-finalize.json": "agent-publish",
    "2-allow.json": "agent-allow",
    "3-deploy.json": "agent-lifecycle",
    "1-update-app.json": "agent-update-app",
}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["new", "update"], required=True)
    parser.add_argument("--stage-file", required=True, help="stageCustomApp() の戻り値を保存した JSON")
    parser.add_argument("--publish-to", action="append", default=[], help="インストールできるユーザーの Entra オブジェクト ID（複数可）")
    parser.add_argument("--publish-group", action="append", default=[], help="インストールできるグループのオブジェクト ID（複数可）")
    parser.add_argument("--install-to", action="append", default=[], help="事前インストールするユーザーのオブジェクト ID（複数可）")
    parser.add_argument("--install-group", action="append", default=[], help="事前インストールするグループのオブジェクト ID（複数可）")
    parser.add_argument("--locale", default="en")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    stage = load_stage(args.stage_file)
    payloads = build_new(stage, args) if args.mode == "new" else build_update(stage, args)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, payload in payloads.items():
        (out_dir / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{name} -> manage_m365_portal_api.py {OPERATIONS[name]} --payload-file {out_dir / name}")


if __name__ == "__main__":
    main()
