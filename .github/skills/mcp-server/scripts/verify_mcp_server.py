"""MCP Server をエンドツーエンドで検証する。

Streamable HTTP の準拠を確かめた上で、`tools/list` でツール一覧を取得し、
続けて `tools/call` を実行して**実データが返ること**まで確認する。
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

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import get_api_access_token  # noqa: E402

# Streamable HTTP トランスポートが導入されたバージョン。Copilot Studio はこれ以降を要求する。
MIN_STREAMABLE_PROTOCOL_VERSION = "2025-03-26"
CLIENT_PROTOCOL_VERSION = "2025-06-18"


def rpc(url: str, token: str, method: str, params: dict | None = None) -> dict:
    res = requests.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        timeout=180,
    )
    if res.status_code != 200:
        raise RuntimeError(f"{method} が失敗しました: {res.status_code} {res.text[:300]}")
    payload = res.json()
    if "error" in payload:
        raise RuntimeError(f"{method} が JSON-RPC エラーを返しました: {payload['error']}")
    return payload.get("result", {})


def check_streamable_compliance(url: str, token: str) -> list[str]:
    """Copilot Studio が接続できる Streamable HTTP 準拠を検査し、違反を返す。

    いずれも tools/list は成功するのにコネクタ接続だけが失敗するクラスの不具合。
    """
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    violations = []

    init = rpc(url, token, "initialize", {"protocolVersion": CLIENT_PROTOCOL_VERSION, "capabilities": {}})
    version = init.get("protocolVersion", "")
    if version < MIN_STREAMABLE_PROTOCOL_VERSION:
        violations.append(
            f"initialize の protocolVersion が {version or '未返却'}。"
            f"Streamable HTTP には {MIN_STREAMABLE_PROTOCOL_VERSION} 以降が必要"
        )

    # 通知（id なし）には応答本文を返してはいけない。返すとハンドシェイク直後に切断される。
    notified = requests.post(
        url, headers=headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"}, timeout=60
    )
    if notified.status_code not in (202, 204) or notified.content:
        violations.append(
            f"通知（id なし）への応答が {notified.status_code} / body {len(notified.content)} bytes。"
            "202 かつ本文なしでなければならない"
        )

    # SSE 未対応なら 405、対応するなら 200。404 は GET がルートに登録されていない。
    streamed = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    if streamed.status_code == 404:
        violations.append("GET が 404。SSE 未対応なら 405 を返すよう methods に GET を含める")

    return violations


def verify(app: str, token: str, call: str | None) -> bool:
    url = f"https://{app}.azurewebsites.net/api/mcp"
    print(f"\n=== {app} ===")
    try:
        violations = check_streamable_compliance(url, token)
    except RuntimeError as exc:
        print(f"NG: {exc}")
        return False
    if violations:
        for v in violations:
            print(f"NG: {v}")
        return False
    print("Streamable HTTP 準拠 OK")

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
