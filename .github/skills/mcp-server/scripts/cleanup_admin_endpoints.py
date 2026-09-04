"""データ投入用の管理エンドポイントを削除し、再デプロイして到達不能になったことを確認する。

投入が終わったら必ず実行する。攻撃面を残さないための後始末。

使い方:
    python .github/skills/mcp-server/scripts/cleanup_admin_endpoints.py --project mcp-servers/example-mcp --app func-example-mcp
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deploy_mcp_function import build, ensure_func_cli, ensure_local_settings, publish  # noqa: E402

ADMIN_FILE_HINTS = ("adminseed", "adminsetup", "admindbsetup", "seedupload")


def find_admin_sources(project: Path) -> list[Path]:
    functions_dir = project / "src" / "functions"
    if not functions_dir.exists():
        return []
    return [p for p in functions_dir.glob("*.ts") if p.stem.lower().replace("_", "") in ADMIN_FILE_HINTS]


def strip_entrypoint_imports(project: Path, removed: list[Path]) -> None:
    """エントリポイントに残った import を削除する。残すと worker が起動できず全ルートが 404 になる。"""
    entry = project / "src" / "index.ts"
    if not entry.exists():
        return
    stems = {p.stem for p in removed}
    kept = [line for line in entry.read_text(encoding="utf-8").splitlines() if not any(f"functions/{s}" in line for s in stems)]
    entry.write_text("\n".join(kept) + "\n", encoding="utf-8")
    print(f"[entry] {entry.relative_to(project)} から削除済みモジュールの import を除去しました")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--app", required=True)
    parser.add_argument("--route", action="append", default=None, help="削除されたことを確認するルート")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    targets = find_admin_sources(project)
    if not targets:
        print("削除対象の管理エンドポイントが見つかりませんでした（削除済みの可能性）")
    for path in targets:
        print(f"[remove] {path.relative_to(project)}")
        path.unlink()
    strip_entrypoint_imports(project, targets)

    ensure_local_settings(project)
    func = ensure_func_cli()
    build(project)
    publish(func, project, args.app)

    ok = True
    for route in args.route or []:
        url = f"https://{args.app}.azurewebsites.net/api/{route}"
        status = requests.post(url, timeout=60).status_code
        print(f"[verify] {route}: {status} {'OK（削除済み）' if status == 404 else 'NG（まだ到達できる）'}")
        ok = ok and status == 404

    print("\nアプリ設定から ADMIN_SEED_SECRET を削除してください（本スクリプトは設定を変更しません）")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
