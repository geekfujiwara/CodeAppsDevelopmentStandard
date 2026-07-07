"""
Copilot Studio エージェント — セキュリティ（ユーザー認証）設定スクリプト（テンプレート）

Copilot Studio の「設定 → セキュリティ → 認証」に相当。
認証モードを設定してから公開する（認証変更は公開後に反映される）。

  AGENT_AUTH_MODE=none       … 認証なし（匿名アクセス／Web 埋め込みに必須）   authenticationmode=2
  AGENT_AUTH_MODE=microsoft  … Microsoft で認証（Teams + M365 チャネル・既定） authenticationmode=1

前提:
  - deploy_agent.py で構築済み（BOT_ID を .env に設定済み）
  - 認証モードは .env の AGENT_AUTH_MODE で指定（未設定時は none）

使い方:
  python set_agent_security.py
"""

import os
import sys

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)

from dotenv import load_dotenv
from deploy_agent import find_bot, api_get, api_patch, api_post, BOT_NAME

load_dotenv()

# 認証モード → Dataverse bots.authenticationmode の値
#   1 = Microsoft で認証（Authenticate with Microsoft）
#   2 = 認証なし（No authentication）
# ※ 実機（live 環境）で確認済み。UI 既定は Microsoft 認証（=1）のため、
#   認証なしの Web 埋め込みが必要な場合は必ず none を指定する。
AUTH_MODE_VALUES = {"microsoft": 1, "none": 2}


def set_security(bot_id: str, mode: str):
    print("\n=== セキュリティ設定（ユーザー認証） ===")
    value = AUTH_MODE_VALUES[mode]
    bot = api_get(f"bots({bot_id})?$select=name,authenticationmode,authenticationtrigger")
    print(f"  現在: authenticationmode={bot.get('authenticationmode')} → 変更後: {value} ({mode})")

    body = {"name": bot["name"], "authenticationmode": value}
    if mode == "microsoft":
        # Teams では常に認証されるため trigger は 0（As needed）
        body["authenticationtrigger"] = 0
    api_patch(f"bots({bot_id})", body)
    label = "認証なし（匿名アクセス）" if mode == "none" else "Microsoft で認証"
    print(f"  ✅ 認証モードを設定: {label}")


def publish_bot(bot_id: str):
    print("\n=== 公開（認証変更を反映） ===")
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  ✅ 公開完了")
    except Exception as e:
        print(f"  ⚠️ 公開でエラー（手動で公開してください）: {e}")


def main():
    mode = os.environ.get("AGENT_AUTH_MODE", "none").strip().lower()
    if mode not in AUTH_MODE_VALUES:
        print(f"❌ AGENT_AUTH_MODE の値が不正です: '{mode}'")
        print(f"   有効値: {', '.join(AUTH_MODE_VALUES)}")
        sys.exit(1)

    print("=" * 60)
    print("  Copilot Studio セキュリティ設定")
    print(f"  エージェント名: {BOT_NAME}")
    print(f"  認証モード: {mode}")
    print("=" * 60)

    bot_id = find_bot()
    set_security(bot_id, mode)
    publish_bot(bot_id)

    print("\n" + "=" * 60)
    print("  ✅ セキュリティ設定完了!")
    print("=" * 60)
    if mode == "none":
        print("  → Web 埋め込み（認証なし）が利用可能になりました。")
        print("  → 次: python set_agent_channels.py（AGENT_CHANNELS=web）")
    else:
        print("  → Microsoft 認証（Teams + M365）が有効になりました。")
        print("  → 次: python set_agent_channels.py（AGENT_CHANNELS=teams,copilot）")


if __name__ == "__main__":
    main()
