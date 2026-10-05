"""Cowork コネクタの OAuth アプリについて、Entra のサインイン ログからトークン発行の成否を集計する（読み取りのみ）。

Connect は成功し、詳細画面も「接続済み」なのに、Cowork の実行時に MCP のツールが 0 件になる場合の切り分けに使う。
Cowork のトークン保管庫（Enterprise Token Store）は、Connect のたびにこのアプリで Dataverse 宛てのトークンを取得する。

  - 記録が無い          → Cowork がこのアプリでトークンを取っていない（Connect していない／別の OAuth 登録を参照）
  - 失敗（AADSTS）がある → 条件付きアクセス・同意などテナント側で直せる可能性がある
  - すべて成功           → 認証は正常。それでもツールが 0 件なら Cowork 側の問題（troubleshooting #46）。
                           copilot-studio-v2 の templates/agm-qa-author のように Copilot Studio で代替する

必要な権限: Graph の委任権限 AuditLog.Read.All（Microsoft Graph PowerShell の公開クライアントで初回だけ同意）と、
サインイン ログを読めるロール（レポート閲覧者・セキュリティ閲覧者・グローバル閲覧者のいずれか）。

例:
  python check_oauth_signins.py                        # .env の COWORK_OAUTH_CLIENT_ID、過去 24 時間
  python check_oauth_signins.py --hours 8 --client-id <APP_ID> --client-id <比較用 APP_ID>
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from collections import Counter
from pathlib import Path

GRAPH_POWERSHELL_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
SCOPE = "https://graph.microsoft.com/AuditLog.Read.All"
EVENT_TYPES = ("interactiveUser", "nonInteractiveUser")


def summarize(rows: list[dict]) -> dict:
    """サインイン記録を、成功・失敗・リソース・条件付きアクセスの状態に集計して判定を付ける。"""
    failures = [r for r in rows if ((r.get("status") or {}).get("errorCode") or 0) != 0]
    summary = {
        "total": len(rows),
        "succeeded": len(rows) - len(failures),
        "failed": len(failures),
        "resources": dict(Counter(r.get("resourceDisplayName") or "?" for r in rows)),
        "conditionalAccess": dict(Counter(r.get("conditionalAccessStatus") or "?" for r in rows)),
        "errors": dict(Counter(f"AADSTS{(r.get('status') or {}).get('errorCode')}" for r in failures)),
        "latest": max((r.get("createdDateTime") or "" for r in rows), default=None),
    }
    if not rows:
        summary["verdict"] = "no-signins"
    elif failures:
        summary["verdict"] = "token-failures"
    else:
        summary["verdict"] = "tokens-ok"
    return summary


VERDICT_TEXT = {
    "no-signins": "記録なし: Cowork はこのアプリでトークンを取っていない。Connect したか、manifest の referenceId がこの OAuth 登録を指しているかを確認する",
    "token-failures": "失敗あり: エラーコード（AADSTS）を確認する。条件付きアクセス・同意・リダイレクト URI などテナント側で直せる可能性がある",
    "tokens-ok": "すべて成功: 認証は正常。それでも Cowork の実行時にツールが 0 件なら Cowork 側の問題（troubleshooting #46）。Copilot Studio での代替を検討する",
}


def fetch(client_id: str, hours: int) -> list[dict]:
    import requests  # noqa: PLC0415

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
    from auth_helper import get_token  # noqa: PLC0415

    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = {"Authorization": f"Bearer {get_token(SCOPE, client_id=GRAPH_POWERSHELL_CLIENT_ID)}"}
    rows: list[dict] = []
    for kind in EVENT_TYPES:
        url = "https://graph.microsoft.com/beta/auditLogs/signIns"
        params = {"$filter": f"appId eq '{client_id}' and createdDateTime ge {since} "
                             f"and signInEventTypes/any(t: t eq '{kind}')", "$top": "200"}
        while url:
            res = requests.get(url, headers=headers, params=params, timeout=120)
            if res.status_code == 403:
                raise SystemExit("403: サインイン ログを読む権限がありません（AuditLog.Read.All とレポート閲覧者などのロールが必要）")
            res.raise_for_status()
            body = res.json()
            rows += body.get("value", [])
            url, params = body.get("@odata.nextLink"), None
    return rows


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--client-id", action="append", help="OAuth アプリの Client ID（複数可。既定: .env の COWORK_OAUTH_CLIENT_ID）")
    p.add_argument("--hours", type=int, default=24)
    args = p.parse_args()
    try:
        from dotenv import find_dotenv, load_dotenv  # noqa: PLC0415

        load_dotenv(find_dotenv(usecwd=True))
    except ImportError:
        pass
    ids = args.client_id or [os.getenv("COWORK_OAUTH_CLIENT_ID", "").strip().strip("'\"")]
    if not ids[0]:
        raise SystemExit("--client-id か .env の COWORK_OAUTH_CLIENT_ID が必要です")
    for client_id in ids:
        summary = summarize(fetch(client_id, args.hours))
        print(f"== {client_id}（過去 {args.hours} 時間）")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        print(VERDICT_TEXT[summary["verdict"]])


if __name__ == "__main__":
    main()
