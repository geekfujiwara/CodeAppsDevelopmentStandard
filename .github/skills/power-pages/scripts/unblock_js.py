"""
Dataverse blockedattachments から .js を除外するスクリプト

Power Pages Code Site のデプロイには .js ファイルのアップロードが必要。
Dataverse のデフォルト設定では .js がブロック対象のため、除外が必要。

Usage:
    python unblock_js.py           # .js をブロックリストから除外
    python unblock_js.py --check   # 現在のブロックリストを確認（変更なし）

注意:
- テナント管理者または System Administrator ロールが必要
- 変更はテナント全体に影響する
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))


def get_blocked_attachments(dv_url: str, headers: dict) -> tuple:
    """組織のブロック拡張子リストを取得."""
    import requests
    r = requests.get(
        f"{dv_url}/api/data/v9.2/organizations?$select=organizationid,blockedattachments",
        headers=headers
    )
    r.raise_for_status()
    orgs = r.json()["value"]
    if not orgs:
        print("❌ Organization が見つかりません。")
        sys.exit(1)
    org = orgs[0]
    return org["organizationid"], org.get("blockedattachments", "")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Dataverse .js ブロック解除")
    parser.add_argument("--check", action="store_true", help="確認のみ（変更なし）")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv()

    from auth_helper import get_token
    import requests

    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    if not dv_url:
        print("❌ .env に DATAVERSE_URL が設定されていません。")
        sys.exit(1)

    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }

    org_id, blocked = get_blocked_attachments(dv_url, headers)

    # ブロックリスト表示
    blocked_list = [x.strip() for x in blocked.split(";") if x.strip()]
    print(f"📋 現在のブロック拡張子 ({len(blocked_list)} 件):")
    js_blocked = any(ext.lower() == "js" for ext in blocked_list)

    if js_blocked:
        print(f"   ⚠️  .js がブロックされています")
    else:
        print(f"   ✅ .js はブロックされていません")

    if args.check:
        print(f"\n   完全なリスト: {blocked}")
        return

    if not js_blocked:
        print("   変更不要です。")
        return

    # .js を除外
    new_list = [ext for ext in blocked_list if ext.lower() != "js"]
    new_blocked = ";".join(new_list)

    print(f"\n🔧 .js をブロックリストから除外します...")
    print(f"   Organization ID: {org_id}")

    patch_headers = {
        **headers,
        "Content-Type": "application/json",
        "If-Match": "*",
    }
    body = {"blockedattachments": new_blocked}
    r = requests.patch(
        f"{dv_url}/api/data/v9.2/organizations({org_id})",
        headers=patch_headers,
        json=body
    )

    if r.status_code == 204:
        print("✅ .js ブロック解除完了")
        print(f"   新しいリスト: {new_blocked}")
        print("\n   ⚠️  開発完了後に .js を再追加することを推奨します。")
        print(f"       python {os.path.basename(__file__)} --reblock  (未実装)")
    else:
        print(f"❌ 更新失敗: {r.status_code}")
        print(f"   {r.text}")
        sys.exit(1)


if __name__ == "__main__":
    main()
