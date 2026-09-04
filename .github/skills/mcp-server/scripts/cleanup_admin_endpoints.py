"""データ投入用の管理エンドポイントを削除し、再デプロイして到達不能になったことを確認する。

投入が終わったら必ず実行する。攻撃面を残さないための後始末。

使い方:
    python .github/skills/mcp-server/scripts/cleanup_admin_endpoints.py --project mcp-servers/example-mcp --app func-example-mcp --confirm
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from deploy_mcp_function import build, ensure_func_cli, ensure_local_settings, publish  # noqa: E402
from azure_helper import function_url, http_post  # noqa: E402

ADMIN_FILE_HINTS = ("adminseed", "adminsetup", "admindbsetup", "seedupload")


def find_admin_sources(project: Path) -> list[Path]:
    functions_dir = project / "src" / "functions"
    if not functions_dir.exists():
        return []
    return [p for p in functions_dir.glob("*.ts") if p.stem.lower().replace("_", "") in ADMIN_FILE_HINTS]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--app", required=True)
    parser.add_argument("--route", action="append", default=None, help="削除されたことを確認するルート")
    parser.add_argument("--confirm", action="store_true", help="管理エンドポイントを削除して再デプロイする")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    targets = find_admin_sources(project)
    if not args.confirm:
        if targets:
            print("削除予定の管理エンドポイント:")
            for path in targets:
                print(f"  {path.relative_to(project)}")
        else:
            print("削除対象の管理エンドポイントは見つかりませんでした")
        print("実行するには内容を確認して --confirm を追加してください")
        return 0
    if not targets:
        print("削除対象の管理エンドポイントが見つかりませんでした（削除済みの可能性）")
    for path in targets:
        print(f"[remove] {path.relative_to(project)}")
        path.unlink()

    ensure_local_settings(project)
    func = ensure_func_cli()
    build(project)
    publish(func, project, args.app)

    ok = True
    for route in args.route or []:
        try:
            status, _ = http_post(function_url(args.app, route), timeout=60)
        except (RuntimeError, ValueError) as exc:
            print(f"[verify] {route}: 接続失敗 {exc}")
            ok = False
            continue
        print(f"[verify] {route}: {status} {'OK（削除済み）' if status == 404 else 'NG（まだ到達できる）'}")
        ok = ok and status == 404

    print("\nアプリ設定から ADMIN_SEED_SECRET を削除してください（本スクリプトは設定を変更しません）")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
