"""Cowork セッションワークスペース等の DLP ブロックを診断する（読み取り専用）。

auth_helper.py のキャッシュ済み認証（Microsoft Graph スコープ）を使い、追加のサインインなしで
共有 URL の driveItem 解決を試みる。実際にはこのテナントでは Graph API 経由での DLP ポリシー
閲覧・アラート取得は機能しないことが多い（→ troubleshooting.md #20 参照）ため、本スクリプトは
「本当にブロックされているか」の一次切り分けにのみ使い、ポリシーの特定・是正は
Microsoft Purview ポータル（https://purview.microsoft.com/datalossprevention/policies）を
VS Code 統合ブラウザツールで直接確認する。

使い方:
  python diagnose_dlp_block.py --url "https://contoso.sharepoint.com/.../workspace"
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for candidate in [
    HERE / ".." / ".." / "standard" / "scripts",
    HERE / ".." / ".." / ".." / ".github" / "skills" / "standard" / "scripts",
]:
    resolved = candidate.resolve()
    if (resolved / "auth_helper.py").is_file():
        sys.path.insert(0, str(resolved))
        break

from auth_helper import get_token  # noqa: E402

import requests  # noqa: E402

GRAPH_V1 = "https://graph.microsoft.com/v1.0"


def headers() -> dict[str, str]:
    token = get_token(scope="https://graph.microsoft.com/.default")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def encode_share_url(url: str) -> str:
    """Graph の /shares/{shareId}/driveItem 用に URL を base64url エンコードする。"""
    b64 = base64.urlsafe_b64encode(url.encode("utf-8")).decode("utf-8").rstrip("=")
    return f"u!{b64}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="DLP ブロックが疑われる共有 URL")
    args = parser.parse_args()

    print("auth_helper 経由で Microsoft Graph トークンを取得します（キャッシュ済みなら追加サインインなし）...")
    h = headers()

    share_id = encode_share_url(args.url)
    resp = requests.get(
        f"{GRAPH_V1}/shares/{share_id}/driveItem?$select=id,name,webUrl,sensitivityLabel",
        headers=h,
        timeout=30,
    )
    print(f"\n=== driveItem 解決 (HTTP {resp.status_code}) ===")
    try:
        print(json.dumps(resp.json(), ensure_ascii=False, indent=2))
    except ValueError:
        print(resp.text)

    if resp.status_code == 403:
        print(
            "\n→ 403 accessDenied（権限不足の定型メッセージではない）は、DLP による"
            "アクセス制限が実際に有効であることを示唆する。"
            "\n→ 次のステップ: Microsoft Purview ポータル "
            "(https://purview.microsoft.com/datalossprevention/policies) を"
            "VS Code 統合ブラウザツールで開き、SharePoint サイトを対象に含むポリシーを確認する"
            "（詳細は troubleshooting.md #20）。"
        )
    elif resp.status_code == 200:
        print("\n→ アクセス可能。DLP ブロックは発生していない（または既に解除済み）。")


if __name__ == "__main__":
    main()
