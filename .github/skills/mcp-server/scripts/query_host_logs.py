"""Function App の Application Insights を KQL で照会して、ホスト起動エラーを特定する。

`0 functions loaded` / 全ルート 404 のときの一次切り分けに使う。

使い方:
    python .github/skills/mcp-server/scripts/query_host_logs.py --component func-example-mcp
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import arm_get, get_api_access_token  # noqa: E402

API_BASE = "https://api.applicationinsights.io"

DEFAULT_QUERY = (
    "union traces, exceptions "
    "| where timestamp > ago(1h) "
    "| project timestamp, severityLevel, msg = coalesce(message, outerMessage) "
    "| order by timestamp desc | take 40"
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", required=True, help="Application Insights リソース名")
    parser.add_argument("--subscription", default=os.getenv("AZURE_SUBSCRIPTION_ID"))
    parser.add_argument("--resource-group", default=os.getenv("AZURE_RESOURCE_GROUP"))
    parser.add_argument("--query", default=DEFAULT_QUERY)
    args = parser.parse_args()

    if not args.subscription or not args.resource_group:
        raise SystemExit("AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP を指定してください")

    path = (
        f"/subscriptions/{args.subscription}/resourceGroups/{args.resource_group}"
        f"/providers/microsoft.insights/components/{args.component}"
    )
    app_id = arm_get(path, api_version="2020-02-02")["properties"]["AppId"]

    token = get_api_access_token(API_BASE)
    res = requests.post(
        f"{API_BASE}/v1/apps/{app_id}/query",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"query": args.query},
        timeout=180,
    )
    if res.status_code >= 400:
        raise SystemExit(f"クエリに失敗しました: {res.status_code} {res.text}")

    for table in res.json().get("tables", []):
        cols = [c["name"] for c in table["columns"]]
        for row in table["rows"]:
            print(" | ".join(str(v) for v in dict(zip(cols, row)).values()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
