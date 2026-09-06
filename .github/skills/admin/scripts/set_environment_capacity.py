"""環境ごとの容量（Copilot クレジット・AI Builder クレジット・アプリ パス等）を確認・配分する。

環境グループのルールには「テナント プールから消費するか」の可否しか無く、環境ごとの
配分数は設定できないため、テナント専用ホストの licensing API を直接使う。

Dataverse ストレージ（Database / File / Log）は消費ベースでテナント プールから引かれるため
配分 API が無い。--storage で環境ごとの消費量だけを一覧できる。

使い方:
    python set_environment_capacity.py --tenant-id <ID>                                      # Copilot クレジット一覧
    python set_environment_capacity.py --tenant-id <ID> --storage                             # Dataverse 容量一覧
    python set_environment_capacity.py --tenant-id <ID> --currency AI                         # AI Builder クレジット一覧
    python set_environment_capacity.py --tenant-id <ID> --environment-id <ENV> --quantity 500 --apply
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402
from set_environment_group_rules import tenant_host  # noqa: E402

PP_SCOPE = "https://api.powerplatform.com/.default"
_TIMEOUT = 120

# PATCH /licensing/environments/{id}/allocations で配分できる容量
ALLOCATABLE = [
    "MCSMessages",
    "MCSSessions",
    "AI",
    "AppPass",
    "AppPassForTeams",
    "PAHostedRPA",
    "PAUnattendedRPA",
    "PerFlowPlan",
    "PowerAutomatePerProcess",
    "PortalLogins",
    "PortalViews",
    "PowerPagesAnonymous",
    "PowerPagesAuthenticated",
    "ProcessMiningDataStorage",
]

# 消費ベースで配分 API が無い容量（読み取りのみ）
STORAGE = ["Database", "File", "Log"]


def _request(host: str, method: str, path: str, body: dict | None = None) -> requests.Response:
    for attempt in range(4):
        try:
            return requests.request(
                method,
                f"{host}{path}{'&' if '?' in path else '?'}api-version=1",
                headers={"Authorization": f"Bearer {get_token(scope=PP_SCOPE)}", "Content-Type": "application/json"},
                json=body,
                timeout=_TIMEOUT,
            )
        except requests.exceptions.RequestException:
            if attempt == 3:
                raise
            time.sleep(3)
    raise RuntimeError("unreachable")


def tenant_entitlement(host: str, currency: str) -> dict:
    response = _request(host, "GET", f"/licensing/entitlements/{currency}")
    return response.json() if response.ok else {}


def environment_entitlements(host: str, currency: str) -> list[dict]:
    response = _request(host, "GET", f"/licensing/environments/entitlements/{currency}?searchRequest=")
    return response.json().get("value", []) if response.ok else []


def set_allocation(host: str, environment_id: str, currency: str, quantity: int) -> requests.Response:
    return _request(
        host,
        "PATCH",
        f"/licensing/environments/{environment_id}/allocations",
        {"currencyAllocations": [{"currencyType": currency, "allocated": quantity}]},
    )


def _capacity(environment: dict) -> dict:
    return (environment.get("entitlement") or {}).get("capacity") or {}


def print_currency(host: str, currency: str) -> None:
    capacity = (tenant_entitlement(host, currency).get("entitlement") or {}).get("capacity") or {}
    entitled = (capacity.get("entitled") or {}).get("value", 0)
    allocated = (capacity.get("allocated") or {}).get("value", 0)
    unit = capacity.get("unit") or ""
    print(f"テナント {currency}: 保有 {entitled:g}{unit} / 割り当て済み {allocated:g}{unit}")
    if allocated > entitled:
        print(f"  [要対応] 保有数を {allocated - entitled:g} 超えて割り当てています。")

    environments = environment_entitlements(host, currency)
    print(f"環境ごとの割り当て（{len(environments)} 件）")
    for environment in environments:
        capacity = _capacity(environment)
        value = (capacity.get("allocated") or {}).get("value", 0)
        consumed = (capacity.get("consumed") or {}).get("value", 0)
        print(f"  {environment.get('environmentName')}: 割り当て {value:g} / 消費 {consumed:g}")


def print_storage(host: str) -> None:
    rows: dict[str, dict[str, float]] = {}
    for currency in STORAGE:
        capacity = (tenant_entitlement(host, currency).get("entitlement") or {}).get("capacity") or {}
        entitled = (capacity.get("entitled") or {}).get("value", 0)
        consumed = (capacity.get("consumed") or {}).get("value", 0)
        print(f"テナント {currency}: 保有 {entitled:g}MB / 消費 {consumed:g}MB")
        for environment in environment_entitlements(host, currency):
            name = environment.get("environmentName") or environment.get("environmentId")
            rows.setdefault(name, {})[currency] = ((_capacity(environment).get("consumed") or {}).get("value", 0))

    print("\n環境ごとの Dataverse 消費（MB）")
    print(f"  {'環境':<28}{'Database':>12}{'File':>12}{'Log':>12}")
    for name, values in sorted(rows.items(), key=lambda item: -sum(item[1].values())):
        print(f"  {name[:27]:<28}{values.get('Database', 0):>12,.0f}{values.get('File', 0):>12,.0f}{values.get('Log', 0):>12,.0f}")
    print("\nDataverse ストレージは消費ベースでテナント プールから引かれるため、環境ごとの配分 API は無い。")
    print("環境ごとに上限を掛けたい場合は、環境の作成数と種類（Sandbox / Developer）で制御する。")


def main() -> int:
    parser = argparse.ArgumentParser(description="環境ごとの容量を確認・配分する")
    parser.add_argument("--tenant-id", required=True, help="テナント ID")
    parser.add_argument("--currency", default="MCSMessages", help=f"配分できる容量: {', '.join(ALLOCATABLE)}")
    parser.add_argument("--storage", action="store_true", help="Dataverse 容量（Database / File / Log）を一覧する")
    parser.add_argument("--environment-id", help="配分先の環境 ID")
    parser.add_argument("--quantity", type=int, help="配分する数量（整数）")
    parser.add_argument("--apply", action="store_true", help="実際に配分する（既定は dry-run）")
    args = parser.parse_args()

    host = tenant_host(args.tenant_id)

    if args.storage:
        print_storage(host)
        return 0

    if args.currency not in ALLOCATABLE:
        print(f"エラー: --currency は次のいずれかを指定してください: {', '.join(ALLOCATABLE)}")
        return 2

    print_currency(host, args.currency)

    if not args.environment_id or args.quantity is None:
        print("\n配分するには --environment-id と --quantity を指定してください。")
        return 0

    print(f"\n{'' if args.apply else '[dry-run] '}{args.environment_id} の {args.currency} を {args.quantity} に設定")
    if not args.apply:
        print("適用するには --apply を付けてください。")
        return 0

    response = set_allocation(host, args.environment_id, args.currency, args.quantity)
    if response.ok:
        print("配分しました。")
        return 0
    print(f"[失敗] HTTP {response.status_code}: {response.text[:300]}")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
