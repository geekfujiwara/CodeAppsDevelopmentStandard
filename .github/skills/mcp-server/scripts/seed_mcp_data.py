"""Private Endpoint 環境の MCP Server へ、管理エンドポイント経由でデータを投入する。

ローカルからデータ層に到達できないため、VNet 統合済み Function App の一時エンドポイントを叩く。
認証は auth_helper のキャッシュを使うため非対話で完走する。

使い方:
    # スキーマ作成 + MI へのロール付与（実行者のトークンを渡す）
    python .github/skills/mcp-server/scripts/seed_mcp_data.py --app func-example-db-mcp --route internal-db-setup --with-sql-token
    # 業務データ投入
    python .github/skills/mcp-server/scripts/seed_mcp_data.py --app func-example-db-mcp --route internal-seed
    # ファイル共有へのアップロード
    python .github/skills/mcp-server/scripts/seed_mcp_data.py --app func-example-files-mcp --route seed-upload
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import function_url, get_app_settings, get_sql_access_token, http_post  # noqa: E402


def resolve_secret(app: str) -> str:
    """`ADMIN_SEED_SECRET` を .env から、無ければ Function App のアプリ設定から取得する。"""
    secret = os.getenv("ADMIN_SEED_SECRET")
    if secret:
        return secret
    subscription = os.environ["AZURE_SUBSCRIPTION_ID"]
    resource_group = os.environ["AZURE_RESOURCE_GROUP"]
    secret = get_app_settings(subscription, resource_group, app).get("ADMIN_SEED_SECRET")
    if not secret:
        raise SystemExit(f"{app} のアプリ設定に ADMIN_SEED_SECRET がありません")
    return secret


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True, help="Function App 名")
    parser.add_argument("--route", required=True, help="管理エンドポイントのルート")
    parser.add_argument("--with-sql-token", action="store_true", help="Azure SQL のアクセストークンを body に含める")
    args = parser.parse_args()

    body: dict = {}
    if args.with_sql_token:
        # CREATE USER ... FROM EXTERNAL PROVIDER は Entra 管理者権限が必要で MI では実行できない
        body["accessToken"] = get_sql_access_token()

    try:
        status, _ = http_post(
            function_url(args.app, args.route),
            body,
            headers={"x-admin-seed-secret": resolve_secret(args.app)},
            timeout=600,
        )
    except (RuntimeError, ValueError, KeyError) as exc:
        print(f"{args.route} -> 接続失敗: {exc}", file=sys.stderr)
        return 1
    # 応答がリクエスト内容を反射してもトークンを漏らさないよう本文は表示しない。
    print(f"{args.route} -> {status}")
    return 0 if status < 400 else 1


if __name__ == "__main__":
    raise SystemExit(main())
