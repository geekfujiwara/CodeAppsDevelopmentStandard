"""
post_deploy.py — Power Pages デプロイ後の必須セットアップ
===========================================================
pac pages upload-code-site の後に必ず実行する。

既知の問題:
  pac pages upload-code-site は table-permissions YAML 内の
  entitypermission_webrole (N:N 関連付け) を正しく同期しない。
  デプロイのたびにテーブル権限↔Web ロールのリンクが消失する。

このスクリプトが行うこと:
  1. テーブル権限 ↔ Authenticated Users ロールの関連付けを復元
  2. サイトキャッシュの無効化（メタデータ反映）

使い方:
  py post_deploy.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auth_helper import api_get, get_session, DATAVERSE_URL

# ── 設定 ──────────────────────────────────────────────────
WEBSITE_ID = os.getenv("WEBSITE_ID", "83535722-1daf-4523-ac12-374fd93cd8eb")
AUTH_ROLE_ID = "7e158fa3-602e-4a62-93c3-06d54022438e"


def ensure_role_links():
    """全テーブル権限を Authenticated Users ロールに紐づける。"""
    print("=" * 60)
    print("Step 1: テーブル権限 → Authenticated Users ロール紐づけ")
    print("=" * 60)

    session = get_session()

    perms = api_get(
        f"mspp_entitypermissions?$filter=_mspp_websiteid_value eq '{WEBSITE_ID}'"
        "&$select=mspp_entitypermissionid,mspp_entityname,mspp_entitylogicalname"
    )["value"]

    if not perms:
        print("  [WARN] テーブル権限が見つかりません。")
        return

    linked = 0
    for p in perms:
        pid = p["mspp_entitypermissionid"]
        name = p.get("mspp_entitylogicalname", "?")

        # 既存リンクを確認
        try:
            links = api_get(
                f"mspp_entitypermissions({pid})/mspp_entitypermission_webrole/$ref"
            )
            already_linked = any(
                AUTH_ROLE_ID in ref.get("@odata.id", "")
                for ref in links.get("value", [])
            )
            if already_linked:
                print(f"  [OK] {name} — 既にリンク済み")
                continue
        except Exception:
            pass

        # 関連付け作成
        url = (
            f"{DATAVERSE_URL}/api/data/v9.2/"
            f"mspp_entitypermissions({pid})/mspp_entitypermission_webrole/$ref"
        )
        body = {
            "@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/mspp_webroles({AUTH_ROLE_ID})"
        }
        resp = session.post(url, json=body)

        if resp.status_code in (200, 201, 204):
            print(f"  [LINKED] {name} → Authenticated Users")
            linked += 1
        elif resp.status_code == 409:
            print(f"  [OK] {name} — 既に関連付け済み (409)")
        else:
            print(f"  [ERROR] {name}: {resp.status_code} {resp.text[:200]}")

    print(f"\n  合計: {linked} 件リンク")


def invalidate_cache():
    """サイトレコードを touch してキャッシュ無効化をトリガーする。"""
    print("\n" + "=" * 60)
    print("Step 2: サイトキャッシュ無効化")
    print("=" * 60)

    session = get_session()
    session.headers["If-Match"] = "*"
    url = f"{DATAVERSE_URL}/api/data/v9.2/mspp_websites({WEBSITE_ID})"
    resp = session.patch(url, json={"mspp_name": "m365status"})
    del session.headers["If-Match"]

    if resp.status_code in (200, 204):
        print("  [OK] キャッシュ無効化トリガー送信")
    else:
        print(f"  [WARN] {resp.status_code}")

    print("\n  ★ メタデータ反映に数分かかる場合があります。")


def main():
    print("=== Power Pages Post-Deploy ===\n")
    ensure_role_links()
    invalidate_cache()
    print("\n=== 完了 ===")


if __name__ == "__main__":
    main()
