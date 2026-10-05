"""Teams Developer Portal の OAuth client registration を、承認 plan → 実行 → 読み戻しで管理する。

非公開 API のため、portal build で観測済みの DTO だけを許可する。変更前に plan hash を承認する。
既定（--transport cli）は auth_helper で Microsoft 365 Agents Toolkit の公開クライアント
（Device Code。初回だけサインイン）のトークンを取り、https://dev.teams.microsoft.com/api/v1.0/oauthConfigurations を直接呼ぶ。
--transport browser は従来どおり plan だけを出し、ログイン済み統合ブラウザの同一セッションから送る。
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
# Developer Portal が事前承認している公開クライアント（Agents Toolkit）。PAC CLI / Graph PowerShell / Azure CLI 互換では
# AADSTS65002 / AADSTS650057 / 401・403 になる。interactive（ループバック）は AADSTS70007 のため Device Code を使う
TOOLKIT_CLIENT_ID = "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0"
PORTAL_SCOPE = "https://dev.teams.microsoft.com/AppDefinitions.ReadWrite"
CLI_BASE = "https://dev.teams.microsoft.com/api/v1.0/oauthConfigurations"
# 読み戻しで一致を確かめる項目（秘密は返らないので含めない）
READBACK_FIELDS = ("description", "applicableToApps", "targetAudience", "clientId", "identityProvider",
                   "targetUrlsShouldStartWith", "isPKCEEnabled", "scopes", "authorizationEndpoint")


def mask(value: str) -> str:
    return f"…{value[-4:]}" if value else ""


def portal_call(method: str, suffix: str = "", body: dict[str, Any] | None = None) -> Any:
    import requests  # noqa: PLC0415
    from auth_helper import get_token  # noqa: PLC0415

    token = get_token(PORTAL_SCOPE, client_id=TOOLKIT_CLIENT_ID)
    res = requests.request(method, CLI_BASE + suffix, json=body, timeout=60,
                           headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    if res.status_code >= 400:
        text = res.text[:300]
        if body and body.get("clientSecret"):
            text = text.replace(body["clientSecret"], "<redacted>")
        raise SystemExit(f"{method} oauthConfigurations{suffix} → {res.status_code}: {text}")
    return res.json() if res.content else None


def list_items() -> list[dict[str, Any]]:
    data = portal_call("GET")
    return data if isinstance(data, list) else (data or {}).get("value", [])


def summarize(item: dict[str, Any]) -> dict[str, Any]:
    return {"id": mask(str(item.get("oAuthConfigId", ""))), "description": item.get("description"),
            "identityProvider": item.get("identityProvider"), "clientId": item.get("clientId"),
            "targetUrlsShouldStartWith": item.get("targetUrlsShouldStartWith")}


def verify_readback(expected: dict[str, Any], actual: dict[str, Any]) -> None:
    diff = [key for key in READBACK_FIELDS if key in expected and actual.get(key) != expected[key]]
    if diff:
        raise SystemExit("読み戻しが plan と一致しません: " + ", ".join(diff))


def raw_registration_id(config_id: str, tenant_id: str) -> str:
    """API の oAuthConfigId は Base64("<tenantId>##<registrationId>")。.env には生の registration ID を保存する
    （manifest の referenceId へのエンコードは build_agent_package.ps1 が行う）。"""
    import base64  # noqa: PLC0415

    try:
        decoded = base64.b64decode(config_id, validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return config_id
    prefix = f"{tenant_id}##" if tenant_id else ""
    if prefix and decoded.startswith(prefix):
        return decoded[len(prefix):]
    return decoded.split("##", 1)[1] if "##" in decoded else config_id


def api_config_id(registration_id: str, tenant_id: str) -> str:
    """API のパスに使う oAuthConfigId を返す。.env の生の registration ID（GUID）を渡しても 404 にならないよう、
    Base64("<tenantId>##<registrationId>") に包む。既に包まれた値はそのまま返す。"""
    import base64  # noqa: PLC0415

    value = registration_id.strip().strip("'\"")
    if raw_registration_id(value, tenant_id) != value:
        return value
    if not tenant_id:
        raise SystemExit("生の registration ID を API に渡すには TENANT_ID が必要です（.env に設定してください）。")
    return base64.b64encode(f"{tenant_id}##{value}".encode()).decode()


def write_env(path: str, key: str, value: str) -> None:
    env = Path(path)
    lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    lines = [line for line in lines if not line.startswith(f"{key}=")] + [f"{key}={value}"]
    env.write_text("\n".join(lines) + "\n", encoding="utf-8")


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
    if getattr(args, "transport", "browser") == "browser":
        print("READY_FOR_BROWSER_API")
    return result


def list_registrations(args: argparse.Namespace) -> None:
    if args.transport == "cli":
        items = [i for i in list_items() if not args.identity_provider or i.get("identityProvider") == args.identity_provider]
        print(json.dumps([summarize(i) for i in items], ensure_ascii=False, indent=2))
        return
    suffix = f"?identityProvider={quote(args.identity_provider, safe='')}" if args.identity_provider else ""
    print(json.dumps({"method": "GET", "url": f"{api_base(args.region)}/v1.0/oauthconfigurations{suffix}"}, indent=2))


def get_registration(args: argparse.Namespace) -> None:
    if args.transport == "cli":
        item = portal_call("GET", "/" + quote(api_config_id(args.registration_id, os.getenv("TENANT_ID", "")), safe=""))
        print(json.dumps({**redact(item), "oAuthConfigId": mask(str(item.get("oAuthConfigId", "")))}, ensure_ascii=False, indent=2))
        return
    print(json.dumps({
        "method": "GET",
        "url": f"{api_base(args.region)}/v1.0/oauthconfigurations/"
               f"{quote(api_config_id(args.registration_id, os.getenv('TENANT_ID', '')), safe='')}",
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
        "transport": args.transport,
        "region": args.region,
        "method": "POST",
        "path": "/v1.0/oauthconfigurations",
        "payload": {**redact(payload), "clientSecretSha256": hashlib.sha256(payload["clientSecret"].encode()).hexdigest()},
    }
    if args.transport == "cli":
        # 同じ clientId・Base URL の登録が既にあると、どちらが manifest の referenceId か分からなくなる
        same = [i for i in list_items() if i.get("clientId") == payload["clientId"]
                and i.get("targetUrlsShouldStartWith") == payload["targetUrlsShouldStartWith"]]
        if same and not args.allow_duplicate:
            ids = ", ".join(mask(str(i.get("oAuthConfigId"))) for i in same)
            raise SystemExit(f"同じ clientId・Base URL の登録が既にあります（{ids}）。update で直すか、--allow-duplicate を付けてください。")

    def run() -> None:
        if args.transport != "cli":
            return None
        created = portal_call("POST", body=payload)
        config_id = registration_id(created)
        verify_readback(payload, portal_call("GET", "/" + quote(config_id, safe="")))
        if args.write_env:
            write_env(args.write_env, "COWORK_OAUTH_REGISTRATION_ID", raw_registration_id(config_id, os.getenv("TENANT_ID", "")))
        print(f"✅ 作成して読み戻しが一致しました（ID {mask(config_id)}）" + (f"。{args.write_env} に保存" if args.write_env else ""))
        return None

    approved_apply(args, plan, run)


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
    config_id = quote(api_config_id(args.registration_id, os.getenv("TENANT_ID", "")), safe="")
    plan_payload = redact(payload)
    if payload.get("clientSecret"):
        plan_payload["clientSecretSha256"] = hashlib.sha256(payload["clientSecret"].encode()).hexdigest()
    plan = {
        "operation": "update-oauth-registration",
        "transport": args.transport,
        "region": args.region,
        "method": "PATCH",
        "path": f"/v1.0/oauthconfigurations/{config_id}",
        "payload": plan_payload,
    }

    def run() -> None:
        if args.transport == "cli":
            portal_call("PATCH", "/" + config_id, body=payload)
            verify_readback(payload, portal_call("GET", "/" + config_id))
            print("✅ 更新して読み戻しが一致しました")

    approved_apply(args, plan, run)


def delete_registration(args: argparse.Namespace) -> None:
    wrapped = api_config_id(args.registration_id, os.getenv("TENANT_ID", ""))
    config_id = quote(wrapped, safe="")
    path = f"/v1.0/oauthconfigurations/{config_id}"
    plan = {
        "operation": "delete-oauth-registration",
        "transport": args.transport,
        "region": args.region,
        "method": "DELETE",
        "path": path,
    }

    def run() -> None:
        if args.transport == "cli":
            portal_call("DELETE", "/" + config_id)
            if any(str(i.get("oAuthConfigId")) == wrapped for i in list_items()):
                raise SystemExit("削除後も一覧に残っています")
            print("✅ 削除して一覧から消えたことを確認しました")

    approved_apply(args, plan, run)


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--region",
        choices=sorted(REGION_BASES),
        default=os.getenv("COWORK_PORTAL_REGION", "amer").lower(),
    )
    parser.add_argument("--transport", choices=["cli", "browser"], default=os.getenv("COWORK_PORTAL_TRANSPORT", "cli"),
                        help="cli: Agents Toolkit クライアントで直接呼ぶ（既定） / browser: 統合ブラウザから送る plan だけを出す")


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
    create_parser.add_argument("--write-env", help="作成した registration ID を書き込む .env（値は画面に出さない）")
    create_parser.add_argument("--allow-duplicate", action="store_true")
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
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    args = build_parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()