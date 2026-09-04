"""MCP Server をエンドツーエンドで検証する。

`tools/list` でツール一覧を取得し、続けて `tools/call` を実行して**実データが返ること**まで確認する。
ツール一覧が返るだけでは不十分（データ層への接続や権限が壊れていても一覧は返るため）。

使い方:
    python .github/skills/mcp-server/scripts/verify_mcp_server.py
    python .github/skills/mcp-server/scripts/verify_mcp_server.py --app func-example-mcp --call list_categories
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import function_url, get_api_access_token, http_post  # noqa: E402


def rpc(url: str, token: str, method: str, params: dict | None = None) -> dict:
    status, payload = http_post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        body={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        timeout=180,
    )
    if status != 200:
        raise RuntimeError(f"{method} が失敗しました: HTTP {status}")
    if not isinstance(payload, dict):
        raise RuntimeError(f"{method} が不正な JSON 応答を返しました")
    if "error" in payload:
        raise RuntimeError(f"{method} が JSON-RPC エラーを返しました: {payload['error']}")
    return payload.get("result", {})


def verify(app: str, token: str, call: str | None) -> bool:
    url = function_url(app, "mcp")
    print(f"\n=== {app} ===")
    try:
        tools = [t["name"] for t in rpc(url, token, "tools/list").get("tools", [])]
    except RuntimeError as exc:
        print(f"NG: {exc}")
        return False
    print(f"tools/list -> {tools}")
    if not tools:
        print("NG: ツールが 0 件です")
        return False

    target = call or next((t for t in tools if t.startswith("list_")), tools[0])
    try:
        content = rpc(url, token, "tools/call", {"name": target, "arguments": {}}).get("content", [])
    except RuntimeError as exc:
        print(f"NG: {exc}")
        return False
    text = "".join(c.get("text", "") for c in content).strip()
    print(f"tools/call {target} -> {text[:400]}")
    if not text:
        print("NG: 実データが空です")
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", action="append", help="Function App 名（未指定なら MCP_FUNCTION_APPS）")
    parser.add_argument("--call", help="実行するツール名（既定: list_* の先頭）")
    args = parser.parse_args()

    apps = args.app or [a.strip() for a in os.getenv("MCP_FUNCTION_APPS", "").split(",") if a.strip()]
    if not apps:
        raise SystemExit("MCP_FUNCTION_APPS を .env に設定するか --app を指定してください")

    audience = os.environ["MCP_API_AUDIENCE"]
    token = get_api_access_token(audience)

    results = [verify(app, token, args.call) for app in apps]
    print(f"\n結果: {sum(results)}/{len(results)} 件成功")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
