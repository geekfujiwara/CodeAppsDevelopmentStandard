"""マネージド環境が有効化されているかを確認する。

pac code init / pac code push（コードアップのデプロイ）の前に実行し、
対象環境が Power Platform の「マネージド環境」として有効化されているかを
BAP（Business Application Platform）管理者 API で確認する。

Code Apps のデプロイにはマネージド環境の事前有効化が前提条件であり、
未有効のまま pac code init / pac code push を実行するとデプロイに失敗する。

使い方:
  python .github/skills/code-apps/scripts/check_managed_environment.py

.env に DATAVERSE_URL が設定されている必要がある（auth_helper 経由）。
"""
import os
import sys

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))
from auth_helper import DATAVERSE_URL, get_token  # noqa: E402

BAP_SCOPE = "https://api.bap.microsoft.com/.default"
BAP_ENVIRONMENTS_URL = (
    "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform"
    "/scopes/admin/environments?api-version=2021-04-01&$expand=properties"
)


def find_environment() -> dict:
    """DATAVERSE_URL の instanceUrl と一致する BAP 環境情報を取得する。"""
    tok = get_token(BAP_SCOPE)
    r = requests.get(BAP_ENVIRONMENTS_URL, headers={"Authorization": "Bearer " + tok}, timeout=60)
    r.raise_for_status()
    target = DATAVERSE_URL.rstrip("/").lower()
    for env in r.json().get("value", []):
        props = env.get("properties", {}) or {}
        meta = props.get("linkedEnvironmentMetadata", {}) or {}
        inst = (meta.get("instanceUrl") or "").rstrip("/").lower()
        if inst == target:
            return env
    print(
        f"❌ Error: DATAVERSE_URL ({DATAVERSE_URL}) に一致する環境が見つかりません。",
        file=sys.stderr,
    )
    sys.exit(2)


def main() -> int:
    if not DATAVERSE_URL:
        print("❌ Error: .env に DATAVERSE_URL が設定されていません。", file=sys.stderr)
        return 2

    env = find_environment()
    props = env.get("properties", {}) or {}
    governance = props.get("governanceConfiguration") or {}
    protection_level = governance.get("protectionLevel")
    env_name = props.get("displayName") or env.get("name")

    if protection_level and protection_level != "Basic":
        print(f"✅ マネージド環境が有効です（環境: {env_name}, protectionLevel: {protection_level}）。")
        print("   pac code init / pac code push を実行できます。")
        return 0

    print(f"❌ マネージド環境が有効化されていません（環境: {env_name}）。")
    print("   pac code init / pac code push の前に、以下の手順で有効化してください:")
    print("   1. Power Platform 管理センター (https://admin.powerplatform.microsoft.com) を開く")
    print("   2. 環境 > 該当環境を選択 > 設定 > マネージド環境 > 「有効にする」を ON")
    print("   3. 有効化後、本スクリプトを再実行して確認する")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
