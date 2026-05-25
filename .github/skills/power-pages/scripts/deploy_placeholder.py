"""
Power Pages プレースホルダーSPA の即時デプロイスクリプト

開発フローの最初（Phase 0.5）に実行し、Power Pages のプロビジョニングを即座に開始する。
プロビジョニング完了後にプレースホルダーをデプロイし、サイトインフラを確保する。
本番 SPA の開発が完了したら pac pages upload-code-site で上書きする。

Usage:
    python deploy_placeholder.py                  # テンプレートデプロイ
    python deploy_placeholder.py --create-site    # サイト作成 + テンプレートデプロイ
    python deploy_placeholder.py --site-name X    # サイト名を指定

前提:
- pac auth create --environment {ENV_ID} 済み
- .env に DATAVERSE_URL, ENV_ID 設定済み
"""
import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "template"
SCRIPT_DIR = Path(__file__).parent


def check_pac():
    """pac CLI の存在確認."""
    r = subprocess.run(["pac", "--version"], capture_output=True, text=True)
    if r.returncode != 0:
        logger.error("pac CLI が見つかりません。npm install -g @microsoft/power-apps-cli")
        sys.exit(1)
    logger.info(f"pac CLI: {r.stdout.strip()}")


def create_site_if_needed(site_name: str, subdomain: str) -> None:
    """Power Platform API でサイトを作成（未存在時）."""
    from auth_helper import get_token
    from dotenv import load_dotenv
    load_dotenv()
    import requests

    env_id = os.environ.get("ENV_ID")
    if not env_id:
        logger.error("ENV_ID が .env に設定されていません")
        sys.exit(1)

    token = get_token(scope="https://api.powerplatform.com/.default")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    base = f"https://api.powerplatform.com/powerpages/environments/{env_id}/websites"

    # 既存サイト確認
    r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
    r.raise_for_status()
    sites = r.json().get("value", [])

    for s in sites:
        if s.get("name") == site_name or s.get("subdomain") == subdomain:
            logger.info(f"サイト '{site_name}' は既に存在します (status: {s.get('status')})")
            return

    # Organization ID 取得
    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    dv_token = get_token()
    dv_headers = {"Authorization": f"Bearer {dv_token}", "Accept": "application/json"}
    org_r = requests.get(f"{dv_url}/api/data/v9.2/organizations?$select=organizationid", headers=dv_headers)
    org_r.raise_for_status()
    org_id = org_r.json()["value"][0]["organizationid"]

    # サイト作成
    body = {
        "dataverseOrganizationId": org_id,
        "name": site_name,
        "selectedBaseLanguage": 1041,
        "subdomain": subdomain,
        "templateName": "DefaultPortalTemplate",
    }
    logger.info(f"サイト作成中: {site_name} ({subdomain}.powerappsportals.com)")
    cr = requests.post(f"{base}?api-version=2024-10-01",
                       headers={**headers, "Content-Type": "application/json"}, json=body)
    if cr.status_code == 202:
        logger.info("✅ サイト作成リクエスト受理 (202)")
        logger.info("   プロビジョニングに 10〜20 分かかります。")
        logger.info(f"   確認: https://make.powerpages.microsoft.com/environments/{env_id}/portals/home")
    else:
        logger.error(f"サイト作成失敗: {cr.status_code} {cr.text}")
        sys.exit(1)


def wait_for_provisioning(site_name: str, timeout: int = 1200) -> bool:
    """プロビジョニング完了を待機（最大 timeout 秒）."""
    from auth_helper import get_token
    from dotenv import load_dotenv
    load_dotenv()
    import requests

    env_id = os.environ.get("ENV_ID")
    token = get_token(scope="https://api.powerplatform.com/.default")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    base = f"https://api.powerplatform.com/powerpages/environments/{env_id}/websites"

    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
        if r.status_code == 200:
            sites = r.json().get("value", [])
            for s in sites:
                if s.get("name") == site_name:
                    pkg_status = s.get("packageInstallStatus", "")
                    status = s.get("status", "")
                    logger.info(f"  状態: status={status}, package={pkg_status}")
                    if pkg_status in ("Installed", "Complete") or status == "Running":
                        return True
        time.sleep(30)
        logger.info("  プロビジョニング待機中...")

    logger.warning(f"タイムアウト ({timeout}秒)。手動確認してください。")
    return False


def deploy_template(site_name: str) -> None:
    """テンプレート SPA をデプロイ."""
    if not TEMPLATE_DIR.exists():
        logger.error(f"テンプレートが見つかりません: {TEMPLATE_DIR}")
        sys.exit(1)

    # 一時ディレクトリにテンプレートをコピー + .powerpages-site マーカー作成
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # テンプレートファイルをコピー
        shutil.copytree(TEMPLATE_DIR, tmp / "dist")

        # .powerpages-site マーカー作成
        (tmp / ".powerpages-site").touch()

        # アップロード
        cmd = ["pac", "pages", "upload-code-site",
               "--rootPath", str(tmp),
               "--compiledPath", str(tmp / "dist"),
               "--siteName", site_name]
        logger.info(f"テンプレートデプロイ: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.stdout:
            for line in result.stdout.strip().split("\n"):
                logger.info(f"  {line}")
        if result.returncode != 0:
            logger.error(f"デプロイ失敗 (exit {result.returncode})")
            if result.stderr:
                for line in result.stderr.strip().split("\n"):
                    logger.error(f"  {line}")
            sys.exit(1)

    logger.info("✅ プレースホルダー SPA のデプロイ完了")
    logger.info("   本番 SPA 完成後に pac pages upload-code-site で上書きしてください。")


def main():
    parser = argparse.ArgumentParser(description="Power Pages プレースホルダーデプロイ")
    parser.add_argument("--create-site", action="store_true", help="サイトが未作成の場合に新規作成")
    parser.add_argument("--site-name", default="", help="サイト名")
    parser.add_argument("--subdomain", default="", help="サブドメイン (create-site 時)")
    parser.add_argument("--wait", action="store_true", help="プロビジョニング完了まで待機")
    parser.add_argument("--timeout", type=int, default=1200, help="待機タイムアウト秒 (default: 1200)")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv()

    site_name = args.site_name or os.environ.get("POWERPAGES_WEBSITE_NAME", "")
    subdomain = args.subdomain or site_name.lower().replace(" ", "")

    if not site_name:
        logger.error("--site-name または .env POWERPAGES_WEBSITE_NAME を指定してください")
        sys.exit(1)

    check_pac()

    if args.create_site:
        create_site_if_needed(site_name, subdomain)
        if args.wait:
            logger.info("プロビジョニング完了待機中...")
            if not wait_for_provisioning(site_name, args.timeout):
                logger.warning("プロビジョニング未完了。手動確認後に再実行してください。")
                env_id = os.environ.get("ENV_ID", "")
                if env_id:
                    logger.info(f"確認: https://make.powerpages.microsoft.com/environments/{env_id}/portals/home")
                sys.exit(0)

    deploy_template(site_name)


if __name__ == "__main__":
    main()
