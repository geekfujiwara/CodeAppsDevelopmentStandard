"""Teams Developer Portal OAuth API の承認 plan を生成する。

非公開 API のため、portal build で観測済みの DTO だけを許可する。実行はログイン済み
VS Code 統合ブラウザの同一セッションで行い、変更前にこの plan hash を承認する。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote


HERE = Path(__file__).resolve().parent
STANDARD_SCRIPTS = (HERE / ".." / ".." / "standard" / "scripts").resolve()
sys.path.insert(0, str(STANDARD_SCRIPTS))

REGION_BASES = {
    "amer": "https://dev.teams.microsoft.com/cosmicprodamer",
    "apac": "https://dev.teams.microsoft.com/cosmicprodapac",
    "emea": "https://dev.teams.microsoft.com/cosmicprodemea",
}
ALLOWED_FIELDS = {
    "description",
    "applicableToApps",
    "m365AppId",
    "targetAudience",
    "clientId",
    "identityProvider",
    "targetUrlsShouldStartWith",
    "isPKCEEnabled",
    "clientSecret",
    "scopes",
    "authorizationEndpoint",
    "tokenExchangeEndpoint",
    "tokenRefreshEndpoint",
    "tokenExchangeMethodType",
}
SECRET_KEYS = {"clientSecret", "accessToken", "refreshToken", "token"}


def canonical_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "<redacted>" if key in SECRET_KEYS else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def api_base(region: str) -> str:
    try:
        return REGION_BASES[region.lower()]
    except KeyError as error:
        raise SystemExit(f"未対応の Developer Portal region です: {region}") from error


def validate_payload(payload: dict[str, Any], *, creating: bool) -> dict[str, Any]:
    unknown = sorted(set(payload) - ALLOWED_FIELDS)
    if unknown:
        raise SystemExit(f"未確認の OAuth DTO フィールドです: {', '.join(unknown)}")
    required = {
        "description",
        "applicableToApps",
        "targetAudience",
        "clientId",
        "identityProvider",
        "targetUrlsShouldStartWith",
        "clientSecret",
        "scopes",
        "authorizationEndpoint",
        "tokenExchangeEndpoint",
    }
    if creating:
        missing = sorted(field for field in required if not payload.get(field))
        if missing:
            raise SystemExit(f"OAuth registration の必須フィールドがありません: {', '.join(missing)}")
    if payload.get("identityProvider", "Custom") != "Custom":
        raise SystemExit("この CLI は identityProvider=Custom の OAuth registration 専用です。")
    if payload.get("applicableToApps") not in {None, "AnyApp", "SpecificApp"}:
        raise SystemExit("applicableToApps は AnyApp または SpecificApp です。")
    if payload.get("targetAudience") not in {None, "HomeTenant", "AnyTenant"}:
        raise SystemExit("targetAudience は HomeTenant または AnyTenant です。")
    if payload.get("applicableToApps") == "SpecificApp" and not payload.get("m365AppId"):
        raise SystemExit("SpecificApp では m365AppId が必須です。")
    if "clientSecret" in payload and len(str(payload["clientSecret"])) < 10:
        raise SystemExit("clientSecret は 10 文字以上である必要があります。")
    return payload


def registration_id(result: Any) -> str:
    if isinstance(result, dict):
        direct = result.get("oAuthConfigId")
        nested = result.get("configurationRegistrationId") or {}
        value = direct or (nested.get("oAuthConfigId") if isinstance(nested, dict) else None)
        if value:
            return str(value)
    raise RuntimeError("API 応答に oAuthConfigId がありません。")


def approved_apply(args: argparse.Namespace, plan: dict[str, Any], operation) -> Any:
    digest = canonical_hash(plan)
    print(json.dumps(redact(plan), ensure_ascii=False, indent=2))
    print(f"PLAN_HASH={digest}")
    if not args.apply:
        print("DRY-RUN: 変更していません。適用時は --expected-hash と --apply を指定してください。")
        return None
    if args.expected_hash != digest:
        raise SystemExit("承認済み plan hash が一致しません。")
    result = operation()
    print("READY_FOR_BROWSER_API")
    return result


def list_registrations(args: argparse.Namespace) -> None:
    suffix = f"?identityProvider={quote(args.identity_provider, safe='')}" if args.identity_provider else ""
    print(json.dumps({"method": "GET", "url": f"{api_base(args.region)}/v1.0/oauthconfigurations{suffix}"}, indent=2))


def get_registration(args: argparse.Namespace) -> None:
    print(json.dumps({
        "method": "GET",
        "url": f"{api_base(args.region)}/v1.0/oauthconfigurations/{quote(args.registration_id, safe='')}",
    }, indent=2))


def create_payload(args: argparse.Namespace) -> dict[str, Any]:
    secret = os.getenv("COWORK_OAUTH_CLIENT_SECRET", "")
    tenant_id = os.getenv("TENANT_ID", "")
    if not secret:
        raise SystemExit("COWORK_OAUTH_CLIENT_SECRET を .env または環境変数に設定してください。")
    if not tenant_id and (not args.authorization_endpoint or not args.token_endpoint):
        raise SystemExit("TENANT_ID、または authorization/token endpoint の明示指定が必要です。")
    auth_base = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0"
    payload = {
        "description": args.name,
        "applicableToApps": args.applicable_to_apps,
        "targetAudience": args.target_audience,
        "clientId": args.client_id,
        "identityProvider": "Custom",
        "targetUrlsShouldStartWith": [args.base_url.rstrip("/")],
        "isPKCEEnabled": not args.disable_pkce,
        "clientSecret": secret,
        "scopes": [scope.strip() for scope in args.scopes.split(",") if scope.strip()],
        "authorizationEndpoint": args.authorization_endpoint or f"{auth_base}/authorize",
        "tokenExchangeEndpoint": args.token_endpoint or f"{auth_base}/token",
        "tokenRefreshEndpoint": args.refresh_endpoint or args.token_endpoint or f"{auth_base}/token",
        "tokenExchangeMethodType": args.token_exchange_method,
    }
    if args.m365_app_id:
        payload["m365AppId"] = args.m365_app_id
    return validate_payload(payload, creating=True)


def create_registration(args: argparse.Namespace) -> None:
    payload = create_payload(args)
    plan = {
        "operation": "create-oauth-registration",
        "region": args.region,
        "method": "POST",
        "path": "/v1.0/oauthconfigurations",
        "payload": {**redact(payload), "clientSecretSha256": hashlib.sha256(payload["clientSecret"].encode()).hexdigest()},
    }

    approved_apply(args, plan, lambda: None)


def load_update_payload(path: str) -> dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"更新 payload を読み込めません: {error}") from error
    if not isinstance(payload, dict):
        raise SystemExit("更新 payload は JSON object で指定してください。")
    if payload.get("clientSecret") == "${COWORK_OAUTH_CLIENT_SECRET}":
        payload["clientSecret"] = os.getenv("COWORK_OAUTH_CLIENT_SECRET", "")
    return validate_payload(payload, creating=False)


def update_registration(args: argparse.Namespace) -> None:
    payload = load_update_payload(args.payload_file)
    config_id = quote(args.registration_id, safe="")
    plan_payload = redact(payload)
    if payload.get("clientSecret"):
        plan_payload["clientSecretSha256"] = hashlib.sha256(payload["clientSecret"].encode()).hexdigest()
    plan = {
        "operation": "update-oauth-registration",
        "region": args.region,
        "method": "PATCH",
        "path": f"/v1.0/oauthconfigurations/{config_id}",
        "payload": plan_payload,
    }

    approved_apply(args, plan, lambda: None)


def delete_registration(args: argparse.Namespace) -> None:
    config_id = quote(args.registration_id, safe="")
    path = f"/v1.0/oauthconfigurations/{config_id}"
    plan = {
        "operation": "delete-oauth-registration",
        "region": args.region,
        "method": "DELETE",
        "path": path,
    }

    approved_apply(args, plan, lambda: None)


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--region",
        choices=sorted(REGION_BASES),
        default=os.getenv("COWORK_PORTAL_REGION", "amer").lower(),
    )


def add_apply(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-hash")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    list_parser = commands.add_parser("list", help="OAuth registration を一覧")
    add_common(list_parser)
    list_parser.add_argument("--identity-provider", default="Custom")
    list_parser.set_defaults(handler=list_registrations)

    get_parser = commands.add_parser("get", help="OAuth registration を取得")
    add_common(get_parser)
    get_parser.add_argument("--registration-id", required=True)
    get_parser.set_defaults(handler=get_registration)

    create_parser = commands.add_parser("create", help="OAuth registration を作成")
    add_common(create_parser)
    add_apply(create_parser)
    create_parser.add_argument("--name", required=True)
    create_parser.add_argument("--base-url", required=True)
    create_parser.add_argument("--client-id", default=os.getenv("COWORK_OAUTH_CLIENT_ID"), required=not os.getenv("COWORK_OAUTH_CLIENT_ID"))
    create_parser.add_argument("--scopes", required=True, help="カンマ区切り")
    create_parser.add_argument("--applicable-to-apps", choices=["AnyApp", "SpecificApp"], default="AnyApp")
    create_parser.add_argument("--m365-app-id")
    create_parser.add_argument("--target-audience", choices=["HomeTenant", "AnyTenant"], default="HomeTenant")
    create_parser.add_argument("--authorization-endpoint")
    create_parser.add_argument("--token-endpoint")
    create_parser.add_argument("--refresh-endpoint")
    create_parser.add_argument("--disable-pkce", action="store_true")
    create_parser.add_argument(
        "--token-exchange-method",
        choices=["PostRequestBody", "BasicAuthorizationHeader"],
        default="PostRequestBody",
    )
    create_parser.set_defaults(handler=create_registration)

    update_parser = commands.add_parser("update", help="OAuth registration を PATCH")
    add_common(update_parser)
    add_apply(update_parser)
    update_parser.add_argument("--registration-id", required=True)
    update_parser.add_argument("--payload-file", required=True)
    update_parser.set_defaults(handler=update_registration)

    delete_parser = commands.add_parser("delete", help="OAuth registration を削除")
    add_common(delete_parser)
    add_apply(delete_parser)
    delete_parser.add_argument("--registration-id", required=True)
    delete_parser.set_defaults(handler=delete_registration)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()