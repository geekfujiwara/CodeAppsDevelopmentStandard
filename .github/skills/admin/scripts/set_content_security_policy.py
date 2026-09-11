"""環境のコンテンツ セキュリティ ポリシー（CSP）を Dataverse Web API で設定する。

管理センターの「環境 > 設定 > プライバシー + セキュリティ > コンテンツ セキュリティ ポリシー」に相当する。
「App（モデル駆動）」タブの設定が Code Apps にも適用される。

注意:
- この設定は既定で無効（iscontentsecuritypolicyenabled=False）。無効の間は
  モデル駆動型アプリ / Generative Pages に CSP ヘッダーが付かず、iframe 埋め込みは制限されない。
- Code Apps はこれとは別に `frame-src 'self'` が常時強制される。
- Frame-Src 等のディレクティブは Strict CSP（--strict）を有効にした場合のみ効く。
  有効化は環境全体に影響するため、単一の iframe を許可する目的で有効化しないこと。

使い方:
    python set_content_security_policy.py --environment-url <ENV_URL>          # 現状確認
    python set_content_security_policy.py --environment-url ... --enable --apply                  # 強制を有効化
    python set_content_security_policy.py --environment-url ... --enable --strict \
        --directive "Frame-Ancestor=https://*.powerapps.com,'self'" \
        --directive "Script-Src='self'" --apply
    python set_content_security_policy.py --environment-url ... --report-uri https://... --apply  # レポートのみ
    python set_content_security_policy.py --environment-url ... --disable --apply
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402

_TIMEOUT = 120

# 管理センターの「Configure directives」に並ぶディレクティブ。
# Frame-Ancestor は既定モードでも設定でき、それ以外は Strict CSP を有効にした場合のみ有効。
DIRECTIVES = [
    "Frame-Ancestor",
    "Script-Src",
    "Img-Src",
    "Style-Src",
    "Font-Src",
    "Connect-Src",
    "Frame-Src",
    "Form-Action",
]

# contentsecuritypolicyoptions のビット
OPTION_STRICT_CSP = 1

FIELDS = [
    "iscontentsecuritypolicyenabled",
    "contentsecuritypolicyconfiguration",
    "contentsecuritypolicyoptions",
    "contentsecuritypolicyreporturi",
    "iscontentsecuritypolicyenabledforcanvas",
    "contentsecuritypolicyconfigurationforcanvas",
]


def _headers(environment_url: str) -> dict:
    return {
        "Authorization": f"Bearer {get_token(scope=f'{environment_url}/.default')}",
        "Content-Type": "application/json; charset=utf-8",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def _request(method: str, url: str, headers: dict, body: dict | None = None) -> requests.Response:
    for attempt in range(4):
        try:
            return requests.request(method, url, headers=headers, json=body, timeout=_TIMEOUT)
        except requests.exceptions.RequestException:
            if attempt == 3:
                raise
            time.sleep(3)
    raise RuntimeError("unreachable")


def organization_id(environment_url: str, headers: dict) -> str:
    response = _request("GET", f"{environment_url}/api/data/v9.2/organizations?$select=organizationid", headers)
    response.raise_for_status()
    return response.json()["value"][0]["organizationid"]


def get_settings(environment_url: str, headers: dict, org_id: str) -> dict:
    url = f"{environment_url}/api/data/v9.2/organizations({org_id})?$select={','.join(FIELDS)}"
    response = _request("GET", url, headers)
    response.raise_for_status()
    return {key: value for key, value in response.json().items() if not key.startswith("@")}


def parse_directive(text: str) -> tuple[str, list[str]]:
    """`Frame-Ancestor=https://a,'self'` を ("Frame-Ancestor", ["https://a", "'self'"]) にする。"""
    if "=" not in text:
        raise ValueError(f"--directive は Name=値1,値2 の形式で指定してください: {text}")
    name, _, sources = text.partition("=")
    name = name.strip()
    match = next((d for d in DIRECTIVES if d.lower() == name.lower()), None)
    if match is None:
        raise ValueError(f"未知のディレクティブです: {name}（利用可能: {', '.join(DIRECTIVES)}）")
    values = [source.strip() for source in sources.split(",") if source.strip()]
    return match, values


def build_configuration(directives: dict[str, list[str]]) -> str:
    """Dataverse が受け取る JSON 文字列を組み立てる。

    例: {"Frame-Ancestor":{"sources":[{"source":"https://*.powerapps.com"}]}}
    ディレクティブを省略すると既定値が使われ、空リストを渡すとそのディレクティブは無効になる。
    """
    return json.dumps(
        {name: {"sources": [{"source": source} for source in sources]} for name, sources in directives.items()},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def build_patch(args: argparse.Namespace, current: dict) -> dict:
    suffix = "forcanvas" if args.canvas else ""
    body: dict = {}

    if args.enable or args.disable:
        body[f"iscontentsecuritypolicyenabled{suffix}"] = bool(args.enable)

    if args.directive is not None:
        directives = dict(parse_directive(text) for text in args.directive)
        body[f"contentsecuritypolicyconfiguration{suffix}"] = build_configuration(directives)
    elif args.reset_directives:
        body[f"contentsecuritypolicyconfiguration{suffix}"] = "{}"

    if args.strict or args.no_strict:
        options = int(current.get("contentsecuritypolicyoptions") or 0)
        options = options | OPTION_STRICT_CSP if args.strict else options & ~OPTION_STRICT_CSP
        body["contentsecuritypolicyoptions"] = options

    if args.report_uri is not None:
        body["contentsecuritypolicyreporturi"] = args.report_uri or None

    return body


def main() -> int:
    parser = argparse.ArgumentParser(description="環境の CSP を設定する")
    parser.add_argument("--environment-url", required=True, help="環境の URL（例 <ENV_URL>）")
    parser.add_argument("--enable", action="store_true", help="CSP の強制を有効にする")
    parser.add_argument("--disable", action="store_true", help="CSP の強制を無効にする")
    parser.add_argument("--strict", action="store_true", help="Strict CSP を有効にする（全ディレクティブが設定可能になる）")
    parser.add_argument("--no-strict", action="store_true", help="Strict CSP を無効にする")
    parser.add_argument("--canvas", action="store_true", help="キャンバス アプリ側の設定を対象にする")
    parser.add_argument(
        "--directive",
        action="append",
        help=f"Name=値1,値2 形式で指定（複数可）。利用可能: {', '.join(DIRECTIVES)}",
    )
    parser.add_argument("--reset-directives", action="store_true", help="ディレクティブを既定値に戻す")
    parser.add_argument("--report-uri", help="違反レポートの送信先（空文字で解除）")
    parser.add_argument("--apply", action="store_true", help="実際に適用する（既定は dry-run）")
    args = parser.parse_args()

    if args.enable and args.disable:
        print("エラー: --enable と --disable は同時に指定できません。")
        return 2
    if args.strict and args.no_strict:
        print("エラー: --strict と --no-strict は同時に指定できません。")
        return 2

    environment_url = args.environment_url.rstrip("/")
    headers = _headers(environment_url)
    org_id = organization_id(environment_url, headers)
    current = get_settings(environment_url, headers, org_id)

    print(f"環境: {environment_url}（organizationid={org_id}）")
    print("現在の設定:")
    for key in FIELDS:
        print(f"  {key}: {current.get(key)}")

    body = build_patch(args, current)
    if not body:
        print("\n変更する項目がありません。--enable / --disable / --strict / --directive などを指定してください。")
        return 0

    print(f"\n{'' if args.apply else '[dry-run] '}適用する内容:")
    print("  " + json.dumps(body, ensure_ascii=False))
    if not args.apply:
        print("適用するには --apply を付けてください。")
        return 0

    response = _request("PATCH", f"{environment_url}/api/data/v9.2/organizations({org_id})", headers, body)
    if response.ok:
        print("適用しました。反映まで数分かかることがあります。")
        return 0
    print(f"[失敗] HTTP {response.status_code}: {response.text[:400]}")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
