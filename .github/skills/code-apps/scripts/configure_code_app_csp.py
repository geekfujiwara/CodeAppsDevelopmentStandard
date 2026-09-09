"""Code Apps のコンテンツ セキュリティ ポリシー（CSP）を Power Platform API で確認・設定する。

管理センターの「環境 > 設定 > プライバシー + セキュリティ > コンテンツ セキュリティ ポリシー > アプリ」に相当する。
Dataverse の組織設定（`iscontentsecuritypolicyenabled` 等 = モデル駆動/キャンバス用）とは**別物**なので、
`pac env list-settings` で確認しても Code Apps の CSP は出てこない。

使い方:
    # 現状確認（dry-run）
    python .github/skills/code-apps/scripts/configure_code_app_csp.py

    # デプロイ前チェック: 必要なオリジンが無ければ終了コード 1（CI / pre-deploy 用）
    python .github/skills/code-apps/scripts/configure_code_app_csp.py \
        --directive Frame-Src --source https://www.google.com --source https://maps.google.com --assert

    # 実際に追加する
    python .github/skills/code-apps/scripts/configure_code_app_csp.py \
        --directive Frame-Src --source https://www.google.com --source https://maps.google.com --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
load_dotenv(ROOT / ".env")

from auth_helper import get_token  # noqa: E402

API_BASE = "https://api.powerplatform.com"
API_VERSION = "2022-03-01-preview"
SETTINGS = ["PowerApps_CSPReportingEndpoint", "PowerApps_CSPEnabledCodeApps", "PowerApps_CSPConfigCodeApps"]
# 既定の Azure CLI 互換クライアントには EnvironmentManagement.Settings.* の委任アクセス許可が無く 403 になる。
# キャッシュ済みトークンで先に試し、403 のときだけ Power Platform CLI のパブリック クライアントへ切り替える。
PAC_CLIENT_ID = "9cee029c-6210-4654-90bb-17e6e9d36617"
_client_ids: list[str | None] = [None, PAC_CLIENT_ID]


def _url(environment_id: str) -> str:
    return f"{API_BASE}/environmentmanagement/environments/{environment_id}/settings?api-version={API_VERSION}"


def _headers(client_id: str | None) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_token(scope=f'{API_BASE}/.default', client_id=client_id)}",
        "Content-Type": "application/json",
    }


def _send(method: str, url: str, **kwargs) -> requests.Response:
    """権限のあるクライアントが見つかるまで client_id を切り替えて要求する。"""
    last: requests.Response | None = None
    for client_id in list(_client_ids):
        res = requests.request(method, url, headers=_headers(client_id), timeout=120, **kwargs)
        if res.status_code != 403:
            _client_ids[:] = [client_id]  # 以降は成功したクライアントに固定して再認証を避ける
            res.raise_for_status()
            return res
        last = res
        if client_id is None:
            print("  既定クライアントは権限不足のため PAC CLI クライアントで再試行します", file=sys.stderr)
    assert last is not None
    last.raise_for_status()
    return last


def get_settings(environment_id: str) -> dict:
    res = _send("GET", f"{_url(environment_id)}&$select={','.join(SETTINGS)}")
    return res.json().get("objectResult", [{}])[0]


def parse_directives(raw: str | None) -> dict[str, list[str]]:
    if not raw:
        return {}
    parsed = json.loads(raw)
    return {name: [s["source"] for s in body.get("sources", [])] for name, body in parsed.items()}


def patch_directives(environment_id: str, directives: dict[str, list[str]]) -> None:
    config = {name: {"sources": [{"source": s} for s in sources]} for name, sources in directives.items()}
    body = {"PowerApps_CSPConfigCodeApps": json.dumps(config, separators=(",", ":"))}
    _send("PATCH", _url(environment_id), json=body)


def main() -> int:
    parser = argparse.ArgumentParser(description="Code Apps の CSP を確認・設定する")
    parser.add_argument("--environment-id", default=os.getenv("ENV_ID", "") or os.getenv("ENVIRONMENT_ID", ""))
    parser.add_argument("--directive", default="Frame-Src", help="対象ディレクティブ（例: Frame-Src / Connect-Src）")
    parser.add_argument("--source", action="append", default=[], help="追加するオリジン（複数可）")
    parser.add_argument("--assert", dest="assert_only", action="store_true",
                        help="不足があれば終了コード 1（変更しない・デプロイ前チェック用）")
    parser.add_argument("--apply", action="store_true", help="実際に適用する（既定は dry-run）")
    args = parser.parse_args()

    if not args.environment_id:
        print("ENV_ID が未設定です（.env か --environment-id で指定してください）")
        return 1

    current = get_settings(args.environment_id)
    directives = parse_directives(current.get("PowerApps_CSPConfigCodeApps"))
    print(f"環境: {args.environment_id}")
    print(f"  CSP 強制: {current.get('PowerApps_CSPEnabledCodeApps')}")
    print(f"  レポート先: {current.get('PowerApps_CSPReportingEndpoint') or '(なし)'}")
    print(f"  カスタム ディレクティブ: {json.dumps(directives, ensure_ascii=False) if directives else '(なし・既定値のみ)'}")

    if not args.source:
        return 0

    existing = directives.get(args.directive, [])
    missing = [origin for origin in args.source if origin not in existing]
    if not missing:
        print(f"  ✅ {args.directive}: 要求されたオリジンはすべて設定済み")
        return 0

    print(f"  ⚠️ {args.directive} に不足: {missing}")
    if args.assert_only:
        print("     CSP 未設定のままデプロイすると該当リソースは無言でブロックされます（--apply で追加）")
        return 1

    # PATCH はディレクティブ コレクション全体を置換するため、必ず現在値とマージする。
    merged = dict(directives)
    merged[args.directive] = [*existing, *missing]
    print(f"\n変更内容: {args.directive} = {merged[args.directive]}")
    if not args.apply:
        print("dry-run です。適用するには --apply を付けてください。")
        return 0

    patch_directives(args.environment_id, merged)
    after = parse_directives(get_settings(args.environment_id).get("PowerApps_CSPConfigCodeApps"))
    if any(origin not in after.get(args.directive, []) for origin in args.source):
        print(f"  ❌ 適用後の検証に失敗しました: {after.get(args.directive)}")
        return 1
    print("適用しました。反映まで数分かかる場合があります。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
