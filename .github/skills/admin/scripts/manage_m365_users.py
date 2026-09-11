"""Microsoft Graph v1.0 で M365 ユーザーとライセンスを管理する。

読み取りは即時実行し、変更は dry-run -> plan hash -> --apply の二段階で行う。
認証は standard/scripts/auth_helper.py のキャッシュ済み認証だけを使う。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


HERE = Path(__file__).resolve().parent
STANDARD_SCRIPTS = (HERE / ".." / ".." / "standard" / "scripts").resolve()
sys.path.insert(0, str(STANDARD_SCRIPTS))

from auth_helper import get_session  # noqa: E402


GRAPH_BASE = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
TIMEOUT = 120


def graph_request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    session = get_session(scope=GRAPH_SCOPE)
    response = session.request(method, f"{GRAPH_BASE}{path}", json=body, timeout=TIMEOUT)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed: HTTP {response.status_code} {response.text}")
    return response.json() if response.content else None


def graph_collection(path: str) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    url = f"{GRAPH_BASE}{path}"
    session = get_session(scope=GRAPH_SCOPE)
    while url:
        response = session.get(url, timeout=TIMEOUT)
        if response.status_code >= 400:
            raise RuntimeError(f"GET {path} failed: HTTP {response.status_code} {response.text}")
        page = response.json()
        values.extend(page.get("value") or [])
        url = page.get("@odata.nextLink")
    return values


def canonical_hash(plan: dict[str, Any]) -> str:
    payload = json.dumps(plan, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def apply_plan(plan: dict[str, Any], args: argparse.Namespace) -> Any:
    plan_hash = canonical_hash(plan)
    printable = {**plan, "body": redact(plan.get("body") or {})}
    print(json.dumps(printable, ensure_ascii=False, indent=2))
    print(f"PLAN_HASH={plan_hash}")
    if not args.apply:
        print("DRY-RUN: 変更していません。適用時は --expected-hash と --apply を指定してください。")
        return None
    if args.expected_hash != plan_hash:
        raise SystemExit("承認済み plan hash が一致しません。最新の dry-run を再確認してください。")
    result = graph_request(plan["method"], plan["path"], plan.get("body"))
    print("APPLIED")
    return result


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "<redacted>" if key.lower() in {"password", "secret", "clientsecret"} else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def parse_graph_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def inventory(args: argparse.Namespace) -> None:
    skus = graph_collection("/subscribedSkus")
    users = graph_collection(
        "/users?$select=id,displayName,userPrincipalName,accountEnabled,usageLocation,"
        "assignedLicenses,signInActivity&$top=500"
    )
    sku_by_id = {str(sku.get("skuId")): sku for sku in skus}
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.inactive_days)
    inactive = []
    for user in users:
        activity = user.get("signInActivity") or {}
        last_sign_in = parse_graph_time(activity.get("lastSuccessfulSignInDateTime"))
        user["assignedSkuPartNumbers"] = [
            (sku_by_id.get(str(item.get("skuId"))) or {}).get("skuPartNumber", str(item.get("skuId")))
            for item in user.get("assignedLicenses") or []
        ]
        user["lastSuccessfulSignInDateTime"] = last_sign_in.isoformat() if last_sign_in else None
        user.pop("signInActivity", None)
        if user.get("accountEnabled") and (last_sign_in is None or last_sign_in < cutoff):
            inactive.append(user)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "inactiveDays": args.inactive_days,
        "summary": {
            "users": len(users),
            "enabledUsers": sum(bool(user.get("accountEnabled")) for user in users),
            "licensedUsers": sum(bool(user.get("assignedLicenses")) for user in users),
            "inactiveCandidates": len(inactive),
        },
        "skus": [
            {
                "skuId": sku.get("skuId"),
                "skuPartNumber": sku.get("skuPartNumber"),
                "enabled": (sku.get("prepaidUnits") or {}).get("enabled", 0),
                "consumed": sku.get("consumedUnits", 0),
                "available": max(
                    0,
                    (sku.get("prepaidUnits") or {}).get("enabled", 0) - sku.get("consumedUnits", 0),
                ),
            }
            for sku in skus
        ],
        "users": users,
        "inactiveCandidates": inactive,
    }
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    if args.report_file:
        output = Path(args.report_file)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Report: {output.resolve()}")


def sku_id(value: str) -> str:
    skus = graph_collection("/subscribedSkus")
    for sku in skus:
        if value.lower() in {str(sku.get("skuId", "")).lower(), str(sku.get("skuPartNumber", "")).lower()}:
            return str(sku["skuId"])
    raise SystemExit(f"SKU が見つかりません: {value}")


def license_change(args: argparse.Namespace) -> None:
    add_ids = [sku_id(value) for value in args.add_sku]
    remove_ids = [sku_id(value) for value in args.remove_sku]
    if not add_ids and not remove_ids:
        raise SystemExit("--add-sku または --remove-sku を指定してください。")
    user = quote(args.user, safe="")
    plan = {
        "operation": "license-change",
        "method": "POST",
        "path": f"/users/{user}/assignLicense",
        "body": {
            "addLicenses": [{"skuId": value, "disabledPlans": []} for value in add_ids],
            "removeLicenses": remove_ids,
        },
    }
    apply_plan(plan, args)


def set_account(args: argparse.Namespace) -> None:
    user = quote(args.user, safe="")
    plan = {
        "operation": "set-account-enabled",
        "method": "PATCH",
        "path": f"/users/{user}",
        "body": {"accountEnabled": args.enabled == "true"},
    }
    apply_plan(plan, args)


def create_user(args: argparse.Namespace) -> None:
    password = os.getenv(args.password_env)
    if not password:
        raise SystemExit(f"一時パスワードを環境変数 {args.password_env} に設定してください。")
    plan = {
        "operation": "create-user",
        "method": "POST",
        "path": "/users",
        "body": {
            "accountEnabled": True,
            "displayName": args.display_name,
            "mailNickname": args.mail_nickname,
            "userPrincipalName": args.user_principal_name,
            "usageLocation": args.usage_location,
            "passwordProfile": {"forceChangePasswordNextSignIn": True, "password": password},
        },
    }
    apply_plan(plan, args)


def add_apply_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-hash")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    inventory_parser = subparsers.add_parser("inventory", help="ライセンスと非アクティブ候補を棚卸")
    inventory_parser.add_argument("--inactive-days", type=int, default=90)
    inventory_parser.add_argument("--report-file")
    inventory_parser.set_defaults(handler=inventory)

    license_parser = subparsers.add_parser("license", help="ライセンスを付与または解除")
    license_parser.add_argument("--user", required=True, help="User ID または UPN")
    license_parser.add_argument("--add-sku", action="append", default=[], help="skuId または skuPartNumber")
    license_parser.add_argument("--remove-sku", action="append", default=[], help="skuId または skuPartNumber")
    add_apply_arguments(license_parser)
    license_parser.set_defaults(handler=license_change)

    account_parser = subparsers.add_parser("account", help="ユーザーを有効化または無効化")
    account_parser.add_argument("--user", required=True, help="User ID または UPN")
    account_parser.add_argument("--enabled", choices=("true", "false"), required=True)
    add_apply_arguments(account_parser)
    account_parser.set_defaults(handler=set_account)

    create_parser = subparsers.add_parser("create-user", help="クラウドユーザーを作成")
    create_parser.add_argument("--display-name", required=True)
    create_parser.add_argument("--mail-nickname", required=True)
    create_parser.add_argument("--user-principal-name", required=True)
    create_parser.add_argument("--usage-location", required=True, help="ISO 3166-1 alpha-2 (例: JP)")
    create_parser.add_argument("--password-env", default="M365_NEW_USER_PASSWORD")
    add_apply_arguments(create_parser)
    create_parser.set_defaults(handler=create_user)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if getattr(args, "inactive_days", 1) < 1:
        raise SystemExit("--inactive-days は 1 以上にしてください。")
    args.handler(args)


if __name__ == "__main__":
    main()