"""
よろず相談ボット Dataverse テーブル構築スクリプト
================================================
GPQ よろず相談パートナーの相談データを格納する Dataverse テーブルを構築する。

前提:
  - auth_helper.py が scripts/ ディレクトリに存在
  - .env に DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定済み
  - pip install azure-identity requests python-dotenv

使い方:
  cd scripts && python setup_dataverse.py
"""
import os
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from auth_helper import (
    api_get,
    api_post,
    api_patch,
    api_delete,
    api_request,
    retry_metadata,
    DATAVERSE_URL,
)

# ── 環境変数 ──────────────────────────────────────────────
def get_required_env_vars():
    required_env = {
        "DATAVERSE_URL": DATAVERSE_URL,
        "SOLUTION_NAME": os.environ.get("SOLUTION_NAME", "").strip(),
        "PUBLISHER_PREFIX": os.environ.get("PUBLISHER_PREFIX", "").strip(),
    }
    missing = [name for name, value in required_env.items() if not value]
    if missing:
        print(
            "Error: Required environment variables are missing or empty: "
            + ", ".join(missing)
            + ". Please set them in your environment or .env before running.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return required_env


REQUIRED_ENV_VARS = get_required_env_vars()
SOLUTION_NAME = REQUIRED_ENV_VARS["SOLUTION_NAME"]
PREFIX = REQUIRED_ENV_VARS["PUBLISHER_PREFIX"]
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", "よろず相談ボット")


# ════════════════════════════════════════════════════════════════
# ▼▼▼ プロジェクト固有: よろず相談ボット テーブル定義 ▼▼▼
# ════════════════════════════════════════════════════════════════

TABLES = [
    {
        "logical": f"{PREFIX}_yorozuinquiry",
        "display": "Yorozu Inquiry",
        "plural": "Yorozu Inquiries",
        "description": "よろず相談ボットの相談記録テーブル",
        "columns": [
            # 部門（Picklist）
            {
                "logical": f"{PREFIX}_department",
                "type": "Picklist",
                "display": "Department",
                "options": [
                    (100000000, "Logistics"),
                    (100000001, "Procurement"),
                    (100000002, "Quality"),
                    (100000003, "Other"),
                ],
            },
            # メールアドレス
            {
                "logical": f"{PREFIX}_email",
                "type": "String",
                "display": "Email",
                "maxLength": 200,
            },
            # 質問内容
            {
                "logical": f"{PREFIX}_question",
                "type": "Memo",
                "display": "Question",
                "maxLength": 4000,
            },
            # 回答内容
            {
                "logical": f"{PREFIX}_answer",
                "type": "Memo",
                "display": "Answer",
                "maxLength": 4000,
            },
            # 満足度（1-5）
            {
                "logical": f"{PREFIX}_satisfaction",
                "type": "Integer",
                "display": "Satisfaction",
                "minValue": 1,
                "maxValue": 5,
            },
            # 分類（Picklist）
            {
                "logical": f"{PREFIX}_category",
                "type": "Picklist",
                "display": "Category",
                "options": [
                    (100000000, "Information"),
                    (100000001, "Task Support"),
                    (100000002, "Design Consultation"),
                    (100000003, "Troubleshooting"),
                ],
            },
            # DXサポート要否（Boolean）
            {
                "logical": f"{PREFIX}_supportneeded",
                "type": "Boolean",
                "display": "Support Needed",
                "true_label": "Required",
                "false_label": "Not Required",
            },
            # ステータス（Picklist）
            {
                "logical": f"{PREFIX}_status",
                "type": "Picklist",
                "display": "Status",
                "options": [
                    (100000000, "Received"),
                    (100000001, "In Progress"),
                    (100000002, "Completed"),
                    (100000003, "Incomplete"),
                    (100000004, "Escalated"),
                ],
            },
            # プロンプトレベル診断（Picklist）
            {
                "logical": f"{PREFIX}_promptlevel",
                "type": "Picklist",
                "display": "Prompt Level",
                "options": [
                    (100000000, "L1 Basic"),
                    (100000001, "L2 Execution"),
                    (100000002, "L3 Companion"),
                    (100000003, "L4 Design"),
                ],
            },
            # AI有効性（Picklist）
            {
                "logical": f"{PREFIX}_aieffectiveness",
                "type": "Picklist",
                "display": "AI Effectiveness",
                "options": [
                    (100000000, "Effective"),
                    (100000001, "Partially Effective"),
                    (100000002, "Ineffective"),
                ],
            },
            # 意図一致（Picklist）
            {
                "logical": f"{PREFIX}_intentmatch",
                "type": "Picklist",
                "display": "Intent Match",
                "options": [
                    (100000000, "Matched"),
                    (100000001, "Partially Matched"),
                    (100000002, "Mismatched"),
                ],
            },
            # 回答モード（Picklist）
            {
                "logical": f"{PREFIX}_responsemode",
                "type": "Picklist",
                "display": "Response Mode",
                "options": [
                    (100000000, "Instant"),
                    (100000001, "Companion"),
                ],
            },
            # 解決状況（Picklist）
            {
                "logical": f"{PREFIX}_resolutionstatus",
                "type": "Picklist",
                "display": "Resolution Status",
                "options": [
                    (100000000, "Resolved"),
                    (100000001, "Unresolved"),
                ],
            },
            # エスカレーション理由
            {
                "logical": f"{PREFIX}_escalationreason",
                "type": "Memo",
                "display": "Escalation Reason",
                "maxLength": 2000,
            },
            # フィードバックコメント
            {
                "logical": f"{PREFIX}_feedbackcomment",
                "type": "Memo",
                "display": "Feedback Comment",
                "maxLength": 2000,
            },
            # 相談日時
            {
                "logical": f"{PREFIX}_inquirydate",
                "type": "DateTime",
                "display": "Inquiry Date",
                "format": "DateAndTime",
            },
        ],
    },
]

LOOKUPS = [
    # 現時点では Lookup なし（ユーザーは createdby システム列で追跡）
]

# ── ローカライズ定義 ─────────────────────────────────────

LOCALIZE_TABLES = [
    (f"{PREFIX}_yorozuinquiry", "よろず相談", "よろず相談一覧"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_name", "相談件名"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_department", "部門"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_email", "メールアドレス"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_question", "質問"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_answer", "回答"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_satisfaction", "満足度"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_category", "分類"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_supportneeded", "DXサポート要否"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_promptlevel", "プロンプトレベル診断"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_aieffectiveness", "AI有効性"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_intentmatch", "意図一致"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_responsemode", "回答モード"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_resolutionstatus", "解決状況"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_escalationreason", "エスカレーション理由"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_feedbackcomment", "フィードバックコメント"),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_inquirydate", "相談日時"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_department", [
        (100000000, "物流"),
        (100000001, "購買"),
        (100000002, "品質"),
        (100000003, "その他"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_category", [
        (100000000, "情報取得"),
        (100000001, "作業支援"),
        (100000002, "設計相談"),
        (100000003, "トラブル対応"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_status", [
        (100000000, "受付済み"),
        (100000001, "対応中"),
        (100000002, "完了"),
        (100000003, "未完了"),
        (100000004, "エスカレーション済み"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_promptlevel", [
        (100000000, "L1 基本"),
        (100000001, "L2 実行"),
        (100000002, "L3 伴走"),
        (100000003, "L4 設計"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_aieffectiveness", [
        (100000000, "有効"),
        (100000001, "部分有効"),
        (100000002, "無効"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_intentmatch", [
        (100000000, "合っていた"),
        (100000001, "一部ずれた"),
        (100000002, "ずれていた"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_responsemode", [
        (100000000, "即答"),
        (100000001, "伴走"),
    ]),
    (f"{PREFIX}_yorozuinquiry", f"{PREFIX}_resolutionstatus", [
        (100000000, "解決"),
        (100000001, "未解決"),
    ]),
]

# ════════════════════════════════════════════════════════════════
# ▲▲▲ プロジェクト固有: ここまで ▲▲▲
# ════════════════════════════════════════════════════════════════


# ── 共通ヘルパー ─────────────────────────────────────────────

def label_jp(text: str) -> dict:
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


def _save_env_value(key: str, value: str):
    script_dir = Path(__file__).resolve().parent
    project_root = next(
        (p for p in [script_dir, *script_dir.parents] if (p / ".env.example").exists() or (p / ".git").exists()),
        script_dir,
    )
    env_path = project_root / ".env"
    lines = []
    found = False
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}\n")
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def get_entity_set_name(logical_name: str) -> str:
    meta = api_get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=EntitySetName")
    return meta["EntitySetName"]


def get_navprop(from_logical: str, to_logical: str) -> str | None:
    rels = api_get(
        f"EntityDefinitions(LogicalName='{from_logical}')/ManyToOneRelationships"
        f"?$filter=ReferencedEntity eq '{to_logical}'"
        f"&$select=ReferencingEntityNavigationPropertyName"
    )
    if rels.get("value"):
        return rels["value"][0]["ReferencingEntityNavigationPropertyName"]
    return None


# ── Step 1: ソリューション ──────────────────────────────────

def ensure_solution():
    global SOLUTION_DISPLAY_NAME
    print("\n=== Step 1: ソリューション確認 ===")
    existing = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")
    if existing.get("value"):
        display_name = existing["value"][0].get("friendlyname", SOLUTION_DISPLAY_NAME)
        print(f"  ソリューション '{SOLUTION_NAME}' は既存（表示名: {display_name}）。スキップ。")
        SOLUTION_DISPLAY_NAME = display_name
        _save_env_value("SOLUTION_DISPLAY_NAME", display_name)
        return

    print(f"  ソリューション '{SOLUTION_NAME}' を作成します…")
    pubs = api_get(f"publishers?$filter=customizationprefix eq '{PREFIX}'&$select=publisherid")
    if not pubs.get("value"):
        raise RuntimeError(f"パブリッシャー prefix='{PREFIX}' が見つかりません。Power Apps で作成してください。")
    pub_id = pubs["value"][0]["publisherid"]

    api_post("solutions", {
        "uniquename": SOLUTION_NAME,
        "friendlyname": SOLUTION_DISPLAY_NAME,
        "version": "1.0.0.0",
        "publisherid@odata.bind": f"/publishers({pub_id})",
    })

    _save_env_value("SOLUTION_DISPLAY_NAME", SOLUTION_DISPLAY_NAME)
    print(f"  ソリューション作成完了（表示名: {SOLUTION_DISPLAY_NAME}）")


# ── Step 2: テーブル作成 ─────────────────────────────────────

def build_column_body(col: dict) -> dict:
    base = {
        "SchemaName": col["logical"],
        "DisplayName": label_jp(col["display"]),
        "RequiredLevel": {"Value": "None"},
    }

    if col["type"] == "Memo":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        base["Format"] = "Text"
        base["MaxLength"] = col.get("maxLength", 2000)
    elif col["type"] == "Picklist":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": False,
            "OptionSetType": "Picklist",
            "Options": [
                {"Value": v, "Label": label_jp(lbl)} for v, lbl in col["options"]
            ],
        }
    elif col["type"] == "DateTime":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        base["Format"] = col.get("format", "DateAndTime")
    elif col["type"] == "String":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.StringAttributeMetadata"
        base["FormatName"] = {"Value": "Text"}
        base["MaxLength"] = col.get("maxLength", 200)
    elif col["type"] == "Integer":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 100000)
    elif col["type"] == "Boolean":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
            "TrueOption": {"Value": 1, "Label": label_jp(col.get("true_label", "はい"))},
            "FalseOption": {"Value": 0, "Label": label_jp(col.get("false_label", "いいえ"))},
        }

    return base


def create_tables():
    print("\n=== Step 2: テーブル作成 ===")

    for tbl in TABLES:
        logical = tbl["logical"]

        def _create(t=tbl):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                "SchemaName": t["logical"],
                "DisplayName": label_jp(t["display"]),
                "DisplayCollectionName": label_jp(t["plural"]),
                "Description": label_jp(t["description"]),
                "OwnershipType": "UserOwned",
                "IsActivity": False,
                "HasActivities": False,
                "HasNotes": False,
                "HasFeedback": False,
                "PrimaryNameAttribute": f"{PREFIX}_name",
                "Attributes": [
                    {
                        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                        "SchemaName": f"{PREFIX}_name",
                        "DisplayName": label_jp("Name"),
                        "IsPrimaryName": True,
                        "RequiredLevel": {"Value": "ApplicationRequired"},
                        "FormatName": {"Value": "Text"},
                        "MaxLength": 200,
                    }
                ],
            }
            api_post("EntityDefinitions", body, solution=SOLUTION_NAME)
            print(f"  テーブル '{logical}' 作成完了")

        retry_metadata(_create, f"テーブル {logical}")
        time.sleep(10)

        for col in tbl.get("columns", []):
            col_logical = col["logical"]

            try:
                api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName")
                print(f"    列 '{col_logical}' は既存。スキップ")
                continue
            except Exception:
                pass

            def _add_col(c=col, ln=logical):
                api_post(
                    f"EntityDefinitions(LogicalName='{ln}')/Attributes",
                    build_column_body(c),
                    solution=SOLUTION_NAME,
                )
                print(f"    列 '{c['logical']}' 追加完了")

            retry_metadata(_add_col, f"列 {col_logical}")
            time.sleep(5)


# ── Step 3: Lookup リレーション ──────────────────────────────

def create_lookups():
    print("\n=== Step 3: Lookup リレーションシップ作成 ===")

    if not LOOKUPS:
        print("  Lookup なし（MVP: createdby システム列でユーザー追跡）")
        return

    for lk in LOOKUPS:
        def _create(l=lk):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                "SchemaName": l["schema"],
                "ReferencedEntity": l["referenced"],
                "ReferencingEntity": l["referencing"],
                "Lookup": {
                    "SchemaName": l["lookup_attr"],
                    "DisplayName": label_jp(l["lookup_display"]),
                    "RequiredLevel": {"Value": "None"},
                },
            }
            api_post("RelationshipDefinitions", body, solution=SOLUTION_NAME)
            print(f"  Lookup '{l['schema']}' 作成完了")

        retry_metadata(_create, f"Lookup {lk['schema']}")
        time.sleep(5)


# ── Step 4: カスタマイズ公開 ──────────────────────────────────

def publish_all():
    print("\n  カスタマイズ公開中…")
    api_post("PublishAllXml", {})
    print("  公開完了")


# ── Step 5: 日本語ローカライズ ────────────────────────────────

def localize_tables():
    print("\n=== Step 5: 日本語ローカライズ ===")

    for logical, disp, plural in LOCALIZE_TABLES:
        data = api_get(
            f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId,DisplayName,DisplayCollectionName"
        )
        mid = data["MetadataId"]
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
            "DisplayCollectionName": label_jp(plural),
        }
        api_request(f"EntityDefinitions({mid})", body, method="PUT")
        print(f"  テーブル '{logical}' → '{disp}'")

    for table, col, disp in LOCALIZE_COLUMNS:
        data = api_get(
            f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{col}')"
            f"?$select=MetadataId,AttributeType"
        )
        mid = data["MetadataId"]
        attr_type = data.get("AttributeType", "")
        odata_type_map = {
            "String": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "Memo": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata",
            "Picklist": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "DateTime": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            "Lookup": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "Integer": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
            "Boolean": "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        }
        odata_type = odata_type_map.get(attr_type, "#Microsoft.Dynamics.CRM.AttributeMetadata")
        body = {
            "@odata.type": odata_type,
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
        }
        api_request(
            f"EntityDefinitions(LogicalName='{table}')/Attributes({mid})",
            body,
            method="PUT",
        )
        print(f"  列 '{table}.{col}' → '{disp}'")

    for table, col, options in LOCALIZE_OPTIONS:
        for value, label_text in options:
            body = {
                "EntityLogicalName": table,
                "AttributeLogicalName": col,
                "Value": value,
                "Label": label_jp(label_text),
                "MergeLabels": True,
            }
            api_post("UpdateOptionValue", body)
            print(f"    Option {col}={value} → '{label_text}'")


# ── Step 6: デモデータ投入 ────────────────────────────────────

def create_demo_data():
    print("\n=== Step 6: デモデータ投入 ===")

    inquiry_set = get_entity_set_name(f"{PREFIX}_yorozuinquiry")

    demo_records = [
        {
            f"{PREFIX}_name": "メール文面の作り方を教えてほしい",
            f"{PREFIX}_department": 100000000,  # 物流
            f"{PREFIX}_email": "demo-user1@example.com",
            f"{PREFIX}_question": "配送遅延のお詫びメールを書きたいのですが、どう書けばいいですか？",
            f"{PREFIX}_answer": "以下のプロンプトをCopilotで実行してください:\n\n「配送遅延のお詫びメールを作成してください。宛先は取引先の○○様、遅延理由は天候不良、到着予定は翌日です。丁寧で誠意が伝わる文面でお願いします。」",
            f"{PREFIX}_satisfaction": 5,
            f"{PREFIX}_category": 100000001,  # 作業支援
            f"{PREFIX}_supportneeded": False,
            f"{PREFIX}_status": 100000002,  # 完了
            f"{PREFIX}_promptlevel": 100000000,  # L1 基本
            f"{PREFIX}_aieffectiveness": 100000000,  # 有効
            f"{PREFIX}_intentmatch": 100000000,  # 合っていた
            f"{PREFIX}_responsemode": 100000000,  # 即答
            f"{PREFIX}_resolutionstatus": 100000000,  # 解決
            f"{PREFIX}_feedbackcomment": "すぐに使えて助かりました！",
        },
        {
            f"{PREFIX}_name": "見積比較表の整理を手伝ってほしい",
            f"{PREFIX}_department": 100000001,  # 購買
            f"{PREFIX}_email": "demo-user2@example.com",
            f"{PREFIX}_question": "3社からの見積もりを比較表にまとめたいのですが、どの観点で比較すればよいですか？",
            f"{PREFIX}_answer": "見積比較のポイントと、Copilotで比較表を作成するプロンプトを提示しました。伴走モードで対応中です。",
            f"{PREFIX}_satisfaction": 4,
            f"{PREFIX}_category": 100000001,  # 作業支援
            f"{PREFIX}_supportneeded": False,
            f"{PREFIX}_status": 100000002,  # 完了
            f"{PREFIX}_promptlevel": 100000001,  # L2 実行
            f"{PREFIX}_aieffectiveness": 100000000,  # 有効
            f"{PREFIX}_intentmatch": 100000000,  # 合っていた
            f"{PREFIX}_responsemode": 100000001,  # 伴走
            f"{PREFIX}_resolutionstatus": 100000000,  # 解決
            f"{PREFIX}_feedbackcomment": "比較観点が整理できてよかった",
        },
        {
            f"{PREFIX}_name": "不具合報告書の要約をしたい",
            f"{PREFIX}_department": 100000002,  # 品質
            f"{PREFIX}_email": "demo-user3@example.com",
            f"{PREFIX}_question": "長い不具合報告書を要約して上司に報告したいです。どうすればいいですか？",
            f"{PREFIX}_answer": "報告書の要約プロンプトと、重要ポイントの抽出方法を提示しました。",
            f"{PREFIX}_satisfaction": 3,
            f"{PREFIX}_category": 100000000,  # 情報取得
            f"{PREFIX}_supportneeded": True,
            f"{PREFIX}_status": 100000004,  # エスカレーション済み
            f"{PREFIX}_promptlevel": 100000002,  # L3 伴走
            f"{PREFIX}_aieffectiveness": 100000001,  # 部分有効
            f"{PREFIX}_intentmatch": 100000001,  # 一部ずれた
            f"{PREFIX}_responsemode": 100000001,  # 伴走
            f"{PREFIX}_resolutionstatus": 100000001,  # 未解決
            f"{PREFIX}_escalationreason": "機密情報を含む報告書のため、AI単独での処理が困難。DXチームによる支援が必要。",
            f"{PREFIX}_feedbackcomment": "もう少し専門的なサポートがほしい",
        },
        {
            f"{PREFIX}_name": "在庫分析の観点が知りたい",
            f"{PREFIX}_department": 100000000,  # 物流
            f"{PREFIX}_email": "demo-user4@example.com",
            f"{PREFIX}_question": "在庫回転率の改善提案を上司に説明する資料を作りたい。どんな分析観点が必要？",
            f"{PREFIX}_answer": "在庫分析に必要な観点（回転率、滞留日数、ABC分析）と、それぞれの説明資料テンプレートを提示しました。",
            f"{PREFIX}_satisfaction": 4,
            f"{PREFIX}_category": 100000002,  # 設計相談
            f"{PREFIX}_supportneeded": False,
            f"{PREFIX}_status": 100000002,  # 完了
            f"{PREFIX}_promptlevel": 100000001,  # L2 実行
            f"{PREFIX}_aieffectiveness": 100000000,  # 有効
            f"{PREFIX}_intentmatch": 100000000,  # 合っていた
            f"{PREFIX}_responsemode": 100000001,  # 伴走
            f"{PREFIX}_resolutionstatus": 100000000,  # 解決
        },
        {
            f"{PREFIX}_name": "Copilotの使い方を教えてほしい",
            f"{PREFIX}_department": 100000003,  # その他
            f"{PREFIX}_email": "demo-user5@example.com",
            f"{PREFIX}_question": "Copilotを初めて使います。何ができるのか教えてください。",
            f"{PREFIX}_answer": "Copilotでできること（文書作成、要約、翻訳、アイデア整理など）を一覧で紹介し、最初に試すべきプロンプト3選を提示しました。",
            f"{PREFIX}_satisfaction": 5,
            f"{PREFIX}_category": 100000000,  # 情報取得
            f"{PREFIX}_supportneeded": False,
            f"{PREFIX}_status": 100000002,  # 完了
            f"{PREFIX}_promptlevel": 100000000,  # L1 基本
            f"{PREFIX}_aieffectiveness": 100000000,  # 有効
            f"{PREFIX}_intentmatch": 100000000,  # 合っていた
            f"{PREFIX}_responsemode": 100000000,  # 即答
            f"{PREFIX}_resolutionstatus": 100000000,  # 解決
            f"{PREFIX}_feedbackcomment": "分かりやすかったです！",
        },
    ]

    for rec in demo_records:
        name = rec[f"{PREFIX}_name"]
        # べき等チェック: 同名レコードが既存ならスキップ
        existing = api_get(
            f"{inquiry_set}?$filter={PREFIX}_name eq '{name}'&$select={PREFIX}_name&$top=1"
        )
        if existing.get("value"):
            print(f"  既存スキップ: {name}")
            continue

        rec_id = api_post(inquiry_set, rec)
        print(f"  作成: {name} (id={rec_id})")


# ── Step 7: ソリューション含有検証 ──────────────────────────

def ensure_solution_membership():
    print("\n=== Step 7: ソリューション含有検証 ===")

    sols = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid")
    if not sols.get("value"):
        print(f"  ❌ ソリューション '{SOLUTION_NAME}' が見つかりません")
        return
    sol_id = sols["value"][0]["solutionid"]

    comps = api_get(
        f"solutioncomponents?$filter=_solutionid_value eq {sol_id} and componenttype eq 1&$select=objectid"
    )
    existing_ids = {c["objectid"] for c in comps.get("value", [])}

    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            meta = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
            meta_id = meta["MetadataId"]
            if meta_id in existing_ids:
                print(f"  ✅ {logical}: ソリューション内に存在")
            else:
                print(f"  ➕ {logical}: ソリューションに追加中…")
                api_post("AddSolutionComponent", {
                    "ComponentId": meta_id,
                    "ComponentType": 1,
                    "SolutionUniqueName": SOLUTION_NAME,
                    "AddRequiredComponents": False,
                    "DoNotIncludeSubcomponents": False,
                })
                print(f"  ✅ {logical}: 追加完了")
        except Exception as e:
            print(f"  ❌ {logical}: {e}")


# ── Step 8: テーブル検証 ──────────────────────────────────────

def verify_tables():
    print("\n=== Step 8: テーブル検証 ===")

    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            entity_set = get_entity_set_name(logical)
            data = api_get(f"{entity_set}?$top=1&$select={PREFIX}_name")
            count = len(data.get("value", []))
            print(f"  ✅ {logical} ({entity_set}): OK (rows={count})")
        except Exception as e:
            print(f"  ❌ {logical}: FAILED — {e}")


# ── メイン ────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  よろず相談ボット Dataverse テーブル構築")
    print("=" * 60)
    print(f"  環境: {DATAVERSE_URL}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  プレフィックス: {PREFIX}")

    ensure_solution()
    create_tables()
    create_lookups()
    publish_all()
    localize_tables()
    publish_all()
    create_demo_data()
    ensure_solution_membership()
    verify_tables()

    print("\n✅ よろず相談ボット Dataverse セットアップ完了!")
    print("次のステップ: Copilot Studio エージェント構築")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ エラー: {e}")
        traceback.print_exc()
        sys.exit(1)
