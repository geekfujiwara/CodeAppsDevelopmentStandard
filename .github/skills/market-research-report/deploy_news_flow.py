"""
ニュースレポーター — スケジュールトリガーフローの検索・設定更新

ユーザーが Copilot Studio UI で Recurrence トリガーを追加した後、
自動作成されたフローを検索し、ExecuteCopilot のプロンプトとスケジュール設定を更新する。

前提:
  - Copilot Studio UI でエージェントに Recurrence トリガーが追加済み
  - トリガー追加によりフローが自動作成されている

Usage:
  python .github/skills/market-research-report/deploy_news_flow.py <BOT_ID or URL>
"""

import json
import os
import re
import sys

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "power-platform-standard"))

import requests
from dotenv import load_dotenv
from auth_helper import DATAVERSE_URL, get_token, api_get, api_patch

load_dotenv()

SOLUTION_NAME = os.getenv("SOLUTION_NAME", "IncidentManagement")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")

# ── スケジュール設定 ──
FREQUENCY = "Hour"
INTERVAL = 4

# ── ExecuteCopilot プロンプト ──
INDUSTRY = "IT・テクノロジー"
ROLE = "エンジニアリングマネージャー"
INTERESTS = "AI・クラウド・セキュリティに関する最新動向をまとめ、チームへの影響と対処方法を報告する必要がある"


# ── Bot 検索 ──────────────────────────────────────────────

def find_bot():
    """コマンドライン引数または名前から Bot ID と schemaname を取得"""
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        match = re.search(r'/bots/([0-9a-f-]{36})', arg)
        bot_id = match.group(1) if match else arg.strip()
        bot = api_get(f"bots({bot_id})?$select=botid,schemaname,name")
        print(f"  Bot: {bot['name']} ({bot['schemaname']})")
        return bot["botid"], bot["schemaname"]

    result = api_get("bots?$filter=name eq 'ニュースレポーター'&$select=botid,schemaname,name")
    if result.get("value"):
        b = result["value"][0]
        print(f"  Bot: {b['name']} ({b['schemaname']})")
        return b["botid"], b["schemaname"]

    print("  ❌ Bot が見つかりません")
    print("  Usage: python .github/skills/market-research-report/deploy_news_flow.py <BOT_ID or URL>")
    sys.exit(1)


# ── フロー検索 ─────────────────────────────────────────────

def _check_flow_match(clientdata_str: str, bot_schema: str) -> bool:
    """フローの clientdata が Recurrence + ExecuteCopilot(bot_schema) を含むか"""
    try:
        cd = json.loads(clientdata_str)
        definition = cd.get("properties", {}).get("definition", {})
        triggers = definition.get("triggers", {})
        actions = definition.get("actions", {})

        has_recurrence = any(
            t.get("type") == "Recurrence" for t in triggers.values()
        )
        if not has_recurrence:
            return False

        # ExecuteCopilot で該当 bot を呼んでいるか（文字列マッチ）
        actions_str = json.dumps(actions, ensure_ascii=False)
        has_copilot = "ExecuteCopilot" in actions_str and bot_schema in actions_str
        return has_copilot
    except (json.JSONDecodeError, KeyError, AttributeError):
        return False


def find_trigger_flow(bot_id: str, bot_schema: str) -> dict | None:
    """Bot に紐づくスケジュールトリガーフローを検索"""

    # 方法 1: ExternalTriggerComponent (componenttype=17) から関連フローを探す
    print("\n  --- ExternalTriggerComponent 検索 ---")
    triggers = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{bot_id}' and componenttype eq 17"
        "&$select=botcomponentid,name,schemaname,data"
    )
    for t in triggers.get("value", []):
        schema = t.get("schemaname", "")
        if "RecurringCopilotTrigger" in schema or "Schedule" in schema:
            print(f"  トリガーコンポーネント発見: {schema}")
            # data から workflowId を抽出
            data = t.get("data", "")
            wf_match = re.search(r'workflowId:\s*([0-9a-f-]{36})', data)
            if wf_match:
                wf_id = wf_match.group(1)
                print(f"  → workflowId: {wf_id}")
                try:
                    flow = api_get(
                        f"workflows({wf_id})?$select=workflowid,name,clientdata,statecode,statuscode"
                    )
                    return flow
                except Exception:
                    print(f"  → フロー取得失敗、workflows テーブルを検索")

    # 方法 2: workflows テーブルを検索（Active → Draft の順）
    print("\n  --- workflows テーブル検索 ---")
    for state_label, state_filter in [("Active", "statecode eq 1"), ("Draft", "statecode eq 0")]:
        flows = api_get(
            f"workflows?$filter=category eq 5 and {state_filter}"
            "&$select=workflowid,name,clientdata,statecode,statuscode"
            "&$orderby=createdon desc"
            "&$top=30"
        )
        for f in flows.get("value", []):
            cd = f.get("clientdata", "")
            if cd and _check_flow_match(cd, bot_schema):
                print(f"  フロー発見 ({state_label}): {f['name']} ({f['workflowid']})")
                return f

    return None


# ── フロー更新 ─────────────────────────────────────────────

def update_flow(flow: dict, bot_schema: str):
    """フローの ExecuteCopilot プロンプトとスケジュール設定を更新"""
    wf_id = flow["workflowid"]
    cd = json.loads(flow["clientdata"])
    definition = cd["properties"]["definition"]

    # スケジュール更新
    for trigger_name, trigger in definition.get("triggers", {}).items():
        if trigger.get("type") == "Recurrence":
            trigger["recurrence"]["frequency"] = FREQUENCY
            trigger["recurrence"]["interval"] = INTERVAL
            print(f"  スケジュール更新: {FREQUENCY} / {INTERVAL}")

    # ExecuteCopilot プロンプト更新
    # ★ トリガープロンプトは GPT Instructions より優先されるため、
    #   全ステップ（RSS→Web検索→メール送信）を明示的に指示する。
    #   コンテキスト情報だけ渡すとエージェントは最初のツール（RSS）しか実行しない。
    prompt_message = (
        f"以下の条件でニュースレポートを作成し、メールで送信してください。\n"
        f"全ステップを必ず最後まで実行すること。途中で止めないでください。\n\n"
        f"自社の業界: {INDUSTRY}\n"
        f"自分の業務: {ROLE}\n"
        f"関心: {INTERESTS}\n\n"
        f"実行手順:\n"
        f"1. 上記の業界・関心に基づいてキーワードを決め、RSSで最新ニュースを検索する\n"
        f"2. 重要な記事についてWeb検索で詳細情報を調べる\n"
        f"3. レポートを作成する\n"
        f"4. 作成したレポートをHTML形式のメールで送信する（宛先: {ADMIN_EMAIL}）\n"
        f"必ずメール送信まで完了すること。"
    )
    for action_name, action in definition.get("actions", {}).items():
        host = action.get("inputs", {}).get("host", {})
        if host.get("operationId") == "ExecuteCopilot":
            action["inputs"]["parameters"]["body/message"] = prompt_message
            print(f"  プロンプト更新: {INDUSTRY} / {ROLE}")

    # PATCH
    api_patch(f"workflows({wf_id})", {
        "clientdata": json.dumps(cd, ensure_ascii=False),
    })
    print(f"\n  ✅ フロー更新完了: {wf_id}")


# ── メイン ─────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  ニュースレポーター — スケジュールフロー検索・設定更新")
    print("=" * 60)

    bot_id, bot_schema = find_bot()
    flow = find_trigger_flow(bot_id, bot_schema)

    if not flow:
        print("\n  ❌ スケジュールトリガーフローが見つかりません。")
        print()
        print("  Copilot Studio UI でトリガーを追加してください:")
        print("    1. エージェント → 左メニュー「トリガー」")
        print("    2. 「+ トリガーの追加」→ 「Recurrence」を選択")
        print("    3. フローが自動作成されるまで待つ")
        print("    4. 再実行: python .github/skills/market-research-report/deploy_news_flow.py <BOT_ID or URL>")
        sys.exit(1)

    update_flow(flow, bot_schema)

    print("\n" + "=" * 60)
    print("  ✅ 完了！")
    print("=" * 60)
    print()
    print("  ★ Power Automate UI でフローを有効化:")
    print("    1. https://make.powerautomate.com を開く")
    print(f"    2. フロー「{flow['name']}」を開く")
    print("    3. 接続を認証 →「オンにする」")
    print()
    print("  ★ Copilot Studio UI でエージェントを公開:")
    print("    1. 右上の「公開」ボタンをクリック")


if __name__ == "__main__":
    main()
