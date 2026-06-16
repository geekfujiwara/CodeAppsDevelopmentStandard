"""Dataverse MCP クライアントの有効状態を確認する。

VS Code / Copilot CLI 等から Dataverse MCP サーバーへ接続する前に実行し、
利用するクライアント（既定: Microsoft GitHub Copilot）が環境で
有効化されているかを確認する。無効なら有効化手順を案内する。

使い方:
  python .github/skills/standard/scripts/check_mcp_client.py            # GitHub Copilot を確認
  python .github/skills/standard/scripts/check_mcp_client.py cowork     # Cowork を確認
  python .github/skills/standard/scripts/check_mcp_client.py all        # 全クライアント一覧

uniquename エイリアス:
  copilot       -> microsoftgithubcopilot  (VS Code / Copilot CLI)
  cowork        -> microsoftcowork          (M365 Copilot / Cowork)
  studio        -> microsoftcopilotstudio   (Copilot Studio)
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import get_session, DATAVERSE_URL

ALIASES = {
    "copilot": "microsoftgithubcopilot",
    "githubcopilot": "microsoftgithubcopilot",
    "cowork": "microsoftcowork",
    "studio": "microsoftcopilotstudio",
    "copilotstudio": "microsoftcopilotstudio",
    "cli": "dataversemcpcli",
}


def fetch_clients(session):
    url = f"{DATAVERSE_URL}/api/data/v9.2/allowedmcpclients?$select=name,uniquename,applicationid,isenabled"
    r = session.get(url)
    r.raise_for_status()
    return r.json().get("value", [])


def main():
    arg = (sys.argv[1] if len(sys.argv) > 1 else "copilot").lower()
    session = get_session()
    clients = fetch_clients(session)

    if arg == "all":
        print(f"登録済み MCP クライアント: {len(clients)} 件")
        for c in clients:
            mark = "✅" if c.get("isenabled") else "❌"
            print(f"  {mark} {c.get('name')} (uniquename={c.get('uniquename')}, enabled={c.get('isenabled')})")
        return 0

    target_unique = ALIASES.get(arg, arg)
    match = next((c for c in clients if c.get("uniquename") == target_unique), None)

    if match is None:
        print(f"❌ クライアントが見つかりません: uniquename={target_unique}")
        print("   利用可能な uniquename 一覧:")
        for c in clients:
            print(f"     - {c.get('uniquename')} ({c.get('name')})")
        return 2

    if match.get("isenabled"):
        print(f"✅ {match.get('name')} は有効です (uniquename={target_unique})。MCP 接続を続行できます。")
        return 0

    print(f"❌ {match.get('name')} は無効です (uniquename={target_unique})。")
    print("   有効化手順:")
    print("   1. Power Platform 管理センター > 環境 > 該当環境 > 設定")
    print("   2. 製品 > 機能 > Dataverse Model Context Protocol を ON")
    print("   3. 詳細設定 > 該当クライアントのレコードを開き Is Enabled = Yes > 保存")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
