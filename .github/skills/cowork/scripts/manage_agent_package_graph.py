"""Microsoft Graph v1.0 で Cowork/M365 エージェントパッケージを管理する。

deploy は ZIP 内 manifest.json の id で既存アプリを判定し、存在しなければ新規登録、
存在すれば appDefinitions へ新バージョンを追加する。変更は plan hash の承認が必須。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import quote


HERE = Path(__file__).resolve().parent
STANDARD_SCRIPTS = (HERE / ".." / ".." / "standard" / "scripts").resolve()
sys.path.insert(0, str(STANDARD_SCRIPTS))

from auth_helper import get_session, get_token  # noqa: E402


GRAPH_BASE = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
# 既定クライアントには AppCatalog.* が無い。Graph PowerShell の公開クライアントなら委任スコープを個別に要求できる
GRAPH_POWERSHELL_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
APP_CATALOG_SCOPE = "https://graph.microsoft.com/AppCatalog.ReadWrite.All"
TIMEOUT = 180
_CLIENT: dict[str, str | None] = {"client_id": None, "scope": GRAPH_SCOPE}


def graph_session():
    if not _CLIENT["client_id"]:
        return get_session(scope=GRAPH_SCOPE)
    import requests

    session = requests.Session()
    token = get_token(scope=_CLIENT["scope"], client_id=_CLIENT["client_id"])
    session.headers["Authorization"] = f"Bearer {token}"
    return session


def graph_get(path: str) -> dict[str, Any]:
    response = graph_session().get(f"{GRAPH_BASE}{path}", timeout=TIMEOUT)
    if response.status_code >= 400:
        raise RuntimeError(f"GET {path} failed: HTTP {response.status_code} {response.text}")
    return response.json()


def graph_binary_post(path: str, package: bytes) -> dict[str, Any] | None:
    session = graph_session()
    response = session.post(
        f"{GRAPH_BASE}{path}",
        data=package,
        headers={"Content-Type": "application/zip"},
        timeout=TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"POST {path} failed: HTTP {response.status_code} {response.text}")
    return response.json() if response.content else None


def app_catalog() -> list[dict[str, Any]]:
    # appCatalogs/teamsApps は $top を受け付けない（HTTP 400）。ページングは @odata.nextLink に任せる
    path = (
        "/appCatalogs/teamsApps?$filter=distributionMethod eq 'organization'"
        "&$expand=appDefinitions"
    )
    values: list[dict[str, Any]] = []
    while path:
        page = graph_get(path)
        values.extend(page.get("value") or [])
        next_link = page.get("@odata.nextLink")
        path = next_link.removeprefix(GRAPH_BASE) if next_link else ""
    return values


def package_metadata(package_path: Path) -> tuple[dict[str, Any], bytes, str]:
    package = package_path.read_bytes()
    try:
        with zipfile.ZipFile(package_path) as archive:
            names = archive.namelist()
            if "manifest.json" not in names:
                raise SystemExit("ZIP ルートに manifest.json がありません。")
            manifest = json.loads(archive.read("manifest.json").decode("utf-8-sig"))
    except (zipfile.BadZipFile, json.JSONDecodeError) as error:
        raise SystemExit(f"無効な M365 app package です: {error}") from error
    for field in ("id", "version", "name"):
        if field not in manifest:
            raise SystemExit(f"manifest.json に必須フィールド {field} がありません。")
    return manifest, package, hashlib.sha256(package).hexdigest()


def plan_hash(plan: dict[str, Any]) -> str:
    payload = json.dumps(plan, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def list_packages(args: argparse.Namespace) -> None:
    packages = []
    for app in app_catalog():
        definitions = app.get("appDefinitions") or []
        latest = definitions[-1] if definitions else {}
        packages.append(
            {
                "teamsAppId": app.get("id"),
                "manifestId": app.get("externalId"),
                "displayName": app.get("displayName"),
                "version": latest.get("version"),
                "publishingState": latest.get("publishingState"),
            }
        )
    output = {"count": len(packages), "packages": packages}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if args.report_file:
        Path(args.report_file).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")


def deploy(args: argparse.Namespace) -> None:
    package_path = Path(args.package)
    if not package_path.is_file():
        raise SystemExit(f"パッケージが見つかりません: {package_path}")
    manifest, package, package_sha256 = package_metadata(package_path)
    matches = [app for app in app_catalog() if str(app.get("externalId", "")).lower() == manifest["id"].lower()]
    if len(matches) > 1:
        raise SystemExit(f"manifest ID {manifest['id']} に一致する組織アプリが複数あります。")
    if matches:
        teams_app_id = matches[0]["id"]
        path = f"/appCatalogs/teamsApps/{quote(teams_app_id, safe='')}/appDefinitions"
        operation = "update"
    else:
        path = "/appCatalogs/teamsApps"
        operation = "create"
    if args.requires_review:
        path += "?requiresReview=true"

    plan = {
        "operation": operation,
        "method": "POST",
        "path": path,
        "manifestId": manifest["id"],
        "displayName": (manifest.get("name") or {}).get("short"),
        "version": manifest["version"],
        "packageSha256": package_sha256,
        "requiresReview": args.requires_review,
    }
    approved_hash = plan_hash(plan)
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"PLAN_HASH={approved_hash}")
    if not args.apply:
        print("DRY-RUN: アップロードしていません。適用時は --expected-hash と --apply を指定してください。")
        return
    if args.expected_hash != approved_hash:
        raise SystemExit("承認済み plan hash が一致しません。パッケージを再確認してください。")
    result = graph_binary_post(path, package)
    print("APPLIED")
    if result:
        print(json.dumps(result, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph-powershell", action="store_true",
                        help="Graph PowerShell 公開クライアントで AppCatalog.ReadWrite.All を要求する（既定トークンが 403 のとき）")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="組織アプリカタログを一覧")
    list_parser.add_argument("--report-file")
    list_parser.set_defaults(handler=list_packages)

    deploy_parser = subparsers.add_parser("deploy", help="パッケージを新規登録または更新")
    deploy_parser.add_argument("--package", required=True)
    deploy_parser.add_argument("--requires-review", action="store_true")
    deploy_parser.add_argument("--apply", action="store_true")
    deploy_parser.add_argument("--expected-hash")
    deploy_parser.set_defaults(handler=deploy)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.graph_powershell:
        _CLIENT.update(client_id=GRAPH_POWERSHELL_CLIENT_ID, scope=APP_CATALOG_SCOPE)
    args.handler(args)


if __name__ == "__main__":
    main()