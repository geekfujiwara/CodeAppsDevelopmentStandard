"""環境のマネージド環境設定（governanceConfiguration）を変更する。

マネージド環境の有効化 / 無効化と、共有制限・ソリューション チェッカーなどの
拡張設定を BAP 管理 API で更新する。既定は dry-run で、`--apply` を付けたときだけ書き込む。

```powershell
python .github/skills/admin/scripts/set_managed_environment.py `
  --environment-id $env:ENV_ID `
  --enable --limit-sharing-mode excludeSharingToSecurityGroups --solution-checker-mode warn
```

必要なロール: Power Platform Administrator または対象環境の Environment Admin。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import BAP_BASE, BAP_SCOPE, _request  # noqa: E402

API_VERSION = "2021-04-01"
SHARING_MODES = ("noLimit", "excludeSharingToSecurityGroups")
SOLUTION_CHECKER_MODES = ("none", "warn", "block")


def _url(environment_id: str) -> str:
    return (
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/"
        f"{environment_id}?api-version={API_VERSION}"
    )


def _current(environment_id: str) -> dict:
    env = _request("GET", _url(environment_id), BAP_SCOPE)
    return env.get("properties", {}).get("governanceConfiguration", {}) or {}


def _print(label: str, config: dict) -> None:
    extended = (config.get("settings", {}) or {}).get("extendedSettings", {}) or {}
    print(f"{label}: protectionLevel={config.get('protectionLevel', 'Basic')}")
    for key in ("limitSharingMode", "maxLimitUserSharing", "solutionCheckerMode", "isGroupSharingDisabled"):
        if key in extended:
            print(f"  {key} = {extended[key]}")


def _build(current: dict, args: argparse.Namespace) -> dict:
    """既存の拡張設定を保持したまま、指定された項目だけを差し替える。"""
    config = json.loads(json.dumps(current))  # 入力を破壊しない
    if args.enable:
        config["protectionLevel"] = "Standard"
    elif args.disable:
        config["protectionLevel"] = "Basic"

    extended = dict((config.get("settings", {}) or {}).get("extendedSettings", {}) or {})
    if args.limit_sharing_mode:
        extended["limitSharingMode"] = args.limit_sharing_mode
    if args.max_limit_user_sharing is not None:
        extended["maxLimitUserSharing"] = str(args.max_limit_user_sharing)
    if args.solution_checker_mode:
        extended["solutionCheckerMode"] = args.solution_checker_mode
    if extended:
        config.setdefault("settings", {})["extendedSettings"] = extended
    return config


def main() -> int:
    parser = argparse.ArgumentParser(description="マネージド環境設定の変更（既定は dry-run）")
    parser.add_argument("--environment-id", default=os.getenv("ENV_ID") or os.getenv("POWER_PLATFORM_ENVIRONMENT_ID"))
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--enable", action="store_true", help="マネージド環境を有効化する")
    group.add_argument("--disable", action="store_true", help="マネージド環境を無効化する")
    parser.add_argument("--limit-sharing-mode", choices=SHARING_MODES)
    parser.add_argument("--max-limit-user-sharing", type=int, help="共有できるユーザー数の上限（-1 で無制限）")
    parser.add_argument("--solution-checker-mode", choices=SOLUTION_CHECKER_MODES)
    parser.add_argument("--apply", action="store_true", help="実際に適用する（省略時は表示のみ）")
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id か .env の ENV_ID が必要です")
    if args.max_limit_user_sharing is not None and args.limit_sharing_mode != "excludeSharingToSecurityGroups":
        parser.error("--max-limit-user-sharing は --limit-sharing-mode excludeSharingToSecurityGroups と併用してください")

    current = _current(args.environment_id)
    _print("現在", current)
    desired = _build(current, args)
    print()
    _print("変更後", desired)

    if desired == current:
        print("\n変更はありません。")
        return 0
    if not args.apply:
        print("\ndry-run です。適用するには --apply を付けて再実行してください。")
        return 0

    _request("PATCH", _url(args.environment_id), BAP_SCOPE, {"properties": {"governanceConfiguration": desired}})
    print()
    _print("適用後", _current(args.environment_id))
    print("\n反映まで数分かかることがあります。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
