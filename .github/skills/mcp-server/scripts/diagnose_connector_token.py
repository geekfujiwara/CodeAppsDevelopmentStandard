"""Copilot Studio の MCP コネクタが 401 を返すとき、原因を「未接続 / トークン失効 / その他」に分類する。

`Couldn't load MCP tools ... HTTP 401` は DLP ブロックとよく混同されるが、DLP を解消した後でも
Copilot Studio 側が保持する古い OAuth アクセストークンをそのまま使い続けて `jwt expired` になる
ケースがある（Entra アプリ登録やサーバー側の JWT 検証は正常なまま）。このスクリプトは
Application Insights の認証失敗ログを読み取り専用で集計し、どの是正が必要かを判定する。
ポリシーやアプリ設定は一切変更しない。

使い方:
    python .github/skills/mcp-server/scripts/diagnose_connector_token.py --app func-example-mcp
    python .github/skills/mcp-server/scripts/diagnose_connector_token.py --hours 12
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import arm_get, get_api_access_token  # noqa: E402

API_BASE = "https://api.applicationinsights.io"

# 認証失敗の分類。src/lib/auth.ts の AuthError メッセージと対応させる。
NOT_CONNECTED = "not_connected"  # Authorization ヘッダーが無い＝接続がまだ認証されていない
TOKEN_EXPIRED = "token_expired"  # jwt expired。単発なら一時的、繰り返せば無更新
AUDIENCE_OR_ISSUER = "audience_or_issuer"  # aud/iss 不一致。アプリ登録側の設定不備
OTHER = "other"

# 繰り返し失敗の間隔がこれを超えたら「リフレッシュされず放置」と判定する（分）
STALE_SPAN_MINUTES_THRESHOLD = 15

QUERY_TEMPLATE = (
    "traces "
    "| where timestamp > ago({hours}h) "
    "| where message has '認証失敗' "
    "| project timestamp, message "
    "| order by timestamp asc"
)


@dataclass
class Failure:
    timestamp: str
    message: str


def classify(message: str) -> str:
    if "Bearer <token>" in message or "必要です" in message:
        return NOT_CONNECTED
    if "expired" in message:
        return TOKEN_EXPIRED
    if "audience" in message or "issuer" in message:
        return AUDIENCE_OR_ISSUER
    return OTHER


def find_component(name: str, subscription: str, resource_group: str) -> str | None:
    resources = arm_get(
        f"/subscriptions/{subscription}/resourceGroups/{resource_group}/resources", api_version="2021-04-01"
    )["value"]
    components = [r["name"] for r in resources if r["type"].lower() == "microsoft.insights/components"]
    if name in components:
        return name
    return None


def fetch_failures(component: str, subscription: str, resource_group: str, hours: int) -> list[Failure]:
    path = (
        f"/subscriptions/{subscription}/resourceGroups/{resource_group}"
        f"/providers/microsoft.insights/components/{component}"
    )
    app_id = arm_get(path, api_version="2020-02-02")["properties"]["AppId"]
    token = get_api_access_token(API_BASE)
    res = requests.post(
        f"{API_BASE}/v1/apps/{app_id}/query",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"query": QUERY_TEMPLATE.format(hours=hours)},
        timeout=180,
    )
    if res.status_code >= 400:
        raise SystemExit(f"クエリに失敗しました: {res.status_code} {res.text}")

    failures: list[Failure] = []
    for table in res.json().get("tables", []):
        cols = [c["name"] for c in table["columns"]]
        for row in table["rows"]:
            record = dict(zip(cols, row))
            failures.append(Failure(timestamp=str(record.get("timestamp")), message=str(record.get("message") or "")))
    return failures


def diagnose(app: str, failures: list[Failure]) -> None:
    print(f"\n=== {app} ===")
    if not failures:
        print("直近の期間に認証失敗ログはありません（DLP 等それ以外の原因を疑ってください）")
        return

    by_category: dict[str, list[Failure]] = {}
    for failure in failures:
        by_category.setdefault(classify(failure.message), []).append(failure)

    for category, items in by_category.items():
        print(f"[{category}] {len(items)} 件 最新: {items[-1].timestamp}")

    if TOKEN_EXPIRED in by_category:
        expired = by_category[TOKEN_EXPIRED]
        span_minutes = _span_minutes(expired[0].timestamp, expired[-1].timestamp)
        if len(expired) >= 2 and span_minutes >= STALE_SPAN_MINUTES_THRESHOLD:
            print(
                "診断: Copilot Studio 側が保持する OAuth アクセストークンが失効し、"
                f"{span_minutes:.0f} 分以上リフレッシュされずに同じ 401 を繰り返しています。"
            )
            print(
                "対処: DLP やアプリ登録の設定ではなく、Copilot Studio（または Power Apps > Connections）で"
                "対象コネクタの接続を選び、組織アカウントで再認証（reconnect）してください。"
            )
        else:
            print("診断: 直近で 1 回だけの期限切れです。もう一度ツールを開き直して再現するか確認してください。")

    if NOT_CONNECTED in by_category:
        print("診断: Authorization ヘッダーが付いていません。接続がまだ認証されていません。")
        print("対処: Copilot Studio でコネクタの接続を作成し、サインインを完了させてください。")

    if AUDIENCE_OR_ISSUER in by_category:
        print("診断: トークンの aud/iss がサーバーの検証条件と一致していません。")
        print("対処: configure_entra_api.py の設定と auth.ts の audience/issuer 許容値を再確認してください。")


def _span_minutes(first: str, last: str) -> float:
    import re
    from datetime import datetime

    def parse(value: str) -> datetime:
        # App Insights は秒以下を最大7桁で返すため、fromisoformat が扱える6桁までに切り詰める
        normalized = re.sub(r"(\.\d{6})\d*Z$", r"\1+00:00", value)
        normalized = normalized.replace("Z", "+00:00") if normalized.endswith("Z") else normalized
        return datetime.fromisoformat(normalized)

    return (parse(last) - parse(first)).total_seconds() / 60


def main() -> int:
    parser = argparse.ArgumentParser(description="MCP コネクタの 401 原因を分類して診断する（読み取り専用）")
    parser.add_argument(
        "--apps",
        default=os.getenv("MCP_FUNCTION_APPS", ""),
        help="カンマ区切りの Function App 名。既定は MCP_FUNCTION_APPS",
    )
    parser.add_argument("--app", help="単一の Function App 名を指定する場合はこちら")
    parser.add_argument("--subscription", default=os.getenv("AZURE_SUBSCRIPTION_ID"))
    parser.add_argument("--resource-group", default=os.getenv("AZURE_RESOURCE_GROUP"))
    parser.add_argument("--hours", type=int, default=6, help="遡る時間（時間単位）。既定 6")
    args = parser.parse_args()

    if not args.subscription or not args.resource_group:
        parser.error("--subscription/--resource-group または AZURE_SUBSCRIPTION_ID/AZURE_RESOURCE_GROUP を指定してください")

    apps = [args.app] if args.app else [a.strip() for a in args.apps.split(",") if a.strip()]
    if not apps:
        parser.error("--app または --apps、MCP_FUNCTION_APPS のいずれかで対象 Function App を指定してください")

    for app in apps:
        component = find_component(app, args.subscription, args.resource_group)
        if not component:
            print(f"\n=== {app} ===")
            print("Application Insights コンポーネントが見つかりません（名前が Function App と異なる可能性）")
            continue
        failures = fetch_failures(component, args.subscription, args.resource_group, args.hours)
        diagnose(app, failures)

    print("\n読み取り専用の診断です。ポリシー・アプリ設定は変更していません。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
