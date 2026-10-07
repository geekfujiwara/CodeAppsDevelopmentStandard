"""物件概要の取り込み用カスタム コネクタ（認証なし・ホスト suumo.jp 固定）を作成し、接続を作って動作を確かめる。

Code Apps の既定の CSP（connect-src 'none'）では、ブラウザから外部サイトを fetch できない。
外部ページはコネクタ経由（サーバー側）で取得する。

使い方（.env の ENV_ID / SOLUTION_NAME / DATAVERSE_URL を使う）:
    python scripts/setup_listing_connector.py            # 作成（既にあれば更新）→ 接続 → 1 回呼んで確認
    python scripts/setup_listing_connector.py --dry-run  # 何をするかだけ表示

最後に表示される connector / connection を使って、Code App にデータソースを追加する:
    python .github/skills/code-apps/scripts/add_data_source.py --connector <shared_...> --connection-id <接続名>
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / ".github" / "skills"
CONNECTOR_DIR = ROOT / "connectors" / "listing"
# pac は題名からコネクタ名を作る（英数字・ハイフン・アンダースコアのみ）。説明は日本語
DISPLAY_NAME = "Perse3D-Listing-SUUMO"
CONNECTION_NAME = "物件概要の取り込み"
CREATED = re.compile(r"Connector created with ID ([0-9a-fA-F-]{36})")
# 動作確認に使う物件概要のパス（公開ページ 1 件。値は表示しない）
TEST_PATH = os.getenv("LISTING_TEST_PATH", "")


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip().strip('"')


def skill_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def assert_definition() -> None:
    """コネクタ定義の事前検証: ホストは suumo.jp 固定・認証なし・GET の操作だけ（任意の URL を取りに行けるコネクタにしない）"""
    definition = json.loads((CONNECTOR_DIR / "apiDefinition.swagger.json").read_text(encoding="utf-8-sig"))
    properties = json.loads((CONNECTOR_DIR / "apiProperties.json").read_text(encoding="utf-8-sig"))
    if definition.get("host") != "suumo.jp" or definition.get("schemes") != ["https"]:
        raise SystemExit("apiDefinition の host は suumo.jp、schemes は https だけにしてください")
    methods = {m for p in definition.get("paths", {}).values() for m in p}
    if methods != {"get"}:
        raise SystemExit(f"操作は GET だけにしてください: {sorted(methods)}")
    # 物件概要・物件ページ（画像の一覧）・物件画像（robots.txt で許可された /jj/resizeImage）だけ
    allowed = {"/{kind}/{pref}/{area}/{id}/bukkengaiyo/", "/{kind}/{pref}/{area}/{id}/", "/jj/resizeImage"}
    for path in definition.get("paths", {}):
        if path not in allowed:
            raise SystemExit(f"物件概要・物件ページ・物件画像以外のパスは置かない: {path}")
    if properties.get("properties", {}).get("connectionParameters"):
        raise SystemExit("このコネクタは認証なし（connectionParameters は空）")
    # Code Apps の SDK は、JSON 以外の応答（text/html）でも状態コードの応答情報（responseInfo["200"]。schema が無くても
    # type "void" で生成される）があると本文を JSON.parse し、必ず InvalidResponse で失敗する。
    # JSON を返さない操作は応答を状態コードで宣言せず "default" だけにする
    produces = definition.get("produces") or []
    for path, ops in definition.get("paths", {}).items():
        for method, op in ops.items():
            types = op.get("produces") or produces
            if any("json" in t for t in types):
                continue
            coded = [s for s in (op.get("responses") or {}) if s != "default"]
            if coded:
                raise SystemExit(f"{method.upper()} {path} は {types} を返すので、応答 {coded} を \"default\" にしてください（Code Apps の SDK が JSON として読んで失敗する）")


def find_connector(display_name: str) -> dict | None:
    sys.path.insert(0, str(SKILLS / "standard" / "scripts"))
    from auth_helper import api_get  # noqa: PLC0415

    rows = api_get(f"connectors?$select=connectorid,displayname,connectorinternalid&$filter=displayname eq '{display_name}'").get("value", [])
    if len(rows) > 1:
        raise SystemExit(f"同じ表示名のコネクタが {len(rows)} 件あります。不要なものを削除してください")
    return rows[0] if rows else None


def run_pac(command: list[str]) -> str:
    res = subprocess.run(command, check=False, text=True, capture_output=True, encoding="utf-8", errors="replace")
    output = (res.stdout or "") + (res.stderr or "")
    if res.returncode:
        raise SystemExit(output.strip() or "pac connector コマンドが失敗しました")
    return output


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    load_env()
    parser = argparse.ArgumentParser(description="物件概要の取り込み用コネクタを作成・接続・確認する")
    parser.add_argument("--environment", default=os.getenv("ENV_ID"))
    parser.add_argument("--solution", default=os.getenv("SOLUTION_NAME"))
    parser.add_argument("--test-path", default=TEST_PATH, help="動作確認に使う物件概要のパス（/chukoikkodate/…/nc_…/bukkengaiyo/）")
    parser.add_argument("--add-to-app", action="store_true", help="作成した接続でアプリにデータソースを追加する（power.config.json が必要。npx pa app init の後）")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.environment:
        raise SystemExit("--environment（または .env の ENV_ID）が必要です")

    assert_definition()
    existing = find_connector(DISPLAY_NAME)
    print(f"[plan] コネクタ: {DISPLAY_NAME}（{'更新 ' + existing['connectorinternalid'] if existing else '新規作成'}）、ソリューション: {args.solution or '(なし)'}")
    if args.dry_run:
        return 0

    pac = shutil.which("pac")
    if not pac:
        raise SystemExit("pac コマンドが見つかりません")
    command = [pac, "connector"]
    if existing:
        command += ["update", "--connector-id", existing["connectorid"]]
    else:
        command += ["create"]
        if args.solution:
            command += ["--solution-unique-name", args.solution]
    command += ["--environment", args.environment, "--api-definition-file", str(CONNECTOR_DIR / "apiDefinition.swagger.json"), "--api-properties-file", str(CONNECTOR_DIR / "apiProperties.json")]
    output = run_pac(command)
    if not existing:
        m = CREATED.search(output)
        if not m:
            raise SystemExit(f"コネクタ ID を出力から読めませんでした:\n{output.strip()}")
    row = find_connector(DISPLAY_NAME)
    if not row:
        raise SystemExit("作成したコネクタを Dataverse から読めません")
    connector = row["connectorinternalid"]
    print(f"[connector] {connector}")

    cc = skill_module("create_connection", SKILLS / "custom-connector" / "scripts" / "create_connection.py")
    # ランタイム側に反映されるまで待つ（作成直後は connections の API が 404 を返すことがある）
    deadline = time.time() + 120
    while True:
        try:
            connections = cc.list_connections(args.environment, connector)
            break
        except SystemExit:
            if time.time() > deadline:
                raise
            time.sleep(5)
    mine = [c for c in connections if c.get("properties", {}).get("displayName") == CONNECTION_NAME and cc.connection_status(c) == "Connected"]
    if mine:
        name = mine[0]["name"]
        print(f"[connection] 既存の接続 {name} を使います")
    else:
        # 認証なしのコネクタは、空の connectionParameters で PUT すると同意なしで Connected になる
        name = uuid.uuid4().hex
        body = {"properties": {"environment": {"name": args.environment}, "connectionParameters": {}, "displayName": CONNECTION_NAME}}
        cc._request("PUT", f"{cc._connections_url(args.environment, connector)}/{name}?api-version=1", json=body)
        cc.wait_connected(args.environment, connector, name)
        print(f"[connection] 接続 {name} を作成しました（Connected）")

    if args.test_path:
        if not re.match(r"^/(chukoikkodate|ikkodate|tochi)/[a-z_]+/[a-z0-9_]+/nc_\d+/bukkengaiyo/$", args.test_path):
            raise SystemExit("--test-path は /<種類>/<都道府県>/<市区町村>/nc_<番号>/bukkengaiyo/ の形にしてください")
        sys.path.insert(0, str(SKILLS / "standard" / "scripts"))
        from auth_helper import get_session  # noqa: PLC0415

        def get(target: str, **kwargs):
            # 社内ネットワークのプロキシ経由で TLS が途中で切れることがある（SSLEOFError）。3 回まで試す
            for attempt in range(3):
                try:
                    return get_session("https://apihub.azure.com/.default").get(target, timeout=120, **kwargs)
                except Exception as exc:  # noqa: BLE001
                    if attempt == 2:
                        raise
                    print(f"[invoke] 再試行します（{type(exc).__name__}）")
                    time.sleep(5)
            raise RuntimeError("unreachable")

        url = f"{cc.runtime_base(args.environment, connector)}/{name}{args.test_path}"
        started = time.perf_counter()
        res = get(url)
        elapsed = int((time.perf_counter() - started) * 1000)
        text = res.text
        found = sum(1 for label in ("所在地", "建物面積", "構造・工法") if label in text)
        print(f"[invoke] GET {args.test_path} -> {res.status_code}（{elapsed} ms、{len(text)} 文字、物件概要の見出し {found}/3）")
        if res.status_code >= 400 or found < 3:
            raise SystemExit("コネクタ経由で物件概要を取得できませんでした")
        # 物件ページ（画像の一覧）と、間取り図の画像 1 枚
        page = get(url.removesuffix("bukkengaiyo/"))
        srcs = re.findall(r'resizeImage\?src=(gazo[^"&]+)[^"]*"[^>]*alt="間取り図"', page.text)
        print(f"[invoke] GET 物件ページ -> {page.status_code}（間取り図の画像 {len(srcs)} 枚）")
        if page.status_code >= 400 or not srcs:
            raise SystemExit("コネクタ経由で物件ページの画像一覧を取得できませんでした")
        base = cc.runtime_base(args.environment, connector)
        img = get(
            f"{base}/{name}/jj/resizeImage", params={"src": urllib.parse.unquote(srcs[0]), "w": "1000", "h": "1000"}
        )
        print(f"[invoke] GET 物件画像 -> {img.status_code}（{img.headers.get('content-type')}、{len(img.content)} バイト）")
        if img.status_code >= 400 or not str(img.headers.get("content-type", "")).startswith("image/"):
            raise SystemExit("コネクタ経由で物件画像を取得できませんでした")
    print(f"\nconnector: {connector}\nconnection: {name}")
    if args.add_to_app:
        if not (ROOT / "power.config.json").exists():
            raise SystemExit("power.config.json がありません。先に npx pa app init でアプリを作成してください")
        add = SKILLS / "code-apps" / "scripts" / "add_data_source.py"
        print(f"[data-source] {add.name} --connector {connector} --connection-id {name}")
        res = subprocess.run([sys.executable, str(add), "--connector", connector, "--connection-id", name], cwd=ROOT, check=False)
        if res.returncode:
            raise SystemExit("アプリへのデータソース追加に失敗しました")
        # 生成サービスに操作がそろっているか（swagger を変えたのに追加し直していない、を防ぐ）
        services = list((ROOT / "src" / "generated" / "services").glob("*Service.ts"))
        text = "\n".join(p.read_text(encoding="utf-8") for p in services)
        missing = [op for op in ("GetListingOverview", "GetListingPage", "GetListingImage") if op not in text]
        if missing:
            raise SystemExit(f"生成サービスに操作がありません: {missing}")
        print("[data-source] 物件ページ取得のコネクタをアプリに追加しました")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
