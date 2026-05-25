"""
.js 拡張子の Dataverse blockedattachments からの解除スクリプト

Power Pages コードサイトのアップロードで PortalFileContentUploadFailed が
発生する場合、Dataverse organization の blockedattachments に .js が含まれている
ことが原因。このスクリプトで .js をブロックリストから除外する。

Usage:
    python unblock_js.py           # .js のブロック状態確認 & 解除
    python unblock_js.py --check   # 確認のみ（変更なし）
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))
from auth_helper import get_token  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv()


def main():
    import requests

    parser = argparse.ArgumentParser(description=".js ブロック解除")
    parser.add_argument("--check", action="store_true", help="確認のみ（変更なし）")
    args = parser.parse_args()

    dv_url = os.environ.get("DATAVERSE_URL", "").rstrip("/")
    if not dv_url:
        print("❌ .env に DATAVERSE_URL が設定されていません。")
        sys.exit(1)

    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    # 現在の blockedattachments 取得
    r = requests.get(
        f"{dv_url}/api/data/v9.2/organizations?$select=blockedattachments,organizationid",
        headers=headers,
    )
    r.raise_for_status()
    org = r.json()["value"][0]
    blocked = org["blockedattachments"]
    org_id = org["organizationid"]

    exts = [e.strip() for e in blocked.split(";") if e.strip()]
    js_blocked = "js" in exts

    if js_blocked:
        print(f"⚠️  .js がブロックされています（計 {len(exts)} 拡張子）")
        if args.check:
            print("   --check モード: 変更なし")
            return

        new_exts = [e for e in exts if e != "js"]
        new_blocked = ";".join(new_exts)
        patch_r = requests.patch(
            f"{dv_url}/api/data/v9.2/organizations({org_id})",
            headers={**headers, "Content-Type": "application/json"},
            json={"blockedattachments": new_blocked},
        )
        patch_r.raise_for_status()
        print(f"✅ .js をブロックリストから除外しました（残り {len(new_exts)} 拡張子）")
    else:
        print(f"✅ .js はブロックされていません（計 {len(exts)} 拡張子）")


if __name__ == "__main__":
    main()
