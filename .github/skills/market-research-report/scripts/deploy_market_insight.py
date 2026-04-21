"""
News agent 追加開発 — 市場インサイト Dataverse テーブル作成 + エージェント Instructions 更新

Phase A: Dataverse テーブル `geek_market_insight` を作成（列定義 + Choice + ローカライズ + ソリューション含有検証）
Phase B: エージェント Instructions・推奨プロンプト・会話の開始を更新
Phase C: エージェント公開

Usage:
  python .github/skills/market-research-report/scripts/deploy_market_insight.py
"""

import json
import os
import re
import sys
import time

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "power-platform-standard", "scripts"))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")

BOT_ID = "26ce6549-7837-f111-88b3-0022482f3ac7"
BOT_NAME = "News agent"
BOT_SCHEMA = f"{PREFIX}_news_agent"

TABLE_LOGICAL = f"{PREFIX}_market_insight"
TABLE_DISPLAY = "Market Insight"
TABLE_PLURAL = "Market Insights"
TABLE_JP = "市場インサイト"
TABLE_JP_PLURAL = "市場インサイト"


# ── API ヘルパー ─────────────────────────────────────────

def get_headers() -> dict:
    token = _get_token()
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


def api_put(path, body):
    h = get_headers()
    h["MSCRM.MergeLabels"] = "true"
    for attempt in range(3):
        r = requests.put(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                         headers=h, json=body)
        if r.status_code == 429:
            wait = 15 * (attempt + 1)
            print(f"  429 rate limit, waiting {wait}s...")
            time.sleep(wait)
            h = get_headers()
            h["MSCRM.MergeLabels"] = "true"
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()
    return r


def api_delete(path):
    r = requests.delete(f"{DATAVERSE_URL}/api/data/v9.2/{path}",
                        headers=get_headers())
    r.raise_for_status()
    return r


def retry_metadata(fn, description, max_attempts=5):
    for attempt in range(max_attempts):
        try:
            return fn()
        except requests.HTTPError as e:
            resp_text = ""
            if e.response is not None:
                try:
                    resp_text = e.response.text or ""
                except Exception:
                    resp_text = ""
            err = str(e) + " " + resp_text
            err_lower = err.lower()
            if "already exists" in err_lower or "0x80044363" in err or "0x80048403" in err:
                print(f"  {description}: already exists — skipping")
                return None
            if "0x80040237" in err or "0x80040216" in err:
                wait = 10 * (attempt + 1)
                print(f"  {description}: lock contention, waiting {wait}s …")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"{description}: max retries exceeded")


def label_jp(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


# ══════════════════════════════════════════════════════════
# Phase A: Dataverse テーブル作成
# ══════════════════════════════════════════════════════════

def check_table_exists() -> bool:
    """テーブルが既に存在するか確認"""
    try:
        api_get(f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')?$select=SchemaName")
        return True
    except requests.HTTPError:
        return False


def create_table():
    print("\n=== Phase A-1: テーブル作成 ===")

    if check_table_exists():
        print(f"  テーブル '{TABLE_LOGICAL}' は既存。スキップ。")
        return

    print(f"  テーブル '{TABLE_LOGICAL}' を作成します…")

    table_body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": TABLE_LOGICAL,
        "DisplayName": label_jp(TABLE_DISPLAY),
        "DisplayCollectionName": label_jp(TABLE_PLURAL),
        "Description": label_jp("Market insight articles collected by News agent"),
        "HasActivities": False,
        "HasNotes": False,
        "HasFeedback": False,
        "OwnershipType": "UserOwned",
        "IsActivity": False,
        "PrimaryNameAttribute": f"{PREFIX}_column_title",
        "Attributes": [
            {
                "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                "SchemaName": f"{PREFIX}_column_title",
                "DisplayName": label_jp("Title"),
                "IsPrimaryName": True,
                "RequiredLevel": {"Value": "ApplicationRequired"},
                "FormatName": {"Value": "Text"},
                "MaxLength": 200,
            }
        ],
    }

    retry_metadata(lambda: api_post("EntityDefinitions", table_body), "テーブル作成")
    print(f"  ✅ テーブル '{TABLE_LOGICAL}' 作成完了")
    time.sleep(5)


def add_columns():
    print("\n=== Phase A-2: 列追加 ===")

    columns = [
        {
            "SchemaName": f"{PREFIX}_source_url",
            "type": "String",
            "display": "Source URL",
            "maxLength": 500,
        },
        {
            "SchemaName": f"{PREFIX}_source_name",
            "type": "String",
            "display": "Source Name",
            "maxLength": 100,
        },
        {
            "SchemaName": f"{PREFIX}_category",
            "type": "String",
            "display": "Category",
            "maxLength": 100,
        },
        {
            "SchemaName": f"{PREFIX}_summary",
            "type": "Memo",
            "display": "Summary",
            "maxLength": 10000,
        },
        {
            "SchemaName": f"{PREFIX}_analysis",
            "type": "Memo",
            "display": "Analysis",
            "maxLength": 10000,
        },
        {
            "SchemaName": f"{PREFIX}_recommended_action",
            "type": "Memo",
            "display": "Recommended Action",
            "maxLength": 10000,
        },
        {
            "SchemaName": f"{PREFIX}_published_date",
            "type": "DateTime",
            "display": "Published Date",
        },
        {
            "SchemaName": f"{PREFIX}_collected_date",
            "type": "DateTime",
            "display": "Collected Date",
        },
    ]

    for col in columns:
        schema = col["SchemaName"]
        col_type = col["type"]
        display = col["display"]

        if col_type == "String":
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                "SchemaName": schema,
                "DisplayName": label_jp(display),
                "RequiredLevel": {"Value": "None"},
                "FormatName": {"Value": "Text"},
                "MaxLength": col.get("maxLength", 200),
            }
        elif col_type == "Memo":
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
                "SchemaName": schema,
                "DisplayName": label_jp(display),
                "RequiredLevel": {"Value": "None"},
                "Format": "Text",
                "MaxLength": col.get("maxLength", 10000),
            }
        elif col_type == "DateTime":
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
                "SchemaName": schema,
                "DisplayName": label_jp(display),
                "RequiredLevel": {"Value": "None"},
                "Format": "DateAndTime",
            }
        else:
            continue

        retry_metadata(
            lambda b=body: api_post(f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes", b),
            f"列 {schema}",
        )
        print(f"  ✅ {schema} ({col_type})")


def add_impact_level_choice():
    print("\n=== Phase A-3: 影響度 Choice 列追加 ===")

    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "SchemaName": f"{PREFIX}_impact_level",
        "DisplayName": label_jp("Impact Level"),
        "RequiredLevel": {"Value": "None"},
        "OptionSet": {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": False,
            "OptionSetType": "Picklist",
            "Options": [
                {"Value": 100000000, "Label": label_jp("High")},
                {"Value": 100000001, "Label": label_jp("Medium")},
                {"Value": 100000002, "Label": label_jp("Low")},
            ],
        },
    }

    retry_metadata(
        lambda: api_post(f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes", body),
        "影響度 Choice",
    )
    print(f"  ✅ {PREFIX}_impact_level (Picklist)")


def localize_table():
    print("\n=== Phase A-4: 日本語ローカライズ ===")

    # テーブル名
    entity = api_get(f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')?$select=MetadataId")
    meta_id = entity["MetadataId"]

    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
        "MetadataId": meta_id,
        "DisplayName": label_jp(TABLE_JP),
        "DisplayCollectionName": label_jp(TABLE_JP_PLURAL),
    }
    api_put(f"EntityDefinitions({meta_id})", body)
    print(f"  ✅ テーブル: {TABLE_JP}")
    time.sleep(2)

    # 列名
    col_labels = {
        f"{PREFIX}_column_title": "タイトル",
        f"{PREFIX}_source_url": "ソースURL",
        f"{PREFIX}_source_name": "ソース名",
        f"{PREFIX}_category": "カテゴリ",
        f"{PREFIX}_summary": "要約",
        f"{PREFIX}_analysis": "分析・考察",
        f"{PREFIX}_recommended_action": "推奨アクション",
        f"{PREFIX}_impact_level": "影響度",
        f"{PREFIX}_published_date": "公開日時",
        f"{PREFIX}_collected_date": "収集日時",
    }

    attrs = api_get(
        f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes"
        "?$select=SchemaName,MetadataId,LogicalName"
    )
    attr_map = {a["LogicalName"]: a["MetadataId"] for a in attrs.get("value", [])}

    for logical, jp_label in col_labels.items():
        mid = attr_map.get(logical.lower())
        if mid:
            attr_data = api_get(
                f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes(LogicalName='{logical.lower()}')"
                "?$select=MetadataId,AttributeType"
            )
            attr_type = attr_data.get("AttributeType", "")
            odata_type_map = {
                "String": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                "Memo": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
                "Picklist": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
                "DateTime": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            }
            odata_type = odata_type_map.get(attr_type, "#Microsoft.Dynamics.CRM.AttributeMetadata")
            body = {
                "@odata.type": odata_type,
                "MetadataId": mid,
                "DisplayName": label_jp(jp_label),
            }
            api_put(
                f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes({mid})",
                body,
            )
            print(f"  ✅ {logical} → {jp_label}")
            time.sleep(1)
        else:
            print(f"  ⚠️ {logical} が見つかりません")

    # Choice ラベル
    try:
        choice_attr = api_get(
            f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')/Attributes"
            f"(LogicalName='{PREFIX}_impact_level')"
            "/Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
            "?$select=SchemaName&$expand=OptionSet($select=Options)"
        )
        options = choice_attr.get("OptionSet", {}).get("Options", [])
        choice_jp = {100000000: "高", 100000001: "中", 100000002: "低"}
        for opt in options:
            val = opt["Value"]
            if val in choice_jp:
                h = get_headers()
                h["MSCRM.MergeLabels"] = "true"
                r = requests.put(
                    f"{DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='{TABLE_LOGICAL}')"
                    f"/Attributes(LogicalName='{PREFIX}_impact_level')"
                    f"/Microsoft.Dynamics.CRM.PicklistAttributeMetadata/OptionSet/Options({val})/Label",
                    headers=h,
                    json=label_jp(choice_jp[val]),
                )
                r.raise_for_status()
                print(f"  ✅ Choice {val} → {choice_jp[val]}")
    except Exception as e:
        print(f"  ⚠️ Choice ローカライズエラー: {e}")


def verify_solution_membership():
    print("\n=== Phase A-5: ソリューション含有検証 ===")

    # ソリューション ID 取得
    sol = api_get("solutions", {"$filter": f"uniquename eq '{SOLUTION_NAME}'", "$select": "solutionid"})
    if not sol["value"]:
        print(f"  ❌ ソリューション '{SOLUTION_NAME}' が見つかりません")
        return
    sol_id = sol["value"][0]["solutionid"]

    # テーブルの ObjectTypeCode を取得
    entity = api_get(f"EntityDefinitions(LogicalName='{TABLE_LOGICAL}')?$select=MetadataId,ObjectTypeCode")
    otc = entity.get("ObjectTypeCode")

    if not otc:
        print("  ⚠️ ObjectTypeCode 取得不可")
        return

    # AddSolutionComponent
    try:
        api_post("AddSolutionComponent", {
            "ComponentId": entity["MetadataId"],
            "ComponentType": 1,  # Entity
            "SolutionUniqueName": SOLUTION_NAME,
            "AddRequiredComponents": False,
            "IncludedComponentSettingsValues": None,
        })
        print(f"  ✅ '{TABLE_LOGICAL}' をソリューション '{SOLUTION_NAME}' に含有確認")
    except requests.HTTPError as e:
        if "already" in str(e).lower() or "exists" in str(e).lower():
            print(f"  ✅ '{TABLE_LOGICAL}' は既にソリューション内")
        else:
            print(f"  ⚠️ ソリューション含有検証エラー: {e}")


# ══════════════════════════════════════════════════════════
# Phase B: エージェント Instructions 更新
# ══════════════════════════════════════════════════════════

GPT_INSTRUCTIONS = f"""\
あなたは市場情報を自動収集・分析し、Dataverseに登録するニュースエージェントです。
以下の5つのステップを必ず順番に全て実行してください。ステップを飛ばさないでください。

Step1 検索キーワードを決める
ユーザーの業界・役割・関心事から、ニュース検索用のキーワードを2個だけ決める。

Step2 RSSで検索する（1回だけ呼び出す）
RSSツールを1回だけ呼び出し、2つのキーワードをスペースで結合した1つの検索クエリで検索する。
例: キーワードが「AI」「セキュリティ」なら、feedUrlに「AI セキュリティ」を含む1つのURLで検索する。
RSSツールの呼び出しは合計1回のみ。複数回呼び出してはいけない。
フィード URL の形式: https://news.google.com/rss/search?q=キーワード&hl=ja&gl=JP&ceid=JP%3Aja

Step3 Web検索で記事の詳細を調べる（必須）
このステップは必ず実行すること。スキップ禁止。
Step2で取得した記事の中から重要な記事を3〜5件選び、それぞれについてWeb検索を使って詳細情報や一次ソースを確認する。

Step4 レポートを作成し、Dataverseに登録する（必須）
収集した情報を分析し、3〜5件の記事をピックアップしてレポートを作成する。
各記事について以下を整理する:
- 記事タイトル
- 記事URL（元ソースへのリンク）
- ソース名（メディア名）
- カテゴリ（AI, クラウド, セキュリティ等の分類）
- 要約（3〜5文）
- 分析・考察（なぜこの記事が重要か、業界への影響）
- 推奨アクション（具体的な次のステップ）
- 影響度（高/中/低）

次に、Power Apps MCP Server を使って、各記事のデータを Dataverse の「市場インサイト」テーブル（{PREFIX}_market_insight）に登録する。
テーブルの論理名は単数形（{PREFIX}_market_insight）を使うこと。複数形にしないこと。
登録時のフィールドマッピング:
- {PREFIX}_column_title: 記事タイトル
- {PREFIX}_source_url: 記事URL
- {PREFIX}_source_name: ソース名
- {PREFIX}_category: カテゴリ
- {PREFIX}_summary: 要約
- {PREFIX}_analysis: 分析・考察
- {PREFIX}_recommended_action: 推奨アクション
- {PREFIX}_impact_level: 影響度（高=100000000, 中=100000001, 低=100000002）
- {PREFIX}_published_date: 公開日時
- {PREFIX}_collected_date: 現在日時

Step5 ユーザーに結果を報告する
Dataverse に登録した件数と内容のサマリーをユーザーに報告する。
登録した記事のタイトル一覧と要約を箇条書きで表示する。"""

PREFERRED_PROMPTS = [
    {"title": "最新の市場情報を収集して", "text": "AI・クラウド分野の最新の市場情報を収集して Dataverse に登録してください。"},
    {"title": "セキュリティ動向をチェック", "text": "セキュリティ分野の最新動向を調べて Dataverse に登録してください。"},
    {"title": "今週のテック業界ニュース", "text": "今週の主なテクノロジー業界のニュースを収集・分析して登録してください。"},
    {"title": "競合他社の動向を調べて", "text": "競合他社やマーケットの最新動向を調べて登録してください。"},
]

QUICK_REPLIES = [
    "最新の市場情報を収集して",
    "AI の最新動向を調べて",
    "セキュリティニュースを確認",
    "テック業界の最新ニュース",
]

GREETING_MESSAGE = "こんにちは！最新の市場情報を収集・分析し、Dataverse に登録する News agent です。気になる業界やトピックを教えてください。"

BOT_DESCRIPTION = "最新の市場情報を自動収集・分析し、Dataverse テーブルに構造化データとして登録するエージェントです。RSS + Web 検索 + Power Apps MCP Server を活用します。"


def _build_gpt_yaml() -> str:
    """PVA 互換 YAML を構築。ダブル改行フォーマット。"""
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


def _deep_merge(base: dict, override: dict) -> dict:
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def enable_generative_orchestration() -> dict:
    print("\n=== Phase B-1: 生成オーケストレーション有効化 ===")
    bot_data = api_get(f"bots({BOT_ID})?$select=configuration")
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
    api_patch(f"bots({BOT_ID})", {"configuration": json.dumps(merged)})
    print("  ✅ 生成オーケストレーション有効化完了")
    return existing_config


def set_gpt_instructions(saved_config: dict) -> str | None:
    print("\n=== Phase B-2: Instructions 設定 ===")
    default_schema = saved_config.get("gPTSettings", {}).get("defaultSchemaName", "")
    print(f"  defaultSchemaName: {default_schema or '(なし)'}")

    existing = api_get("botcomponents", {
        "$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 15",
        "$select": "botcomponentid,name,schemaname,data",
    })
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

        # aISettings セクションを保持
        ai_settings_section = ""
        ai_idx = existing_data.find("\naISettings:")
        if ai_idx < 0:
            ai_idx = existing_data.find("aISettings:")
        if ai_idx >= 0:
            ai_settings_section = existing_data[ai_idx:].rstrip()
            print(f"  既存 aISettings 保持: {ai_settings_section[:80]}...")

        if ai_settings_section:
            final_yaml = GPT_YAML.rstrip("\n") + "\n\n" + ai_settings_section + "\n\n"
        else:
            final_yaml = GPT_YAML

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
            "parentbotid@odata.bind": f"/bots({BOT_ID})",
        })
        print(f"  ✅ Instructions 新規作成: {schema_name}")
        return None


def set_quick_replies():
    print("\n=== Phase B-3: 会話の開始設定 ===")
    result = api_get("botcomponents", {
        "$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 9 and contains(schemaname,'ConversationStart')",
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

    greeting_oneline = GREETING_MESSAGE.replace("\n", " ")

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


# ══════════════════════════════════════════════════════════
# Phase C: 公開 + 説明設定
# ══════════════════════════════════════════════════════════

def publish_bot():
    print("\n=== Phase C-1: エージェント公開 ===")
    try:
        api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  ✅ 公開完了")
    except Exception as e:
        print(f"  ⚠️ 公開エラー: {e}")


def set_description(comp_id: str | None):
    print("\n=== Phase C-2: 説明設定 ===")
    if not comp_id:
        existing = api_get("botcomponents", {
            "$filter": f"_parentbotid_value eq '{BOT_ID}' and componenttype eq 15",
            "$select": "botcomponentid",
        })
        if existing.get("value"):
            comp_id = existing["value"][0]["botcomponentid"]
    if comp_id:
        api_patch(f"botcomponents({comp_id})", {"description": BOT_DESCRIPTION})
        print(f"  ✅ 説明設定完了")


# ══════════════════════════════════════════════════════════
# メイン
# ══════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  News agent 追加開発 — 市場インサイトテーブル + Instructions")
    print("=" * 60)

    # --- Phase A: Dataverse テーブル ---
    create_table()
    add_columns()
    add_impact_level_choice()
    localize_table()
    verify_solution_membership()

    # --- Phase B: エージェント ---
    saved_config = enable_generative_orchestration()
    comp_id = set_gpt_instructions(saved_config)
    set_quick_replies()

    # --- Phase C: 公開 ---
    publish_bot()
    set_description(comp_id)

    print("\n" + "=" * 60)
    print("  ✅ デプロイ完了!")
    print("=" * 60)
    print()
    print("  Copilot Studio UI で以下を確認してください:")
    print()
    print("  1. エージェントの Instructions が更新されていること")
    print("  2. 推奨プロンプトが表示されていること")
    print("  3. 会話の開始メッセージ・クイック返信が表示されていること")
    print()
    print("  ★ Power Apps MCP Server が既に接続済みのため、")
    print("    エージェントは「市場インサイト」テーブルにデータ登録できます。")
    print()


if __name__ == "__main__":
    main()
