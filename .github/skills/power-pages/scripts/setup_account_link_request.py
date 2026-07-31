"""紐づけ依頼テーブルの Power Pages 権限を冪等構成する（SKILL.md Step 6）。

取引先企業（account）に未紐づけのユーザーが、プロファイル画面から
「管理者に紐づけを依頼する」ボタンで依頼レコードを作成できるようにする。

作成するもの:
  - 依頼テーブルのテーブル権限（type=18, scope=Contact, contactrelationship 指定）
    read/create のみ。write/delete は付けない（依頼の改ざん防止）
  - Webapi/{table}/enabled, Webapi/{table}/fields
  - Web ロールとの N:N association

恒久的な事前チェック（正常系の実行でも毎回動作する）:
  - assert_no_write_delete()   : 依頼テーブル権限に write/delete が付いていないか
  - verify_relationship()      : contact → 依頼テーブルのリレーションスキーマ名が実在するか
  - assert_scope_value()       : scope の値域検証（setup_access_scope と共通）

メール送信フロー本体は power-automate スキルで作成する
（references/account-link-request-flow.md 参照）。

使い方:
  python setup_account_link_request.py
  python setup_account_link_request.py --verify-only
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from setup_access_scope import (  # noqa: E402
    SCOPE_CONTACT,
    assert_scope_value,
    build_content,
    enable_webapi,
    resolve_adx_website_id,
    resolve_site_id,
    resolve_site_language_id,
    resolve_webrole_id,
    restart_site,
    upsert_permission,
    verify,
    verify_relationship,
)

CHILD_FIELDS = os.environ.get("ACCESS_SCOPE_CHILD_WEBAPI_FIELDS", "*")


def resolve_table_name() -> str:
    table = os.environ.get("ACCOUNT_LINK_REQUEST_TABLE", "").strip()
    if table:
        return table
    prefix = os.environ.get("PUBLISHER_PREFIX", "").strip()
    if not prefix:
        sys.exit("ERROR: ACCOUNT_LINK_REQUEST_TABLE か PUBLISHER_PREFIX を .env に設定してください")
    return f"{prefix}_accountlinkrequest"


def assert_no_write_delete(content: dict) -> None:
    """依頼レコードを作成者が改ざん・削除できないことを保証する。"""
    for priv in ("write", "delete"):
        if content.get(priv):
            sys.exit(
                f"ERROR: 依頼テーブル権限に {priv}=true が指定されています。"
                "依頼は作成と参照のみに制限してください"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="紐づけ依頼テーブルの権限構成")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    table = resolve_table_name()
    relationship = os.environ.get("ACCOUNT_LINK_REQUEST_RELATIONSHIP", "").strip()
    if not relationship:
        sys.exit("ERROR: ACCOUNT_LINK_REQUEST_RELATIONSHIP（contact → 依頼テーブルの "
                 "1:N リレーションスキーマ名）を .env に設定してください")

    print(f"=== 紐づけ依頼テーブル権限構成: {table} ===\n")
    print("[1/4] サイト・ロールを解決...")
    site_id = resolve_site_id()
    adx_website_id = resolve_adx_website_id()
    lang_id = resolve_site_language_id(site_id)
    role_id = resolve_webrole_id(site_id, lang_id, adx_website_id)
    print()

    if args.verify_only:
        print("[検証] 権限・association・Webapi 設定を確認...")
        missing = verify(site_id, role_id, [table])
        print(f"\n欠落: {missing} 件")
        sys.exit(1 if missing else 0)

    print("[2/4] リレーションを検証...")
    verify_relationship("contact", relationship, table)
    print()

    print("[3/4] 依頼テーブル権限と Webapi 設定を作成/更新...")
    name = f"{table} - Contact scope (create only)"
    content = build_content(
        adx_website_id, table, name, assert_scope_value(SCOPE_CONTACT),
        "contactrelationship", relationship, role_id,
        read=True, write=False, create=True, delete=False, append=True, appendto=False,
    )
    assert_no_write_delete(content)
    upsert_permission(site_id, lang_id, name, content, role_id)
    enable_webapi(site_id, lang_id, adx_website_id, table, CHILD_FIELDS)
    print()

    print("[4/4] サイトを再起動...")
    restart_site()

    print("\n完了! 次に power-automate スキルでメール送信フローを作成する")
    print("  トリガー: Dataverse『行が追加されたとき』（テーブル: %s）" % table)
    print("  アクション: Office 365 Outlook『メールの送信』"
          "（宛先は .env の ACCOUNT_LINK_ADMIN_RECIPIENT）")


if __name__ == "__main__":
    main()
