"""Copilot クレジット（Copilot Studio の容量）を環境ごとに確認・配分する。

環境グループのルールには「テナント クレジット プールから消費するか」の可否しか無く、
環境ごとの配分数は設定できないため、テナント専用ホストの licensing API を直接使う。

使い方:
    python set_copilot_credits.py --tenant-id <ID>                                  # 一覧
    python set_copilot_credits.py --tenant-id <ID> --environment-id <ENV> --credits 500 --apply
    python set_copilot_credits.py --tenant-id <ID> --currency MCSSessions --environment-id <ENV> --credits 10 --apply
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


def set_allocation(host: str, environment_id: str, currency: str, credits: float) -> requests.Response:
    return _request(
        host,
        "PATCH",
        f"/licensing/environments/{environment_id}/allocations",
        {"currencyAllocations": [{"currencyType": currency, "allocated": credits, "autoAllocated": 0.0}]},
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Copilot クレジットを環境ごとに配分する")
    parser.add_argument("--tenant-id", required=True, help="テナント ID")
    parser.add_argument("--currency", default="MCSMessages", help="MCSMessages（クレジット）/ MCSSessions（セッション）")
    parser.add_argument("--environment-id", help="配分先の環境 ID")
    parser.add_argument("--credits", type=float, help="配分する数量")
    parser.add_argument("--apply", action="store_true", help="実際に配分する（既定は dry-run）")
    args = parser.parse_args()

    host = tenant_host(args.tenant_id)
    capacity = (tenant_entitlement(host, args.currency).get("entitlement") or {}).get("capacity") or {}
    entitled = (capacity.get("entitled") or {}).get("value", 0)
    allocated = (capacity.get("allocated") or {}).get("value", 0)
    print(f"テナント {args.currency}: 保有 {entitled:g} / 割り当て済み {allocated:g}")
    if allocated > entitled:
        print(f"  警告: 保有数を {allocated - entitled:g} 超えて割り当てています。")

    environments = environment_entitlements(host, args.currency)
    print(f"\n環境ごとの割り当て（{len(environments)} 件）")
    for environment in environments:
        entitlement = (environment.get("entitlement") or {}).get("capacity") or {}
        value = (entitlement.get("allocated") or {}).get("value", 0)
        consumed = (entitlement.get("consumed") or {}).get("value", 0)
        print(f"  {environment.get('environmentName')}: 割り当て {value:g} / 消費 {consumed:g}")

    if not args.environment_id or args.credits is None:
        print("\n配分するには --environment-id と --credits を指定してください。")
        return 0

    print(f"\n{'' if args.apply else '[dry-run] '}{args.environment_id} の {args.currency} を {args.credits:g} に設定")
    if not args.apply:
        print("適用するには --apply を付けてください。")
        return 0

    response = set_allocation(host, args.environment_id, args.currency, args.credits)
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
