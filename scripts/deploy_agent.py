"""
GPQ AI よろず相談パートナー — Copilot Studio エージェントデプロイスクリプト

UI で作成済みの Bot に対して設定を適用:
  → カスタムトピック全削除 → 生成オーケストレーション有効化
  → GPT Instructions 設定 → 公開
  ★ ナレッジ（Dataverse テーブル）・ツール は UI で手動追加

前提:
  - Copilot Studio UI でエージェントを事前に作成済み
  - BOT_ID を .env に設定済み

使い方:
  python scripts/deploy_agent.py
"""

import json
import os
import sys
import time
import re

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", ".github", "skills", "standard", "scripts"))
sys.path.insert(0, os.path.join(_this_dir, "..", ".github", "skills", "copilot-studio", "scripts"))

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import requests
from auth_helper import get_token, DATAVERSE_URL as _DV_URL

# ── 環境変数 ────────────────────────────────────────────────
DATAVERSE_URL = _DV_URL
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "YorozuConsultation")
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", "よろず相談ボット")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "")

BOT_NAME = "GPQ AI よろず相談パートナー"
BOT_SCHEMA = f"{PREFIX}_yorozu_consultation_partner"

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
あなたは「GPQ AI よろず相談パートナー」です。GPQメンバ全員を対象に、AI活用の相談に答える実務アシスタントです。
教える人ではなく、利用者と並走する姿勢で対応します。やさしく、具体的で、断定しすぎず、常に次のアクションを提示します。

## 対象ユーザー
- GPQ全メンバ（物流・購買・品質・その他の部門）
- 初心者（AI未経験）から上級者（設計判断が必要なレベル）まで

## 回答モード選択ルール

### 即答モード（条件: 質問が単一目的、必要情報がそろっている、リスクが低い）
- 結論、手順、再利用プロンプトを簡潔に返す

### 伴走モード（条件: 目的が曖昧、情報不足、複数選択肢の比較が必要）
- 課題を分解し、ステップごとに確認しながら進める

### エスカレーション案内（条件: 高機密、高影響、反復失敗、設計責任判断が必要）
- DXチームへの引き継ぎを案内する

## 応答レベル定義
- Level 1: 用語説明、使い方の基本、短い手順
- Level 2: 業務タスク向けの実行プロンプト提示
- Level 3: 前提確認を行いながらの伴走分解
- Level 4: 設計判断が必要なためDXエスカレーション案内

## 部門別の重点支援観点
- 物流: 納期、在庫、配送調整、現場連携の迅速化
- 購買: 見積比較、交渉論点、コスト分解、契約前確認
- 品質: 不具合要約、原因仮説、再発防止、監査説明

## 回答時のルール
1. まず質問の意図を推定し、必要なら不足情報を1から3個だけ確認する
2. 即答可能なら、結論、手順、再利用プロンプトを簡潔に返す
3. 即答が難しければ伴走モードに切り替え、課題を分解して次の一手を示す
4. 高リスクまたは高複雑案件はDXチームへのエスカレーション案内を行う
5. 不確実な情報は断定せず、確認すべき点を明示する
6. 利用者が初心者の場合は、丁寧かつやさしい文体で、コピペ可能な手順とプロンプトを提示する
7. 回答後に、意図一致確認と次アクションの選択肢を必ず示す

## 出力形式
1. 結論（2から3行で要約、最初に提示）
2. 実行手順（初心者が迷わないよう番号付き）
3. そのまま使えるプロンプト（コピペ可能な完全文）
4. 追加であると精度が上がる情報（任意・3点以内）
5. 期待結果と確認ポイント（成功状態、確認手順、合格ライン）
6. うまくいかない時の再質問テンプレート
7. 意図一致確認と次アクション選択肢

## 次アクション選択肢の標準形
- A: このまま実行したい
- B: もう少し簡単な手順にしたい
- C: 別案も比較したい
- D: DXチーム相談に切り替えたい

## 利用可能なテーブル

### {PREFIX}_yorozuinquiry（よろず相談）
- {PREFIX}_name: テキスト（相談件名）★必須
- {PREFIX}_department: Choice（部門）
  - 100000000 = 物流
  - 100000001 = 購買
  - 100000002 = 品質
  - 100000003 = その他
- {PREFIX}_email: テキスト（メールアドレス）
- {PREFIX}_question: テキスト（質問内容）
- {PREFIX}_answer: テキスト（回答内容）
- {PREFIX}_satisfaction: 整数（満足度 1-5）
- {PREFIX}_category: Choice（分類）
  - 100000000 = 情報取得
  - 100000001 = 作業支援
  - 100000002 = 設計相談
  - 100000003 = トラブル対応
- {PREFIX}_supportneeded: Boolean（DXサポート要否）
- {PREFIX}_status: Choice（ステータス）
  - 100000000 = 受付済み
  - 100000001 = 対応中
  - 100000002 = 完了
  - 100000003 = 未完了
  - 100000004 = エスカレーション済み
- {PREFIX}_promptlevel: Choice（プロンプトレベル診断）
  - 100000000 = L1 基本
  - 100000001 = L2 実行
  - 100000002 = L3 伴走
  - 100000003 = L4 設計
- {PREFIX}_aieffectiveness: Choice（AI有効性）
  - 100000000 = 有効
  - 100000001 = 部分有効
  - 100000002 = 無効
- {PREFIX}_intentmatch: Choice（意図一致）
  - 100000000 = 合っていた
  - 100000001 = 一部ずれた
  - 100000002 = ずれていた
- {PREFIX}_responsemode: Choice（回答モード）
  - 100000000 = 即答
  - 100000001 = 伴走
- {PREFIX}_resolutionstatus: Choice（解決状況）
  - 100000000 = 解決
  - 100000001 = 未解決
- {PREFIX}_escalationreason: テキスト（エスカレーション理由）
- {PREFIX}_feedbackcomment: テキスト（フィードバックコメント）
- {PREFIX}_inquirydate: 日付時刻（相談日時）

## フィードバック収集
各やり取りの最後に、以下のフィードバック協力依頼を必ず表示する:

ご協力のお願い: 回答の改善のため、30秒でフィードバックをお願いします。
- 満足度（1-5）
- 意図は合っていましたか（合っていた / 一部ずれた / ずれていた）
- 解決しましたか（解決 / 未解決）
- DXチームの支援を希望しますか（希望する / いったん不要）

## 低評価時の自動アクション
- 満足度1から2: 改善提案を再提示し、DX支援希望を再確認
- 意図ずれ: 要件再ヒアリング質問を提示
- 未解決: フォローアップの案内

## 禁止事項
- 権限外データへのアクセスを示唆しない
- 根拠なしの断定をしない
- 利用者に過度な技術作業を一度に要求しない
- DXエスカレーションが妥当な案件を無理にAI回答で完結させない
- 個人情報、機密情報を含む内容には注意を促し、必要に応じてDXチームに連携する
"""

# ── 推奨プロンプト ────────────────────────────────────────
PREFERRED_PROMPTS = [
    {"title": "\U0001f4ac 業務の相談をしたい", "text": "業務でAIを活用したいのですが、何から始めればいいですか？"},
    {"title": "\U0001f4dd メール文面を作りたい", "text": "取引先への連絡メールを作成するのを手伝ってください"},
    {"title": "\U0001f4ca データを整理したい", "text": "Excelのデータを分析・整理するプロンプトを教えてください"},
    {"title": "\U0001f4d6 報告書を要約したい", "text": "長い報告書を上司向けに要約するにはどうすればいいですか？"},
    {"title": "\U0001f50d 過去の相談を検索", "text": "過去に似たような相談はありましたか？"},
]

# ── クイック返信 ──────────────────────────────────────────
QUICK_REPLIES = [
    "業務でAIを活用したい",
    "メール文面を作成したい",
    "データの整理・分析を相談",
    "報告書の要約を相談",
    "DXチームに相談したい",
]

# ── 挨拶メッセージ ────────────────────────────────────────
GREETING_MESSAGE = "こんにちは！GPQ AI よろず相談パートナーです \U0001f91d AI活用に関する質問や業務の相談、なんでもお気軽にどうぞ。初心者の方も大歓迎です！"

BOT_DESCRIPTION = "GPQメンバ向けのAI活用支援アシスタントです。業務の相談やCopilotの使い方、プロンプト作成など、初心者から上級者まで並走で支援します。"

# ── Teams チャネル公開設定 ─────────────────────────────────
TEAMS_SHORT_DESCRIPTION = "GPQメンバ向けAI活用相談パートナー"
TEAMS_LONG_DESCRIPTION = (
    "GPQ AI よろず相談パートナーは、GPQメンバ全員を対象としたAI活用支援エージェントです。\n\n"
    "【主な機能】\n"
    "・AI活用に関する質問への即答・伴走サポート\n"
    "・業務で使えるプロンプトの提案（コピペですぐ使える）\n"
    "・メール文面作成、データ分析、報告書要約などの実務支援\n"
    "・初心者向けの丁寧なガイド\n"
    "・DXチームへのエスカレーション連携\n\n"
    "初心者の方にはやさしく丁寧に、上級者の方には制約付きの比較提案で対応します。"
)
TEAMS_ACCENT_COLOR = "#0078d4"
TEAMS_DEVELOPER_NAME = "GPQ DX Team"

# ── PVA YAML 構築 ─────────────────────────────────────────

def _build_gpt_yaml() -> str:
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
        f"conversationStarters:\n\n{starters_block}\n\n"
    )

GPT_YAML = _build_gpt_yaml()

# ── Step 1: Bot 検索 ─────────────────────────────────────

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

    env_bot_id = os.environ.get("BOT_ID", "")
    if env_bot_id:
        bot_id = _extract_bot_id(env_bot_id)
        if bot_id:
            print(f"  BOT_ID から自動判別: {bot_id}")
            return bot_id
        else:
            print(f"  ⚠️  BOT_ID の形式が不正: {env_bot_id}")
            sys.exit(1)

    existing = api_get("bots", {"$filter": f"name eq '{BOT_NAME}'"})
    if existing.get("value"):
        bot_id = existing["value"][0]["botid"]
        print(f"  既存 Bot を発見: {bot_id}")
        return bot_id

    sol_label = f"{SOLUTION_DISPLAY_NAME}（スキーマ名: {SOLUTION_NAME}）" if SOLUTION_DISPLAY_NAME else SOLUTION_NAME
    print("  ❌ Bot が見つかりません。")
    print()
    print("  Copilot Studio UI でエージェントを作成してください:")
    print(f"    1. https://copilotstudio.microsoft.com/ にアクセス")
    print(f"    2. 「+ 作成」をクリック")
    print(f"    3. エージェント名: {BOT_NAME}")
    print(f"    4. 「エージェント設定 (オプション)」を展開:")
    print(f"       - 言語: 日本語 (日本)")
    print(f"       - ソリューション: {sol_label}")
    print(f"       - スキーマ名: {BOT_SCHEMA}")
    print(f"    5. 「作成」をクリック")
    print(f"    6. 作成後のブラウザ URL を .env に貼り付け:")
    print(f"       BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-xxxx-.../overview")
    print(f"    7. 再実行: python scripts/deploy_agent.py")
    sys.exit(1)


# ── Step 1.5: プロビジョニング待ち ────────────────────────

def _wait_for_provisioning(bot_id: str, timeout: int = 120) -> bool:
    print("\n=== Step 1.5: プロビジョニング待ち ===")
    elapsed = 0
    interval = 10
    while elapsed < timeout:
        topics = api_get("botcomponents",
                         {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 1",
                          "$select": "botcomponentid"})
        if topics.get("value"):
            print(f"  プロビジョニング完了（トピック {len(topics['value'])} 件検出、{elapsed}秒経過）")
            return True
        gpt = api_get("botcomponents",
                      {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                       "$select": "botcomponentid"})
        if gpt.get("value"):
            print(f"  プロビジョニング完了（GPT コンポーネント検出、{elapsed}秒経過）")
            return True
        print(f"  待機中... ({elapsed}/{timeout}秒)")
        time.sleep(interval)
        elapsed += interval
    print(f"  ⚠️ {timeout}秒タイムアウト")
    return False


# ── Step 2: カスタムトピック削除 ──────────────────────────

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
    if not topics.get("value"):
        print("  ⚠️ トピックが 0 件です")
    count = 0
    for topic in topics.get("value", []):
        name = topic.get("name", "")
        schema = topic.get("schemaname", "")
        if name.startswith("system_"):
            continue
        if any(p in schema for p in PROTECTED_TOPIC_PATTERNS):
            print(f"  保護: {name} ({schema})")
            continue
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
            "useModelKnowledge": True,
            "isFileAnalysisEnabled": True,
            "isSemanticSearchEnabled": True,
            "optInUseLatestModels": False,
        },
        "recognizer": {"$kind": "GenerativeAIRecognizer"},
    }

    merged = _deep_merge(existing_config, overrides)
    api_patch(f"bots({bot_id})", {"configuration": json.dumps(merged)})
    print("  生成オーケストレーション有効化完了")
    return existing_config


# ── Step 4: Instructions 設定 ─────────────────────────────

def set_gpt_instructions(bot_id: str, saved_config: dict):
    print("\n=== Step 4: 指示（Instructions）設定 ===")

    default_schema = saved_config.get("gPTSettings", {}).get("defaultSchemaName", "")

    existing = api_get("botcomponents",
                       {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
                        "$select": "botcomponentid,name,schemaname,data"})
    comps = existing.get("value", [])

    ui_comp = None
    extra_comps = []
    for comp in comps:
        schema = comp.get("schemaname", "")
        if default_schema and schema == default_schema:
            ui_comp = comp
        else:
            extra_comps.append(comp)

    if ui_comp is None and comps:
        ui_comp = comps[0]
        extra_comps = comps[1:]

    for comp in extra_comps:
        try:
            api_delete(f"botcomponents({comp['botcomponentid']})")
            print(f"  余分なコンポーネント削除: {comp.get('schemaname', comp['botcomponentid'])}")
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
            print(f"  既存 aISettings を保持")

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
        comp_id = None
        print(f"  指示コンポーネント新規作成: {schema_name}")

    print("  指示の設定完了")
    return comp_id


# ── Step 4.5: 会話の開始設定 ──────────────────────────────

def set_quick_replies(bot_id: str):
    print("\n=== Step 4.5: 会話の開始設定 ===")

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

    id_match = re.search(r'id:\s+(sendMessage_\w+)', existing_data)
    send_id = id_match.group(1) if id_match else "sendMessage_auto01"

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

    new_data = "\n\n".join(lines) + "\n\n"
    api_patch(f"botcomponents({topic_id})", {"data": new_data})
    print(f"  挨拶メッセージ: {GREETING_MESSAGE[:50]}...")
    print(f"  クイック返信 {len(QUICK_REPLIES)} 件を設定")


# ── Step 5: エージェント公開 ──────────────────────────────

def publish_bot(bot_id: str):
    print("\n=== Step 5: エージェント公開 ===")
    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  公開完了")
    except Exception as e:
        print(f"  ⚠️ 公開でエラー（手動で公開してください）: {e}")


# ── Step 6: 説明の設定 ────────────────────────────────────

def set_description(bot_id: str, comp_id: str | None = None):
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


# ── Step 7: Teams チャネル設定 ────────────────────────────

def set_channel_manifest(bot_id: str):
    print("\n=== Step 7: Teams チャネル公開設定 ===")

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

    existing_ami["teams"] = existing_teams

    copilot_chat = existing_ami.get("copilotChat", {})
    copilot_chat["isEnabled"] = True
    existing_ami["copilotChat"] = copilot_chat

    bot_name_data = api_get(f"bots({bot_id})?$select=name")
    api_patch(f"bots({bot_id})", {
        "name": bot_name_data["name"],
        "applicationmanifestinformation": json.dumps(existing_ami),
    })
    print("  チャネル公開設定完了")


def publish_to_channels(bot_id: str):
    print("\n=== Step 8: チャネル公開実行 ===")

    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  エージェント再公開完了")
    except Exception as e:
        print(f"  ⚠️ 再公開エラー: {e}")

    bot_data = api_get(f"bots({bot_id})?$select=configuration")
    config = json.loads(bot_data.get("configuration", "{}") or "{}")
    channels = config.get("channels", [])
    channel_ids = [ch.get("channelId") for ch in channels]

    if "msteams" not in channel_ids:
        channels.append({"id": None, "channelId": "msteams", "channelSpecifier": None, "displayName": None})
        print("  msteams チャネルを追加")

    if "Microsoft365Copilot" not in channel_ids:
        channels.append({"id": None, "channelId": "Microsoft365Copilot", "channelSpecifier": None, "displayName": None})
        print("  Microsoft365Copilot チャネルを追加")

    config["channels"] = channels
    api_patch(f"bots({bot_id})", {"configuration": json.dumps(config)})
    print("  チャネル設定更新完了")

    try:
        api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  最終公開完了")
    except Exception as e:
        print(f"  ⚠️ 最終公開エラー: {e}")


# ── メイン ────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  GPQ AI よろず相談パートナー デプロイ")
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
    print(f"       - {PREFIX}_yorozuinquiry（よろず相談）")
    print()
    print("  2. ツール（Dataverse MCP Server）の追加:")
    print("     → ツール タブ → Dataverse MCP Server を追加")
    print("     → レコードの作成・更新アクションを有効化")
    print()
    print("  3. Power Automate フローの追加（エスカレーション通知）:")
    print("     → python scripts/deploy_escalation_flow.py を実行")
    print()


if __name__ == "__main__":
    main()
