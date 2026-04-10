"""
Copilot Studio エージェント設定スクリプト — インシデント管理アシスタント

Phase 3: UI で作成済みの Bot に対して設定を適用
  → カスタムトピック全削除 → 生成オーケストレーション有効化
  → GPT Instructions 設定 → 公開
  ★ ナレッジ・MCP Server はユーザーが UI で手動追加

前提:
  - Copilot Studio UI でエージェントを事前に作成済み
  - BOT_ID を .env または引数で指定

注意:
  Dataverse bots テーブルに直接レコードを挿入しても PVA Bot Management Service に
  プロビジョニングされないため、Bot の新規作成は Copilot Studio UI で行う。
  API でできるのは既存 Bot の設定変更のみ。

使い方:
  1. Copilot Studio UI でエージェントを作成
  2. .env に BOT_ID=<作成した Bot のID> を追加
  3. python scripts/deploy_agent.py
"""

import json
import os
import sys
import time

import re

# scripts/ ディレクトリを sys.path に追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
import yaml
from dotenv import load_dotenv
from auth_helper import get_token, DATAVERSE_URL as _DV_URL

load_dotenv()

# ── 環境変数 ────────────────────────────────────────────────
DATAVERSE_URL = _DV_URL
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")

BOT_NAME = "インシデント管理アシスタント"
BOT_SCHEMA = f"{PREFIX}_IncidentAssistant"

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

# ── GPT Instructions ─────────────────────────────────────

GPT_INSTRUCTIONS = f"""\
あなたは「インシデント管理アシスタント」です。社内のインシデント（障害・問題）を管理するためのAIエージェントです。

## 利用可能なテーブル

### {PREFIX}_incident（インシデント）
- {PREFIX}_name: テキスト（タイトル）★必須
- {PREFIX}_description: テキスト（説明）
- {PREFIX}_status: Choice（ステータス）
  - 100000000 = 新規
  - 100000001 = 対応中
  - 100000002 = 保留
  - 100000003 = 解決済
  - 100000004 = クローズ
- {PREFIX}_priority: Choice（優先度）
  - 100000000 = 緊急
  - 100000001 = 高
  - 100000002 = 中
  - 100000003 = 低
- {PREFIX}_duedate: DateTime（期限）
- {PREFIX}_incidentcategoryid: Lookup → {PREFIX}_incidentcategory
- {PREFIX}_locationid: Lookup → {PREFIX}_location
- {PREFIX}_assignedtoid: Lookup → systemuser
- createdby: システム列（報告者 = レコード作成者）

### {PREFIX}_incidentcategory（カテゴリ）
- {PREFIX}_name: テキスト（カテゴリ名）

### {PREFIX}_location（場所）
- {PREFIX}_name: テキスト（場所名）

### {PREFIX}_incidentcomment（コメント）
- {PREFIX}_name: テキスト（件名）
- {PREFIX}_content: テキスト（内容）
- {PREFIX}_incidentid: Lookup → {PREFIX}_incident

## 行動指針

1. ユーザーの意図を正確に理解し、Dataverse のデータ操作を実行する
2. レコード作成時は必須項目（タイトル）を必ず確認してから実行
3. 検索結果は見やすく整形して表示する（テーブル形式推奨）
4. 日本語で丁寧に応答する
5. 不明な点は実行前に確認する
6. ステータス・優先度の Choice 値は整数値で指定する

## 条件分岐ルール

### データの照会（ナレッジから回答）
- 「一覧を見せて」「～はありますか」→ ナレッジ（Dataverse テーブル）から検索
- フィルタ条件があれば適用（ステータス、優先度、カテゴリ等）
- 結果がなければその旨を伝える

### 新規レコード作成（ツールで実行）
- 「起票して」「登録して」「追加して」→ ツール（Dataverse MCP Server）でレコード作成
- 必須情報: タイトル
- 推奨情報: 説明、優先度、カテゴリ、場所
- ステータスのデフォルト: 新規（100000000）
- 不足情報は質問して補完

### レコード更新（ツールで実行）
- 「ステータスを変更して」「更新して」→ ツール（Dataverse MCP Server）で PATCH 操作
- 対象レコードの特定 → 変更内容の確認 → 実行

### コメント追加
- 「コメントを追加して」→ {PREFIX}_incidentcomment テーブルに新規作成
- インシデントの特定 → 件名と内容を確認 → 実行
"""

# instructions を |- ブロック形式で手動構築（yaml.dump の quoted scalar では UI が認識しない）

# ── 推奨プロンプト（GPT コンポーネントの conversationStarters） ────────
PREFERRED_PROMPTS = [
    {"title": "インシデント一覧", "text": "現在のインシデント一覧を見せてください"},
    {"title": "新規インシデント", "text": "新しいインシデントを起票したいです"},
    {"title": "ステータス更新", "text": "インシデントのステータスを更新してください"},
    {"title": "緊急インシデント", "text": "緊急のインシデントはありますか？"},
]

_starters = "\n".join([
    f"- title: {p['title']}\n  text: {p['text']}" for p in PREFERRED_PROMPTS
])

# ── 会話の開始のクイック返信（ConversationStart トピックの quickReplies） ──
QUICK_REPLIES = [
    "インシデント一覧を見せて",
    "新しいインシデントを起票したい",
    "緊急のインシデントはある？",
]

# ── 会話の開始メッセージ（ConversationStart トピックの挨拶テキスト） ──
GREETING_MESSAGE = "こんにちは！インシデント管理アシスタントです。インシデントの起票・検索・ステータス更新など、お気軽にお申し付けください。"

BOT_DESCRIPTION = "社内のインシデント（障害・問題）を管理するAIエージェントです。インシデントの起票、ステータス更新、一覧検索、コメント追加などを自然言語で実行できます。"

# ── Teams チャネル公開設定 ─────────────────────────────────
# applicationmanifestinformation.teams に格納される値
TEAMS_SHORT_DESCRIPTION = "インシデントの起票・検索・更新を自然言語で実行できるAIエージェントです。"  # 最大80文字
TEAMS_LONG_DESCRIPTION = (
    "インシデント管理アシスタントは、社内のインシデント（障害・問題）を管理するAIエージェントです。\n\n"
    "【主な機能】\n"
    "・インシデントの新規起票（タイトル・説明・優先度・カテゴリを指定）\n"
    "・インシデント一覧の検索・フィルタリング（ステータス・優先度・カテゴリ別）\n"
    "・ステータス更新（新規→対応中→解決済→クローズ）\n"
    "・コメントの追加\n"
    "・緊急インシデントのアラート確認\n\n"
    "自然言語で指示するだけで、Dataverse 上のインシデントデータを操作できます。"
)  # 最大3400文字
TEAMS_ACCENT_COLOR = "#FFFFFF"  # 背景色（白 / 透明推奨）
TEAMS_DEVELOPER_NAME = "Power Platform Dev"  # 最大32文字
TEAMS_WEBSITE = ""  # 空欄ならデフォルト維持
TEAMS_PRIVACY_URL = ""  # 空欄ならデフォルト維持
TEAMS_TERMS_URL = ""  # 空欄ならデフォルト維持

GPT_YAML = f"kind: GptComponentMetadata\ndisplayName: {BOT_NAME}\ninstructions: |-\n"
for line in GPT_INSTRUCTIONS.splitlines():
    GPT_YAML += f"  {line}\n"
GPT_YAML += f"conversationStarters:\n{_starters}\n"

# ── Step 1: Bot 検索 ─────────────────────────────────────

def _extract_bot_id(value: str) -> str | None:
    """BOT_ID 環境変数から Bot ID を抽出する。URL でも GUID でも対応。"""
    # GUID パターン
    match = re.search(r'/bots/([0-9a-f-]{36})', value)
    if match:
        return match.group(1)
    # 直接 GUID が指定されている場合
    match = re.fullmatch(r'[0-9a-f-]{36}', value.strip())
    if match:
        return value.strip()
    return None


def find_bot() -> str:
    """UI で作成済みの Bot を検索、または BOT_ID 環境変数（URL or GUID）から取得"""
    print("\n=== Step 1: Bot 検索 ===")

    # 環境変数で指定されていればそれを使う（URL でも GUID でも OK）
    env_bot_id = os.environ.get("BOT_ID", "")
    if env_bot_id:
        bot_id = _extract_bot_id(env_bot_id)
        if bot_id:
            print(f"  BOT_ID から自動判別: {bot_id}")
            return bot_id
        else:
            print(f"  ⚠️  BOT_ID の形式が不正: {env_bot_id}")
            print("  URL または GUID を指定してください")
            print("  例: BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/overview")
            print("  例: BOT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
            sys.exit(1)

    # schemaname で検索
    existing = api_get("bots",
                       {"$filter": f"name eq '{BOT_NAME}'"})
    if existing.get("value"):
        bot_id = existing["value"][0]["botid"]
        print(f"  既存 Bot を発見: {bot_id} ({existing['value'][0].get('name', '')})")
        return bot_id

    # 見つからない場合
    print("  ❌ Bot が見つかりません。")
    print()
    print("  Copilot Studio UI でエージェントを作成してください:")
    print(f"    1. https://copilotstudio.microsoft.com/ にアクセス")
    print(f"    2. 「+ 作成」をクリック")
    print(f"    3. エージェント名: {BOT_NAME}")
    print(f"    4. 「エージェント設定 (オプション)」を展開:")
    print(f"       - 言語: 日本語 (日本)")
    print(f"       - ソリューション: {SOLUTION_NAME}")
    print(f"       - スキーマ名: {PREFIX}_incident_management_assistant")
    print(f"    5. 「作成」をクリック")
    print(f"    6. 作成後のブラウザ URL をそのまま .env に貼り付け:")
    print(f"       BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-xxxx-.../overview")
    print(f"       （GUID だけでも OK: BOT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）")
    print(f"    7. 再実行: python scripts/deploy_agent.py")
    print()
    print("  ※ Dataverse bots テーブルへの直接挿入では PVA にプロビジョニングされません")
    sys.exit(1)

# ── Step 2: カスタムトピック全削除 ────────────────────────

def _wait_for_provisioning(bot_id: str, timeout: int = 120) -> bool:
    """Bot のプロビジョニング完了を待つ。トピックが出現するまでリトライ。"""
    print("\n=== Step 1.5: プロビジョニング待ち ===")
    elapsed = 0
    interval = 10
    while elapsed < timeout:
        topics = api_get("botcomponents",
                         {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 1",
                          "$select": "botcomponentid"})
        topic_count = len(topics.get("value", []))
        if topic_count > 0:
            print(f"  プロビジョニング完了（トピック {topic_count} 件検出、{elapsed}秒経過）")
            return True
        # GPT コンポーネント（componenttype=15）も確認
        gpt = api_get("botcomponents",
                      {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                       "$select": "botcomponentid"})
        if gpt.get("value"):
            print(f"  プロビジョニング完了（GPT コンポーネント検出、{elapsed}秒経過）")
            return True
        print(f"  プロビジョニング待機中... ({elapsed}/{timeout}秒)")
        time.sleep(interval)
        elapsed += interval
    print(f"  ⚠️ {timeout}秒経過 — トピック未検出。プロビジョニングが遅延している可能性があります")
    print("    Copilot Studio UI で Bot が完全にロードされているか確認してください")
    return False


# 削除から保護するシステムトピックの schemaname パターン
PROTECTED_TOPIC_PATTERNS = [
    "ConversationStart",
    "Escalate",
    "Fallback",
    "OnError",
    "EndofConversation",
    "MultipleTopicsMatched",
    "Search",
    "Signin",
    "ResetConversation",
]


def delete_custom_topics(bot_id: str):
    print("\n=== Step 2: カスタムトピック削除 ===")
    # componenttype=1（カスタムトピック）と componenttype=9（システムトピック含む）の両方を取得
    topics = api_get("botcomponents",
                     {"$filter": f"_parentbotid_value eq '{bot_id}' and (componenttype eq 1 or componenttype eq 9)",
                      "$select": "botcomponentid,name,schemaname,componenttype"})
    if not topics.get("value"):
        print("  ⚠️ トピックが 0 件です（プロビジョニング未完了の可能性）")
    count = 0
    for topic in topics.get("value", []):
        name = topic.get("name", "")
        schema = topic.get("schemaname", "")
        # システムトピック名はスキップ
        if name.startswith("system_"):
            continue
        # 保護対象のシステムトピックはスキップ（schemaname で判定）
        if any(p in schema for p in PROTECTED_TOPIC_PATTERNS):
            print(f"  保護: {name} ({schema})")
            continue
        # MCP Server / アクション（.action. を含む）はスキップ
        if ".action." in schema:
            print(f"  保護: {name} ({schema})")
            continue
        try:
            api_delete(f"botcomponents({topic['botcomponentid']})")
            print(f"  削除: {name} ({schema})")
            count += 1
        except Exception as e:
            print(f"  スキップ: {name} ({e})")
    print(f"  {count} 件のカスタムトピックを削除")

# ── Step 3: 生成オーケストレーション有効化 ────────────────

def _deep_merge(base: dict, override: dict) -> dict:
    """base に override をディープマージ。override 側の値を優先するが、
    base にしかないキーは保持する。"""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def enable_generative_orchestration(bot_id: str) -> dict:
    """生成オーケストレーションを有効化。既存 configuration をディープマージして返す。
    ★ 基盤モデル（Claude / GPT 等）の選択は変更しない。"""
    print("\n=== Step 3: 生成オーケストレーション有効化 ===")

    # 既存 configuration を読み込み（モデル設定・gPTSettings 等を保持するため）
    bot_data = api_get(f"bots({bot_id})?$select=configuration")
    existing_config = json.loads(bot_data.get("configuration", "{}") or "{}")
    print(f"  既存 configuration キー: {list(existing_config.keys())}")

    # aISettings の既存モデル設定を表示（デバッグ用）
    existing_ai = existing_config.get("aISettings", {})
    if existing_ai:
        print(f"  既存 aISettings キー: {list(existing_ai.keys())}")

    # 生成オーケストレーションに必要な最小限の設定のみ指定
    # ★ optInUseLatestModels は明示的に False — True だと基盤モデルが GPT に強制変更される
    # ★ aISettings は丸ごと上書きせずディープマージ（既存のモデル選択を保持）
    overrides = {
        "$kind": "BotConfiguration",
        "settings": {
            "GenerativeActionsEnabled": True,
        },
        "aISettings": {
            "$kind": "AISettings",
            "useModelKnowledge": True,
            "isFileAnalysisEnabled": True,
            "isSemanticSearchEnabled": True,
            "optInUseLatestModels": False,
        },
        "recognizer": {
            "$kind": "GenerativeAIRecognizer",
        },
    }

    # 既存 configuration にオーバーライドをディープマージ
    # → gPTSettings、モデル選択、その他 UI 由来の設定をすべて保持
    merged = _deep_merge(existing_config, overrides)

    api_patch(f"bots({bot_id})", {"configuration": json.dumps(merged)})
    print("  生成オーケストレーション有効化完了（基盤モデル変更なし）")
    return existing_config


# ── Step 4: 指示（Instructions）設定 ──────────────────────

def set_gpt_instructions(bot_id: str, saved_config: dict):
    print("\n=== Step 4: 指示（Instructions）設定 ===")

    # 保存した configuration から defaultSchemaName を取得
    default_schema = saved_config.get("gPTSettings", {}).get("defaultSchemaName", "")
    print(f"  defaultSchemaName: {default_schema or '(なし)'}")

    # 既存 GPT コンポーネント（componenttype=15）をすべて取得
    existing = api_get("botcomponents",
                       {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                        "$select": "botcomponentid,name,schemaname,data"})
    comps = existing.get("value", [])
    print(f"  既存 GPT コンポーネント数: {len(comps)}")

    # UI が作成したコンポーネント（defaultSchemaName と一致）を探す
    ui_comp = None
    extra_comps = []
    for comp in comps:
        schema = comp.get("schemaname", "")
        if default_schema and schema == default_schema:
            ui_comp = comp
            print(f"  UI コンポーネント: {schema} ({comp['botcomponentid']})")
        else:
            extra_comps.append(comp)

    # UI のコンポーネントがなければ最初のものを使う
    if ui_comp is None and comps:
        ui_comp = comps[0]
        extra_comps = comps[1:]
        print(f"  フォールバック: {ui_comp.get('schemaname','')} ({ui_comp['botcomponentid']})")

    # 余分なコンポーネントを削除
    for comp in extra_comps:
        try:
            api_delete(f"botcomponents({comp['botcomponentid']})")
            print(f"  余分なコンポーネント削除: {comp.get('schemaname', comp['botcomponentid'])}")
        except Exception as e:
            print(f"  削除スキップ: {comp['botcomponentid']} ({e})")

    # 指示を更新 or 新規作成
    if ui_comp:
        comp_id = ui_comp["botcomponentid"]
        api_patch(f"botcomponents({comp_id})", {"data": GPT_YAML})
        print(f"  指示コンポーネント更新: {comp_id}")
    else:
        schema_name = default_schema or f"{BOT_SCHEMA}.gpt.default"
        gpt_body = {
            "name": BOT_NAME,
            "schemaname": schema_name,
            "componenttype": 15,
            "data": GPT_YAML,
            "parentbotid@odata.bind": f"/bots({bot_id})",
        }
        api_post("botcomponents", gpt_body)
        comp_id = None  # 新規作成の場合は後で取得
        print(f"  指示コンポーネント新規作成: {schema_name}")

    print("  指示の設定完了")
    return comp_id


# ── Step 4.5: 会話の開始のクイック返信設定 ────────────────

def set_quick_replies(bot_id: str):
    """ConversationStart トピックの挨拶メッセージと quickReplies を設定する。"""
    print("\n=== Step 4.5: 会話の開始設定（メッセージ + クイック返信） ===")

    # ConversationStart トピックを検索
    result = api_get("botcomponents", {
        "$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 9 and contains(schemaname,'ConversationStart')",
        "$select": "botcomponentid,schemaname,data",
    })
    topics = result.get("value", [])
    if not topics:
        print("  ⚠️ ConversationStart トピックが見つかりません")
        return

    topic = topics[0]
    topic_id = topic["botcomponentid"]
    existing_data = topic.get("data", "")
    print(f"  トピック: {topic['schemaname']} ({topic_id})")

    # 既存 YAML をパースして更新
    try:
        parsed = yaml.safe_load(existing_data)
    except Exception:
        print("  ⚠️ 既存 YAML のパースに失敗")
        return

    # quickReplies を構築
    quick_reply_items = [{"kind": "MessageBack", "text": qr} for qr in QUICK_REPLIES] if QUICK_REPLIES else []

    # beginDialog > actions 内の SendActivity を探してメッセージとクイック返信を設定
    actions = parsed.get("beginDialog", {}).get("actions", [])
    updated = False
    for action in actions:
        if action.get("kind") == "SendActivity":
            activity = action.get("activity", {})
            if isinstance(activity, dict):
                # 挨拶メッセージを更新
                if GREETING_MESSAGE:
                    activity["text"] = [GREETING_MESSAGE]
                    activity["speak"] = [GREETING_MESSAGE]
                # クイック返信を設定
                if quick_reply_items:
                    activity["quickReplies"] = quick_reply_items
            else:
                # activity が文字列の場合は dict に変換
                action["activity"] = {
                    "text": [GREETING_MESSAGE or str(activity)],
                    "quickReplies": quick_reply_items,
                }
            updated = True
            break

    if not updated:
        print("  ⚠️ SendActivity アクションが見つかりません")
        return

    # YAML に戻して PATCH
    new_data = yaml.dump(parsed, default_flow_style=False, allow_unicode=True, sort_keys=False)
    api_patch(f"botcomponents({topic_id})", {"data": new_data})
    if GREETING_MESSAGE:
        print(f"  挨拶メッセージ: {GREETING_MESSAGE[:50]}...")
    print(f"  クイック返信 {len(QUICK_REPLIES)} 件を設定")


# ── Step 6: 説明の設定（publish 後に実行）────────────────

def set_description(bot_id: str, comp_id: str | None = None):
    """UI の「説明」= botcomponents.description カラム。
    data PATCH の非同期処理で上書きされるため publish 後に設定する。"""
    print("\n=== Step 6: 説明の設定 ===")
    if not comp_id:
        existing = api_get("botcomponents",
                           {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                            "$select": "botcomponentid"})
        if existing.get("value"):
            comp_id = existing["value"][0]["botcomponentid"]
    if comp_id:
        api_patch(f"botcomponents({comp_id})", {"description": BOT_DESCRIPTION})
        print(f"  説明を設定: {BOT_DESCRIPTION[:50]}...")
    else:
        print("  ⚠️ GPT コンポーネントが見つかりません")

# ── Step 5: エージェント公開 ──────────────────────────────

def publish_bot(bot_id: str):
    print("\n=== Step 5: エージェント公開 ===")
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  公開完了")
    except Exception as e:
        print(f"  ⚠️ 公開でエラー（手動で公開してください）: {e}")


# ── Step 7: Teams / Copilot チャネル公開設定 ──────────────

def set_channel_manifest(bot_id: str):
    """applicationmanifestinformation の teams 設定を更新する。"""
    print("\n=== Step 7: Teams / Copilot チャネル公開設定 ===")

    # 既存の applicationmanifestinformation を取得
    bot_data = api_get(f"bots({bot_id})?$select=applicationmanifestinformation,iconbase64")
    existing_ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
    existing_teams = existing_ami.get("teams", {})
    print(f"  既存 teams キー: {list(existing_teams.keys())}")

    # teams 設定を更新（空文字列はスキップしてデフォルト維持）
    if TEAMS_SHORT_DESCRIPTION:
        existing_teams["shortDescription"] = TEAMS_SHORT_DESCRIPTION[:80]
        print(f"  簡単な説明: {TEAMS_SHORT_DESCRIPTION[:50]}...")
    if TEAMS_LONG_DESCRIPTION:
        existing_teams["longDescription"] = TEAMS_LONG_DESCRIPTION[:3400]
        print(f"  詳細な説明: {TEAMS_LONG_DESCRIPTION[:50]}...")
    if TEAMS_ACCENT_COLOR:
        existing_teams["accentColor"] = TEAMS_ACCENT_COLOR
        print(f"  背景色: {TEAMS_ACCENT_COLOR}")
    if TEAMS_DEVELOPER_NAME:
        existing_teams["developerName"] = TEAMS_DEVELOPER_NAME[:32]
        print(f"  開発者名: {TEAMS_DEVELOPER_NAME}")
    if TEAMS_WEBSITE:
        existing_teams["websiteLink"] = TEAMS_WEBSITE
        print(f"  Web サイト: {TEAMS_WEBSITE}")
    if TEAMS_PRIVACY_URL:
        existing_teams["privacyLink"] = TEAMS_PRIVACY_URL
        print(f"  プライバシー: {TEAMS_PRIVACY_URL}")
    if TEAMS_TERMS_URL:
        existing_teams["termsLink"] = TEAMS_TERMS_URL
        print(f"  使用条件: {TEAMS_TERMS_URL}")

    # アイコン: Bot の iconbase64 を colorIcon / outlineIcon にも設定
    icon_b64 = bot_data.get("iconbase64")
    if icon_b64:
        existing_teams["colorIcon"] = icon_b64
        existing_teams["outlineIcon"] = icon_b64
        print(f"  アイコン: Bot の iconbase64 を colorIcon/outlineIcon に設定")

    existing_ami["teams"] = existing_teams
    api_patch(f"bots({bot_id})", {
        "applicationmanifestinformation": json.dumps(existing_ami)
    })
    print("  チャネル公開設定完了")


def publish_to_channels(bot_id: str):
    """エージェントを Teams / Copilot チャネルに公開する。"""
    print("\n=== Step 8: チャネル公開実行 ===")

    # まず PvaPublish で最新版を公開
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  エージェント再公開完了")
    except Exception as e:
        print(f"  ⚠️ 再公開エラー: {e}")

    # Teams チャネルの有効化確認
    bot_data = api_get(f"bots({bot_id})?$select=configuration")
    config = json.loads(bot_data.get("configuration", "{}") or "{}")
    channels = config.get("channels", [])
    channel_ids = [ch.get("channelId") for ch in channels]
    print(f"  既存チャネル: {channel_ids}")

    # msteams が未設定なら追加
    if "msteams" not in channel_ids:
        channels.append({
            "id": None,
            "channelId": "msteams",
            "channelSpecifier": None,
            "displayName": None,
        })
        print("  msteams チャネルを追加")

    # Microsoft365Copilot が未設定なら追加
    if "Microsoft365Copilot" not in channel_ids:
        channels.append({
            "id": None,
            "channelId": "Microsoft365Copilot",
            "channelSpecifier": None,
            "displayName": None,
        })
        print("  Microsoft365Copilot チャネルを追加")

    config["channels"] = channels
    api_patch(f"bots({bot_id})", {"configuration": json.dumps(config)})
    print("  チャネル設定更新完了")

    # 再度公開
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  最終公開完了")
    except Exception as e:
        print(f"  ⚠️ 最終公開エラー: {e}")

    print("\n  ★ Teams での利用:")
    print("    Copilot Studio → チャネル → Teams を選択")
    print("    「利用可能にする」をクリック")
    print("    → Teams アプリとして組織内で利用可能になります")

# ── メイン ────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Copilot Studio エージェントデプロイ")
    print(f"  エージェント名: {BOT_NAME}")
    print("=" * 60)

    bot_id = find_bot()
    _wait_for_provisioning(bot_id)
    delete_custom_topics(bot_id)
    saved_config = enable_generative_orchestration(bot_id)
    comp_id = set_gpt_instructions(bot_id, saved_config)
    set_quick_replies(bot_id)
    publish_bot(bot_id)
    set_description(bot_id, comp_id)
    set_channel_manifest(bot_id)
    publish_to_channels(bot_id)

    print("\n" + "=" * 60)
    print("  ✅ エージェントデプロイ完了!")
    print("=" * 60)
    print()
    print("  ★ 次のステップ（手動操作が必要）:")
    print()
    print("  1. ナレッジの追加:")
    print("     → https://copilotstudio.microsoft.com/ にアクセス")
    print(f"     → 「{BOT_NAME}」を選択 → ナレッジ タブ")
    print("     → Dataverse を選択 → 以下のテーブルを追加:")
    print(f"       - {PREFIX}_incident（インシデント）")
    print(f"       - {PREFIX}_incidentcategory（カテゴリ）")
    print(f"       - {PREFIX}_location（場所）")
    print(f"       - {PREFIX}_incidentcomment（コメント）")
    print()
    print("  2. ツール（Dataverse MCP Server）の追加:")
    print("     → ツール タブ → Dataverse MCP Server を追加")
    print("     → レコードの作成・更新・削除アクションを有効化")
    print()


if __name__ == "__main__":
    main()
