"""環境戦略のうち API で自動化できる部分を適用する。

- 不足している環境グループを作成する
- テナント設定をブループリントの推奨値に合わせる

既定は **dry-run**。実際に変更するときだけ `--apply` を付ける。
環境のグループ割り当て・グループのルール発行・ACP 専用モードの切り替えは公開 API が無いため、
管理センターでの手動作業として出力する。

使い方:
    python apply_environment_strategy.py                 # dry-run
    python apply_environment_strategy.py --groups-only --apply
    python apply_environment_strategy.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402

BAP_BASE = "https://api.bap.microsoft.com"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
PP_BASE = "https://api.powerplatform.com"
PP_SCOPE = "https://api.powerplatform.com/.default"
BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"
_TIMEOUT = 120


def _call(method: str, url: str, scope: str, body: dict | None = None) -> tuple[int, dict]:
    response = requests.request(
        method,
        url,
        headers={"Authorization": f"Bearer {get_token(scope=scope)}", "Content-Type": "application/json"},
        json=body,
        timeout=_TIMEOUT,
    )
    payload = {}
    if response.content:
        try:
            payload = response.json()
        except ValueError:
            payload = {"raw": response.text[:400]}
    return response.status_code, payload


def list_groups() -> list[dict]:
    _, data = _call("GET", f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01", PP_SCOPE)
    return data.get("value") or []


def create_group(display_name: str, description: str) -> tuple[int, dict]:
    return _call(
        "POST",
        f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01",
        PP_SCOPE,
        {"displayName": display_name, "description": description},
    )


def get_tenant_settings() -> dict:
    _, data = _call(
        "POST",
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2020-10-01",
        BAP_SCOPE,
        {},
    )
    return data


def save_tenant_settings(settings: dict) -> tuple[int, dict]:
    return _call(
        "POST",
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/saveTenantSettings?api-version=2020-10-01",
        BAP_SCOPE,
        settings,
    )


def _read(settings: dict, path: str):
    current = settings
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _write(settings: dict, path: str, value) -> None:
    parts = path.split(".")
    current = settings
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def apply_groups(blueprint: dict, apply: bool) -> int:
    existing = {group.get("displayName") for group in list_groups()}
    missing = [group for group in blueprint["groups"] if group["name"] not in existing]

    print("=== 環境グループ ===")
    if not missing:
        print("  推奨グループはすべて存在します。")
        return 0

    failures = 0
    for group in missing:
        if not apply:
            print(f"  [dry-run] 作成予定: {group['name']}")
            continue
        status, payload = create_group(group["name"], group["purpose"])
        if status < 300:
            print(f"  [作成] {group['name']} (id={payload.get('id')})")
        else:
            failures += 1
            print(f"  [失敗] {group['name']}: HTTP {status} {json.dumps(payload, ensure_ascii=False)[:200]}")
    return failures


def apply_tenant_settings(blueprint: dict, apply: bool) -> int:
    settings = get_tenant_settings()
    if not settings:
        print("=== テナント設定 ===\n  取得に失敗しました。")
        return 1

    changes = []
    for path, spec in blueprint["tenantSettings"].items():
        if "expected" not in spec:
            continue
        actual = _read(settings, path)
        if actual != spec["expected"]:
            changes.append((path, spec, actual))

    print("\n=== テナント設定 ===")
    if not changes:
        print("  推奨値との差分はありません。")
        return 0

    for path, spec, actual in changes:
        prefix = "[変更]" if apply else "[dry-run]"
        print(f"  {prefix} {spec['label']}: {actual} -> {spec['expected']}")
        print(f"           理由: {spec['why']}")
        if apply:
            _write(settings, path, spec["expected"])

    if not apply:
        return 0

    settings.pop("@odata.context", None)
    status, payload = save_tenant_settings(settings)
    if status < 300:
        print("  テナント設定を保存しました。")
        return 0
    print(f"  [失敗] テナント設定の保存: HTTP {status} {json.dumps(payload, ensure_ascii=False)[:300]}")
    return 1


def print_manual_steps(blueprint: dict) -> None:
    print("\n=== 管理センターでの手動作業（公開 API なし）===")
    print("  1. 環境をグループへ追加する（マネージド環境のみ選択可）")
    print("     管理センター > 管理 > 環境グループ > 対象グループ > 環境の追加")
    print("  2. グループのルールを設定して「ルールの発行」を実行する")
    print("     共有上限 / メーカー ウェルカム コンテンツ / ソリューション チェッカー /")
    print("     使用状況分析 / バックアップ保持 / 生成 AI 設定")
    print(f"  3. コネクタ ポリシーを {blueprint['connectorPolicy']['mode']} に切り替える")
    print("     管理センター > セキュリティ > データとプライバシー")
    print(f"     {blueprint['connectorPolicy']['note']}")
    print("  4. Copilot クレジットを環境へ配分する")
    print("     管理センター > ライセンス > Copilot Credits")
    print("  5. 既定環境ルーティングの対象グループを個人開発者環境グループに設定する")
    print("     管理センター > 管理 > 環境グループ > 環境ルーティング")


def main() -> int:
    parser = argparse.ArgumentParser(description="環境戦略のうち API で自動化できる部分を適用する")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT, help="ブループリント JSON")
    parser.add_argument("--groups-only", action="store_true", help="環境グループの作成のみ行う")
    parser.add_argument("--tenant-settings-only", action="store_true", help="テナント設定のみ変更する")
    parser.add_argument("--apply", action="store_true", help="実際に変更する（既定は dry-run）")
    args = parser.parse_args()

    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    if not args.apply:
        print("[dry-run] 変更は行いません。適用するには --apply を付けてください。\n")

    failures = 0
    if not args.tenant_settings_only:
        failures += apply_groups(blueprint, args.apply)
    if not args.groups_only:
        failures += apply_tenant_settings(blueprint, args.apply)

    print_manual_steps(blueprint)
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
