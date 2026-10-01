"""カスタム コネクタ（OAuth 認可コード）の接続を作成する。

Power Automate / Power Apps の接続画面が使う Power Platform API（非公開。観測日は CONTRACT_VERSION）を使う。
観測した contract と根拠は references/connection-api-contract.md。

サブコマンド:
  plan    対象を固定して事前検証し、plan とハッシュを出力する（書き込みなし）
  apply   承認済み plan で接続を作成 → 同意リンクを取得 → localhost で中継してサインインを待つ → Connected を確認
  manual  ポータルの URL を表示し、利用者がブラウザで作成した接続が Connected になるまで API で待つ
  status  接続の一覧と状態を表示する
  delete  接続を削除する（対象を読み戻して確認してから）

同意リンクと認可コードは画面・ログ・ファイルに出さない（ブラウザは http://127.0.0.1:<port>/start を開くだけ）。

使い方:
  python create_connection.py plan  --environment <env-id> --connector <shared_...> --display-name "<表示名>" [--connection-reference <logical>]
  python create_connection.py apply --plan .mcp/connection-plan.json --plan-hash <sha256>
  python create_connection.py manual --environment <env-id> --connector <shared_...> [--connection-reference <logical>]
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

CONTRACT_VERSION = "2026-10-01"
PP_SCOPE = "https://api.powerplatform.com/.default"
# 既定の Azure CLI 互換クライアントには Connectivity.Connections.* の委任アクセス許可が無く 403 になる
PAC_CLIENT_ID = "9cee029c-6210-4654-90bb-17e6e9d36617"
PLAN_KEYS = {"contractVersion", "environment", "host", "connector", "connectionName", "displayName", "redirectPort", "connectionReference"}
GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
CONNECTOR = re.compile(r"^shared_[A-Za-z0-9][A-Za-z0-9\-_.]{2,200}$")
CONNECTION_NAME = re.compile(r"^[0-9a-f]{32}$")
LOGICAL_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
PORTAL = "https://make.powerautomate.com"
STANDARD_SCRIPTS = Path(__file__).resolve().parents[2] / "standard" / "scripts"


# ---------- 純粋関数（tests/ で検証） ----------

def environment_host(environment_id: str) -> str:
    """環境 ID から環境スコープの Power Platform API ホストを求める（ハイフンを除き、末尾 2 文字の前に . を入れる）。"""
    if not GUID.match(environment_id or ""):
        raise ValueError(f"環境 ID が GUID ではありません: {environment_id}")
    h = environment_id.replace("-", "").lower()
    return f"https://{h[:-2]}.{h[-2:]}.environment.api.powerplatform.com"


def canonical_hash(plan: dict) -> str:
    return hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def validate_plan(plan: dict) -> None:
    if set(plan) != PLAN_KEYS:
        raise ValueError(f"plan のキーが一致しません: {sorted(set(plan) ^ PLAN_KEYS)}")
    if plan["contractVersion"] != CONTRACT_VERSION:
        raise ValueError(f"contract が違います（plan={plan['contractVersion']} / script={CONTRACT_VERSION}）。plan を作り直してください")
    if plan["host"] != environment_host(plan["environment"]):
        raise ValueError("plan の host が環境 ID から求めた値と一致しません")
    if not CONNECTOR.match(plan["connector"]):
        raise ValueError(f"コネクタ ID の形式が不正です: {plan['connector']}")
    if not CONNECTION_NAME.match(plan["connectionName"]):
        raise ValueError("connectionName は 32 桁の小文字 16 進数にしてください")
    name = plan["displayName"]
    if not isinstance(name, str) or not 1 <= len(name) <= 128 or any(c in name for c in "\r\n\t"):
        raise ValueError("displayName は改行を含まない 1〜128 文字にしてください")
    port = plan["redirectPort"]
    if not isinstance(port, int) or isinstance(port, bool) or not 1024 <= port <= 65535:
        raise ValueError("redirectPort は 1024〜65535 にしてください")
    ref = plan["connectionReference"]
    if ref is not None and not LOGICAL_NAME.match(ref):
        raise ValueError(f"接続参照の論理名は英字で始まり英数字と _ のみ: {ref}")


def connection_status(connection: dict | None) -> str:
    if not connection:
        return "Missing"
    statuses = connection.get("properties", {}).get("statuses") or []
    return statuses[0].get("status", "Unknown") if statuses else "Unknown"


def decode_consent_error(value: str) -> str:
    """同意サーバーが返す error パラメーター（Base64）を読める形にする。Base64 でなければそのまま返す。"""
    try:
        decoded = base64.b64decode(value + "=" * (-len(value) % 4), validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return value
    return decoded if decoded.isprintable() or "\n" in decoded else value


def new_connected(before: list[dict], after: list[dict]) -> list[dict]:
    known = {c["name"] for c in before}
    return [c for c in after if c["name"] not in known and connection_status(c) == "Connected"]


# ---------- API ----------

def _auth_headers() -> dict[str, str]:
    sys.path.insert(0, str(STANDARD_SCRIPTS))
    from auth_helper import get_token  # noqa: PLC0415

    return {"Authorization": f"Bearer {get_token(PP_SCOPE, client_id=PAC_CLIENT_ID)}", "Content-Type": "application/json"}


def _request(method: str, url: str, **kwargs):
    import requests  # noqa: PLC0415

    res = requests.request(method, url, headers=_auth_headers(), timeout=60, **kwargs)
    if res.status_code >= 400:
        raise SystemExit(f"{method} {url.split('?')[0]} -> {res.status_code} {res.text[:300]}")
    return res


def _connections_url(environment: str, connector: str) -> str:
    return f"{environment_host(environment)}/connectivity/connectors/{connector}/connections"


def list_connections(environment: str, connector: str) -> list[dict]:
    res = _request("GET", f"{_connections_url(environment, connector)}?api-version=1&$filter=environment eq '{environment}'")
    return res.json().get("value", [])


def assert_connector_in_dataverse(connector: str) -> None:
    sys.path.insert(0, str(STANDARD_SCRIPTS))
    from auth_helper import api_get  # noqa: PLC0415

    rows = api_get(f"connectors?$select=connectorid&$filter=connectorinternalid eq '{connector}'").get("value", [])
    if not rows:
        raise SystemExit(f"DATAVERSE_URL の環境にコネクタ {connector} がありません（deploy_connector.py で作成するか、環境を確認してください）")


def bind_connection_reference(logical_name: str, connector: str, connection_name: str) -> None:
    sys.path.insert(0, str(STANDARD_SCRIPTS))
    from auth_helper import api_get, api_patch  # noqa: PLC0415

    rows = api_get(
        "connectionreferences?$select=connectionreferenceid,connectorid,connectionid"
        f"&$filter=connectionreferencelogicalname eq '{logical_name}'"
    ).get("value", [])
    if len(rows) != 1:
        raise SystemExit(f"接続参照 {logical_name} が一意に見つかりません: {len(rows)} 件")
    if not (rows[0].get("connectorid") or "").endswith(f"/{connector}"):
        raise SystemExit(f"接続参照 {logical_name} は別のコネクタ用です: {rows[0].get('connectorid')}")
    api_patch(f"connectionreferences({rows[0]['connectionreferenceid']})", {"connectionid": connection_name})
    bound = api_get(f"connectionreferences({rows[0]['connectionreferenceid']})?$select=connectionid").get("connectionid")
    if bound != connection_name:
        raise SystemExit("接続参照へのバインドを読み戻せませんでした")
    print(f"[bind] 接続参照 {logical_name} -> {connection_name}")


def wait_connected(environment: str, connector: str, connection_name: str, seconds: int = 60) -> dict:
    deadline = time.time() + seconds
    while True:
        match = next((c for c in list_connections(environment, connector) if c["name"] == connection_name), None)
        if connection_status(match) == "Connected":
            return match  # type: ignore[return-value]
        if time.time() > deadline:
            raise SystemExit(f"接続が Connected になりません（現在: {connection_status(match)}）")
        time.sleep(3)


# ---------- localhost の中継（同意リンクとコードを表示しない） ----------

class Relay:
    def __init__(self, port: int, consent_link: str):
        self.consent_link = consent_link
        self.query: dict | None = None
        relay = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                url = urlparse(self.path)
                if url.path == "/start":
                    self.send_response(302)
                    self.send_header("Location", relay.consent_link)
                    self.end_headers()
                    print("[relay] 同意ページへ転送しました", flush=True)
                    return
                if url.path != "/callback":
                    self.send_response(404)
                    self.end_headers()
                    return
                relay.query = {k: v[0] for k, v in parse_qs(url.query).items()}
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write("<p>応答を受け取りました。このタブは閉じて構いません。</p>".encode("utf-8"))

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", port), Handler)
        self.server.timeout = 1

    def wait(self, seconds: int) -> dict | None:
        deadline = time.time() + seconds
        while self.query is None and time.time() < deadline:
            self.server.handle_request()
        self.server.server_close()
        return self.query


# ---------- サブコマンド ----------

def assert_git_ignored(path: Path) -> None:
    res = subprocess.run(["git", "check-ignore", "--no-index", "-q", "--", str(path)], check=False, capture_output=True)
    if res.returncode == 128:
        raise SystemExit("Git リポジトリ外のため、plan の保存先が除外されているか判定できません（git init し、.gitignore に .mcp/ を追加）")
    if res.returncode != 0:
        raise SystemExit(f"plan の保存先が .gitignore で除外されていません: {path}")


def cmd_plan(args) -> int:
    plan = {
        "contractVersion": CONTRACT_VERSION,
        "environment": args.environment,
        "host": environment_host(args.environment),
        "connector": args.connector,
        "connectionName": uuid.uuid4().hex,
        "displayName": args.display_name,
        "redirectPort": args.port,
        "connectionReference": args.connection_reference,
    }
    validate_plan(plan)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    assert_git_ignored(out)
    assert_connector_in_dataverse(args.connector)
    same = [c for c in list_connections(args.environment, args.connector) if c.get("properties", {}).get("displayName") == args.display_name]
    if same and not args.allow_duplicate:
        raise SystemExit(f"同じ表示名の接続があります: {[(c['name'], connection_status(c)) for c in same]}（意図的なら --allow-duplicate）")
    out.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"\nplan: {out.as_posix()}\nsha256: {canonical_hash(plan)}")
    return 0


def cmd_apply(args) -> int:
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    if canonical_hash(plan) != args.plan_hash:
        raise SystemExit("plan のハッシュが承認値と一致しません（plan が変更されています）")
    validate_plan(plan)
    env, connector, name = plan["environment"], plan["connector"], plan["connectionName"]
    if any(c["name"] == name for c in list_connections(env, connector)):
        raise SystemExit(f"接続 {name} は既に存在します。plan を作り直してください")

    url = f"{_connections_url(env, connector)}/{name}"
    body = {"properties": {"environment": {"name": env}, "connectionParameters": {}, "displayName": plan["displayName"]}}
    created = _request("PUT", f"{url}?api-version=1", json=body).json()
    print(f"[create] 接続 {name} を作成しました（状態: {connection_status(created)}。サインイン待ち）")

    succeeded = False
    try:
        redirect = f"http://localhost:{plan['redirectPort']}/callback"
        consent = _request("POST", f"{url}/getConsentLink?api-version=1&$filter=environment eq '{env}'", json={"redirectUrl": redirect}).json()
        if not consent.get("consentLink"):
            raise SystemExit("同意リンクを取得できませんでした")
        relay = Relay(plan["redirectPort"], consent["consentLink"])
        print(f"\n[sign-in] 接続の所有者になる本人のブラウザで開いてください: http://127.0.0.1:{plan['redirectPort']}/start")
        print("  1. アカウントを選ぶ（初回だけアクセス許可の同意画面が出る → Accept）")
        print("  2. 「Confirmation required」で作成者が本人であることを確認し、チェックして Allow access")
        print(f"  （最大 {args.timeout} 秒待ちます）", flush=True)
        query = relay.wait(args.timeout)
        if query is None:
            raise SystemExit("サインインが完了しませんでした（タイムアウト）")
        if "error" in query:
            raise SystemExit(f"同意に失敗しました:\n{decode_consent_error(query['error'])}")
        if "code" in query:
            # ポータルへ戻す場合と同じく、コードが付いて戻ったときだけ確定を呼ぶ
            # （localhost へ戻す場合は同意サーバーが確認画面のあとで確定し、コードは付かない）
            _request("POST", f"{url}/confirmConsentCode?api-version=1&$filter=environment eq '{env}'", json={"code": query["code"]})
        connection = wait_connected(env, connector, name)
        print(f"[verify] 接続 {name}（{connection['properties'].get('displayName')}）は Connected")
        if plan["connectionReference"]:
            bind_connection_reference(plan["connectionReference"], connector, name)
        succeeded = True
    finally:
        if not succeeded and not args.keep_on_failure:
            _request("DELETE", f"{url}?api-version=1")
            print(f"[cleanup] 失敗したため接続 {name} を削除しました（残すには --keep-on-failure）")
    print(f"\nconnection: {name}")
    return 0


def cmd_manual(args) -> int:
    before = list_connections(args.environment, args.connector)
    print("[manual] 接続の所有者になる本人に、次の URL を Microsoft Edge で開いてもらいます（表示名を入れて「作成」→ サインイン）:")
    print(f"  {PORTAL}/environments/{args.environment}/connections/available/{args.connector}")
    print("  ※ VS Code の統合ブラウザは同意のポップアップがブロックされ、画面側が接続を削除して終わる")
    print(f"[manual] 作成を API で確認します（最大 {args.timeout} 秒）...", flush=True)
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        time.sleep(10)
        found = new_connected(before, list_connections(args.environment, args.connector))
        if found:
            c = found[0]
            owner = c["properties"].get("createdBy", {}).get("userPrincipalName")
            print(f"[verify] 新しい接続 {c['name']}（{c['properties'].get('displayName')}、作成者 {owner}）は Connected")
            if args.connection_reference:
                bind_connection_reference(args.connection_reference, args.connector, c["name"])
            print(f"\nconnection: {c['name']}")
            return 0
    raise SystemExit("時間内に Connected の新しい接続を確認できませんでした")


def cmd_status(args) -> int:
    for c in list_connections(args.environment, args.connector):
        p = c.get("properties", {})
        print(f"{c['name']}  {connection_status(c):<10} {p.get('displayName')}  ({p.get('createdBy', {}).get('userPrincipalName')})")
    return 0


def cmd_delete(args) -> int:
    match = next((c for c in list_connections(args.environment, args.connector) if c["name"] == args.connection_name), None)
    if not match:
        raise SystemExit(f"接続 {args.connection_name} はありません")
    print(f"対象: {match['name']} {match['properties'].get('displayName')} ({connection_status(match)})")
    if not args.yes:
        raise SystemExit("削除するには --yes を付けてください")
    _request("DELETE", f"{_connections_url(args.environment, args.connector)}/{args.connection_name}?api-version=1")
    if any(c["name"] == args.connection_name for c in list_connections(args.environment, args.connector)):
        raise SystemExit("削除後も接続が残っています")
    print("[delete] 削除を確認しました")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="カスタム コネクタ（OAuth）の接続を作成する")
    sub = parser.add_subparsers(dest="command", required=True)

    def target(p: argparse.ArgumentParser) -> None:
        p.add_argument("--environment", default=os.getenv("ENV_ID"), help="Power Platform 環境 ID（既定: .env の ENV_ID）")
        p.add_argument("--connector", required=True, help="コネクタ ID（shared_...）")

    p = sub.add_parser("plan", help="plan とハッシュを出力する（書き込みなし）")
    target(p)
    p.add_argument("--display-name", required=True)
    p.add_argument("--connection-reference", help="作成後にバインドする接続参照の論理名")
    p.add_argument("--port", type=int, default=53682)
    p.add_argument("--out", default=".mcp/connection-plan.json")
    p.add_argument("--allow-duplicate", action="store_true")
    p.set_defaults(func=cmd_plan)

    p = sub.add_parser("apply", help="承認済み plan で作成する")
    p.add_argument("--plan", required=True)
    p.add_argument("--plan-hash", required=True)
    p.add_argument("--timeout", type=int, default=600)
    p.add_argument("--keep-on-failure", action="store_true")
    p.set_defaults(func=cmd_apply)

    p = sub.add_parser("manual", help="URL を案内し、利用者の作成を API で確認する")
    target(p)
    p.add_argument("--connection-reference")
    p.add_argument("--timeout", type=int, default=900)
    p.set_defaults(func=cmd_manual)

    p = sub.add_parser("status", help="接続の一覧")
    target(p)
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("delete", help="接続を削除する")
    target(p)
    p.add_argument("--connection-name", required=True)
    p.add_argument("--yes", action="store_true")
    p.set_defaults(func=cmd_delete)
    return parser


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    args = build_parser().parse_args()
    if getattr(args, "environment", "x") is None:
        raise SystemExit("--environment か .env の ENV_ID が必要です")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
