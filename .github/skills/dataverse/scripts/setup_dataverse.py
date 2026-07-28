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

  Code Apps で pac code add-data-source を使う場合（2段階運用。日本語 DisplayName だと
  add-data-source が 'Failed to sanitize string' で失敗することがあるため）:
    a. python setup_dataverse.py --skip-localize   # テーブル構築のみ（英語のまま）
    b. pac code add-data-source -a dataverse -t {prefix}_xxx を全テーブルに実行
    c. python setup_dataverse.py --localize-only   # ローカライズ・デモデータ投入
"""
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

# 進捗ログをリアルタイム表示するため stdout/stderr を行バッファに切り替え。
# （bash ツール経由で呼ばれた際にブロックバッファリングされ、テーブル作成中に
#  何も表示されず「止まって見える」問題を防ぐ）
try:
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
except AttributeError:
    pass

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

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))
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
    # ── マスタテーブル ──────────────────────────────
    {
        "logical": f"{PREFIX}_division", "display": "事業本部", "plural": "事業本部",
        "name_display": "事業本部名", "description": "事業本部マスタ（M_Organization から正規化）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "本部コード", "maxLength": 20},
        ],
    },
    {
        "logical": f"{PREFIX}_organization", "display": "組織", "plural": "組織",
        "name_display": "組織名", "description": "組織（部）マスタ（M_Organization）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "組織コード", "maxLength": 20},
        ],
    },
    {
        "logical": f"{PREFIX}_group", "display": "企業グループ", "plural": "企業グループ",
        "name_display": "グループ名", "description": "企業グループマスタ（M_Group）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "グループコード", "maxLength": 20},
            {"logical": f"{PREFIX}_country", "type": "String", "display": "国", "maxLength": 100},
            {"logical": f"{PREFIX}_sector", "type": "String", "display": "業種", "maxLength": 100},
            {
                "logical": f"{PREFIX}_creditrating", "type": "Picklist", "display": "信用格付",
                "options": [
                    (100000000, "AAA"), (100000001, "AA+"), (100000002, "AA"), (100000003, "AA-"),
                    (100000004, "A+"), (100000005, "A"), (100000006, "A-"),
                    (100000007, "BBB+"), (100000008, "BBB"), (100000009, "BBB-"),
                    (100000010, "BB+"), (100000011, "BB"), (100000012, "BB-"),
                    (100000013, "B+"), (100000014, "B"), (100000015, "B-"), (100000016, "CCC"),
                ],
            },
            {"logical": f"{PREFIX}_grouplimitjpym", "type": "Decimal", "display": "グループ与信枠(百万円)",
             "precision": 0, "minValue": 0, "maxValue": 1000000},
        ],
    },
    {
        "logical": f"{PREFIX}_counterparty", "display": "取引先", "plural": "取引先",
        "name_display": "取引先名", "description": "取引先マスタ（M_Counterparty）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "取引先コード", "maxLength": 20},
            {"logical": f"{PREFIX}_country", "type": "String", "display": "国", "maxLength": 100},
            {
                "logical": f"{PREFIX}_role", "type": "Picklist", "display": "役割",
                "options": [(100000000, "仕入先"), (100000001, "顧客"), (100000002, "顧客兼仕入先")],
            },
            {"logical": f"{PREFIX}_isinvestee", "type": "Boolean", "display": "出資先フラグ",
             "true_label": "Yes", "false_label": "No"},
        ],
    },
    {
        "logical": f"{PREFIX}_commodity", "display": "商品", "plural": "商品",
        "name_display": "商品名", "description": "商品マスタ（M_Product。既存 geek_product との衝突回避のため commodity に改名）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "商品コード", "maxLength": 20},
            {"logical": f"{PREFIX}_category", "type": "String", "display": "カテゴリ", "maxLength": 100},
            {"logical": f"{PREFIX}_uom", "type": "String", "display": "数量単位", "maxLength": 20},
            {"logical": f"{PREFIX}_unitpricejpy", "type": "Decimal", "display": "単価(円)",
             "precision": 2, "minValue": 0, "maxValue": 10000000000},
        ],
    },
    {
        "logical": f"{PREFIX}_site", "display": "拠点", "plural": "拠点",
        "name_display": "拠点名", "description": "拠点マスタ（M_Site）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "拠点コード", "maxLength": 20},
            {"logical": f"{PREFIX}_sitetype", "type": "String", "display": "拠点種別", "maxLength": 100},
            {"logical": f"{PREFIX}_country", "type": "String", "display": "国", "maxLength": 100},
            {"logical": f"{PREFIX}_capacityindex", "type": "Integer", "display": "処理能力指数",
             "minValue": 0, "maxValue": 200},
        ],
    },
    {
        "logical": f"{PREFIX}_route", "display": "航路", "plural": "航路",
        "name_display": "航路名", "description": "航路マスタ（M_Route）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "航路コード", "maxLength": 20},
            {"logical": f"{PREFIX}_chokepoint", "type": "String", "display": "チョークポイント", "maxLength": 100},
            {"logical": f"{PREFIX}_viahormuz", "type": "Boolean", "display": "ホルムズ海峡経由",
             "true_label": "Yes", "false_label": "No"},
            {"logical": f"{PREFIX}_distancenm", "type": "Integer", "display": "距離(海里)",
             "minValue": 0, "maxValue": 50000},
            {"logical": f"{PREFIX}_transitdays", "type": "Integer", "display": "航行日数",
             "minValue": 0, "maxValue": 100},
            {"logical": f"{PREFIX}_maincargo", "type": "String", "display": "主要貨物", "maxLength": 100},
        ],
    },
    {
        "logical": f"{PREFIX}_altroute", "display": "代替航路", "plural": "代替航路",
        "name_display": "代替航路名", "description": "代替航路マスタ（M_AltRoute）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "代替航路コード", "maxLength": 20},
            {"logical": f"{PREFIX}_alttransitdays", "type": "Integer", "display": "代替航行日数",
             "minValue": 0, "maxValue": 100},
            {"logical": f"{PREFIX}_extradays", "type": "Integer", "display": "追加日数",
             "minValue": -100, "maxValue": 100},
            {"logical": f"{PREFIX}_extracostpct", "type": "Decimal", "display": "追加コスト率(%)",
             "precision": 2, "minValue": -100, "maxValue": 200},
            {"logical": f"{PREFIX}_note", "type": "Memo", "display": "備考", "maxLength": 2000},
        ],
    },

    # ── トランザクションテーブル ──────────────────────
    {
        "logical": f"{PREFIX}_contract", "display": "契約", "plural": "契約",
        "name_display": "契約ID", "description": "契約トランザクション（T_Contract）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "契約ID", "maxLength": 20},
            {
                "logical": f"{PREFIX}_contracttype", "type": "Picklist", "display": "契約種別",
                "options": [(100000000, "スポット"), (100000001, "フレーム契約"), (100000002, "長期契約")],
            },
            {"logical": f"{PREFIX}_qtyperyear", "type": "Decimal", "display": "年間数量",
             "precision": 2, "minValue": 0, "maxValue": 10000000},
            {"logical": f"{PREFIX}_unitpricejpy", "type": "Decimal", "display": "単価(円)",
             "precision": 2, "minValue": 0, "maxValue": 10000000000},
            {
                "logical": f"{PREFIX}_incoterms", "type": "Picklist", "display": "インコタームズ",
                "options": [
                    (100000000, "EXW"), (100000001, "FCA"), (100000002, "FOB"), (100000003, "CFR"),
                    (100000004, "CIF"), (100000005, "CPT"), (100000006, "CIP"), (100000007, "DAP"),
                    (100000008, "DPU"), (100000009, "DDP"), (100000010, "DES"),
                ],
            },
            {"logical": f"{PREFIX}_startdate", "type": "DateTime", "display": "契約開始日", "format": "DateOnly"},
            {"logical": f"{PREFIX}_enddate", "type": "DateTime", "display": "契約終了日", "format": "DateOnly"},
            {"logical": f"{PREFIX}_penaltypctperday", "type": "Decimal", "display": "日次ペナルティ率(%)",
             "precision": 4, "minValue": 0, "maxValue": 10},
        ],
    },
    {
        "logical": f"{PREFIX}_shipment", "display": "出荷", "plural": "出荷",
        "name_display": "出荷ID", "description": "出荷トランザクション（T_Shipment）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "出荷ID", "maxLength": 20},
            {"logical": f"{PREFIX}_vesselname", "type": "String", "display": "船名", "maxLength": 100},
            {"logical": f"{PREFIX}_etd", "type": "DateTime", "display": "出港日(ETD)", "format": "DateOnly"},
            {"logical": f"{PREFIX}_eta", "type": "DateTime", "display": "入港日(ETA)", "format": "DateOnly"},
            {"logical": f"{PREFIX}_qty", "type": "Decimal", "display": "数量",
             "precision": 2, "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_unitpricejpy", "type": "Decimal", "display": "単価(円)",
             "precision": 2, "minValue": 0, "maxValue": 10000000000},
            {
                "logical": f"{PREFIX}_status", "type": "Picklist", "display": "ステータス",
                "options": [
                    (100000000, "計画"), (100000001, "出港済"), (100000002, "航行中"),
                    (100000003, "入港済"), (100000004, "荷揚完了"), (100000005, "滞船"),
                    (100000006, "遅延"), (100000007, "キャンセル"),
                ],
            },
            {"logical": f"{PREFIX}_viahormuz", "type": "Boolean", "display": "ホルムズ海峡経由",
             "true_label": "Yes", "false_label": "No"},
            {"logical": f"{PREFIX}_amountjpy", "type": "Decimal", "display": "金額(円)",
             "precision": 2, "minValue": 0, "maxValue": 100000000000},
            {
                "logical": f"{PREFIX}_isaffected", "type": "Picklist", "display": "影響区分",
                "options": [(100000000, "影響あり"), (100000001, "影響なし"), (100000002, "対象外")],
            },
            {"logical": f"{PREFIX}_affectedamtjpy", "type": "Decimal", "display": "影響金額(円)",
             "precision": 2, "minValue": 0, "maxValue": 100000000000},
            {"logical": f"{PREFIX}_altextradays", "type": "Integer", "display": "代替追加日数",
             "minValue": -100, "maxValue": 100},
            {"logical": f"{PREFIX}_altcostpct", "type": "Decimal", "display": "代替追加コスト率(%)",
             "precision": 2, "minValue": -100, "maxValue": 200},
            {"logical": f"{PREFIX}_altextracostjpy", "type": "Decimal", "display": "代替追加コスト(円)",
             "precision": 2, "minValue": 0, "maxValue": 100000000000},
            {"logical": f"{PREFIX}_penaltyjpy", "type": "Decimal", "display": "ペナルティ(円)",
             "precision": 2, "minValue": 0, "maxValue": 100000000000},
            {"logical": f"{PREFIX}_buyerisinvestee", "type": "Boolean", "display": "買主は出資先",
             "true_label": "Yes", "false_label": "No"},
        ],
    },
    {
        "logical": f"{PREFIX}_investment", "display": "出資案件", "plural": "出資案件",
        "name_display": "出資先名", "description": "出資案件トランザクション（T_Investment）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "出資案件ID", "maxLength": 20},
            {"logical": f"{PREFIX}_equitypct", "type": "Decimal", "display": "出資比率(%)",
             "precision": 2, "minValue": 0, "maxValue": 100},
            {"logical": f"{PREFIX}_bookvaluejpym", "type": "Decimal", "display": "出資簿価(百万円)",
             "precision": 2, "minValue": -1000000, "maxValue": 1000000},
            {
                "logical": f"{PREFIX}_equitymethod", "type": "Picklist", "display": "持分区分",
                "options": [(100000000, "連結"), (100000001, "持分法")],
            },
            {"logical": f"{PREFIX}_annualprofitjpym", "type": "Decimal", "display": "年間利益(百万円)",
             "precision": 2, "minValue": -1000000, "maxValue": 1000000},
        ],
    },
    {
        "logical": f"{PREFIX}_creditline", "display": "与信枠", "plural": "与信枠",
        "name_display": "与信枠ID", "description": "与信枠トランザクション（T_CreditLine）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "与信枠ID", "maxLength": 20},
            {"logical": f"{PREFIX}_limitjpym", "type": "Decimal", "display": "与信枠(百万円)",
             "precision": 2, "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_usedjpym", "type": "Decimal", "display": "使用額(百万円)",
             "precision": 2, "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_expirydate", "type": "DateTime", "display": "期限日", "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_guaranteetype", "type": "Picklist", "display": "保証形態",
                "options": [
                    (100000000, "親会社保証"), (100000001, "信用状(LC)"), (100000002, "銀行保証"),
                    (100000003, "前受金"), (100000004, "無担保"),
                ],
            },
        ],
    },
    {
        "logical": f"{PREFIX}_event", "display": "リスクイベント", "plural": "リスクイベント",
        "name_display": "イベント名", "description": "リスクイベントトランザクション（T_Event）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "イベントID", "maxLength": 20},
            {
                "logical": f"{PREFIX}_eventtype", "type": "Picklist", "display": "イベント種別",
                "options": [
                    (100000000, "地政学"), (100000001, "気象"), (100000002, "災害"), (100000003, "規制"),
                    (100000004, "労働"), (100000005, "物流"), (100000006, "設備"),
                ],
            },
            {"logical": f"{PREFIX}_startdate", "type": "DateTime", "display": "開始日", "format": "DateOnly"},
            {"logical": f"{PREFIX}_enddate", "type": "DateTime", "display": "終了日", "format": "DateOnly"},
            {
                "logical": f"{PREFIX}_severity", "type": "Picklist", "display": "重大度",
                "options": [(100000000, "高"), (100000001, "中"), (100000002, "低")],
            },
            {"logical": f"{PREFIX}_affectedchokepoint", "type": "String", "display": "影響地域/チョークポイント", "maxLength": 100},
            {"logical": f"{PREFIX}_description", "type": "Memo", "display": "説明", "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_eventimpact", "display": "イベント影響定義", "plural": "イベント影響定義",
        "name_display": "影響定義ID", "description": "イベント影響定義トランザクション（T_EventImpact）",
        "columns": [
            {"logical": f"{PREFIX}_code", "type": "String", "display": "影響定義ID", "maxLength": 20},
            {
                "logical": f"{PREFIX}_targettype", "type": "Picklist", "display": "対象種別",
                "options": [(100000000, "Route"), (100000001, "Commodity")],
            },
            {"logical": f"{PREFIX}_targetid", "type": "String", "display": "対象ID", "maxLength": 20},
            {
                "logical": f"{PREFIX}_impactkind", "type": "Picklist", "display": "影響種別",
                "options": [
                    (100000000, "通航不可"), (100000001, "迂回"), (100000002, "通航制限"),
                    (100000003, "遅延"), (100000004, "調達停止"),
                ],
            },
            {"logical": f"{PREFIX}_delaydays", "type": "Integer", "display": "遅延日数",
             "minValue": -100, "maxValue": 100},
            {"logical": f"{PREFIX}_costupliftpct", "type": "Decimal", "display": "コスト上昇率(%)",
             "precision": 2, "minValue": -100, "maxValue": 200},
            {"logical": f"{PREFIX}_volumecutpct", "type": "Decimal", "display": "数量減少率(%)",
             "precision": 2, "minValue": -100, "maxValue": 200},
        ],
    },
]

LOOKUPS = [
    # マスタ間
    {"from_table": f"{PREFIX}_organization", "column_logical": f"{PREFIX}_divisionid",
     "display": "事業本部", "to_table": f"{PREFIX}_division"},
    {"from_table": f"{PREFIX}_counterparty", "column_logical": f"{PREFIX}_groupid",
     "display": "企業グループ", "to_table": f"{PREFIX}_group"},
    {"from_table": f"{PREFIX}_commodity", "column_logical": f"{PREFIX}_divisionid",
     "display": "事業本部", "to_table": f"{PREFIX}_division"},
    {"from_table": f"{PREFIX}_altroute", "column_logical": f"{PREFIX}_routeid",
     "display": "航路", "to_table": f"{PREFIX}_route"},

    # systemuser 拡張（担当者の所属部）
    {"from_table": "systemuser", "column_logical": f"{PREFIX}_organizationid",
     "display": "所属組織", "to_table": f"{PREFIX}_organization"},

    # contract
    {"from_table": f"{PREFIX}_contract", "column_logical": f"{PREFIX}_buyercounterpartyid",
     "display": "買主", "to_table": f"{PREFIX}_counterparty"},
    {"from_table": f"{PREFIX}_contract", "column_logical": f"{PREFIX}_sellercounterpartyid",
     "display": "売主", "to_table": f"{PREFIX}_counterparty"},
    {"from_table": f"{PREFIX}_contract", "column_logical": f"{PREFIX}_commodityid",
     "display": "対象商品", "to_table": f"{PREFIX}_commodity"},
    {"from_table": f"{PREFIX}_contract", "column_logical": f"{PREFIX}_organizationid",
     "display": "所管組織", "to_table": f"{PREFIX}_organization"},
    {"from_table": f"{PREFIX}_contract", "column_logical": f"{PREFIX}_ownerid",
     "display": "契約担当者", "to_table": "systemuser"},
    {"from_table": f"{PREFIX}_contract", "column_logical": f"{PREFIX}_routeid",
     "display": "想定航路", "to_table": f"{PREFIX}_route"},

    # shipment
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_contractid",
     "display": "契約", "to_table": f"{PREFIX}_contract"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_commodityid",
     "display": "商品", "to_table": f"{PREFIX}_commodity"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_routeid",
     "display": "航路", "to_table": f"{PREFIX}_route"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_originsiteid",
     "display": "積地", "to_table": f"{PREFIX}_site"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_destsiteid",
     "display": "揚地", "to_table": f"{PREFIX}_site"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_buyercounterpartyid",
     "display": "買主", "to_table": f"{PREFIX}_counterparty"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_buyergroupid",
     "display": "買主グループ", "to_table": f"{PREFIX}_group"},
    {"from_table": f"{PREFIX}_shipment", "column_logical": f"{PREFIX}_organizationid",
     "display": "所管組織", "to_table": f"{PREFIX}_organization"},

    # investment
    {"from_table": f"{PREFIX}_investment", "column_logical": f"{PREFIX}_linkedcounterpartyid",
     "display": "同一実体取引先", "to_table": f"{PREFIX}_counterparty"},
    {"from_table": f"{PREFIX}_investment", "column_logical": f"{PREFIX}_groupid",
     "display": "企業グループ", "to_table": f"{PREFIX}_group"},
    {"from_table": f"{PREFIX}_investment", "column_logical": f"{PREFIX}_organizationid",
     "display": "出資元組織", "to_table": f"{PREFIX}_organization"},

    # creditline
    {"from_table": f"{PREFIX}_creditline", "column_logical": f"{PREFIX}_groupid",
     "display": "企業グループ", "to_table": f"{PREFIX}_group"},
    {"from_table": f"{PREFIX}_creditline", "column_logical": f"{PREFIX}_organizationid",
     "display": "組織", "to_table": f"{PREFIX}_organization"},

    # eventimpact
    {"from_table": f"{PREFIX}_eventimpact", "column_logical": f"{PREFIX}_eventid",
     "display": "イベント", "to_table": f"{PREFIX}_event"},
]

# ── ローカライズ定義 ─────────────────────────────────────
# 表示名は TABLES/LOOKUPS 定義時に直接日本語で作成するため、
# Code Apps 向けの2段階ローカライズ運用（英語作成→後で日本語化）は本プロジェクトでは不要
# （Copilot Studio v2 単独利用のため pac code add-data-source を使わない）。

LOCALIZE_TABLES = []
LOCALIZE_COLUMNS = []
LOCALIZE_OPTIONS = []

# ── デモデータ用 Choice 値マッピング（TABLES の options と対応） ──────
CREDIT_RATING = {
    "AAA": 100000000, "AA+": 100000001, "AA": 100000002, "AA-": 100000003,
    "A+": 100000004, "A": 100000005, "A-": 100000006,
    "BBB+": 100000007, "BBB": 100000008, "BBB-": 100000009,
    "BB+": 100000010, "BB": 100000011, "BB-": 100000012,
    "B+": 100000013, "B": 100000014, "B-": 100000015, "CCC": 100000016,
}
ROLE = {"仕入先": 100000000, "顧客": 100000001, "顧客兼仕入先": 100000002}
CONTRACT_TYPE = {"スポット": 100000000, "フレーム契約": 100000001, "長期契約": 100000002}
INCOTERMS = {
    "EXW": 100000000, "FCA": 100000001, "FOB": 100000002, "CFR": 100000003,
    "CIF": 100000004, "CPT": 100000005, "CIP": 100000006, "DAP": 100000007,
    "DPU": 100000008, "DDP": 100000009, "DES": 100000010,
}
SHIPMENT_STATUS = {
    "計画": 100000000, "出港済": 100000001, "航行中": 100000002, "入港済": 100000003,
    "荷揚完了": 100000004, "滞船": 100000005, "遅延": 100000006, "キャンセル": 100000007,
}
IS_AFFECTED = {"影響あり": 100000000, "影響なし": 100000001, "対象外": 100000002}
EQUITY_METHOD = {"連結": 100000000, "持分法": 100000001}
GUARANTEE_TYPE = {
    "親会社保証": 100000000, "信用状(LC)": 100000001, "銀行保証": 100000002,
    "前受金": 100000003, "無担保": 100000004,
}
EVENT_TYPE = {
    "地政学": 100000000, "気象": 100000001, "災害": 100000002, "規制": 100000003,
    "労働": 100000004, "物流": 100000005, "設備": 100000006,
}
SEVERITY = {"高": 100000000, "中": 100000001, "低": 100000002}
TARGET_TYPE = {"Route": 100000000, "Commodity": 100000001}
IMPACT_KIND = {
    "通航不可": 100000000, "迂回": 100000001, "通航制限": 100000002,
    "遅延": 100000003, "調達停止": 100000004,
}

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


def get_navprop(from_logical: str, to_logical: str, referencing_attribute: str | None = None) -> str | None:
    """Lookup の NavProp 名を API から取得。
    同じ参照先テーブルへの Lookup が複数存在する場合（例: contract の買主/売主が
    どちらも counterparty を参照）は referencing_attribute（列論理名）で一意に絞り込む。"""
    filter_str = f"ReferencedEntity eq '{to_logical}'"
    if referencing_attribute:
        filter_str += f" and ReferencingAttribute eq '{referencing_attribute}'"
    rels = api_get(
        f"EntityDefinitions(LogicalName='{from_logical}')/ManyToOneRelationships"
        f"?$filter={filter_str}"
        f"&$select=ReferencingEntityNavigationPropertyName"
    )
    if rels.get("value"):
        return rels["value"][0]["ReferencingEntityNavigationPropertyName"]
    return None


# ── Step 1: ソリューション ──────────────────────────────────

def ensure_solution():
    global SOLUTION_DISPLAY_NAME
    print("\n=== Step 1: Solution check ===")
    existing = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")
    if existing.get("value"):
        display_name = existing["value"][0].get("friendlyname", SOLUTION_DISPLAY_NAME)
        print(f"  Solution '{SOLUTION_NAME}' already exists (display name: {display_name}). Skipping.")
        SOLUTION_DISPLAY_NAME = display_name
        _save_env_value("SOLUTION_DISPLAY_NAME", display_name)
        return

    print(f"  Creating solution '{SOLUTION_NAME}'...")
    # ⚠️ この環境には prefix='geek' の Publisher が uniquename='geek' と
    #    uniquename='geek_fujiwara' の2つ存在するため、uniquename を明示して一意に解決する。
    pubs = api_get(f"publishers?$filter=customizationprefix eq '{PREFIX}' and uniquename eq 'geek'&$select=publisherid")
    if not pubs.get("value"):
        pubs = api_get(f"publishers?$filter=customizationprefix eq '{PREFIX}'&$select=publisherid")
    if not pubs.get("value"):
        raise RuntimeError(f"Publisher with prefix='{PREFIX}' not found. Please create it in Power Apps.")
    pub_id = pubs["value"][0]["publisherid"]

    api_post("solutions", {
        "uniquename": SOLUTION_NAME,
        "friendlyname": SOLUTION_DISPLAY_NAME,
        "version": "1.0.0.0",
        "publisherid@odata.bind": f"/publishers({pub_id})",
    })

    _save_env_value("SOLUTION_DISPLAY_NAME", SOLUTION_DISPLAY_NAME)
    print(f"  Solution created (display name: {SOLUTION_DISPLAY_NAME})")


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


# Dataverse のメタデータ属性が許容する値域（API 呼び出し前に静的検証するため定義）。
# 実測: Decimal は 1000億（100,000,000,000）を超えると 0x80040203（Min/max out of range）。
DATAVERSE_LIMITS = {
    "Decimal": {"min": -100_000_000_000, "max": 100_000_000_000},
    "Integer": {"min": -2_147_483_648, "max": 2_147_483_647},
    "String": {"maxLength": 4000},
    "Memo": {"maxLength": 1_048_576},
}


def validate_tables() -> None:
    """TABLES 定義を Dataverse のメタデータ制約に照らして事前検証する。

    API 呼び出しより前（Step 1 の前）に実行することで、値域超過等の定義ミスを
    ThreadPoolExecutor による並行構築の途中で 400 エラーとして検出する事態を防ぎ、
    ビルド開始前に一括で分かりやすいエラーとして提示する。
    """
    errors: list[str] = []
    for tbl in TABLES:
        for col in tbl.get("columns", []):
            limit = DATAVERSE_LIMITS.get(col["type"])
            if not limit:
                continue
            label = f"{tbl['logical']}.{col['logical']}"
            if "min" in limit and "max" in limit:
                min_v = col.get("minValue", 0)
                max_v = col.get("maxValue", limit["max"])
                if max_v > limit["max"] or min_v < limit["min"]:
                    errors.append(
                        f"{label}: {col['type']} must be within range {limit['min']}..{limit['max']}"
                        f" (given: {min_v}..{max_v})"
                    )
            if "maxLength" in limit:
                max_len = col.get("maxLength", limit["maxLength"])
                if max_len > limit["maxLength"]:
                    errors.append(
                        f"{label}: {col['type']} maxLength must be <= {limit['maxLength']}"
                        f" (given: {max_len})"
                    )

    if errors:
        raise ValueError(
            "TABLES definition has values exceeding Dataverse limits (detected before any API call):\n"
            + "\n".join(f"  - {e}" for e in errors)
        )


def _create_single_table(tbl: dict) -> None:
    """1 テーブル（本体 + 列）を作成する。ThreadPoolExecutor から呼ばれる。"""
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
                    "DisplayName": label_jp(t.get("name_display", "Name")),
                    "IsPrimaryName": True,
                    "RequiredLevel": {"Value": "ApplicationRequired"},
                    "FormatName": {"Value": "Text"},
                    "MaxLength": 200,
                }
            ],
        }
        api_post("EntityDefinitions", body, solution=SOLUTION_NAME)
        print(f"  Table '{logical}' created")

    retry_metadata(_create, f"Table {logical}")
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
            print(f"    Column '{c['logical']}' added")

        retry_metadata(_add_col, f"Column {col_logical}")
        time.sleep(5)


def create_tables():
    """全テーブルを並行作成し、すべての完了を待ってから返る。
    Lookup は必ず全テーブル+列が完成してから create_lookups() で作成する。"""
    print("\n=== Step 2: Table creation ===")

    if len(TABLES) <= 1:
        # テーブルが 1 つ以下なら並行化不要
        for tbl in TABLES:
            _create_single_table(tbl)
        return

    print(f"  Creating {len(TABLES)} tables in parallel...")
    errors: list[str] = []
    # 並行数はデフォルト 3。既存カスタムテーブルが多い（100件超）環境や他セッションが
    # 同時にメタデータ操作をしている環境では、並行数が高いほど 0x80040237（メタデータ
    # ロック競合）の retry_metadata 上限（5回）を超えて失敗しやすい（実測: 5並行で
    # 10テーブル中7テーブルが失敗、2並行で全成功）。失敗が多発する場合は 2 まで下げる。
    # スクリプトはべき等なので、失敗した分だけを対象に何度でも安全に再実行できる。
    with ThreadPoolExecutor(max_workers=min(len(TABLES), 2)) as executor:
        futures = {executor.submit(_create_single_table, tbl): tbl["logical"] for tbl in TABLES}
        for future in as_completed(futures):
            logical = futures[future]
            try:
                future.result()
            except Exception as exc:
                detail_text = ""
                resp = getattr(exc, "response", None)
                if resp is not None:
                    try:
                        detail_text = f"\n  詳細: {resp.text}"
                    except Exception:
                        pass
                msg = f"Error creating table '{logical}': {exc}{detail_text}"
                print(f"  ❌ {msg}")
                errors.append(msg)

    if errors:
        raise RuntimeError("Errors occurred during parallel table creation:\n" + "\n".join(errors))


# ── Step 3: Lookup リレーション ──────────────────────────────

def create_lookups():
    print("\n=== Step 3: Lookup relationship creation ===")

    errors: list[str] = []
    for lk in LOOKUPS:
        col_logical = lk["column_logical"]
        from_table = lk["from_table"]
        to_table = lk["to_table"]

        # 既存 Lookup 属性チェック（べき等: 存在すればスキップ）
        try:
            api_get(f"EntityDefinitions(LogicalName='{from_table}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName")
            print(f"  Lookup '{col_logical}' already exists. Skipping.")
            continue
        except Exception:
            pass

        def _create(l=lk):
            # Lookup（1:N リレーション）作成は RelationshipDefinitions への POST を使う。
            # ※ CreateOneToMany バインドアクションは環境／Web API バージョンによって
            #   404 Not Found になるため使わない。RelationshipDefinitions は安定して動作する。
            # SchemaName はカスタマイズプレフィックスで始まる必要がある。from_table が
            # systemuser 等の標準テーブルの場合は from_table 自体にプレフィックスが
            # 付いていないため、明示的に付与する。
            from_schema = l["from_table"] if l["from_table"].startswith(PREFIX) else f"{PREFIX}_{l['from_table']}"
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                "SchemaName": f"{from_schema}_{l['column_logical']}",
                "ReferencedEntity": l["to_table"],
                "ReferencingEntity": l["from_table"],
                "Lookup": {
                    "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                    "SchemaName": l["column_logical"],
                    "DisplayName": label_jp(l["display"]),
                    "RequiredLevel": {"Value": "None"},
                },
            }
            api_post("RelationshipDefinitions", body, solution=SOLUTION_NAME)
            print(f"  Lookup '{col_logical}' created")

        try:
            retry_metadata(_create, f"Lookup {col_logical}")
        except Exception as exc:
            detail_text = ""
            resp = getattr(exc, "response", None)
            if resp is not None:
                try:
                    detail_text = f"\n  詳細: {resp.text}"
                except Exception:
                    pass
            msg = f"Error creating Lookup '{from_table}.{col_logical}': {exc}{detail_text}"
            print(f"  ❌ {msg}")
            errors.append(msg)
        time.sleep(5)

    if errors:
        raise RuntimeError("Errors occurred during Lookup creation:\n" + "\n".join(errors))



# ── Step 4: カスタマイズ公開 ──────────────────────────────────

def publish_all():
    """PublishAllXml でカスタマイズを公開"""
    print("\n  Publishing customizations...")
    api_post("PublishAllXml", {})
    print("  Publish complete")


# ── Step 5: 日本語ローカライズ ────────────────────────────────

def localize_tables():
    print("\n=== Step 5: Japanese localization ===")

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
        print(f"  Table '{logical}' -> '{disp}'")

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
        print(f"  Column '{table}.{col}' -> '{disp}'")

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
            print(f"    Option {col}={value} -> '{label_text}'")


# ── Step 6: デモデータ投入 ────────────────────────────────────

def _find_repo_root() -> Path:
    script_dir = Path(__file__).resolve().parent
    return next(
        (p for p in [script_dir, *script_dir.parents] if (p / ".env.example").exists() or (p / ".git").exists()),
        script_dir,
    )


def _clean(v):
    """NaN/None を None に、日付は ISO 文字列に変換。

    numpy スカラー型（int64/float64/bool_ 等）は requests の json= がそのまま
    シリアライズできず TypeError になるため、.item() でネイティブ Python 型に変換する。
    """
    import numpy as np
    import pandas as pd
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, np.generic):
        return v.item()
    return v


def _to_bool(v) -> bool:
    return str(v).strip().lower() in ("1", "1.0", "yes", "true", "y")


def _post_debug(entity_set: str, body: dict, label: str):
    """api_post をラップし、400 系エラー時はレスポンスボディを含めて再送出する。

    デモデータ投入は大量行を api_post で連続投入するため、詳細メッセージ無しで
    クラッシュすると原因究明ができない（項目 12 と同じパターン）。
    """
    try:
        return api_post(entity_set, body)
    except Exception as exc:
        detail_text = ""
        resp = getattr(exc, "response", None)
        if resp is not None:
            try:
                detail_text = f"\n  detail: {resp.text}"
            except Exception:
                pass
        raise RuntimeError(f"Failed to create {label} row: {exc}{detail_text}\n  body: {body}") from exc


def create_demo_data():
    """
    Excel（spec/input/Demo Excel.xlsx）の全行を読み込み、Dataverse にデモデータを投入する。
    """
    print("\n=== Step 6: Demo data import ===")
    import pandas as pd

    excel_path = _find_repo_root() / "spec" / "input" / "Demo Excel.xlsx"
    print(f"  Reading Excel: {excel_path}")
    sheets = pd.read_excel(excel_path, sheet_name=None, engine="openpyxl")

    # ── EntitySetName 解決 ──
    division_set = get_entity_set_name(f"{PREFIX}_division")
    organization_set = get_entity_set_name(f"{PREFIX}_organization")
    group_set = get_entity_set_name(f"{PREFIX}_group")
    counterparty_set = get_entity_set_name(f"{PREFIX}_counterparty")
    commodity_set = get_entity_set_name(f"{PREFIX}_commodity")
    site_set = get_entity_set_name(f"{PREFIX}_site")
    route_set = get_entity_set_name(f"{PREFIX}_route")
    altroute_set = get_entity_set_name(f"{PREFIX}_altroute")
    contract_set = get_entity_set_name(f"{PREFIX}_contract")
    shipment_set = get_entity_set_name(f"{PREFIX}_shipment")
    investment_set = get_entity_set_name(f"{PREFIX}_investment")
    creditline_set = get_entity_set_name(f"{PREFIX}_creditline")
    event_set = get_entity_set_name(f"{PREFIX}_event")
    eventimpact_set = get_entity_set_name(f"{PREFIX}_eventimpact")

    # ── NavProp 解決（from, to, 列論理名で一意化） ──
    np_org_div = get_navprop(f"{PREFIX}_organization", f"{PREFIX}_division", f"{PREFIX}_divisionid")
    np_cp_group = get_navprop(f"{PREFIX}_counterparty", f"{PREFIX}_group", f"{PREFIX}_groupid")
    np_com_div = get_navprop(f"{PREFIX}_commodity", f"{PREFIX}_division", f"{PREFIX}_divisionid")
    np_alt_route = get_navprop(f"{PREFIX}_altroute", f"{PREFIX}_route", f"{PREFIX}_routeid")
    np_user_org = get_navprop("systemuser", f"{PREFIX}_organization", f"{PREFIX}_organizationid")

    np_ct_buyer = get_navprop(f"{PREFIX}_contract", f"{PREFIX}_counterparty", f"{PREFIX}_buyercounterpartyid")
    np_ct_seller = get_navprop(f"{PREFIX}_contract", f"{PREFIX}_counterparty", f"{PREFIX}_sellercounterpartyid")
    np_ct_commodity = get_navprop(f"{PREFIX}_contract", f"{PREFIX}_commodity", f"{PREFIX}_commodityid")
    np_ct_org = get_navprop(f"{PREFIX}_contract", f"{PREFIX}_organization", f"{PREFIX}_organizationid")
    np_ct_owner = get_navprop(f"{PREFIX}_contract", "systemuser", f"{PREFIX}_ownerid")
    np_ct_route = get_navprop(f"{PREFIX}_contract", f"{PREFIX}_route", f"{PREFIX}_routeid")

    np_sh_contract = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_contract", f"{PREFIX}_contractid")
    np_sh_commodity = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_commodity", f"{PREFIX}_commodityid")
    np_sh_route = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_route", f"{PREFIX}_routeid")
    np_sh_origin = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_site", f"{PREFIX}_originsiteid")
    np_sh_dest = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_site", f"{PREFIX}_destsiteid")
    np_sh_buyer = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_counterparty", f"{PREFIX}_buyercounterpartyid")
    np_sh_buyergroup = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_group", f"{PREFIX}_buyergroupid")
    np_sh_org = get_navprop(f"{PREFIX}_shipment", f"{PREFIX}_organization", f"{PREFIX}_organizationid")

    np_iv_linked = get_navprop(f"{PREFIX}_investment", f"{PREFIX}_counterparty", f"{PREFIX}_linkedcounterpartyid")
    np_iv_group = get_navprop(f"{PREFIX}_investment", f"{PREFIX}_group", f"{PREFIX}_groupid")
    np_iv_org = get_navprop(f"{PREFIX}_investment", f"{PREFIX}_organization", f"{PREFIX}_organizationid")

    np_cl_group = get_navprop(f"{PREFIX}_creditline", f"{PREFIX}_group", f"{PREFIX}_groupid")
    np_cl_org = get_navprop(f"{PREFIX}_creditline", f"{PREFIX}_organization", f"{PREFIX}_organizationid")

    np_im_event = get_navprop(f"{PREFIX}_eventimpact", f"{PREFIX}_event", f"{PREFIX}_eventid")

    # ルートビジネスユニット（systemuser 作成に必須）
    bu = api_get("businessunits?$filter=_parentbusinessunitid_value eq null&$select=businessunitid")
    bu_id = bu["value"][0]["businessunitid"]

    # ── division（M_Organization から正規化） ──
    org_df = sheets["M_Organization"]
    div_ids: dict = {}
    for _, row in org_df[["DivisionID", "DivisionName"]].drop_duplicates().iterrows():
        code = row["DivisionID"]
        rid = api_post(division_set, {f"{PREFIX}_name": row["DivisionName"], f"{PREFIX}_code": code})
        div_ids[code] = rid
    print(f"  division: {len(div_ids)} rows")

    # ── organization ──
    org_ids: dict = {}
    for _, row in org_df.iterrows():
        body = {f"{PREFIX}_name": row["OrgName"], f"{PREFIX}_code": row["OrgID"]}
        div_id = div_ids.get(row["DivisionID"])
        if np_org_div and div_id:
            body[f"{np_org_div}@odata.bind"] = f"/{division_set}({div_id})"
        org_ids[row["OrgID"]] = api_post(organization_set, body)
    print(f"  organization: {len(org_ids)} rows")

    # ── group ──
    group_df = sheets["M_Group"]
    group_ids: dict = {}
    for _, row in group_df.iterrows():
        body = {
            f"{PREFIX}_name": row["GroupName"], f"{PREFIX}_code": row["GroupID"],
            f"{PREFIX}_country": _clean(row.get("Country")), f"{PREFIX}_sector": _clean(row.get("Sector")),
            f"{PREFIX}_grouplimitjpym": _clean(row.get("GroupLimitJPYm")),
        }
        rating = CREDIT_RATING.get(str(row.get("CreditRating")).strip())
        if rating:
            body[f"{PREFIX}_creditrating"] = rating
        group_ids[row["GroupID"]] = api_post(group_set, body)
    print(f"  group: {len(group_ids)} rows")

    # ── counterparty ──
    cp_df = sheets["M_Counterparty"]
    cp_ids: dict = {}
    for _, row in cp_df.iterrows():
        body = {
            f"{PREFIX}_name": row["CounterpartyName"], f"{PREFIX}_code": row["CounterpartyID"],
            f"{PREFIX}_country": _clean(row.get("Country")),
            f"{PREFIX}_isinvestee": _to_bool(row.get("IsInvestee")),
        }
        role = ROLE.get(str(row.get("Role")).strip())
        if role:
            body[f"{PREFIX}_role"] = role
        group_id = group_ids.get(row.get("GroupID"))
        if np_cp_group and group_id:
            body[f"{np_cp_group}@odata.bind"] = f"/{group_set}({group_id})"
        cp_ids[row["CounterpartyID"]] = api_post(counterparty_set, body)
    print(f"  counterparty: {len(cp_ids)} rows")

    # ── commodity（M_Product） ──
    prod_df = sheets["M_Product"]
    commodity_ids: dict = {}
    for _, row in prod_df.iterrows():
        body = {
            f"{PREFIX}_name": row["ProductName"], f"{PREFIX}_code": row["ProductID"],
            f"{PREFIX}_category": _clean(row.get("Category")), f"{PREFIX}_uom": _clean(row.get("UOM")),
            f"{PREFIX}_unitpricejpy": _clean(row.get("UnitPriceJPY")),
        }
        div_id = div_ids.get(row.get("DivisionID"))
        if np_com_div and div_id:
            body[f"{np_com_div}@odata.bind"] = f"/{division_set}({div_id})"
        commodity_ids[row["ProductID"]] = api_post(commodity_set, body)
    print(f"  commodity: {len(commodity_ids)} rows")

    # ── site ──
    site_df = sheets["M_Site"]
    site_ids: dict = {}
    for _, row in site_df.iterrows():
        body = {
            f"{PREFIX}_name": row["SiteName"], f"{PREFIX}_code": row["SiteID"],
            f"{PREFIX}_sitetype": _clean(row.get("SiteType")), f"{PREFIX}_country": _clean(row.get("Country")),
            f"{PREFIX}_capacityindex": _clean(row.get("CapacityIndex")),
        }
        site_ids[row["SiteID"]] = api_post(site_set, body)
    print(f"  site: {len(site_ids)} rows")

    # ── route ──
    route_df = sheets["M_Route"]
    route_ids: dict = {}
    for _, row in route_df.iterrows():
        body = {
            f"{PREFIX}_name": row["RouteName"], f"{PREFIX}_code": row["RouteID"],
            f"{PREFIX}_chokepoint": _clean(row.get("Chokepoint")),
            f"{PREFIX}_viahormuz": _to_bool(row.get("ViaHormuz")),
            f"{PREFIX}_distancenm": _clean(row.get("DistanceNM")),
            f"{PREFIX}_transitdays": _clean(row.get("TransitDays")),
            f"{PREFIX}_maincargo": _clean(row.get("MainCargo")),
        }
        route_ids[row["RouteID"]] = api_post(route_set, body)
    print(f"  route: {len(route_ids)} rows")

    # ── altroute ──
    alt_df = sheets["M_AltRoute"]
    alt_count = 0
    for _, row in alt_df.iterrows():
        body = {
            f"{PREFIX}_name": row["AltRouteName"], f"{PREFIX}_code": row["AltRouteID"],
            f"{PREFIX}_alttransitdays": _clean(row.get("AltTransitDays")),
            f"{PREFIX}_extradays": _clean(row.get("ExtraDays")),
            f"{PREFIX}_extracostpct": _clean(row.get("ExtraCostPct")),
            f"{PREFIX}_note": _clean(row.get("Note")),
        }
        route_id = route_ids.get(row.get("RouteID"))
        if np_alt_route and route_id:
            body[f"{np_alt_route}@odata.bind"] = f"/{route_set}({route_id})"
        api_post(altroute_set, body)
        alt_count += 1
    print(f"  altroute: {alt_count} rows")

    # ── systemuser（M_Person。架空担当者を標準 systemuser テーブルに直接作成） ──
    person_df = sheets["M_Person"]
    person_ids: dict = {}
    for _, row in person_df.iterrows():
        full = str(row["PersonName"]).strip()
        parts = full.split()
        lastname, firstname = (parts[0], " ".join(parts[1:])) if len(parts) > 1 else (full, full)
        email = _clean(row.get("Email"))
        body = {
            "firstname": firstname, "lastname": lastname,
            "jobtitle": _clean(row.get("Title")),
            "internalemailaddress": email, "domainname": email,
            "businessunitid@odata.bind": f"/businessunits({bu_id})",
        }
        org_id = org_ids.get(row.get("OrgID"))
        if np_user_org and org_id:
            body[f"{np_user_org}@odata.bind"] = f"/{organization_set}({org_id})"
        person_ids[row["PersonID"]] = api_post("systemusers", body)
    print(f"  systemuser (owner): {len(person_ids)} rows")

    # ── contract ──
    contract_df = sheets["T_Contract"]
    contract_ids: dict = {}
    for _, row in contract_df.iterrows():
        body = {
            f"{PREFIX}_name": row["ContractID"], f"{PREFIX}_code": row["ContractID"],
            f"{PREFIX}_qtyperyear": _clean(row.get("QtyPerYear")),
            f"{PREFIX}_unitpricejpy": _clean(row.get("UnitPriceJPY")),
            f"{PREFIX}_startdate": _clean(row.get("StartDate")),
            f"{PREFIX}_enddate": _clean(row.get("EndDate")),
            f"{PREFIX}_penaltypctperday": _clean(row.get("PenaltyPctPerDay")),
        }
        ctype = CONTRACT_TYPE.get(str(row.get("ContractType")).strip())
        if ctype:
            body[f"{PREFIX}_contracttype"] = ctype
        inco = INCOTERMS.get(str(row.get("Incoterms")).strip())
        if inco:
            body[f"{PREFIX}_incoterms"] = inco
        buyer_id = cp_ids.get(row.get("BuyerCPID"))
        if np_ct_buyer and buyer_id:
            body[f"{np_ct_buyer}@odata.bind"] = f"/{counterparty_set}({buyer_id})"
        seller_id = cp_ids.get(row.get("SellerCPID"))
        if np_ct_seller and seller_id:
            body[f"{np_ct_seller}@odata.bind"] = f"/{counterparty_set}({seller_id})"
        prod_id = commodity_ids.get(row.get("ProductID"))
        if np_ct_commodity and prod_id:
            body[f"{np_ct_commodity}@odata.bind"] = f"/{commodity_set}({prod_id})"
        org_id = org_ids.get(row.get("OrgID"))
        if np_ct_org and org_id:
            body[f"{np_ct_org}@odata.bind"] = f"/{organization_set}({org_id})"
        owner_id = person_ids.get(row.get("PersonID"))
        if np_ct_owner and owner_id:
            body[f"{np_ct_owner}@odata.bind"] = f"/systemusers({owner_id})"
        rt_id = route_ids.get(row.get("RouteID"))
        if np_ct_route and rt_id:
            body[f"{np_ct_route}@odata.bind"] = f"/{route_set}({rt_id})"
        contract_ids[row["ContractID"]] = _post_debug(contract_set, body, "contract")
    print(f"  contract: {len(contract_ids)} rows")

    # ── shipment ──
    shipment_df = sheets["T_Shipment"]
    shipment_count = 0
    for _, row in shipment_df.iterrows():
        body = {
            f"{PREFIX}_name": row["ShipmentID"], f"{PREFIX}_code": row["ShipmentID"],
            f"{PREFIX}_vesselname": _clean(row.get("VesselName")),
            f"{PREFIX}_etd": _clean(row.get("ETD")), f"{PREFIX}_eta": _clean(row.get("ETA")),
            f"{PREFIX}_qty": _clean(row.get("Qty")), f"{PREFIX}_unitpricejpy": _clean(row.get("UnitPriceJPY")),
            f"{PREFIX}_viahormuz": _to_bool(row.get("ViaHormuz")),
            f"{PREFIX}_amountjpy": _clean(row.get("AmountJPY")),
            f"{PREFIX}_affectedamtjpy": _clean(row.get("AffectedAmtJPY")),
            f"{PREFIX}_altextradays": _clean(row.get("AltExtraDays")),
            f"{PREFIX}_altcostpct": _clean(row.get("AltCostPct")),
            f"{PREFIX}_altextracostjpy": _clean(row.get("AltExtraCostJPY")),
            f"{PREFIX}_penaltyjpy": _clean(row.get("PenaltyJPY")),
            f"{PREFIX}_buyerisinvestee": _to_bool(row.get("BuyerIsInvestee")),
        }
        status = SHIPMENT_STATUS.get(str(row.get("Status")).strip())
        if status:
            body[f"{PREFIX}_status"] = status
        affected = IS_AFFECTED.get(str(row.get("IsAffected")).strip())
        if affected:
            body[f"{PREFIX}_isaffected"] = affected
        ct_id = contract_ids.get(row.get("ContractID"))
        if np_sh_contract and ct_id:
            body[f"{np_sh_contract}@odata.bind"] = f"/{contract_set}({ct_id})"
        prod_id = commodity_ids.get(row.get("ProductID"))
        if np_sh_commodity and prod_id:
            body[f"{np_sh_commodity}@odata.bind"] = f"/{commodity_set}({prod_id})"
        rt_id = route_ids.get(row.get("RouteID"))
        if np_sh_route and rt_id:
            body[f"{np_sh_route}@odata.bind"] = f"/{route_set}({rt_id})"
        orig_id = site_ids.get(row.get("OriginSiteID"))
        if np_sh_origin and orig_id:
            body[f"{np_sh_origin}@odata.bind"] = f"/{site_set}({orig_id})"
        dest_id = site_ids.get(row.get("DestSiteID"))
        if np_sh_dest and dest_id:
            body[f"{np_sh_dest}@odata.bind"] = f"/{site_set}({dest_id})"
        buyer_id = cp_ids.get(row.get("BuyerCPID"))
        if np_sh_buyer and buyer_id:
            body[f"{np_sh_buyer}@odata.bind"] = f"/{counterparty_set}({buyer_id})"
        buyergroup_id = group_ids.get(row.get("BuyerGroupID"))
        if np_sh_buyergroup and buyergroup_id:
            body[f"{np_sh_buyergroup}@odata.bind"] = f"/{group_set}({buyergroup_id})"
        org_id = org_ids.get(row.get("OrgID"))
        if np_sh_org and org_id:
            body[f"{np_sh_org}@odata.bind"] = f"/{organization_set}({org_id})"
        _post_debug(shipment_set, body, "shipment")
        shipment_count += 1
        if shipment_count % 100 == 0:
            print(f"    shipment progress: {shipment_count}/{len(shipment_df)}")
    print(f"  shipment: {shipment_count} rows")

    # ── investment ──
    inv_df = sheets["T_Investment"]
    inv_count = 0
    for _, row in inv_df.iterrows():
        body = {
            f"{PREFIX}_name": row["InvesteeName"], f"{PREFIX}_code": row["InvestmentID"],
            f"{PREFIX}_equitypct": _clean(row.get("EquityPct")),
            f"{PREFIX}_bookvaluejpym": _clean(row.get("BookValueJPYm")),
            f"{PREFIX}_annualprofitjpym": _clean(row.get("AnnualProfitJPYm")),
        }
        method = EQUITY_METHOD.get(str(row.get("EquityMethod")).strip())
        if method:
            body[f"{PREFIX}_equitymethod"] = method
        linked_id = cp_ids.get(row.get("LinkedCounterpartyID"))
        if np_iv_linked and linked_id:
            body[f"{np_iv_linked}@odata.bind"] = f"/{counterparty_set}({linked_id})"
        group_id = group_ids.get(row.get("GroupID"))
        if np_iv_group and group_id:
            body[f"{np_iv_group}@odata.bind"] = f"/{group_set}({group_id})"
        org_id = org_ids.get(row.get("OrgID"))
        if np_iv_org and org_id:
            body[f"{np_iv_org}@odata.bind"] = f"/{organization_set}({org_id})"
        _post_debug(investment_set, body, "investment")
        inv_count += 1
    print(f"  investment: {inv_count} rows")

    # ── creditline ──
    cl_df = sheets["T_CreditLine"]
    cl_count = 0
    for _, row in cl_df.iterrows():
        body = {
            f"{PREFIX}_name": row["CreditLineID"], f"{PREFIX}_code": row["CreditLineID"],
            f"{PREFIX}_limitjpym": _clean(row.get("LimitJPYm")), f"{PREFIX}_usedjpym": _clean(row.get("UsedJPYm")),
            f"{PREFIX}_expirydate": _clean(row.get("ExpiryDate")),
        }
        gtype = GUARANTEE_TYPE.get(str(row.get("GuaranteeType")).strip())
        if gtype:
            body[f"{PREFIX}_guaranteetype"] = gtype
        group_id = group_ids.get(row.get("GroupID"))
        if np_cl_group and group_id:
            body[f"{np_cl_group}@odata.bind"] = f"/{group_set}({group_id})"
        org_id = org_ids.get(row.get("OrgID"))
        if np_cl_org and org_id:
            body[f"{np_cl_org}@odata.bind"] = f"/{organization_set}({org_id})"
        _post_debug(creditline_set, body, "creditline")
        cl_count += 1
    print(f"  creditline: {cl_count} rows")

    # ── event ──
    event_df = sheets["T_Event"]
    event_ids: dict = {}
    for _, row in event_df.iterrows():
        body = {
            f"{PREFIX}_name": row["EventName"], f"{PREFIX}_code": row["EventID"],
            f"{PREFIX}_startdate": _clean(row.get("StartDate")), f"{PREFIX}_enddate": _clean(row.get("EndDate")),
            f"{PREFIX}_affectedchokepoint": _clean(row.get("AffectedChokepoint")),
            f"{PREFIX}_description": _clean(row.get("Description")),
        }
        etype = EVENT_TYPE.get(str(row.get("EventType")).strip())
        if etype:
            body[f"{PREFIX}_eventtype"] = etype
        sev = SEVERITY.get(str(row.get("Severity")).strip())
        if sev:
            body[f"{PREFIX}_severity"] = sev
        event_ids[row["EventID"]] = _post_debug(event_set, body, "event")
    print(f"  event: {len(event_ids)} rows")

    # ── eventimpact ──
    im_df = sheets["T_EventImpact"]
    im_count = 0
    for _, row in im_df.iterrows():
        body = {
            f"{PREFIX}_name": row["ImpactID"], f"{PREFIX}_code": row["ImpactID"],
            f"{PREFIX}_targetid": _clean(row.get("TargetID")),
            f"{PREFIX}_delaydays": _clean(row.get("DelayDays")),
            f"{PREFIX}_costupliftpct": _clean(row.get("CostUpliftPct")),
            f"{PREFIX}_volumecutpct": _clean(row.get("VolumeCutPct")),
        }
        ttype = TARGET_TYPE.get(str(row.get("TargetType")).strip())
        if ttype:
            body[f"{PREFIX}_targettype"] = ttype
        ikind = IMPACT_KIND.get(str(row.get("ImpactKind")).strip())
        if ikind:
            body[f"{PREFIX}_impactkind"] = ikind
        ev_id = event_ids.get(row.get("EventID"))
        if np_im_event and ev_id:
            body[f"{np_im_event}@odata.bind"] = f"/{event_set}({ev_id})"
        _post_debug(eventimpact_set, body, "eventimpact")
        im_count += 1
    print(f"  eventimpact: {im_count} rows")

    print("  ✅ Demo data import complete")


# ── Step 7: ソリューション含有検証 ──────────────────────────

def ensure_solution_membership():
    """全テーブルがソリューションに含まれているか確認し、不足分を追加"""
    print("\n=== Step 7: Solution membership verification ===")

    sols = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid")
    if not sols.get("value"):
        print(f"  ❌ Solution '{SOLUTION_NAME}' not found")
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
                print(f"  ✅ {logical}: already in solution")
            else:
                print(f"  ➕ {logical}: adding to solution...")
                api_post("AddSolutionComponent", {
                    "ComponentId": meta_id,
                    "ComponentType": 1,
                    "SolutionUniqueName": SOLUTION_NAME,
                    "AddRequiredComponents": False,
                    "DoNotIncludeSubcomponents": False,
                })
                print(f"  ✅ {logical}: added")
        except Exception as e:
            print(f"  ❌ {logical}: {e}")


# ── Step 8: テーブル検証 ──────────────────────────────────────

def verify_tables():
    """全テーブルの EntitySetName を API で取得してクエリ検証"""
    print("\n=== Step 8: Table verification ===")

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
    import argparse
    parser = argparse.ArgumentParser(description="Dataverse table build")
    parser.add_argument(
        "--skip-localize", action="store_true",
        help="ローカライズ（Step 5）とデモデータ投入以降をスキップし、テーブル構築（英語のまま）のみ行う。"
             "Code Apps で pac code add-data-source を使う場合、日本語 DisplayName だと "
             "'Failed to sanitize string' で失敗することがあるため、"
             "add-data-source 完了後に --localize-only で改めてローカライズする2段階運用にする",
    )
    parser.add_argument(
        "--localize-only", action="store_true",
        help="ローカライズ（Step 5）・再公開・デモデータ投入・検証のみ実行する（Step 1〜4 はスキップ）。"
             "--skip-localize でテーブル構築 → add-data-source 完了後にこれを実行する想定",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  Dataverse table build")
    print("=" * 60)
    print(f"  Environment: {DATAVERSE_URL}")
    print(f"  Solution: {SOLUTION_NAME}")
    print(f"  Prefix: {PREFIX}")

    validate_tables()             # Step 0: TABLES 定義の事前検証（API 呼び出し前）

    if not args.localize_only:
        ensure_solution()            # Step 1: ソリューション
        create_tables()              # Step 2: テーブル作成
        create_lookups()             # Step 3: Lookup
        publish_all()                # Step 4: 公開（テーブル反映）

    if args.skip_localize:
        print("\n⏭  --skip-localize specified: skipping localization and later steps")
        print("Next: run pac code add-data-source, then re-run this script with --localize-only")
        return

    localize_tables()            # Step 5: ローカライズ
    publish_all()                # 再公開（ローカライズ反映）
    create_demo_data()           # Step 6: デモデータ
    ensure_solution_membership() # Step 7: ソリューション検証
    verify_tables()              # Step 8: テーブル検証

    print("\n✅ Dataverse setup complete!")
    print("Next: create app / npx power-apps add-data-source / pac model genpage generate-types")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        traceback.print_exc()
        sys.exit(1)
