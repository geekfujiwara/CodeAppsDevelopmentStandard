"""Code Apps を採用する前に、環境側の前提条件が満たされているかを確認する。

architecture スキルが「Code Apps」を適切なソリューションとして提案したタイミング
（設計フェーズの早い段階、pac code init / pac code push の前）で実行し、以下 2 点を
BAP（Business Application Platform）管理者 API / Environment Management Settings API
で確認する。

  1. マネージド環境が有効化されているか（governanceConfiguration.protectionLevel）
  2. 環境で Code Apps が許可されているか（コード アプリを許可する）

未有効のまま Code Apps の実装・デプロイを進めると、後工程で
CodeAppOperationNotAllowedInEnvironment (403) 等のエラーで手戻りになるため、
設計提案の直後にまとめて確認する。

使い方:
  python .github/skills/code-apps/scripts/check_code_apps_environment.py

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

PP_API_SCOPE = "https://api.powerplatform.com/.default"
ENV_SETTINGS_URL_TMPL = (
    "https://api.powerplatform.com/environmentmanagement/environments/"
    "{env_id}/settings?api-version=2022-03-01-preview"
)

# Environment Management Settings API のキー名は Microsoft 側で変更されうるため、
# 大文字小文字を問わず "codeapp" を含むキーを探索する（未確定の場合は手動確認に倒す）。
CODE_APP_KEY_HINT = "codeapp"


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


def check_managed_environment(env: dict) -> bool:
    """マネージド環境（protectionLevel != Basic）かどうかを判定する。"""
    props = env.get("properties", {}) or {}
    governance = props.get("governanceConfiguration") or {}
    protection_level = governance.get("protectionLevel")
    env_name = props.get("displayName") or env.get("name")

    if protection_level and protection_level != "Basic":
        print(f"✅ マネージド環境が有効です（環境: {env_name}, protectionLevel: {protection_level}）。")
        return True

    print(f"❌ マネージド環境が有効化されていません（環境: {env_name}）。")
    print("   有効化手順:")
    print("   1. Power Platform 管理センター (https://admin.powerplatform.microsoft.com) を開く")
    print("   2. 環境 > 該当環境を選択 > 設定 > マネージド環境 > 「有効にする」を ON")
    return False


def check_code_apps_enabled(env_id: str):
    """環境で Code Apps が許可されているかを確認する。

    Environment Management Settings API のキー名は未確定のため、
    "codeapp" を含むキーを探索する。判定できない場合は None（要手動確認）を返す。
    """
    tok = get_token(PP_API_SCOPE)
    url = ENV_SETTINGS_URL_TMPL.format(env_id=env_id)
    try:
        r = requests.get(url, headers={"Authorization": "Bearer " + tok}, timeout=60)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"⚠ Code Apps 許可設定の自動確認に失敗しました（{e}）。手動確認に切り替えます。")
        return None

    settings = r.json()
    if isinstance(settings, dict) and "value" in settings:
        settings = settings["value"][0] if settings["value"] else {}

    for key, value in (settings or {}).items():
        if CODE_APP_KEY_HINT in key.lower():
            if value:
                print(f"✅ 環境で Code Apps が許可されています（{key} = {value}）。")
                return True
            print(f"❌ 環境で Code Apps が許可されていません（{key} = {value}）。")
            return False

    print("⚠ Code Apps 許可設定を API から自動判定できませんでした。手動で確認してください。")
    return None


def main() -> int:
    if not DATAVERSE_URL:
        print("❌ Error: .env に DATAVERSE_URL が設定されていません。", file=sys.stderr)
        return 2

    env = find_environment()
    env_id = env.get("name", "")

    managed_ok = check_managed_environment(env)
    code_apps_result = check_code_apps_enabled(env_id)

    print()
    if code_apps_result is None:
        print("   Code Apps 許可設定は手動で確認してください:")
        print("   1. Power Platform 管理センター > 環境 > 該当環境 > 設定")
        print("   2. 製品 > 機能 > 「コード アプリを許可する」→ オン")

    if managed_ok and code_apps_result is not False:
        print("✅ Code Apps を採用する前提条件を満たしています（要手動確認項目がある場合は上記参照）。")
        return 0

    print("❌ Code Apps の前提条件が未整備です。上記の手順で有効化してから設計・実装を進めてください。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
