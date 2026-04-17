"""
Word日報出力エージェント — メールトリガー動作修正 v2

問題:
  1. Instructions がチャット専用 → メール起動時も質問して応答待ちでスタック
  2. フローの ExecuteCopilot プロンプトにメッセージIDがない → 返信ツールが使えない

修正:
  1. Instructions にメールトリガー用セクションを追加（質問せず即処理）
  2. フローの ExecuteCopilot プロンプトにメッセージID・返信指示を追加
  3. エージェント公開（PvaPublish）
"""
import json
import os
import re
import sys

import requests

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "power-platform-standard"))
from dotenv import load_dotenv
from auth_helper import get_token, api_patch, api_post, DATAVERSE_URL
load_dotenv()

BOT_ID = os.getenv("BOT_ID", "")
FLOW_WORKFLOW_ID = os.getenv("FLOW_WORKFLOW_ID", "")


def api_get(path, params=None):
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


# =================================================================
# Step 1: Instructions にメールトリガー時の動作を追加
# =================================================================
def fix_instructions():
    print("=" * 60)
    print("Step 1: Instructions 修正")
    print("=" * 60)

    bot = api_get(f"bots({BOT_ID})", {"$select": "configuration"})
    config = json.loads(bot.get("configuration", "{}") or "{}")
    default_schema = config.get("gPTSettings", {}).get("defaultSchemaName", "")

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
        return False

    data = ui_comp["data"]
    comp_id = ui_comp["botcomponentid"]

    # 既にメールトリガーセクションがあるか確認 → 削除して新版で置き換え
    if "メールトリガー時の動作" in data:
        print("  ℹ️  既存メールトリガーセクションを削除 → 新版で置換")
        data = re.sub(
            r'\n  # メールトリガー時の動作.*?(?=\n  # [^\s]|\ngptCapabilities:|\nconversationStarters:|\naISettings:|\Z)',
            '',
            data,
            flags=re.DOTALL
        )

    email_section = """
  # メールトリガー時の動作（最重要 — 会話フローとは異なる）
  外部トリガー（メール受信）から起動された場合、入力メッセージに「メッセージID:」が含まれる。
  この場合、以下のルールに**厳守**で従うこと:

  ## 判定方法
  - 入力に「メッセージID:」「差出人:」「件名:」が含まれていたら、メールトリガーからの起動と判断する。

  ## メールトリガー時のルール（厳守）
  1. **ユーザーに一切質問しない**。チャットで返信できないため、質問するとスタックする。
  2. メール本文から日報情報を**自動的に抽出**する。
  3. 不足情報はデフォルト値を使う:
     - 日付: メール受信日（今日）
     - 氏名: 差出人の名前
     - 課題・問題点: メール本文に言及がなければ「なし」
     - 翌日の予定: メール本文に言及がなければ「なし」
     - 所感・連絡事項: メール本文に言及がなければ「なし」
  4. プレビュー表示・最終確認は**スキップ**する。
  5. 即座に Work IQ Word MCP Server を呼び出して Word ファイルを生成する。
  6. Word 生成後、**必ず「メールに返信する (V3)」ツールを呼び出してメール返信する**。
     - メッセージID: 入力に含まれる「メッセージID:」の値をそのまま使用する。
     - 件名: 「Re: 」+ 元の件名
     - 本文: 生成した Word ファイルのリンク（OneDrive URL）を含む HTML メール。
       例: 「日報を作成しました。<a href='(生成されたWord URL)'>日報_YYYY-MM-DD.docx</a> をご確認ください。」
     - ReplyAll: false
  7. 「メールに返信する (V3)」ツールが**実行されなければ処理未完了**とみなす。必ず実行すること。

  ## メールトリガー時の処理順序（この順番を厳守）
  1. メール本文を解析 → 日報情報を抽出（質問しない）
  2. Work IQ Word MCP Server で Word 生成
  3. 「メールに返信する (V3)」で元メールに返信（生成された Word リンクを本文に含める）
  4. 完了"""

    # gptCapabilities: の前に挿入
    if "\ngptCapabilities:" in data:
        data = data.replace(
            "\ngptCapabilities:",
            f"{email_section}\n\ngptCapabilities:"
        )
    elif "\nconversationStarters:" in data:
        data = data.replace(
            "\nconversationStarters:",
            f"{email_section}\n\nconversationStarters:"
        )
    elif "\naISettings:" in data:
        data = data.replace(
            "\naISettings:",
            f"{email_section}\n\naISettings:"
        )
    else:
        data += email_section

    api_patch(f"botcomponents({comp_id})", {"data": data})
    print("  ✅ Instructions にメールトリガーセクションを追加しました")
    return True


# =================================================================
# Step 2: フローの ExecuteCopilot プロンプトを修正
# =================================================================
def fix_flow_prompt():
    print("\n" + "=" * 60)
    print("Step 2: フローの ExecuteCopilot プロンプト修正")
    print("=" * 60)

    flow = api_get(
        f"workflows({FLOW_WORKFLOW_ID})",
        {"$select": "workflowid,name,clientdata,statecode"}
    )

    state_label = "Active" if flow.get("statecode") == 1 else "Draft"
    print(f"  フロー: {flow.get('name')} ({state_label})")

    cd_raw = flow.get("clientdata", "")
    if not cd_raw:
        print("  ❌ clientdata がありません")
        return False

    cd = json.loads(cd_raw)
    actions = cd.get("properties", {}).get("definition", {}).get("actions", {})

    found = False
    for aname, adef in actions.items():
        host = adef.get("inputs", {}).get("host", {})
        if host.get("operationId") == "ExecuteCopilot":
            old_msg = adef["inputs"]["parameters"].get("body/message", "")
            print(f"  現在のプロンプト: {repr(old_msg[:120])}")

            new_msg = (
                "以下のメールを受信しました。メール本文から日報情報を抽出し、"
                "Word日報を作成して「メールに返信する (V3)」ツールで返信してください。"
                "質問はせず、即座に処理してください。\n\n"
                "メッセージID: @{triggerOutputs()?['body/id']}\n"
                "差出人: @{triggerOutputs()?['body/from']}\n"
                "件名: @{triggerOutputs()?['body/subject']}\n"
                "受信日時: @{triggerOutputs()?['body/dateTimeReceived']}\n"
                "本文:\n@{triggerOutputs()?['body/body']}"
            )

            adef["inputs"]["parameters"]["body/message"] = new_msg
            found = True
            break

    if not found:
        print("  ❌ ExecuteCopilot アクションが見つかりません")
        return False

    new_cd = json.dumps(cd, ensure_ascii=False)
    token = get_token()
    url = f"{DATAVERSE_URL}/api/data/v9.2/workflows({FLOW_WORKFLOW_ID})"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }
    resp = requests.patch(url, headers=headers, json={"clientdata": new_cd})
    if resp.status_code < 300:
        print("  ✅ ExecuteCopilot プロンプトを更新しました")
        print("  → メッセージID + 差出人 + 件名 + 本文 + 返信指示")
        return True
    else:
        print(f"  ❌ フロー更新失敗: {resp.status_code}")
        print(f"  {resp.text[:500]}")
        return False


# =================================================================
# Step 3: エージェント公開
# =================================================================
def publish_agent():
    print("\n" + "=" * 60)
    print("Step 3: エージェント公開")
    print("=" * 60)

    try:
        api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  ✅ エージェント公開完了（PvaPublish）")
        return True
    except Exception as e:
        print(f"  ❌ 公開失敗: {e}")
        return False


def main():
    print("=" * 60)
    print("  Word日報出力 — メールトリガー動作修正 v2")
    print("=" * 60)

    ok1 = fix_instructions()
    ok2 = fix_flow_prompt()
    ok3 = publish_agent()

    print("\n" + "=" * 60)
    print("  結果サマリー")
    print("=" * 60)
    print(f"  Instructions 修正: {'✅' if ok1 else '❌'}")
    print(f"  フロープロンプト修正: {'✅' if ok2 else '❌'}")
    print(f"  エージェント公開: {'✅' if ok3 else '❌'}")

    if ok1 and ok2 and ok3:
        print("\n  ✅ すべて完了！")
        print("\n  📧 テスト: 件名に「【日報】」を含むメールを送信してください。")
        print("  → 質問せずに即座に Word を生成し、メールで返信されるはずです。")


if __name__ == "__main__":
    main()
