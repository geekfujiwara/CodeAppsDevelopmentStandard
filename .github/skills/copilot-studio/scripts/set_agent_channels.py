"""
Copilot Studio エージェント — チャネル選択・公開スクリプト（テンプレート）

Copilot Studio の「設定 → チャネル」に相当。対象チャネルを選択して公開する。

  AGENT_CHANNELS=web,teams,copilot  （カンマ区切りで選択）
    web     … Web / カスタムアプリ（DirectLine）。公開すれば既定で利用可能
    teams   … Microsoft Teams（msteams チャネル + Teams マニフェスト）
    copilot … Microsoft 365 Copilot（Microsoft365Copilot チャネル）

前提:
  - deploy_agent.py で構築済み・set_agent_security.py で認証設定済み

注意:
  Teams / Copilot チャネルは「Microsoft で認証」（AGENT_AUTH_MODE=microsoft）が前提です。
  「認証なし」のまま teams/copilot を選ぶと警告を表示します（Web 埋め込みのみ利用可）。

使い方:
  python set_agent_channels.py
"""

import json
import os
import sys

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)

from dotenv import load_dotenv
from deploy_agent import (
    find_bot, api_get, api_patch, api_post, BOT_NAME,
    TEAMS_SHORT_DESCRIPTION, TEAMS_LONG_DESCRIPTION, TEAMS_ACCENT_COLOR,
    TEAMS_DEVELOPER_NAME, TEAMS_WEBSITE, TEAMS_PRIVACY_URL, TEAMS_TERMS_URL,
)

load_dotenv()

VALID_CHANNELS = {"web", "teams", "copilot"}


def _parse_channels() -> set:
    raw = os.environ.get("AGENT_CHANNELS", "web")
    channels = {c.strip().lower() for c in raw.split(",") if c.strip()}
    invalid = channels - VALID_CHANNELS
    if invalid:
        print(f"❌ AGENT_CHANNELS に不正な値: {', '.join(invalid)}")
        print(f"   有効値: {', '.join(sorted(VALID_CHANNELS))}")
        sys.exit(1)
    return channels


def set_teams_manifest(bot_id: str):
    print("\n=== Teams マニフェスト設定 ===")
    bot_data = api_get(f"bots({bot_id})?$select=applicationmanifestinformation,iconbase64")
    existing_ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
    existing_teams = existing_ami.get("teams", {})

    if TEAMS_SHORT_DESCRIPTION:
        existing_teams["shortDescription"] = TEAMS_SHORT_DESCRIPTION[:80]
    if TEAMS_LONG_DESCRIPTION:
        existing_teams["longDescription"] = TEAMS_LONG_DESCRIPTION[:3400]
    if TEAMS_ACCENT_COLOR:
        existing_teams["accentColor"] = TEAMS_ACCENT_COLOR
    if TEAMS_DEVELOPER_NAME:
        existing_teams["developerName"] = TEAMS_DEVELOPER_NAME[:32]
    if TEAMS_WEBSITE:
        existing_teams["websiteLink"] = TEAMS_WEBSITE
    if TEAMS_PRIVACY_URL:
        existing_teams["privacyLink"] = TEAMS_PRIVACY_URL
    if TEAMS_TERMS_URL:
        existing_teams["termsLink"] = TEAMS_TERMS_URL

    # アイコン: Teams 要件の PNG（colorIcon=192x192 / outlineIcon=32x32、生 Base64）
    try:
        from generate_icon_png import generate_icons
        icons = generate_icons()
        existing_teams["colorIcon"] = icons["color"]["base64"]
        existing_teams["outlineIcon"] = icons["outline"]["base64"]
    except Exception as e:
        print(f"  ⚠️ PNG アイコン生成エラー、iconbase64 をフォールバック使用: {e}")
        icon_b64 = bot_data.get("iconbase64")
        if icon_b64:
            existing_teams["colorIcon"] = icon_b64
            existing_teams["outlineIcon"] = icon_b64

    existing_ami["teams"] = existing_teams
    bot_name_data = api_get(f"bots({bot_id})?$select=name")
    api_patch(f"bots({bot_id})", {
        "name": bot_name_data["name"],
        "applicationmanifestinformation": json.dumps(existing_ami),
    })
    print("  ✅ Teams マニフェスト設定完了")


def enable_copilot_chat(bot_id: str):
    print("\n=== Microsoft 365 Copilot 有効化 ===")
    bot_data = api_get(f"bots({bot_id})?$select=applicationmanifestinformation,name")
    existing_ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
    copilot_chat = existing_ami.get("copilotChat", {})
    copilot_chat["isEnabled"] = True
    existing_ami["copilotChat"] = copilot_chat
    api_patch(f"bots({bot_id})", {
        "name": bot_data["name"],
        "applicationmanifestinformation": json.dumps(existing_ami),
    })
    print("  ✅ Microsoft 365 Copilot 有効化完了")


def set_channels(bot_id: str, channels: set):
    print("\n=== チャネル定義の更新 ===")
    bot_data = api_get(f"bots({bot_id})?$select=configuration")
    config = json.loads(bot_data.get("configuration", "{}") or "{}")
    existing = config.get("channels", [])
    channel_ids = [ch.get("channelId") for ch in existing]

    def _add(channel_id):
        if channel_id not in channel_ids:
            existing.append({
                "id": None, "channelId": channel_id,
                "channelSpecifier": None, "displayName": None,
            })
            channel_ids.append(channel_id)
            print(f"  {channel_id} チャネルを追加")

    if "teams" in channels:
        _add("msteams")
    if "copilot" in channels:
        _add("Microsoft365Copilot")
    # web（DirectLine）は公開すれば既定で利用可能。追加の channel 定義は不要。

    config["channels"] = existing
    api_patch(f"bots({bot_id})", {"configuration": json.dumps(config)})
    print(f"  ✅ チャネル設定更新完了: {channel_ids}")


def publish_bot(bot_id: str):
    print("\n=== 公開 ===")
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  ✅ 公開完了")
    except Exception as e:
        print(f"  ⚠️ 公開でエラー（手動で公開してください）: {e}")


def main():
    channels = _parse_channels()

    print("=" * 60)
    print("  Copilot Studio チャネル選択・公開")
    print(f"  エージェント名: {BOT_NAME}")
    print(f"  対象チャネル: {', '.join(sorted(channels))}")
    print("=" * 60)

    bot_id = find_bot()

    # 認証モードとチャネルの整合性チェック
    bot = api_get(f"bots({bot_id})?$select=authenticationmode")
    if bot.get("authenticationmode") == 2 and (channels & {"teams", "copilot"}):
        print("\n  ⚠️ 現在「認証なし」です。Teams / Copilot チャネルは Microsoft 認証が前提です。")
        print("     Teams / Copilot を使うには set_agent_security.py（AGENT_AUTH_MODE=microsoft）を先に実行してください。")

    if "teams" in channels:
        set_teams_manifest(bot_id)
    if "copilot" in channels:
        enable_copilot_chat(bot_id)
    set_channels(bot_id, channels)
    publish_bot(bot_id)

    print("\n" + "=" * 60)
    print("  ✅ チャネル公開完了!")
    print("=" * 60)
    if "web" in channels:
        print("  ★ Web: Copilot Studio → チャネル → 「Web アプリまたはネイティブアプリ」で埋め込みコードを取得")
    if "teams" in channels:
        print("  ★ Teams: Copilot Studio → チャネル → Teams →「利用可能にする」")
    if "copilot" in channels:
        print("  ★ Copilot: Microsoft 365 Copilot 内でエージェントが利用可能")


if __name__ == "__main__":
    main()
