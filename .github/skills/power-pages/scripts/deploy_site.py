"""
Power Pages Code Site 統合デプロイスクリプト（再現性のための標準フロー）

`npm run build` → `pac pages upload-code-site` だけでデプロイすると、
upload-code-site が `.powerpages-site/table-permissions/*.yml` で既存の
テーブル権限を上書きし、Web ロール紐付け（content JSON + N:N association）を
**消去する**ため、再デプロイのたびに全テーブル権限が 403 になる（実機 m365status で確定）。

このスクリプトは事故を構造的に防ぐため、以下を 1 コマンドで一貫実行する:

    1. ビルド            : portal で `npm run build`
    2. アップロード      : `pac pages upload-code-site --rootPath . --compiledPath ./dist`
    3. ロール再付与      : relink_table_permissions.relink_all()
                           （全 type=18 に content 配列 + N:N association を冪等付与）
    4. 検証              : relink_table_permissions.verify_all()
                           （欠落があれば非ゼロ終了）
    5. 再起動            : relink_table_permissions.restart_site()

ハードコードは一切なし。すべて .env / 環境変数で管理する（.env.example 参照）。

必須 env:
    DATAVERSE_URL          Dataverse 環境 URL
再起動に必要（いずれか）:
    PAGES_WEBSITE_ID       PP API の websites().id（最優先・最も確実）
    PP_SUBDOMAIN           サブドメイン（フォールバック）
    ENV_ID                 Power Platform 環境 ID
任意 env:
    PORTAL_DIR             ポータルディレクトリ（既定: ./portal）
    RELINK_WEBROLE_NAMES   再付与する Web ロール名（部分一致, カンマ区切り。既定: Authenticated）

Usage:
    py .github/skills/power-pages/scripts/deploy_site.py [OPTIONS]

Options:
    --skip-build      ビルドをスキップ（事前ビルド済みの場合）
    --skip-upload     アップロードをスキップ（relink/restart のみ実行）
    --skip-relink     ロール再付与・検証をスキップ（非推奨）
    --skip-restart    再起動をスキップ
    --portal-dir DIR  ポータルディレクトリを指定（既定: $PORTAL_DIR or ./portal）
"""
import os
import sys
import subprocess
from pathlib import Path

# Windows 既定コンソール（cp932 等）でも UTF-8 で出力できるようにする
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
# relink_table_permissions の関数を再利用（ロジック重複を避ける）
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parents[3]))  # auth_helper.py 探索用（リポジトルート）

try:
    from dotenv import load_dotenv

    load_dotenv(SCRIPT_DIR.parents[3] / ".env")
except ImportError:
    pass

import relink_table_permissions as relink  # noqa: E402

PORTAL_DIR = Path(
    os.environ.get("PORTAL_DIR", str(SCRIPT_DIR.parents[3] / "portal"))
).resolve()

skip_build = "--skip-build" in sys.argv
skip_upload = "--skip-upload" in sys.argv
skip_relink = "--skip-relink" in sys.argv
skip_restart = "--skip-restart" in sys.argv

for i, arg in enumerate(sys.argv):
    if arg == "--portal-dir" and i + 1 < len(sys.argv):
        PORTAL_DIR = Path(sys.argv[i + 1]).resolve()


def run(cmd: list, cwd: Path):
    """サブプロセスを実行し、失敗したら終了する。"""
    print(f"  $ {' '.join(cmd)}  (cwd={cwd})")
    result = subprocess.run(cmd, cwd=str(cwd), shell=(os.name == "nt"))
    if result.returncode != 0:
        print(f"[FAIL] コマンド失敗 (exit={result.returncode}): {' '.join(cmd)}")
        sys.exit(result.returncode)


def main():
    print("=== Power Pages 統合デプロイ ===\n")

    if not PORTAL_DIR.is_dir():
        print(f"[FAIL] ポータルディレクトリが見つかりません: {PORTAL_DIR}")
        sys.exit(1)

    # [1] ビルド
    if not skip_build:
        print("[1/5] ビルド (npm run build)...")
        run(["npm", "run", "build"], PORTAL_DIR)
    else:
        print("[1/5] ビルド: スキップ")
    print()

    # [2] アップロード
    if not skip_upload:
        print("[2/5] アップロード (pac pages upload-code-site)...")
        run(
            ["pac", "pages", "upload-code-site", "--rootPath", ".",
             "--compiledPath", "./dist"],
            PORTAL_DIR,
        )
    else:
        print("[2/5] アップロード: スキップ")
    print()

    # [3-5] ロール再付与 + 検証 + 再起動（relink_table_permissions を再利用）
    if skip_relink:
        print("[3-5/5] ロール再付与・検証・再起動: スキップ（--skip-relink）")
        print("  ⚠️ upload-code-site でテーブル権限のロールが消えている可能性があります。")
        return

    headers = relink.get_headers()

    print("[3/5] サイト ID / Web ロールを取得し、テーブル権限を再付与...")
    site_id = relink.get_site_id(headers)
    role_ids = relink.get_webrole_ids(site_id, headers)
    fixed = relink.relink_all(site_id, role_ids, headers)
    print(f"  → {fixed} 件を修復\n")

    print("[4/5] content webrole + N:N association を検証...")
    verified = relink.verify_all(site_id, role_ids, headers)
    print()

    print("[5/5] ポータルを再起動...")
    if skip_restart:
        print("  スキップ（--skip-restart）— 手動で再起動してください。")
    else:
        relink.restart_site()

    if not verified:
        print("\n[FAIL] 検証: 欠落しているロールがあります。content/association を確認してください。")
        sys.exit(1)
    print("\n[OK] デプロイ完了! 再起動後 60-90秒でアクセス可能。")


if __name__ == "__main__":
    main()
