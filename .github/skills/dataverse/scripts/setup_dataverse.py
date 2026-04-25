"""
Dataverse テーブル構築テンプレート
==================================
プロジェクトごとに TABLES / LOOKUPS / LOCALIZE_* / デモデータをカスタマイズして使用する。
共通ロジック（リトライ・カラム補完・NavProp動的取得・Choice ローカライズ等）は汎用のまま。

前提:
  - auth_helper.py がプロジェクトルートに存在
    (.github/skills/standard/scripts/auth_helper.py をコピー)
  - .env に DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定済み
  - pip install azure-identity requests python-dotenv

使い方:
  1. TABLES リストにテーブル定義を記述
  2. LOOKUPS リストにリレーション定義を記述
  3. LOCALIZE_TABLES / LOCALIZE_COLUMNS / LOCALIZE_OPTIONS を記述
  4. create_demo_data() にデモデータ投入ロジックを記述
  5. python setup_dataverse.py で実行
"""
import os
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ── auth_helper.py インポート ────────────────────────────────
# auth_helper.py は standard スキルの共通モジュール。
# プロジェクトルートにコピーして使用する。
#
# 主要 API:
#   api_get(path)                    → dict を返す（パス文字列のみ。dict 第2引数は不可）
#   api_post(path, body, solution=)  → 作成レコードの ID(str) or None
#   api_patch(path, body)            → None
#   api_delete(path)                 → None
#   api_request(path, body, method)  → PUT + MergeLabels 用
#   retry_metadata(fn, desc, max)    → メタデータロック・重複検出リトライ
#   get_token(scope=)                → アクセストークン文字列
#   DATAVERSE_URL                    → .env から読み込んだ URL

from auth_helper import (
    api_get,
    api_post,
    api_patch,
    api_delete,
    api_request,       # PUT + MergeLabels ヘッダー自動付与
    retry_metadata,    # メタデータロック・重複検出リトライ
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
            + ". Please set them in your environment or .env before running setup_dataverse.py.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return required_env


REQUIRED_ENV_VARS = get_required_env_vars()
SOLUTION_NAME = REQUIRED_ENV_VARS["SOLUTION_NAME"]
PREFIX = REQUIRED_ENV_VARS["PUBLISHER_PREFIX"]
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", SOLUTION_NAME)


# ════════════════════════════════════════════════════════════════
# ▼▼▼ プロジェクト固有: ここをカスタマイズ ▼▼▼
# ════════════════════════════════════════════════════════════════

TABLES = [
    # --- マスタテーブル（先に作成） ---
    {
        "logical": f"{PREFIX}_samplemaster",    # 論理名（英語小文字のみ）
        "display": "Sample Master",              # 英語表示名（作成時）
        "plural": "Sample Masters",              # 英語複数形
        "description": "サンプルマスタテーブル",
        "columns": [
            # Memo 列（複数行テキスト）
            # {"logical": f"{PREFIX}_description", "type": "Memo", "display": "Description", "maxLength": 2000},
        ],
    },
    # --- 主テーブル ---
    {
        "logical": f"{PREFIX}_samplemain",
        "display": "Sample Main",
        "plural": "Sample Mains",
        "description": "サンプルメインテーブル",
        "columns": [
            # String 列
            # {"logical": f"{PREFIX}_code", "type": "String", "display": "Code", "maxLength": 100},

            # Integer 列
            # {"logical": f"{PREFIX}_quantity", "type": "Integer", "display": "Quantity"},

            # DateTime 列（DateAndTime or DateOnly）
            # {"logical": f"{PREFIX}_duedate", "type": "DateTime", "display": "Due Date", "format": "DateOnly"},

            # Memo 列
            # {"logical": f"{PREFIX}_description", "type": "Memo", "display": "Description", "maxLength": 4000},

            # Picklist 列（Choice — 値は 100000000 始まり）
            # {
            #     "logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status",
            #     "options": [
            #         (100000000, "New"),
            #         (100000001, "In Progress"),
            #         (100000002, "Completed"),
            #     ],
            # },
        ],
    },
    # --- 従属テーブル ---
    # {
    #     "logical": f"{PREFIX}_samplechild",
    #     "display": "Sample Child",
    #     "plural": "Sample Children",
    #     "description": "サンプル従属テーブル",
    #     "columns": [
    #         {"logical": f"{PREFIX}_content", "type": "Memo", "display": "Content", "maxLength": 4000},
    #     ],
    # },
]

LOOKUPS = [
    # 通常の Lookup:
    # {"schema": f"{PREFIX}_samplemain_{PREFIX}_samplemaster",
    #  "referencing": f"{PREFIX}_samplemain",
    #  "referenced": f"{PREFIX}_samplemaster",
    #  "lookup_attr": f"{PREFIX}_samplemasterid",
    #  "lookup_display": "Sample Master"},

    # SystemUser への Lookup（担当者等）:
    # {"schema": f"{PREFIX}_samplemain_systemuser_assignee",
    #  "referencing": f"{PREFIX}_samplemain",
    #  "referenced": "systemuser",
    #  "lookup_attr": f"{PREFIX}_assigneeid",
    #  "lookup_display": "Assigned To"},
]

# ── ローカライズ定義 ─────────────────────────────────────

# テーブル表示名の日本語化
LOCALIZE_TABLES = [
    # (論理名, 日本語表示名, 日本語複数形)
    # (f"{PREFIX}_samplemaster", "サンプルマスタ", "サンプルマスタ"),
    # (f"{PREFIX}_samplemain", "サンプルメイン", "サンプルメイン一覧"),
]

# 列表示名の日本語化
LOCALIZE_COLUMNS = [
    # (テーブル論理名, 列論理名, 日本語表示名)
    # (f"{PREFIX}_samplemaster", f"{PREFIX}_name", "名前"),
    # (f"{PREFIX}_samplemain", f"{PREFIX}_name", "名前"),
    # (f"{PREFIX}_samplemain", f"{PREFIX}_status", "ステータス"),
    # (f"{PREFIX}_samplemain", f"{PREFIX}_samplemasterid", "マスタ"),  # Lookup 列も忘れずに
]

# Choice オプションの日本語化
LOCALIZE_OPTIONS = [
    # (テーブル論理名, 列論理名, [(値, 日本語ラベル), ...])
    # (f"{PREFIX}_samplemain", f"{PREFIX}_status", [
    #     (100000000, "新規"),
    #     (100000001, "進行中"),
    #     (100000002, "完了"),
    # ]),
]

# ════════════════════════════════════════════════════════════════
# ▲▲▲ プロジェクト固有: ここまで ▲▲▲
# ════════════════════════════════════════════════════════════════


# ── 共通ヘルパー ─────────────────────────────────────────────

def label_jp(text: str) -> dict:
    """日本語ラベルの OData 構造を返す"""
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


def _save_env_value(key: str, value: str):
    """既存の .env ファイルにキーを追記または更新する"""
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
    """テーブルの EntitySetName を API から取得（推測しない）"""
    meta = api_get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=EntitySetName")
    return meta["EntitySetName"]


def get_navprop(from_logical: str, to_logical: str) -> str | None:
    """Lookup の NavProp 名を API から取得"""
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
    """列定義の JSON ボディを構築"""
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
    elif col["type"] == "Decimal":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        base["Precision"] = col.get("precision", 2)
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 100000000000)
    elif col["type"] == "Money":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
        base["Precision"] = col.get("precision", 2)
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
        time.sleep(10)  # メタデータ反映待ち

        # カスタム列追加（既存テーブルでも欠落カラムを補完）
        for col in tbl.get("columns", []):
            col_logical = col["logical"]

            # 既存カラムチェック
            try:
                api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName")
                continue  # 既存 → スキップ
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
    """PublishAllXml でカスタマイズを公開"""
    print("\n  カスタマイズ公開中…")
    api_post("PublishAllXml", {})
    print("  公開完了")


# ── Step 5: 日本語ローカライズ ────────────────────────────────

def localize_tables():
    print("\n=== Step 5: 日本語ローカライズ ===")

    # テーブル表示名
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
        # PUT + MergeLabels で更新（api_request は MergeLabels ヘッダーを自動付与）
        api_request(f"EntityDefinitions({mid})", body, method="PUT")
        print(f"  テーブル '{logical}' → '{disp}'")

    # 列表示名
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
            "Decimal": "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
            "Money": "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
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

    # Choice オプション ローカライズ
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
    """
    プロジェクト固有のデモデータ投入ロジック。
    以下のヘルパーを使用:
      - get_entity_set_name(logical_name) → EntitySetName（推測しない）
      - get_navprop(from_logical, to_logical) → NavProp名
      - api_post(entity_set, body) → 作成レコードの ID(str) or None
    """
    print("\n=== Step 6: デモデータ投入 ===")
    print("  ℹ テンプレート — プロジェクト固有のデモデータをここに実装")

    # 例:
    # master_set = get_entity_set_name(f"{PREFIX}_samplemaster")
    # main_set = get_entity_set_name(f"{PREFIX}_samplemain")
    # navprop = get_navprop(f"{PREFIX}_samplemain", f"{PREFIX}_samplemaster")
    #
    # # マスタデータ作成
    # master_id = api_post(master_set, {f"{PREFIX}_name": "マスタA"})
    # print(f"  マスタ: マスタA (id={master_id})")
    #
    # # Lookup 付きメインデータ作成（NavProp@odata.bind パターン）
    # body = {f"{PREFIX}_name": "メイン1"}
    # if navprop and master_id:
    #     body[f"{navprop}@odata.bind"] = f"/{master_set}({master_id})"
    # main_id = api_post(main_set, body)
    # print(f"  メイン: メイン1 (id={main_id})")


# ── Step 7: ソリューション含有検証 ──────────────────────────

def ensure_solution_membership():
    """全テーブルがソリューションに含まれているか確認し、不足分を追加"""
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
    """全テーブルの EntitySetName を API で取得してクエリ検証"""
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
    print("  Dataverse テーブル構築")
    print("=" * 60)
    print(f"  環境: {DATAVERSE_URL}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  プレフィックス: {PREFIX}")

    ensure_solution()            # Step 1: ソリューション
    create_tables()              # Step 2: テーブル作成
    create_lookups()             # Step 3: Lookup
    publish_all()                # Step 4: 公開（テーブル反映）
    localize_tables()            # Step 5: ローカライズ
    publish_all()                # 再公開（ローカライズ反映）
    create_demo_data()           # Step 6: デモデータ
    ensure_solution_membership() # Step 7: ソリューション検証
    verify_tables()              # Step 8: テーブル検証

    print("\n✅ Dataverse セットアップ完了!")
    print("次のステップ: アプリ作成 / npx power-apps add-data-source / pac model genpage generate-types")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ エラー: {e}")
        traceback.print_exc()
        sys.exit(1)
