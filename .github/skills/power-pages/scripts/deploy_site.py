"""Power Pages コードサイト デプロイスクリプト.

以下を順番に実行する:
1. 前提チェック（check_prerequisites.py 呼び出し）
2. pac pages upload-code-site でサイトアップロード
3. pac pages provision-website でプロビジョニング（初回のみ、任意）

環境変数:
- POWERPAGES_SITE_PATH: サイトディレクトリ（デフォルト: .）
- DATAVERSE_URL: Dataverse 環境 URL（ログ用）
- POWERPAGES_WEBSITE_NAME: プロビジョニング時のサイト名（省略時はプロビジョニングをスキップ）
- POWERPAGES_SKIP_PRECHECK: "1" で前提チェックをスキップ
"""

import logging
import os
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# ログ設定
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

SITE_PATH = os.environ.get("POWERPAGES_SITE_PATH", ".")
DATAVERSE_URL = os.environ.get("DATAVERSE_URL", "")
WEBSITE_NAME = os.environ.get("POWERPAGES_WEBSITE_NAME", "")
SKIP_PRECHECK = os.environ.get("POWERPAGES_SKIP_PRECHECK", "") == "1"

# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------


def run_command(
    cmd: list[str],
    description: str,
    check: bool = True,
) -> subprocess.CompletedProcess:
    """サブプロセスを実行し、エラー時は詳細ログを出力する."""
    logger.info(f"実行: {description}")
    logger.info(f"  コマンド: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError as e:
        logger.error(f"コマンドが見つかりません: {cmd[0]}")
        logger.error(f"  詳細: {e}")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        logger.error(f"タイムアウト（300秒）: {description}")
        sys.exit(1)

    if result.stdout.strip():
        for line in result.stdout.strip().split("\n"):
            logger.info(f"  [stdout] {line}")

    if result.returncode != 0:
        logger.error(f"失敗: {description} (exit code: {result.returncode})")
        if result.stderr.strip():
            for line in result.stderr.strip().split("\n"):
                logger.error(f"  [stderr] {line}")
        if check:
            sys.exit(result.returncode)

    return result


# ---------------------------------------------------------------------------
# デプロイステップ
# ---------------------------------------------------------------------------


def step_precheck() -> None:
    """前提チェックを実行."""
    if SKIP_PRECHECK:
        logger.info("前提チェックをスキップ（POWERPAGES_SKIP_PRECHECK=1）")
        return

    script_dir = Path(__file__).parent
    check_script = script_dir / "check_prerequisites.py"

    if not check_script.exists():
        logger.warning(f"前提チェックスクリプトが見つかりません: {check_script}")
        logger.warning("前提チェックをスキップします")
        return

    result = run_command(
        [sys.executable, str(check_script)],
        "前提チェック",
        check=False,
    )

    if result.returncode != 0:
        logger.error("前提チェックに失敗しました。上記のアクションを実行してください。")
        sys.exit(1)


def step_upload() -> None:
    """pac pages upload-code-site を実行."""
    site_path = Path(SITE_PATH).resolve()

    # .powerpages-site の存在を再確認
    marker = site_path / ".powerpages-site"
    if not marker.exists():
        logger.error(f".powerpages-site が見つかりません: {marker}")
        logger.error("サイトディレクトリを確認してください。")
        sys.exit(1)

    logger.info(f"サイトパス: {site_path}")
    if DATAVERSE_URL:
        logger.info(f"Dataverse URL: {DATAVERSE_URL}")

    run_command(
        ["pac", "pages", "upload-code-site", "--path", str(site_path)],
        "コードサイトのアップロード",
    )

    logger.info("✅ サイトのアップロードが完了しました")


def step_provision() -> None:
    """pac pages provision-website を実行（POWERPAGES_WEBSITE_NAME 指定時のみ）."""
    if not WEBSITE_NAME:
        logger.info("POWERPAGES_WEBSITE_NAME 未設定のため、プロビジョニングをスキップ")
        logger.info("（既存サイトの更新のみ実行されました）")
        return

    run_command(
        ["pac", "pages", "provision-website", "--name", WEBSITE_NAME],
        f"Web サイトのプロビジョニング: {WEBSITE_NAME}",
    )

    logger.info(f"✅ Web サイト '{WEBSITE_NAME}' のプロビジョニングが完了しました")


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------


def main() -> int:
    """デプロイを実行する."""
    logger.info("=" * 60)
    logger.info("Power Pages コードサイト デプロイ")
    logger.info("=" * 60)

    # Step 1: 前提チェック
    step_precheck()

    # Step 2: アップロード
    step_upload()

    # Step 3: プロビジョニング（任意）
    step_provision()

    logger.info("")
    logger.info("=" * 60)
    logger.info("🎉 デプロイ完了")
    logger.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
