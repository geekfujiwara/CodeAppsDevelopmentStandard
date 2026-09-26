"""Fabric capacity と Databricks SQL warehouse の状態確認・停止・再開（read-back まで待つ）。

使い方:
    python manage_compute.py status --target all
    python manage_compute.py stop   --target all
    python manage_compute.py start  --target fabric|databricks
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import Api, env, load_env, print_json  # noqa: E402
from deploy_platform import derive_names  # noqa: E402

FABRIC_API = "2023-11-01"
FABRIC_TARGET = {"stop": ("suspend", "Paused"), "start": ("resume", "Active")}
DATABRICKS_TARGET = {"stop": ("stop", "STOPPED"), "start": ("start", "RUNNING")}


def fabric_capacity_path() -> str:
    names = derive_names(env("DP_NAME_PREFIX", required=True))["fabric"]
    return (f"/subscriptions/{env('AZURE_SUBSCRIPTION_ID', required=True)}/resourceGroups/{names['resourceGroup']}"
            f"/providers/Microsoft.Fabric/capacities/{names['capacityName']}")


def wait_state(read, expected: str, *, sleep=time.sleep, timeout: float = 900) -> str:
    deadline = time.monotonic() + timeout
    state = read()
    while state != expected:
        if time.monotonic() > deadline:
            raise TimeoutError(f"state={state}（期待 {expected}）")
        sleep(10)
        state = read()
    return state


def fabric(action: str, arm: Api, *, sleep=time.sleep) -> dict:
    path = fabric_capacity_path()

    def read() -> str:
        return arm.json("GET", f"{path}?api-version={FABRIC_API}").get("properties", {}).get("state", "")

    before = read()
    if action == "status":
        return {"target": "fabric", "state": before}
    verb, expected = FABRIC_TARGET[action]
    if before == expected:
        return {"target": "fabric", "state": before, "changed": False}
    arm.request("POST", f"{path}/{verb}?api-version={FABRIC_API}", expected=(200, 202))
    return {"target": "fabric", "state": wait_state(read, expected, sleep=sleep), "changed": True, "before": before}


def databricks(action: str, api: Api, *, sleep=time.sleep) -> dict:
    warehouse = env("DATABRICKS_WAREHOUSE_ID", required=True)

    def read() -> str:
        return api.json("GET", f"/api/2.0/sql/warehouses/{warehouse}").get("state", "")

    before = read()
    if action == "status":
        return {"target": "databricks", "state": before}
    verb, expected = DATABRICKS_TARGET[action]
    if before == expected or (action == "stop" and before == "DELETED"):
        return {"target": "databricks", "state": before, "changed": False}
    api.request("POST", f"/api/2.0/sql/warehouses/{warehouse}/{verb}", json_body={})
    return {"target": "databricks", "state": wait_state(read, expected, sleep=sleep), "changed": True, "before": before}


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["status", "stop", "start"])
    parser.add_argument("--target", required=True, choices=["fabric", "databricks", "all"])
    args = parser.parse_args(argv)
    targets = ["fabric", "databricks"] if args.target == "all" else [args.target]
    if args.action == "start" and len(targets) > 1:
        raise SystemExit("start は課金を再開するため対象を 1 つずつ指定してください")
    report = []
    for target in targets:
        if target == "fabric":
            report.append(fabric(args.action, Api("arm")))
        else:
            host = env("DATABRICKS_HOST", required=True).removeprefix("https://").rstrip("/")
            report.append(databricks(args.action, Api("databricks", f"https://{host}")))
    print_json(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
