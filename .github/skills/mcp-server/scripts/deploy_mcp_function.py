"""MCP Server（Azure Functions）を事前チェック付きでデプロイし、ルートを実測検証する。

`func azure functionapp publish` は成功しても終了コード 1 と "appears to be unhealthy" を
返すことがあるため、**成否は HTTP プローブで判定する**。

使い方:
    python .github/skills/mcp-server/scripts/deploy_mcp_function.py --project mcp-servers/example-mcp --app func-example-mcp
    python .github/skills/mcp-server/scripts/deploy_mcp_function.py --project ... --app ... --route mcp --route seed-upload
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import requests

LOCAL_SETTINGS = {
    "IsEncrypted": False,
    "Values": {"FUNCTIONS_WORKER_RUNTIME": "node", "AzureWebJobsStorage": ""},
}


def ensure_local_settings(project: Path) -> None:
    """`local.settings.json` を保証する。

    これが無いと publish が "Worker runtime cannot be 'None'" で失敗する。
    .gitignore 対象のファイルなので clone 直後は必ず存在しない。
    """
    path = project / "local.settings.json"
    if path.exists():
        values = json.loads(path.read_text(encoding="utf-8")).get("Values", {})
        if values.get("FUNCTIONS_WORKER_RUNTIME"):
            print("[check] local.settings.json OK")
            return
        print("[fix] local.settings.json に FUNCTIONS_WORKER_RUNTIME が無いため補完します")
    else:
        print("[fix] local.settings.json が無いため生成します")
    path.write_text(json.dumps(LOCAL_SETTINGS, indent=2), encoding="utf-8")


def ensure_func_cli() -> str:
    """`func` を実行可能にする。npm の zip 未展開を検知したら展開して復旧する。"""
    func = shutil.which("func")
    if func and subprocess.run([func, "--version"], capture_output=True).returncode == 0:
        print("[check] func CLI OK")
        return func

    npm_root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, shell=os.name == "nt")
    bin_dir = Path(npm_root.stdout.strip()) / "azure-functions-core-tools" / "bin"
    archives = list(bin_dir.glob("Azure.Functions.Cli.*.zip")) if bin_dir.exists() else []
    if not archives:
        raise SystemExit("func CLI が見つかりません。`npm i -g azure-functions-core-tools@4` を実行してください")

    print(f"[fix] core tools の zip が未展開のため展開します: {archives[0].name}")
    with zipfile.ZipFile(archives[0]) as zf:
        zf.extractall(bin_dir)
    func = shutil.which("func") or str(bin_dir / "func.exe")
    if subprocess.run([func, "--version"], capture_output=True).returncode != 0:
        raise SystemExit("func CLI の復旧に失敗しました")
    return func


def build(project: Path) -> None:
    # tsc は dist/ をクリーンしないため、削除した関数の .js が残ってルートが復活する
    dist = project / "dist"
    if dist.exists():
        shutil.rmtree(dist)
        print("[clean] dist/ を削除しました")
    for args in (["npm", "install"], ["npm", "run", "build"]):
        res = subprocess.run(args, cwd=project, shell=os.name == "nt")
        if res.returncode != 0:
            raise SystemExit(f"{' '.join(args)} が失敗しました")
    if not dist.exists() or not any(dist.rglob("*.js")):
        raise SystemExit("ビルド出力 dist/ が空です。空パッケージのデプロイを中止しました")
    print("[check] ビルド出力 OK")


def publish(func: str, project: Path, app: str) -> None:
    # 出力をパイプで受けるとバッファされて進捗が見えなくなるため、ログファイルへ流す
    log = Path(tempfile.gettempdir()) / f"publish-{app}.log"
    print(f"[publish] {app} (log: {log})")
    with log.open("w", encoding="utf-8", errors="replace") as fp:
        subprocess.run(
            [func, "azure", "functionapp", "publish", app, "--typescript"],
            cwd=project,
            stdout=fp,
            stderr=subprocess.STDOUT,
        )
    # 終了コードは "appears to be unhealthy" で 1 になり得るため成否判定に使わない
    print("".join(log.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)[-15:]))


def verify_routes(app: str, routes: list[str]) -> bool:
    """ルートを HTTP プローブする。401 = 存在して認可が動いている、404 = 未デプロイ。"""
    ok = True
    for route in routes:
        url = f"https://{app}.azurewebsites.net/api/{route}"
        try:
            status = requests.post(url, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, timeout=60).status_code
        except requests.RequestException as exc:
            print(f"[verify] {route}: 接続失敗 {exc}")
            ok = False
            continue
        if status == 404:
            print(f"[verify] {route}: 404 未デプロイ")
            ok = False
        else:
            print(f"[verify] {route}: {status} OK（ルート存在）")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True, help="Functions プロジェクトのパス")
    parser.add_argument("--app", required=True, help="Function App 名")
    parser.add_argument("--route", action="append", default=None, help="検証するルート（既定: mcp）")
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    if not (project / "package.json").exists():
        raise SystemExit(f"Functions プロジェクトが見つかりません: {project}")

    ensure_local_settings(project)
    func = ensure_func_cli()
    if not args.skip_build:
        build(project)
    publish(func, project, args.app)

    if not verify_routes(args.app, args.route or ["mcp"]):
        print("デプロイ後のルート検証に失敗しました")
        return 1
    print("デプロイ完了")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
