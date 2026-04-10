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

import base64
import requests
from dotenv import load_dotenv
from auth_helper import get_token, DATAVERSE_URL as _DV_URL

load_dotenv()

# ── 環境変数 ────────────────────────────────────────────────
DATAVERSE_URL = _DV_URL
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", "")
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
あなたは「インシデント管理アシスタント」です。社内のITインシデント管理を支援するAIエージェントです。
インシデントの起票・検索・ステータス確認、IT資産情報の照会を行います。

## 利用可能なテーブル

### {PREFIX}_incident（インシデント）
- {PREFIX}_name: テキスト（インシデントタイトル）★必須
- {PREFIX}_description: テキスト（説明・詳細）
- {PREFIX}_status: Choice（ステータス）
  - 100000000 = 新規
  - 100000001 = 対応中
  - 100000002 = 解決済
  - 100000003 = クローズ
- {PREFIX}_resolution: テキスト（解決内容）
- _{PREFIX}_categoryid_value: Lookup → {PREFIX}_incidentcategory（カテゴリ）
- _{PREFIX}_priorityid_value: Lookup → {PREFIX}_priority（優先度）
- _{PREFIX}_assignedtoid_value: Lookup → systemuser（担当者）
- _{PREFIX}_itassetid_value: Lookup → {PREFIX}_itasset（対象IT資産）
- createdby: システム列（起票者）

### {PREFIX}_incidentcategory（インシデントカテゴリ）
- {PREFIX}_name: テキスト（カテゴリ名）
- カテゴリ一覧: ハードウェア障害、ソフトウェア障害、ネットワーク障害、セキュリティ、その他

### {PREFIX}_priority（優先度）
- {PREFIX}_name: テキスト（優先度名）
- {PREFIX}_level: 整数（レベル。1が最高）
- 優先度一覧: 高（レベル1）、中（レベル2）、低（レベル3）

### {PREFIX}_itasset（IT資産）
- {PREFIX}_name: テキスト（資産名）
- {PREFIX}_assettype: Choice（資産タイプ）
  - 100000000 = ノートPC
  - 100000001 = デスクトップPC
  - 100000002 = モニター
  - 100000003 = プリンター
  - 100000004 = ネットワーク機器
  - 100000005 = サーバー
  - 100000006 = その他
- {PREFIX}_assetnumber: テキスト（資産番号）
- {PREFIX}_manufacturer: テキスト（メーカー）
- {PREFIX}_modelname: テキスト（型番）
- {PREFIX}_status: Choice（ステータス）
  - 100000000 = 使用中
  - 100000001 = 在庫
  - 100000002 = 修理中
  - 100000003 = 廃棄

### {PREFIX}_incidentcomment（インシデントコメント）
- {PREFIX}_name: テキスト（コメントタイトル）
- {PREFIX}_content: テキスト（コメント内容）
- _{PREFIX}_incidentid_value: Lookup → {PREFIX}_incident

## 行動指針

1. ユーザーの意図を正確に理解し、適切なDataverse操作を実行する
2. インシデントの新規起票時は、タイトル・カテゴリ・優先度・説明を必ず確認してから作成する
3. 検索結果はテーブル形式で見やすく整形して表示する
4. 日本語で丁寧かつ簡潔に応答する
5. Choice値は整数値（100000000等）で指定する
6. Lookup項目の設定時は対象テーブルからレコードを検索してIDを取得する
7. 曖昧な指示があった場合は確認を求める

## よくある操作パターン

### インシデント起票
タイトル・カテゴリ・優先度・説明をヒアリング → {PREFIX}_incident にレコード作成

### ステータス確認
条件（ステータス・カテゴリ等）でフィルタして一覧表示

### ステータス更新
対象インシデントを特定 → {PREFIX}_status を更新

### IT資産照会
資産番号や名前で検索 → 詳細情報を表示

### コメント追加
インシデントを特定 → {PREFIX}_incidentcomment に新規作成
"""

# instructions を |- ブロック形式で手動構築（yaml.dump の quoted scalar では UI が認識しない）

# ── 推奨プロンプト（GPT コンポーネントの conversationStarters） ────────
PREFERRED_PROMPTS = [
    {"title": "\U0001f4dd インシデントを起票", "text": "新しいインシデントを起票したいです"},
    {"title": "\U0001f50d インシデントを検索", "text": "現在対応中のインシデント一覧を表示してください"},
    {"title": "\U0001f4ca ステータス確認", "text": "未対応（新規）のインシデントは何件ありますか？"},
    {"title": "\U0001f4bb IT資産を検索", "text": "ノートPCの資産一覧を表示してください"},
    {"title": "\U0001f504 ステータス更新", "text": "インシデントのステータスを更新したいです"},
]

# conversationStarters は PVA ダブル改行フォーマットで構築（後述の GPT_YAML 内で使用）

# ── 会話の開始のクイック返信（ConversationStart トピックの quickReplies） ──
QUICK_REPLIES = [
    "新しいインシデントを起票する",
    "対応中のインシデントを確認",
    "IT資産を検索する",
    "未対応のインシデントを確認",
]

# ── 会話の開始メッセージ（ConversationStart トピックの挨拶テキスト） ──
GREETING_MESSAGE = "こんにちは！インシデント管理アシスタントです \U0001f6e1\ufe0f\nインシデントの起票・検索・ステータス更新、IT資産の照会など、お気軽にお申し付けください。"

BOT_DESCRIPTION = "社内インシデントの起票・検索・ステータス確認、IT資産の照会を行うAIアシスタントです。自然言語で指示するだけでDataverseのデータ操作を自動実行します。"

# ── Teams チャネル公開設定 ─────────────────────────────────
# applicationmanifestinformation.teams に格納される値
TEAMS_SHORT_DESCRIPTION = "社内インシデントの起票・検索・管理を行うAIアシスタント"  # 最大80文字
TEAMS_LONG_DESCRIPTION = (
    "インシデント管理アシスタントは、社内ITインシデントの起票、検索、ステータス更新、IT資産照会を支援するAIエージェントです。\n\n"
    "【主な機能】\n"
    "・インシデントの新規起票（タイトル・カテゴリ・優先度・説明を指定）\n"
    "・インシデント一覧の検索・フィルタリング（ステータス・優先度・カテゴリ別）\n"
    "・ステータス更新（新規→対応中→解決済→クローズ）\n"
    "・IT資産の照会（資産番号・名前・タイプで検索）\n"
    "・コメントの追加\n\n"
    "自然言語で指示するだけで、Dataverse上のデータ操作を自動実行します。"
)  # 最大3400文字
TEAMS_ACCENT_COLOR = "#1e293b"  # 背景色（濃紺 — Code Apps と統一）
TEAMS_DEVELOPER_NAME = "Geek Fujiwara"  # 最大32文字
TEAMS_WEBSITE = ""  # 空欄ならデフォルト維持
TEAMS_PRIVACY_URL = ""  # 空欄ならデフォルト維持
TEAMS_TERMS_URL = ""  # 空欄ならデフォルト維持

# ── アイコン SVG（パターン A: シールド＋ライトニング） ────
ICON_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#334155"/>
    </linearGradient>
    <linearGradient id="shield" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#e2e8f0"/>
      <stop offset="100%" style="stop-color:#cbd5e1"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#fbbf24"/>
      <stop offset="100%" style="stop-color:#f59e0b"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="240" height="240" rx="48" ry="48" fill="url(#bg)"/>
  <path d="M120 38 L172 62 C172 62 176 120 172 148 C168 172 148 192 120 206 C92 192 72 172 68 148 C64 120 68 62 68 62 Z"
        fill="url(#shield)" filter="url(#shadow)" opacity="0.95"/>
  <path d="M120 50 L164 70 C164 70 167 120 164 144 C161 164 144 182 120 194 C96 182 79 164 76 144 C73 120 76 70 76 70 Z"
        fill="none" stroke="#94a3b8" stroke-width="1.5" opacity="0.4"/>
  <path d="M132 72 L108 128 L126 128 L112 176 L148 116 L128 116 Z"
        fill="url(#bolt)" filter="url(#shadow)"/>
  <path d="M130 76 L110 124 L126 124 L114 170"
        fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
</svg>'''

# ★ PVA パーサーは「ダブル改行（\n\n）区切り」の独自 YAML フォーマットのみ認識する
# シングル改行の標準 YAML は保存されるが UI に反映されない
# → 全行をダブル改行で区切り、インデントも PVA の慣例に合わせる

def _build_gpt_yaml() -> str:
    """PVA 互換の YAML を構築する。
    構造行（kind, displayName, instructions, conversationStarters 等）はダブル改行。
    instructions ブロック内のテキストはシングル改行（ |- ブロックスカラー）。"""
    # instructions ブロック（シングル改行）
    inst_block = "\n".join(f"  {line}" for line in GPT_INSTRUCTIONS.splitlines())

    # conversationStarters（ダブル改行）
    starter_lines = []
    for p in PREFERRED_PROMPTS:
        starter_lines.append(f"  - title: {p['title']}")
        starter_lines.append(f"    text: {p['text']}")
    starters_block = "\n\n".join(starter_lines)

    # 構造行をダブル改行で結合、instructions 内部はシングル改行を維持
    return (
        "kind: GptComponentMetadata\n\n"
        f"displayName: {BOT_NAME}\n\n"
        f"instructions: |-\n{inst_block}\n\n"
        f"conversationStarters:\n\n{starters_block}\n\n"
    )

GPT_YAML = _build_gpt_yaml()

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


# ── Step 1.1: アイコン設定（PNG Base64 → API） ────────

def set_icon(bot_id: str):
    """PNG アイコンを生成して bots.iconbase64 に PATCH する。
    Teams チャネル要件:
      - iconbase64: data: prefix なしの生 Base64 PNG
      - colorIcon: 192x192 PNG (< 100KB)
      - outlineIcon: 32x32 PNG (白い透明背景)
    """
    print("\n=== Step 1.1: アイコン設定 ===")

    from generate_icon_png import generate_icons
    icons = generate_icons()

    # iconbase64 は data: prefix なしの生 Base64 PNG（REF エージェントと同じ形式）
    icon_b64 = icons["main"]["base64"]
    print(f"  iconbase64: {icons['main']['dimensions']}, {icons['main']['size_bytes']} bytes")

    # ★ bots PATCH には name フィールドが必須
    bot_info = api_get(f"bots({bot_id})?$select=name")
    bot_name = bot_info.get("name", BOT_NAME)

    api_patch(f"bots({bot_id})", {"name": bot_name, "iconbase64": icon_b64})
    print("  ✅ iconbase64 設定完了")


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
    sol_label = f"{SOLUTION_DISPLAY_NAME}（スキーマ名: {SOLUTION_NAME}）" if SOLUTION_DISPLAY_NAME else SOLUTION_NAME
    print("  Copilot Studio UI でエージェントを作成してください:")
    print(f"    1. https://copilotstudio.microsoft.com/ にアクセス")
    print(f"    2. 「+ 作成」をクリック")
    print(f"    3. エージェント名: {BOT_NAME}")
    print(f"    4. 「エージェント設定 (オプション)」を展開:")
    print(f"       - 言語: 日本語 (日本)")
    print(f"       - ソリューション: {sol_label}")
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

        # ★ 既存データから aISettings セクションを抽出（モデル選択を保持）
        # PVA は GPT コンポーネントの data YAML 末尾に aISettings.model.modelNameHint を保存
        # これを上書きすると基盤モデルがデフォルト（GPT 4.1）に戻ってしまう
        existing_data = ui_comp.get("data", "")
        ai_settings_section = ""
        ai_idx = existing_data.find("\naISettings:")
        if ai_idx < 0:
            ai_idx = existing_data.find("aISettings:")
        if ai_idx >= 0:
            ai_settings_section = existing_data[ai_idx:].rstrip()
            print(f"  既存 aISettings を保持: {ai_settings_section[:80]}...")

        # 新しい YAML に既存 aISettings を付加
        final_yaml = GPT_YAML.rstrip("\n") + "\n\n" + ai_settings_section + "\n\n" if ai_settings_section else GPT_YAML

        api_patch(f"botcomponents({comp_id})", {"data": final_yaml})
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
    """ConversationStart トピックの挨拶メッセージと quickReplies を設定する。
    ★ yaml.dump() 禁止 — PVA パーサーと非互換。全体を手動 YAML 構築。"""
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

    # 既存の SendActivity ID を抽出（再利用）
    id_match = re.search(r'id:\s+(sendMessage_\w+)', existing_data)
    send_id = id_match.group(1) if id_match else "sendMessage_auto01"

    # ★ PVA ダブル改行フォーマットで ConversationStart YAML を構築
    # PVA パーサーはシングル改行の YAML を認識しない
    # 参考エージェントの実際の形式に合わせる:
    #   - 全行をダブル改行で区切り
    #   - actions 配下は 4 スペースインデント
    #   - activity 配下は 8 スペースインデント
    #   - text/speak リスト項目は 10 スペースインデント
    #   - quickReplies 項目は 10 スペースインデント

    # 挨拶メッセージ — 改行を含まない 1 行テキスト（PVA は 1 行テキストを想定）
    greeting_oneline = GREETING_MESSAGE.replace('\n', ' ')

    lines = []
    lines.append("kind: AdaptiveDialog")
    lines.append("beginDialog:")
    lines.append("  kind: OnConversationStart")
    lines.append("  id: main")
    lines.append("  actions:")
    lines.append("    - kind: SendActivity")
    lines.append(f"      id: {send_id}")
    lines.append("      activity:")
    lines.append("        text:")
    lines.append(f"          - {greeting_oneline}")
    lines.append("        speak:")
    lines.append(f'          - "{greeting_oneline}"')
    lines.append("        quickReplies:")
    for qr in QUICK_REPLIES:
        lines.append(f"          - kind: MessageBack")
        lines.append(f"            text: {qr}")

    # PVA フォーマット: ダブル改行で結合
    new_data = "\n\n".join(lines) + "\n\n"

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

    # アイコン: Teams 要件に合った PNG を colorIcon / outlineIcon に設定
    # ★ colorIcon = 192x192 PNG, outlineIcon = 32x32 PNG（白い透明背景）
    # ★ data: prefix なしの生 Base64 PNG（REF エージェントと同じ形式）
    try:
        from generate_icon_png import generate_icons
        icons = generate_icons()
        existing_teams["colorIcon"] = icons["color"]["base64"]
        existing_teams["outlineIcon"] = icons["outline"]["base64"]
        print(f"  colorIcon: {icons['color']['dimensions']}, {icons['color']['size_bytes']} bytes")
        print(f"  outlineIcon: {icons['outline']['dimensions']}, {icons['outline']['size_bytes']} bytes")
    except Exception as e:
        print(f"  ⚠️ PNG アイコン生成エラー、iconbase64 をフォールバック使用: {e}")
        icon_b64 = bot_data.get("iconbase64")
        if icon_b64:
            existing_teams["colorIcon"] = icon_b64
            existing_teams["outlineIcon"] = icon_b64

    existing_ami["teams"] = existing_teams

    # Microsoft 365 Copilot で使用可能にする
    copilot_chat = existing_ami.get("copilotChat", {})
    copilot_chat["isEnabled"] = True
    existing_ami["copilotChat"] = copilot_chat
    print("  Microsoft 365 Copilot: 有効化")

    # ★ bots PATCH には name 必須（省略すると "Empty or null bot name" エラー）
    bot_name_data = api_get(f"bots({bot_id})?$select=name")
    api_patch(f"bots({bot_id})", {
        "name": bot_name_data["name"],
        "applicationmanifestinformation": json.dumps(existing_ami),
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
    set_icon(bot_id)
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
    print(f"       - {PREFIX}_priority（優先度）")
    print(f"       - {PREFIX}_itasset（IT資産）")
    print(f"       - {PREFIX}_incidentcomment（コメント）")
    print()
    print("  2. ツール（Dataverse MCP Server）の追加:")
    print("     → ツール タブ → Dataverse MCP Server を追加")
    print("     → レコードの作成・更新・削除アクションを有効化")
    print()


if __name__ == "__main__":
    main()
