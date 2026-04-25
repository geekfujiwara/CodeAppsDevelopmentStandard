"""
ニュースレポーター — Copilot Studio エージェント設定スクリプト

market-research-report スキルに基づく情報収集エージェントの構築:
  → カスタムトピック全削除 → 生成オーケストレーション有効化
  → GPT Instructions (5 ステップ + HTML メールテンプレート仕様) 設定
  → 会話の開始メッセージ + クイック返信 設定
  → アイコン設定 → 公開 → チャネル設定

前提:
  - Copilot Studio UI でエージェントを事前に作成済み
  - .env に NEWS_BOT_ID を指定
"""

import json
import os
import re
import sys
import time

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))

import requests
from dotenv import load_dotenv
from auth_helper import get_token, DATAVERSE_URL as _DV_URL

load_dotenv()

# ── 環境変数 ────────────────────────────────────────────────
DATAVERSE_URL = _DV_URL
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", "インシデント管理")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")

BOT_NAME = "ニュースレポーター"
BOT_SCHEMA = f"{PREFIX}_newsreporter"

TENANT_ID = os.environ.get("TENANT_ID", "")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")

# ── API ヘルパー ─────────────────────────────────────────

def get_headers() -> dict:
    token = get_token()
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "MSCRM.SolutionName": SOLUTION_NAME,
    }

def api_get(path, params=None):
    r = requests.get(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                     headers=get_headers(), params=params)
    r.raise_for_status()
    return r.json()

def api_post(path, body):
    r = requests.post(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                      headers=get_headers(), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r

def api_patch(path, body):
    r = requests.patch(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                       headers=get_headers(), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r

def api_delete(path):
    r = requests.delete(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                        headers=get_headers())
    r.raise_for_status()
    return r

# ── GPT Instructions (5 ステップ + HTML メールテンプレート) ──

GPT_INSTRUCTIONS = f"""\
あなたはニュースレポーターエージェントです。以下の5つのステップを必ず順番に全て実行してください。ステップを飛ばさないでください。

Step1 検索キーワードを決める
ユーザーの業界・役割・関心事から、ニュース検索用のキーワードを2個だけ決める。

Step2 RSSで検索する（1回だけ呼び出す）
RSSツールを1回だけ呼び出し、2つのキーワードをスペースで結合した1つの検索クエリで検索する。
例: キーワードが「AI」「セキュリティ」なら、feedUrlに「AI セキュリティ」を含む1つのURLで検索する。
RSSツールの呼び出しは合計1回のみ。複数回呼び出してはいけない。

Step3 Web検索で記事の詳細を調べる（必須）
このステップは必ず実行すること。スキップ禁止。
Step2で取得した記事の中から重要な記事を3〜5件選び、それぞれについてWeb検索を使って詳細情報や一次ソースを確認する。

Step4 レポートを作成する
収集した情報から、ユーザーの業界・役割に関連する記事を3〜5件選んでレポートを作成する。各記事について以下を整理する:
- 記事タイトル
- 記事URL（元ソースへのリンク）
- 本文の要約（3〜5文）
- なぜこの記事を選定したか（業界・役割との関連性）
- 考えられるアクションの例（具体的な次のステップ）
最後にエグゼクティブサマリー（全体の総括・3〜5文）を作成する。

Step5 HTMLメールを送信する（必須）
このステップは必ず実行すること。スキップ禁止。
Work IQ MCPのメール送信ツールを使って、Step4で作成したレポートをHTML形式のメールで送信する。
宛先: {ADMIN_EMAIL}
件名: 【AIニュースレポート】と日付と業界の最新動向を組み合わせた件名にする

## メール HTML テンプレート仕様（Step5 で使用）

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。

### 構成
1. ヘッダー: 背景色は単色 #1e3a5f（グラデーション禁止・メール非対応のため）、白文字(#ffffff)。タイトルはニュース内容を反映した要約見出し（例:「AI規制強化とクラウドセキュリティの最新動向」）にする。「AI ニュースレポート」等の汎用タイトルは使わない。日付と業界名も表示する。
2. エグゼクティブサマリー: 左青ボーダー4px #2563eb、薄青背景(#eff6ff)の総括カード。見出し「📋 エグゼクティブサマリー」
3. 記事カード（各記事を繰り返し）:
   - 番号バッジ(白文字、青丸背景 #2563eb、角丸20px) + タイトル(18px 太字 #0f172a)
   - 🔗 元記事リンク（色 #2563eb、テキスト「🔗 元記事を読む ↗」）
   - 📝 要約（灰背景 #f1f5f9、角丸10px）本文 3〜5 文
   - 🎯 選定理由（黄背景 #fef3c7）なぜこの記事が重要か
   - 💡 推奨アクション（緑背景 #dcfce7）箇条書き(ul/li) 2〜3 個
   - 記事間は区切り線(1px #e2e8f0)、最後の記事には不要
4. フッター: 背景 #f8fafc、テキスト「このレポートは AI エージェントにより自動生成されました」色 #64748b 12px

### スタイル要件
- 最大幅 680px、角丸 16px、白背景カード、box-shadow
- フォント: Segoe UI, Helvetica Neue, Arial, sans-serif
- 各セクションは角丸 10px カードで視覚的に区切る
- ラベル(📝 要約 等)は 12px 太字 uppercase letter-spacing 1px"""

# ── 推奨プロンプト ─────────────────────────────────────────
PREFERRED_PROMPTS = [
    {"title": "最新ニュースを教えて", "text": "今日の主要なニュースを教えてください。"},
    {"title": "ジャンル別ニュース", "text": "テクノロジー分野の最新ニュースをまとめてください。"},
    {"title": "要約を依頼", "text": "このニュース記事の要点を簡単にまとめてください。"},
    {"title": "解説を依頼", "text": "このニュースの背景やポイントを解説してください。"},
    {"title": "カスタマイズ依頼", "text": "私の興味に合わせてニュースを配信してください。"},
]

QUICK_REPLIES = [
    "最新ニュースを教えて",
    "テクノロジーニュース",
    "AI の最新動向",
    "セキュリティニュース",
]

GREETING_MESSAGE = "こんにちは！最新ニュースの収集・分析をお手伝いする ニュースレポーター です。気になるトピックを教えてください。自動配信もスケジュールで実行中です。"

BOT_DESCRIPTION = "最新ニュースを自動収集し、業界・ビジネスに関連する分析レポートを HTML メールで定期配信するエージェントです。RSS + Web 検索 + Work IQ MCP を活用します。"

TEAMS_SHORT_DESCRIPTION = "最新ニュースを自動収集・分析し HTML レポートで配信"
TEAMS_LONG_DESCRIPTION = (
    "ニュースレポーターは、最新ニュースを自動収集し、業界に関連する分析レポートを HTML メールで定期配信するエージェントです。\n\n"
    "【主な機能】\n"
    "・RSS フィードからの最新ニュース自動収集\n"
    "・Web 検索による詳細情報の確認\n"
    "・業界・役割に合わせたレポート作成\n"
    "・リッチな HTML メールでの自動配信\n"
    "・エグゼクティブサマリー、選定理由、推奨アクション付き\n\n"
    "スケジュールトリガーで定期実行し、チャットでも対話的に利用できます。"
)
TEAMS_ACCENT_COLOR = "#1e40af"
TEAMS_DEVELOPER_NAME = "GeekFujiwara"

# ── PVA YAML ビルダー ──────────────────────────────────────

def _build_gpt_yaml() -> str:
    """PVA 互換 YAML を構築。gptCapabilities.webBrowsing: true を含む。"""
    inst_block = "\n".join(f"  {line}" for line in GPT_INSTRUCTIONS.splitlines())

    starter_lines = []
    for p in PREFERRED_PROMPTS:
        starter_lines.append(f"  - title: {p['title']}")
        starter_lines.append(f"    text: {p['text']}")
    starters_block = "\n\n".join(starter_lines)

    return (
        "kind: GptComponentMetadata\n\n"
        f"displayName: {BOT_NAME}\n\n"
        f"instructions: |-\n{inst_block}\n\n"
        "gptCapabilities:\n\n"
        "  webBrowsing: true\n\n"
        "  codeInterpreter: false\n\n"
        f"conversationStarters:\n\n{starters_block}\n\n"
    )

GPT_YAML = _build_gpt_yaml()

# ── 環境 ID 取得 ──────────────────────────────────────────

def _get_environment_id() -> str:
    """DATAVERSE_URL から環境 ID を取得"""
    try:
        result = api_get("RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')")
        return result.get("EnvironmentId", "")
    except Exception:
        return ""

# ── Bot 検索 ─────────────────────────────────────────────

def _extract_bot_id(value: str) -> str | None:
    match = re.search(r'/bots/([0-9a-f-]{36})', value)
    if match:
        return match.group(1)
    match = re.fullmatch(r'[0-9a-f-]{36}', value.strip())
    if match:
        return value.strip()
    return None

def find_bot() -> str:
    print("\n=== Step 1: Bot 検索 ===")
    # コマンドライン引数から Bot ID / URL を取得
    if len(sys.argv) > 1:
        bot_id = _extract_bot_id(sys.argv[1])
        if bot_id:
            print(f"  引数から取得: {bot_id}")
            return bot_id

    # 名前で検索
    existing = api_get("bots", {"$filter": f"name eq '{BOT_NAME}'", "$select": "botid,name"})
    if existing.get("value"):
        bot_id = existing["value"][0]["botid"]
        print(f"  既存 Bot 発見: {bot_id}")
        return bot_id

    sol_label = f"{SOLUTION_DISPLAY_NAME}（スキーマ名: {SOLUTION_NAME}）"
    print("  ❌ Bot が見つかりません。")
    print()
    print("  Usage: python .github/skills/copilot-studio/scripts/deploy_news_agent.py <BOT_ID or URL>")
    print()
    print("  Copilot Studio UI でエージェントを作成してください:")
    print(f"    1. https://copilotstudio.microsoft.com/ にアクセス")
    print(f"    2. 「+ 作成」→ エージェント名: {BOT_NAME}")
    print(f"    3. 「エージェント設定 (オプション)」を展開:")
    print(f"       - 言語: 日本語 (日本)")
    print(f"       - ソリューション: {sol_label}")
    print(f"       - スキーマ名: {BOT_SCHEMA}")
    print(f"    4. 「作成」→ ロード完了まで待つ")
    print(f"    5. 再実行: python .github/skills/copilot-studio/scripts/deploy_news_agent.py <ブラウザURL or GUID>")
    sys.exit(1)

# ── プロビジョニング待ち ──────────────────────────────────

def _wait_for_provisioning(bot_id: str, timeout: int = 120) -> bool:
    print("\n=== Step 1.5: プロビジョニング待ち ===")
    elapsed = 0
    while elapsed < timeout:
        topics = api_get("botcomponents",
                         {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 1",
                          "$select": "botcomponentid"})
        if topics.get("value"):
            print(f"  完了（{elapsed}秒）")
            return True
        gpt = api_get("botcomponents",
                      {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                       "$select": "botcomponentid"})
        if gpt.get("value"):
            print(f"  完了 — GPT コンポーネント検出（{elapsed}秒）")
            return True
        print(f"  待機中... ({elapsed}/{timeout}秒)")
        time.sleep(10)
        elapsed += 10
    print(f"  ⚠️ {timeout}秒タイムアウト")
    return False

# ── アイコン設定 ──────────────────────────────────────────

def set_icon(bot_id: str):
    print("\n=== Step 1.1: アイコン設定 ===")
    from generate_news_icon import generate_news_icons
    icons = generate_news_icons()

    icon_b64 = icons["main"]["base64"]
    bot_info = api_get(f"bots({bot_id})?$select=name")
    api_patch(f"bots({bot_id})", {"name": bot_info["name"], "iconbase64": icon_b64})
    print(f"  ✅ iconbase64 設定完了 ({icons['main']['dimensions']})")

# ── カスタムトピック削除 ──────────────────────────────────

PROTECTED_TOPIC_PATTERNS = [
    "ConversationStart", "Escalate", "Fallback", "OnError",
    "EndofConversation", "MultipleTopicsMatched", "Search",
    "Signin", "ResetConversation", "StartOver",
]

def delete_custom_topics(bot_id: str):
    print("\n=== Step 2: カスタムトピック削除 ===")
    topics = api_get("botcomponents",
                     {"$filter": f"_parentbotid_value eq '{bot_id}' and (componenttype eq 1 or componenttype eq 9)",
                      "$select": "botcomponentid,name,schemaname,componenttype"})
    count = 0
    for topic in topics.get("value", []):
        schema = topic.get("schemaname", "")
        if any(p in schema for p in PROTECTED_TOPIC_PATTERNS):
            print(f"  保護: {topic['name']} ({schema})")
            continue
        if ".action." in schema:
            print(f"  保護: {topic['name']} ({schema})")
            continue
        try:
            api_delete(f"botcomponents({topic['botcomponentid']})")
            print(f"  削除: {topic['name']}")
            count += 1
        except Exception as e:
            print(f"  スキップ: {topic['name']} ({e})")
    print(f"  {count} 件削除")

# ── 生成オーケストレーション有効化 ─────────────────────────

def _deep_merge(base: dict, override: dict) -> dict:
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result

def enable_generative_orchestration(bot_id: str) -> dict:
    print("\n=== Step 3: 生成オーケストレーション有効化 ===")
    bot_data = api_get(f"bots({bot_id})?$select=configuration")
    existing_config = json.loads(bot_data.get("configuration", "{}") or "{}")

    overrides = {
        "$kind": "BotConfiguration",
        "settings": {"GenerativeActionsEnabled": True},
        "aISettings": {
            "$kind": "AISettings",
            "useModelKnowledge": False,
            "isFileAnalysisEnabled": True,
            "isSemanticSearchEnabled": True,
            "contentModeration": "High",
            "optInUseLatestModels": False,
        },
        "recognizer": {"$kind": "GenerativeAIRecognizer"},
    }

    merged = _deep_merge(existing_config, overrides)
    api_patch(f"bots({bot_id})", {"configuration": json.dumps(merged)})
    print("  ✅ 生成オーケストレーション有効化完了")
    return existing_config

# ── Instructions 設定 ─────────────────────────────────────

def set_gpt_instructions(bot_id: str, saved_config: dict) -> str | None:
    print("\n=== Step 4: Instructions 設定 ===")
    default_schema = saved_config.get("gPTSettings", {}).get("defaultSchemaName", "")
    print(f"  defaultSchemaName: {default_schema or '(なし)'}")

    existing = api_get("botcomponents",
                       {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                        "$select": "botcomponentid,name,schemaname,data"})
    comps = existing.get("value", [])

    ui_comp = None
    extra_comps = []
    for comp in comps:
        if default_schema and comp.get("schemaname") == default_schema:
            ui_comp = comp
        else:
            extra_comps.append(comp)

    if ui_comp is None and comps:
        ui_comp = comps[0]
        extra_comps = comps[1:]

    for comp in extra_comps:
        try:
            api_delete(f"botcomponents({comp['botcomponentid']})")
            print(f"  余分な GPT コンポーネント削除: {comp.get('schemaname')}")
        except Exception:
            pass

    if ui_comp:
        comp_id = ui_comp["botcomponentid"]
        existing_data = ui_comp.get("data", "")
        ai_settings_section = ""
        ai_idx = existing_data.find("\naISettings:")
        if ai_idx < 0:
            ai_idx = existing_data.find("aISettings:")
        if ai_idx >= 0:
            ai_settings_section = existing_data[ai_idx:].rstrip()
            print(f"  既存 aISettings 保持: {ai_settings_section[:80]}...")

        final_yaml = GPT_YAML.rstrip("\n") + "\n\n" + ai_settings_section + "\n\n" if ai_settings_section else GPT_YAML
        api_patch(f"botcomponents({comp_id})", {"data": final_yaml})
        print(f"  ✅ Instructions 更新: {comp_id}")
        return comp_id
    else:
        schema_name = default_schema or f"{BOT_SCHEMA}.gpt.default"
        api_post("botcomponents", {
            "name": BOT_NAME,
            "schemaname": schema_name,
            "componenttype": 15,
            "data": GPT_YAML,
            "parentbotid@odata.bind": f"/bots({bot_id})",
        })
        print(f"  ✅ Instructions 新規作成: {schema_name}")
        return None

# ── 会話の開始設定 ────────────────────────────────────────

def set_quick_replies(bot_id: str):
    print("\n=== Step 4.5: 会話の開始設定 ===")
    result = api_get("botcomponents", {
        "$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 9 and contains(schemaname,'ConversationStart')",
        "$select": "botcomponentid,schemaname,data",
    })
    topics = result.get("value", [])
    if not topics:
        print("  ⚠️ ConversationStart 未検出")
        return

    topic = topics[0]
    topic_id = topic["botcomponentid"]
    existing_data = topic.get("data", "")

    id_match = re.search(r'id:\s+(sendMessage_\w+)', existing_data)
    send_id = id_match.group(1) if id_match else "sendMessage_auto01"

    greeting_oneline = GREETING_MESSAGE.replace('\n', ' ')

    lines = [
        "kind: AdaptiveDialog",
        "beginDialog:",
        "  kind: OnConversationStart",
        "  id: main",
        "  actions:",
        "    - kind: SendActivity",
        f"      id: {send_id}",
        "      activity:",
        "        text:",
        f"          - {greeting_oneline}",
        "        speak:",
        f'          - "{greeting_oneline}"',
        "        quickReplies:",
    ]
    for qr in QUICK_REPLIES:
        lines.append(f"          - kind: MessageBack")
        lines.append(f"            text: {qr}")

    new_data = "\n\n".join(lines) + "\n\n"
    api_patch(f"botcomponents({topic_id})", {"data": new_data})
    print(f"  ✅ 挨拶 + クイック返信 {len(QUICK_REPLIES)} 件設定")

# ── 中間公開（説明設定用） ────────────────────────────────

def publish_bot(bot_id: str):
    """説明設定のための中間公開（data PATCH 非同期処理対策）"""
    print("\n=== Step 5: 中間公開（説明設定準備） ===")
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  ✅ 中間公開完了")
    except Exception as e:
        print(f"  ⚠️ 中間公開エラー: {e}")

# ── 説明設定 ──────────────────────────────────────────────

def set_description(bot_id: str, comp_id: str | None):
    print("\n=== Step 6: 説明設定 ===")
    if not comp_id:
        existing = api_get("botcomponents",
                           {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                            "$select": "botcomponentid"})
        if existing.get("value"):
            comp_id = existing["value"][0]["botcomponentid"]
    if comp_id:
        api_patch(f"botcomponents({comp_id})", {"description": BOT_DESCRIPTION})
        print(f"  ✅ 説明設定完了")

# ── チャネル設定 ──────────────────────────────────────────

def set_channel_manifest(bot_id: str):
    print("\n=== Step 7: Teams / Copilot チャネル公開設定 ===")
    bot_data = api_get(f"bots({bot_id})?$select=applicationmanifestinformation,name")
    existing_ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
    teams = existing_ami.get("teams", {})

    teams["shortDescription"] = TEAMS_SHORT_DESCRIPTION[:80]
    teams["longDescription"] = TEAMS_LONG_DESCRIPTION[:3400]
    teams["accentColor"] = TEAMS_ACCENT_COLOR
    teams["developerName"] = TEAMS_DEVELOPER_NAME[:32]

    try:
        from generate_news_icon import generate_news_icons
        icons = generate_news_icons()
        teams["colorIcon"] = icons["color"]["base64"]
        teams["outlineIcon"] = icons["outline"]["base64"]
        print(f"  colorIcon: {icons['color']['dimensions']}, outlineIcon: {icons['outline']['dimensions']}")
    except Exception as e:
        print(f"  ⚠️ アイコン生成エラー: {e}")

    existing_ami["teams"] = teams
    copilot_chat = existing_ami.get("copilotChat", {})
    copilot_chat["isEnabled"] = True
    existing_ami["copilotChat"] = copilot_chat

    api_patch(f"bots({bot_id})", {
        "name": bot_data["name"],
        "applicationmanifestinformation": json.dumps(existing_ami),
    })
    print("  ✅ チャネル設定完了")

def setup_channels(bot_id: str):
    """Teams / M365 Copilot チャネルを構成（公開はユーザーが手動で実施）"""
    print("\n=== Step 8: チャネル構成 ===")
    bot_data = api_get(f"bots({bot_id})?$select=configuration")
    config = json.loads(bot_data.get("configuration", "{}") or "{}")
    channels = config.get("channels", [])
    channel_ids = [ch.get("channelId") for ch in channels]

    for ch_id in ["msteams", "Microsoft365Copilot"]:
        if ch_id not in channel_ids:
            channels.append({"id": None, "channelId": ch_id, "channelSpecifier": None, "displayName": None})
            print(f"  {ch_id} チャネル追加")

    config["channels"] = channels
    api_patch(f"bots({bot_id})", {"configuration": json.dumps(config)})
    print("  ✅ チャネル構成完了（公開は手動で実施）")

# ── メイン ────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  ニュースレポーター — エージェントデプロイ")
    print("=" * 60)

    bot_id = find_bot()
    _wait_for_provisioning(bot_id)
    set_icon(bot_id)
    delete_custom_topics(bot_id)
    saved_config = enable_generative_orchestration(bot_id)
    comp_id = set_gpt_instructions(bot_id, saved_config)
    set_quick_replies(bot_id)
    publish_bot(bot_id)
    set_description(bot_id, comp_id)
    set_channel_manifest(bot_id)
    setup_channels(bot_id)

    print("\n" + "=" * 60)
    print("  ✅ エージェントデプロイ完了!")
    print("=" * 60)
    print()
    print("  ★ Step 1: Copilot Studio UI で手動設定（まとめて実施）")
    print()
    print("  1-a. 基盤モデル選択:")
    print("       → 設定 → 生成 AI → 「Anthropic Claude Sonnet 4.6」を選択")
    print()
    print("  1-b. Web 検索の確認:")
    print("       → 設定 → 生成 AI → 「Web コンテンツ」がオンか確認")
    print("       （スクリプトで gptCapabilities.webBrowsing: true を設定済み。")
    print("        UI 側でもオンになっていることを確認してください）")
    print()
    print("  1-c. RSS ツール追加:")
    print("       → ツール → + ツールの追加 → コネクタ → 「RSS」を検索")
    print("       → 「すべての RSS フィード項目を一覧表示します」を追加")
    print("       → ★ feedUrl の「説明」に以下を入力:")
    print("         https://news.google.com/rss/search?q={{検索キーワード}}&hl=ja&gl=JP&ceid=JP%3Aja")
    print()
    print("  1-d. Work IQ Mail MCP ツール追加:")
    print("       → ツール → + ツールの追加 → コネクタ → 「Microsoft 365 Outlook Mail」を検索")
    print("       → 「Work IQ Mail (Preview)」を追加 → 接続を認証")
    print()
    print("  1-e. Recurrence トリガー追加:")
    print("       → トリガー → + トリガーの追加 → 「Recurrence」を選択")
    print("       （フローが自動作成されます）")
    print()
    print("  ★ Step 2: フローのプロンプト・スケジュール設定")
    print("     → python .github/skills/copilot-studio/scripts/deploy_news_flow.py <BOT_ID or URL>")
    print()
    print("  ★ Step 3: 接続マネージャーで接続を作成")
    env_id = _get_environment_id()
    if env_id and TENANT_ID:
        conn_url = (
            f"https://copilotstudio.microsoft.com/c2/tenants/{TENANT_ID}"
            f"/environments/{env_id}/bots/{BOT_SCHEMA}"
            "/channels/pva-studio/user-connections"
        )
        print(f"     → {conn_url}")
    else:
        print("     → Copilot Studio UI → エージェントのテスト画面 → 接続マネージャー")
    print("     → 「接続マネージャー」で全ツールの接続を作成・認証")
    print()
    print("  ★ Step 4: 最終公開（全設定完了後に手動で実施）")
    print("     → Copilot Studio UI → 右上の「公開」ボタンをクリック")
    print()

if __name__ == "__main__":
    main()
