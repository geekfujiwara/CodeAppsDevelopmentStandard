"""
Word日報出力エージェント — メールトリガー設定スクリプト

ユーザーが Copilot Studio UI で以下を手動追加済みの前提:
  - トリガー: 新しいメールが届いたとき (V3) / Office 365 Outlook
  - ツール: メールに返信する (V3) / Office 365 Outlook

このスクリプトが行うこと:
  1. トリガー・ツールの登録状況を確認
  2. GPT Instructions にメール返信指示が残っていないか確認（残っていたら削除）
  3. エージェントを公開（PvaPublish）

※ フローは Copilot Studio UI がトリガー追加時に自動生成するため、
  API でのフロー作成は行わない（うまくいかない — 2026-04-13 検証済み）。
"""
import json
import os
import re
import sys

import requests

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))
from auth_helper import get_token, api_patch, api_post, DATAVERSE_URL


def api_get(path: str, params: dict | None = None) -> dict:
    """Dataverse Web API GET（クエリパラメータ辞書対応）。"""
    url = f"{DATAVERSE_URL}/api/data/v9.2/{path.lstrip('/')}"
    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }
    resp = requests.get(url, headers=headers, params=params)
    resp.raise_for_status()
    return resp.json()

BOT_ID = os.getenv("BOT_ID", "")
BOT_SCHEMA = os.getenv("BOT_SCHEMA", "")

issues_found = []
fixes_applied = []


def check_triggers_and_tools():
    """Step 1: トリガーとツールの確認"""
    print("\n" + "=" * 60)
    print("Step 1: トリガー・ツール確認")
    print("=" * 60)

    # ExternalTriggerComponent（トリガー）
    triggers = api_get(
        "botcomponents",
        {"$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 17",
         "$select": "botcomponentid,schemaname,data,name"}
    )
    trigger_count = len(triggers.get("value", []))
    print(f"  トリガー数: {trigger_count}")
    for t in triggers.get("value", []):
        data_str = t.get("data", "")
        conn_type = ""
        for line in data_str.split("\n"):
            if "triggerConnectionType" in line:
                conn_type = line.split(":")[-1].strip()
                break
        print(f"    - {t.get('name', t.get('schemaname', 'N/A'))} (接続: {conn_type})")

    if trigger_count == 0:
        issues_found.append("トリガーが登録されていません — Copilot Studio UI でトリガーを追加してください")

    # ツール（.action. を含む componenttype=9）
    actions = api_get(
        "botcomponents",
        {"$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 9",
         "$select": "botcomponentid,schemaname,name"}
    )
    tools = [a for a in actions.get("value", []) if ".action." in a.get("schemaname", "")]
    print(f"  ツール数: {len(tools)}")
    for t in tools:
        print(f"    - {t.get('name', t.get('schemaname', 'N/A'))}")

    # メール返信ツールがあるか（Work IQ Mail MCP を優先検出）
    has_mail_mcp = any(
        "mailmcp" in t.get("schemaname", "").lower() or
        "mcp_mailtools" in t.get("data", "").lower() or
        "Work IQ Mail" in t.get("name", "")
        for t in tools
    )
    has_reply_connector = any(
        "reply" in t.get("schemaname", "").lower() or
        "返信" in t.get("name", "")
        for t in tools
    )
    if has_mail_mcp:
        print("  ✅ Work IQ Mail MCP が検出されました（推奨）")
    elif has_reply_connector:
        print("  ⚠️  「メールに返信する (V3)」コネクタが検出されました")
        print("     → Attachments 属性でスタックする問題があります。Work IQ Mail MCP への切替を推奨します")
    else:
        print("  ⚠️  メール返信ツールが見つかりません")
        issues_found.append("Work IQ Mail MCP が追加されていません — Copilot Studio UI で追加してください")


def check_and_fix_instructions():
    """Step 2: GPT Instructions からメール返信指示を削除（残っていれば）"""
    print("\n" + "=" * 60)
    print("Step 2: GPT Instructions 確認")
    print("=" * 60)

    # Bot の configuration から defaultSchemaName を取得
    bot = api_get(f"bots({BOT_ID})", {"$select": "configuration"})
    config = json.loads(bot.get("configuration", "{}") or "{}")
    default_schema = config.get("gPTSettings", {}).get("defaultSchemaName", "")

    # GPT コンポーネントを取得
    gpt_comps = api_get(
        "botcomponents",
        {"$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 15",
         "$select": "botcomponentid,schemaname,data"}
    )

    ui_comp = None
    for comp in gpt_comps.get("value", []):
        if default_schema and comp.get("schemaname") == default_schema:
            ui_comp = comp
            break
    if not ui_comp and gpt_comps.get("value"):
        ui_comp = gpt_comps["value"][0]

    if not ui_comp:
        print("  ❌ GPT コンポーネントが見つかりません")
        return

    data = ui_comp.get("data", "")
    comp_id = ui_comp["botcomponentid"]

    # メール返信指示が Instructions に含まれていないか確認
    mail_patterns = [
        "メールトリガー対応",
        "body/id",
        "triggerOutputs",
    ]
    found_mail_instructions = []
    for pattern in mail_patterns:
        if pattern in data:
            found_mail_instructions.append(pattern)

    if found_mail_instructions:
        print(f"  ⚠️  Instructions にメール関連指示が残っています: {found_mail_instructions}")
        print("  → チャット時にメール誤送信のリスクがあるため削除します")

        new_data = data
        sections_to_remove = [
            r'\n## メールトリガー対応.*?(?=\n## |\naISettings:|\Z)',
            r'\n# メールトリガー対応.*?(?=\n# |\naISettings:|\Z)',
        ]
        for pat in sections_to_remove:
            new_data = re.sub(pat, '', new_data, flags=re.DOTALL)

        if new_data != data:
            api_patch(f"botcomponents({comp_id})", {"data": new_data})
            print("  ✅ メール返信指示を Instructions から削除しました")
            fixes_applied.append("Instructions からメール返信指示を削除")
        else:
            print("  ℹ️  セクション削除対象なし（手動確認推奨）")
            issues_found.append("Instructions にメール関連キーワードあり — Copilot Studio UI で確認を推奨")
    else:
        print("  ✅ Instructions にメール関連指示はありません（正常）")


def publish_agent():
    """Step 3: エージェントを公開"""
    print("\n" + "=" * 60)
    print("Step 3: エージェント公開")
    print("=" * 60)

    try:
        api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  ✅ エージェント公開完了（PvaPublish）")
        fixes_applied.append("エージェント公開（PvaPublish）")
    except Exception as e:
        print(f"  ❌ 公開失敗: {e}")
        issues_found.append("エージェント公開失敗 — Copilot Studio UI で手動公開してください")


def main():
    print("=" * 60)
    print("  Word日報出力 — メールトリガー設定")
    print(f"  Bot: {BOT_SCHEMA} ({BOT_ID})")
    print("=" * 60)

    check_triggers_and_tools()
    check_and_fix_instructions()
    publish_agent()

    # サマリー
    print("\n" + "=" * 60)
    print("  結果サマリー")
    print("=" * 60)

    if fixes_applied:
        print("\n  ✅ 修正・適用:")
        for f in fixes_applied:
            print(f"    - {f}")

    if issues_found:
        print("\n  ⚠️  要対応:")
        for i in issues_found:
            print(f"    - {i}")
    else:
        print("\n  ✅ すべて正常です！")

    print("\n📧 テスト方法:")
    print("  件名に「【日報】」を含むメールを送信してください。")
    print("  エージェントが Word を作成し、結果がメールで返信されます。")


if __name__ == "__main__":
    main()
