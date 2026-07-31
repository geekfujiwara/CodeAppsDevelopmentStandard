"""Code Apps のデプロイ前提条件（マネージド環境 / Code Apps 許可）を確認する。

`pac code push` は環境が下記 2 条件を満たしていないと
`CodeAppOperationNotAllowedInEnvironment` (403) で失敗する。
実装に入る前に本スクリプトで確認する。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

_SCRIPT_DIR = Path(__file__).resolve().parent
_CANDIDATES = [
    _SCRIPT_DIR.parent.parent / "standard" / "scripts",
    *[p / ".github" / "skills" / "standard" / "scripts" for p in _SCRIPT_DIR.parents],
    *[p / "scripts" for p in _SCRIPT_DIR.parents],
    *_SCRIPT_DIR.parents,
]
for _c in _CANDIDATES:
    if (_c / "auth_helper.py").is_file():
        sys.path.insert(0, str(_c))
        break
else:
    sys.exit("auth_helper.py が見つかりません（standard スキルの scripts フォルダを確認）")

for _p in _SCRIPT_DIR.parents:
    if (_p / ".env").is_file():
        load_dotenv(_p / ".env")
        break

import auth_helper  # noqa: E402

PP_API = "https://api.powerplatform.com"
PP_SCOPE = "https://api.powerplatform.com/.default"
API_VERSION = "2022-03-01-preview"


def _get(path: str) -> requests.Response:
    token = auth_helper.get_token(scope=PP_SCOPE)
    return requests.get(
        f"{PP_API}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params={"api-version": API_VERSION},
        timeout=60,
    )


def check_managed(env_id: str) -> tuple[bool | None, str]:
    resp = _get(f"/environmentmanagement/environments/{env_id}")
    if resp.status_code == 403:
        return None, "権限不足のため確認できません（Power Platform 管理者ロールが必要）"
    resp.raise_for_status()
    body = resp.json()
    level = body.get("protectionLevel")
    return level == "Standard", f"protectionLevel={level}"


def check_code_apps(env_id: str) -> tuple[bool | None, str]:
    resp = _get(f"/environmentmanagement/environments/{env_id}/settings")
    if resp.status_code in (403, 404):
        return None, f"API から取得できません（HTTP {resp.status_code}）"
    resp.raise_for_status()
    settings = resp.json()
    for key, value in settings.items():
        if "codeapp" in key.lower():
            return bool(value), f"{key}={value}"
    return None, "設定値が API に存在しません"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--environment-id",
        help="環境 ID。省略時は DATAVERSE_URL から逆引きする",
    )
    args = parser.parse_args()

    if not os.getenv("DATAVERSE_URL") and not args.environment_id:
        sys.exit("DATAVERSE_URL が .env に設定されていません（または --environment-id を指定）")

    env_id = args.environment_id or auth_helper.resolve_environment_id()
    admin_url = f"https://admin.powerplatform.microsoft.com/environments/environment/{env_id}/hub"

    print(f"環境 ID: {env_id}\n")

    managed, managed_detail = check_managed(env_id)
    code_apps, code_apps_detail = check_code_apps(env_id)

    icon = {True: "✅", False: "❌", None: "⚠️"}
    print(f"{icon[managed]} マネージド環境        : {managed_detail}")
    print(f"{icon[code_apps]} Code Apps 許可        : {code_apps_detail}")

    if managed and code_apps:
        print("\n前提条件を満たしています。そのまま設計・実装へ進めます。")
        return 0

    print("\n有効化手順（Power Platform 管理センター）:")
    print(f"  {admin_url}")
    if managed is not True:
        print("  - [設定] → [監査とログ] 上部の [マネージド環境] を [有効] にする")
    if code_apps is not True:
        print("  - [設定] → [製品] → [機能] → [Power Apps コード アプリ] を [オン] にする")
    print("\n有効化後にもう一度本スクリプトを実行して確認してください。")
    if managed is None or code_apps is None:
        print("⚠️ は API で判定できなかった項目です。管理センターで目視確認してください。")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
