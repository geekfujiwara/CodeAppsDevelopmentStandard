"""全環境の Dataverse 検索（リレーショナル 検索）を有効化する。

環境グループのルールには Dataverse 検索の項目が無いため、環境ごとの Dataverse 組織設定
`organizations.isexternalsearchindexenabled` を直接更新する。

使い方:
    python enable_dataverse_search.py                # dry-run（現状を一覧表示）
    python enable_dataverse_search.py --apply
    python enable_dataverse_search.py --environment-id <ID> --apply
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402

BAP_BASE = "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
_TIMEOUT = 180


def _get(url: str, scope: str) -> dict:
    for attempt in range(4):
        try:
            response = requests.get(url, headers={"Authorization": f"Bearer {get_token(scope=scope)}"}, timeout=_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.SSLError:
            if attempt == 3:
                raise
            time.sleep(3)
    return {}


def dataverse_environments(environment_id: str | None) -> list[dict]:
    data = _get(f"{BAP_BASE}/environments?api-version=2021-04-01&$expand=properties", BAP_SCOPE)
    results = []
    for environment in data.get("value", []):
        if environment_id and environment.get("name") != environment_id:
            continue
        properties = environment.get("properties", {})
        instance = properties.get("linkedEnvironmentMetadata") or {}
        url = instance.get("instanceApiUrl") or instance.get("instanceUrl")
        if not url:
            continue
        results.append(
            {
                "id": environment.get("name"),
                "displayName": properties.get("displayName"),
                "url": url.rstrip("/"),
            }
        )
    return results


def organization(url: str) -> dict | None:
    token = get_token(scope=f"{url}/.default")
    response = requests.get(
        f"{url}/api/data/v9.2/organizations?$select=organizationid,name,isexternalsearchindexenabled",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=_TIMEOUT,
    )
    if response.status_code >= 300:
        return {"error": f"HTTP {response.status_code} {response.text[:150]}"}
    values = response.json().get("value") or []
    return values[0] if values else None


def enable_search(url: str, organization_id: str) -> None:
    token = get_token(scope=f"{url}/.default")
    response = requests.patch(
        f"{url}/api/data/v9.2/organizations({organization_id})",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        json={"isexternalsearchindexenabled": True},
        timeout=_TIMEOUT,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Dataverse 検索を全環境で有効化する")
    parser.add_argument("--environment-id", help="対象を 1 環境に絞る")
    parser.add_argument("--apply", action="store_true", help="実際に有効化する（既定は dry-run）")
    args = parser.parse_args()

    environments = dataverse_environments(args.environment_id)
    if not environments:
        print("Dataverse を持つ環境が見つかりませんでした。")
        return 0

    print(f"Dataverse を持つ環境: {len(environments)} 件\n")
    targets = []
    for environment in environments:
        org = organization(environment["url"])
        if not org:
            print(f"  - {environment['displayName']}: 組織情報を取得できません")
            continue
        if org.get("error"):
            print(f"  - {environment['displayName']}: {org['error']}")
            continue
        enabled = org.get("isexternalsearchindexenabled")
        print(f"  - {environment['displayName']}: Dataverse 検索 = {'有効' if enabled else '無効'}")
        if not enabled:
            targets.append((environment, org))

    if not targets:
        print("\nすべての環境で有効です。")
        return 0

    print(f"\n有効化する環境: {len(targets)} 件")
    if not args.apply:
        print("適用するには --apply を付けてください。")
        return 0

    for environment, org in targets:
        try:
            enable_search(environment["url"], org["organizationid"])
            print(f"  有効化: {environment['displayName']}")
        except Exception as error:  # noqa: BLE001
            print(f"  失敗: {environment['displayName']} - {error}")
    print("\nインデックス作成が完了するまで数時間かかることがあります。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
