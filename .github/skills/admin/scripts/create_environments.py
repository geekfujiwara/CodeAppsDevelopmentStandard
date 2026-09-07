"""ブループリントに定義した環境のうち、まだ存在しないものを作成して環境グループに割り当てる。

環境名は environment_naming.py の命名規則で決めるため、名前を都度考える必要はない。

使い方:
    python create_environments.py --tenant-id <ID>                       # 不足している環境を一覧（dry-run）
    python create_environments.py --tenant-id <ID> --apply               # 不足している環境を作成
    python create_environments.py --tenant-id <ID> --group "AI CoE 内製開発グループ" --apply
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402
from environment_naming import DEFAULT_BLUEPRINT, build_names, load_blueprint  # noqa: E402

BAP = "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform"
BAP_SCOPE = "https://service.powerapps.com/.default"
API_VERSION = "2021-04-01"
_TIMEOUT = 180

# ブループリントの type を BAP の environmentSku に対応させる
SKU = {
    "Sandbox": "Sandbox",
    "Production": "Production",
    "Developer": "Developer",
    "Trial": "Trial",
    "Default": "Default",
}


def _request(method: str, url: str, body: dict | None = None) -> requests.Response:
    for attempt in range(4):
        try:
            return requests.request(
                method,
                url,
                headers={"Authorization": f"Bearer {get_token(scope=BAP_SCOPE)}", "Content-Type": "application/json"},
                json=body,
                timeout=_TIMEOUT,
            )
        except requests.exceptions.RequestException:
            if attempt == 3:
                raise
            time.sleep(3)
    raise RuntimeError("unreachable")


def list_environments() -> list[dict]:
    response = _request("GET", f"{BAP}/scopes/admin/environments?api-version={API_VERSION}&$expand=properties")
    response.raise_for_status()
    return response.json().get("value", [])


def list_groups(tenant_id: str) -> dict[str, str]:
    host = "https://api.powerplatform.com"
    for attempt in range(4):
        try:
            response = requests.get(
                f"{host}/environmentmanagement/environmentGroups?api-version=2024-10-01",
                headers={"Authorization": f"Bearer {get_token(scope='https://api.powerplatform.com/.default')}"},
                timeout=_TIMEOUT,
            )
            break
        except requests.exceptions.RequestException:
            if attempt == 3:
                raise
            time.sleep(3)
    response.raise_for_status()
    return {group["displayName"]: group["id"] for group in response.json().get("value", [])}


def create_environment(spec: dict) -> requests.Response:
    body = {
        "location": spec["location"],
        "properties": {
            "displayName": spec["displayName"],
            "description": spec.get("description", ""),
            "environmentSku": spec["sku"],
            "databaseType": "CommonDataService",
            "linkedEnvironmentMetadata": {
                "baseLanguage": spec["baseLanguage"],
                "domainName": spec["domainName"],
                "currency": {"code": spec["currency"]},
                "templates": [],
            },
        },
    }
    return _request("POST", f"{BAP}/scopes/admin/environments?api-version={API_VERSION}", body)


def wait_for_environment(display_name: str, attempts: int = 30) -> dict | None:
    for _ in range(attempts):
        time.sleep(20)
        for environment in list_environments():
            if (environment.get("properties") or {}).get("displayName") == display_name:
                state = (environment.get("properties") or {}).get("provisioningState")
                if state in (None, "Succeeded"):
                    return environment
    return None


def assign_group(environment_id: str, group_id: str) -> requests.Response:
    return _request(
        "PATCH",
        f"{BAP}/scopes/admin/environments/{environment_id}?api-version={API_VERSION}",
        {"properties": {"parentEnvironmentGroup": {"id": group_id}}},
    )


def plan(blueprint: dict, existing_names: set[str], only_group: str | None) -> list[dict]:
    defaults = blueprint.get("environmentDefaults") or {}
    planned: list[dict] = []
    for group in blueprint.get("groups", []):
        if only_group and group.get("name") != only_group:
            continue
        for environment in group.get("environments", []):
            stage = environment.get("stage")
            workload = environment.get("workload")
            if not stage or not workload:
                continue  # 自動命名の個人環境や既定環境は作成対象外
            names = build_names(blueprint, workload, group["name"], stage)
            if names["displayName"] in existing_names or environment.get("name") in existing_names:
                continue
            planned.append(
                {
                    "group": group["name"],
                    "displayName": names["displayName"],
                    "domainName": names["domainName"],
                    "description": environment.get("purpose", ""),
                    "sku": SKU.get(environment.get("type", "Sandbox"), "Sandbox"),
                    "location": environment.get("location") or defaults.get("location", "japan"),
                    "baseLanguage": environment.get("baseLanguage") or defaults.get("baseLanguage", 1041),
                    "currency": environment.get("currency") or defaults.get("currency", "JPY"),
                }
            )
    return planned


def main() -> int:
    parser = argparse.ArgumentParser(description="不足している環境を作成する")
    parser.add_argument("--tenant-id", required=True, help="テナント ID")
    parser.add_argument("--blueprint", default=str(DEFAULT_BLUEPRINT), help="ブループリントのパス")
    parser.add_argument("--group", help="この環境グループの環境だけを対象にする")
    parser.add_argument("--skip-group-assignment", action="store_true", help="環境グループへの割り当てを行わない")
    parser.add_argument("--apply", action="store_true", help="実際に作成する（既定は dry-run）")
    args = parser.parse_args()

    blueprint = load_blueprint(Path(args.blueprint))
    existing = list_environments()
    existing_names = {(item.get("properties") or {}).get("displayName") for item in existing}

    planned = plan(blueprint, existing_names, args.group)
    if not planned:
        print("不足している環境はありません。")
        return 0

    print(f"作成する環境（{len(planned)} 件）")
    for spec in planned:
        print(f"  [{spec['group']}] {spec['displayName']}  sku={spec['sku']} location={spec['location']} domain={spec['domainName']}")

    if not args.apply:
        print("\n[dry-run] 適用するには --apply を付けてください。")
        return 0

    groups = {} if args.skip_group_assignment else list_groups(args.tenant_id)
    failures = 0
    for spec in planned:
        response = create_environment(spec)
        if response.status_code not in (200, 201, 202):
            print(f"[失敗] {spec['displayName']}: HTTP {response.status_code} {response.text[:300]}")
            failures += 1
            continue
        print(f"[作成中] {spec['displayName']}（HTTP {response.status_code}）")
        environment = wait_for_environment(spec["displayName"])
        if environment is None:
            print(f"  作成の完了を確認できませんでした。管理センターで状態を確認してください。")
            failures += 1
            continue
        environment_id = environment.get("name")
        print(f"  作成しました: {environment_id}")
        group_id = groups.get(spec["group"])
        if group_id:
            assign = assign_group(environment_id, group_id)
            print(f"  グループ割り当て: HTTP {assign.status_code}")
        elif not args.skip_group_assignment:
            print(f"  [注意] 環境グループ '{spec['group']}' が見つかりません。先に apply_environment_strategy.py --groups-only を実行してください。")

    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        print(json.dumps({"hint": "環境の作成には Power Platform 管理者または Dynamics 365 管理者が必要です。"}, ensure_ascii=False))
        sys.exit(2)
