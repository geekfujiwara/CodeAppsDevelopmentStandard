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

import requests
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
#
# このテンプレートはプロジェクトの scripts/ にコピーして使うため、スキル配下の相対パス
# （../../standard/scripts）を直書きするとコピー先で ModuleNotFoundError になる。
# 配置場所に依存しないよう候補を順に探索する。
def _resolve_auth_helper_dir() -> str:
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent.parent / "standard" / "scripts",  # スキル配下（テンプレート本体）
        here.parent,                                          # スクリプトと同階層
        *[p / ".github" / "skills" / "standard" / "scripts" for p in here.parents],
        *here.parents,                                        # auth_helper.py をルートに置いた場合
    ]
    for c in candidates:
        if (c / "auth_helper.py").is_file():
            return str(c)
    raise ModuleNotFoundError(
        "auth_helper.py が見つかりません。"
        ".github/skills/standard/scripts/auth_helper.py を配置するか、"
        "本スクリプトと同じフォルダにコピーしてください。"
    )


sys.path.insert(0, _resolve_auth_helper_dir())
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
# ▼▼▼ プロジェクト固有: 株主総会 Q&A 支援 ▼▼▼
# ════════════════════════════════════════════════════════════════
# 表示名は英語で作成し（pa app add data-source の 'Failed to sanitize string' 回避）、
# --localize-only で日本語化する 2 段階運用。

TABLES = [
    # ── マスタ ──────────────────────────────────────
    {
        "logical": f"{PREFIX}_agmqa", "display": "AGM QA", "plural": "AGM QAs",
        "name_display": "Code", "description": "Shareholders meeting expected Q&A master",
        "columns": [
            {"logical": f"{PREFIX}_category", "type": "String", "display": "Category", "maxLength": 100},
            {"logical": f"{PREFIX}_question", "type": "Memo", "display": "Question", "maxLength": 2000},
            {"logical": f"{PREFIX}_variants", "type": "Memo", "display": "Question variants", "maxLength": 4000},
            {"logical": f"{PREFIX}_keywords", "type": "String", "display": "Keywords", "maxLength": 1000},
            {"logical": f"{PREFIX}_answer", "type": "Memo", "display": "Answer", "maxLength": 8000},
            {"logical": f"{PREFIX}_answerpoints", "type": "Memo", "display": "Answer points", "maxLength": 4000},
            {"logical": f"{PREFIX}_responder", "type": "String", "display": "Responder", "maxLength": 100},
            {"logical": f"{PREFIX}_sourceids", "type": "String", "display": "Source IDs", "maxLength": 500},
            {"logical": f"{PREFIX}_cautions", "type": "Memo", "display": "Cautions", "maxLength": 2000},
            # 下書き（Copilot Studio・Cowork・アプリで作成、承認待ち）/ 承認済み。空は承認済みとして扱う（既存データ）
            {"logical": f"{PREFIX}_status", "type": "String", "display": "Status", "maxLength": 20},
            {"logical": f"{PREFIX}_createdvia", "type": "String", "display": "Created via", "maxLength": 50},
        ],
    },
    {
        "logical": f"{PREFIX}_agmirexcerpt", "display": "AGM IR Excerpt", "plural": "AGM IR Excerpts",
        "name_display": "Code", "description": "IR document excerpts used as answer evidence",
        "columns": [
            {"logical": f"{PREFIX}_doctitle", "type": "String", "display": "Document title", "maxLength": 200},
            {"logical": f"{PREFIX}_doctype", "type": "String", "display": "Document type", "maxLength": 100},
            {"logical": f"{PREFIX}_section", "type": "String", "display": "Section", "maxLength": 200},
            {"logical": f"{PREFIX}_page", "type": "Integer", "display": "Page", "minValue": 0, "maxValue": 10000},
            {"logical": f"{PREFIX}_text", "type": "Memo", "display": "Text", "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_agmmeeting", "display": "AGM Meeting", "plural": "AGM Meetings",
        "name_display": "Title", "description": "Shareholders meeting",
        "columns": [
            {"logical": f"{PREFIX}_meetingdate", "type": "DateTime", "display": "Meeting date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_summaryurl", "type": "String", "display": "Summary URL", "maxLength": 1000},
        ],
    },
    {
        "logical": f"{PREFIX}_agmshareholder", "display": "AGM Shareholder", "plural": "AGM Shareholders",
        "name_display": "Shareholder number", "description": "Shareholder register (looked up by the number spoken in the meeting)",
        "columns": [
            {"logical": f"{PREFIX}_shareholdername", "type": "String", "display": "Name", "maxLength": 100},
            {"logical": f"{PREFIX}_kana", "type": "String", "display": "Kana", "maxLength": 100},
            {"logical": f"{PREFIX}_shares", "type": "Integer", "display": "Shares", "minValue": 0, "maxValue": 2000000000},
            {"logical": f"{PREFIX}_holdertype", "type": "String", "display": "Holder type", "maxLength": 50},
            {"logical": f"{PREFIX}_since", "type": "String", "display": "Holding since", "maxLength": 20},
            {"logical": f"{PREFIX}_note", "type": "Memo", "display": "Note", "maxLength": 2000},
        ],
    },
    # ── 記録 ────────────────────────────────────────
    {
        "logical": f"{PREFIX}_agmturn", "display": "AGM Turn", "plural": "AGM Turns",
        "name_display": "Title", "description": "One shareholder speaking turn (audio + transcript)",
        "columns": [
            {"logical": f"{PREFIX}_shareholdernumber", "type": "String", "display": "Shareholder number", "maxLength": 20},
            {"logical": f"{PREFIX}_shareholdername", "type": "String", "display": "Shareholder name", "maxLength": 100},
            {"logical": f"{PREFIX}_startedat", "type": "DateTime", "display": "Started at"},
            {"logical": f"{PREFIX}_endedat", "type": "DateTime", "display": "Ended at"},
            {"logical": f"{PREFIX}_durationsec", "type": "Integer", "display": "Duration (sec)", "minValue": 0, "maxValue": 100000},
            {"logical": f"{PREFIX}_transcript", "type": "Memo", "display": "Transcript", "maxLength": 100000},
            {"logical": f"{PREFIX}_audiourl", "type": "String", "display": "Audio URL", "maxLength": 1000},
            {"logical": f"{PREFIX}_audiofilename", "type": "String", "display": "Audio file name", "maxLength": 260},
            {"logical": f"{PREFIX}_savestatus", "type": "String", "display": "Save status", "maxLength": 100},
            {"logical": f"{PREFIX}_numberheard", "type": "String", "display": "Number as heard", "maxLength": 100},
        ],
    },
    {
        "logical": f"{PREFIX}_agmquestion", "display": "AGM Question", "plural": "AGM Questions",
        "name_display": "Summary", "description": "A question detected in a turn, with answer draft and citations",
        "columns": [
            {"logical": f"{PREFIX}_seq", "type": "Integer", "display": "Sequence", "minValue": 0, "maxValue": 1000},
            {"logical": f"{PREFIX}_category", "type": "String", "display": "Category", "maxLength": 100},
            {"logical": f"{PREFIX}_excerpt", "type": "Memo", "display": "Transcript excerpt", "maxLength": 4000},
            {"logical": f"{PREFIX}_qacode", "type": "String", "display": "QA code", "maxLength": 20},
            {"logical": f"{PREFIX}_answerdraft", "type": "Memo", "display": "Answer draft", "maxLength": 8000},
            {"logical": f"{PREFIX}_citations", "type": "Memo", "display": "Citations (JSON)", "maxLength": 50000},
            {"logical": f"{PREFIX}_score", "type": "Decimal", "display": "Score", "precision": 4, "minValue": 0, "maxValue": 1000},
            {"logical": f"{PREFIX}_adopted", "type": "Boolean", "display": "Adopted by operator", "true_label": "Yes", "false_label": "No"},
            {"logical": f"{PREFIX}_unverifiednumbers", "type": "String", "display": "Unverified numbers", "maxLength": 500},
            {"logical": f"{PREFIX}_aidraft", "type": "Memo", "display": "AI draft (generated)", "maxLength": 20000},
            {"logical": f"{PREFIX}_aimodel", "type": "String", "display": "AI model", "maxLength": 100},
            {"logical": f"{PREFIX}_rating", "type": "Integer", "display": "Rating (1-5)", "minValue": 0, "maxValue": 5},
            {"logical": f"{PREFIX}_ratingcomment", "type": "Memo", "display": "Rating comment", "maxLength": 2000},
        ],
    },
    # ── LIVE（閲覧者への画面共有）────────────────────────
    {
        "logical": f"{PREFIX}_agmlive", "display": "AGM Live Session", "plural": "AGM Live Sessions",
        "name_display": "Title", "description": "Read-only screen sharing for executives (owner writes state, viewers get shared read access)",
        "columns": [
            {"logical": f"{PREFIX}_status", "type": "String", "display": "Status", "maxLength": 20},
            {"logical": f"{PREFIX}_state", "type": "Memo", "display": "Screen state (JSON)", "maxLength": 1048576},
            {"logical": f"{PREFIX}_revision", "type": "Integer", "display": "Revision", "minValue": 0, "maxValue": 2000000000},
            {"logical": f"{PREFIX}_viewers", "type": "Memo", "display": "Viewers", "maxLength": 4000},
        ],
    },
    # ── リハーサル台本（Copilot Studio・Cowork・アプリで作成し、台本タブで選ぶ）───────
    {
        "logical": f"{PREFIX}_agmscript", "display": "AGM Rehearsal Script", "plural": "AGM Rehearsal Scripts",
        "name_display": "Title", "description": "Rehearsal script lines for the Q&A session (JSON)",
        "columns": [
            {"logical": f"{PREFIX}_lines", "type": "Memo", "display": "Lines (JSON)", "maxLength": 200000},
            {"logical": f"{PREFIX}_note", "type": "Memo", "display": "Note", "maxLength": 2000},
            {"logical": f"{PREFIX}_status", "type": "String", "display": "Status", "maxLength": 20},
            {"logical": f"{PREFIX}_createdvia", "type": "String", "display": "Created via", "maxLength": 50},
        ],
    },
    # ── アプリの設定（組織の既定。name=default の 1 行）──────────
    {
        "logical": f"{PREFIX}_agmsetting", "display": "AGM Setting", "plural": "AGM Settings",
        "name_display": "Key", "description": "Organization default settings for models and transcription (JSON)",
        "columns": [
            {"logical": f"{PREFIX}_value", "type": "Memo", "display": "Value (JSON)", "maxLength": 100000},
        ],
    },
]

LOOKUPS = [
    {"from_table": f"{PREFIX}_agmturn", "column_logical": f"{PREFIX}_meetingid",
     "display": "Meeting", "to_table": f"{PREFIX}_agmmeeting"},
    {"from_table": f"{PREFIX}_agmquestion", "column_logical": f"{PREFIX}_turnid",
     "display": "Turn", "to_table": f"{PREFIX}_agmturn"},
    {"from_table": f"{PREFIX}_agmquestion", "column_logical": f"{PREFIX}_qaid",
     "display": "Expected QA", "to_table": f"{PREFIX}_agmqa"},
    {"from_table": f"{PREFIX}_agmturn", "column_logical": f"{PREFIX}_shareholderid",
     "display": "Shareholder", "to_table": f"{PREFIX}_agmshareholder"},
    {"from_table": f"{PREFIX}_agmlive", "column_logical": f"{PREFIX}_meetingid",
     "display": "Meeting", "to_table": f"{PREFIX}_agmmeeting"},
]

LOCALIZE_TABLES = [
    (f"{PREFIX}_agmqa", "想定問答", "想定問答"),
    (f"{PREFIX}_agmirexcerpt", "IR 抜粋", "IR 抜粋"),
    (f"{PREFIX}_agmmeeting", "株主総会", "株主総会"),
    (f"{PREFIX}_agmshareholder", "株主名簿", "株主名簿"),
    (f"{PREFIX}_agmturn", "株主発言", "株主発言"),
    (f"{PREFIX}_agmquestion", "株主質問", "株主質問"),
    (f"{PREFIX}_agmlive", "LIVE 共有", "LIVE 共有"),
    (f"{PREFIX}_agmscript", "リハーサル台本", "リハーサル台本"),
    (f"{PREFIX}_agmsetting", "アプリの設定", "アプリの設定"),
]
LOCALIZE_COLUMNS = [
    (f"{PREFIX}_agmqa", f"{PREFIX}_status", "状態（下書き / 承認済み）"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_createdvia", "作成元"),
    (f"{PREFIX}_agmscript", f"{PREFIX}_name", "台本名"),
    (f"{PREFIX}_agmscript", f"{PREFIX}_lines", "行（JSON）"),
    (f"{PREFIX}_agmscript", f"{PREFIX}_note", "メモ"),
    (f"{PREFIX}_agmscript", f"{PREFIX}_status", "状態"),
    (f"{PREFIX}_agmscript", f"{PREFIX}_createdvia", "作成元"),
    (f"{PREFIX}_agmsetting", f"{PREFIX}_name", "キー"),
    (f"{PREFIX}_agmsetting", f"{PREFIX}_value", "値（JSON）"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_name", "問答コード"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_category", "分類"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_question", "質問"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_variants", "言い換え"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_keywords", "キーワード"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_answer", "回答"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_answerpoints", "回答の要点"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_responder", "回答者"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_sourceids", "根拠 ID"),
    (f"{PREFIX}_agmqa", f"{PREFIX}_cautions", "注意事項"),
    (f"{PREFIX}_agmirexcerpt", f"{PREFIX}_name", "抜粋コード"),
    (f"{PREFIX}_agmirexcerpt", f"{PREFIX}_doctitle", "資料名"),
    (f"{PREFIX}_agmirexcerpt", f"{PREFIX}_doctype", "資料種別"),
    (f"{PREFIX}_agmirexcerpt", f"{PREFIX}_section", "章"),
    (f"{PREFIX}_agmirexcerpt", f"{PREFIX}_page", "ページ"),
    (f"{PREFIX}_agmirexcerpt", f"{PREFIX}_text", "本文"),
    (f"{PREFIX}_agmmeeting", f"{PREFIX}_name", "総会名"),
    (f"{PREFIX}_agmmeeting", f"{PREFIX}_meetingdate", "開催日"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_name", "株主番号"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_shareholdername", "氏名"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_kana", "フリガナ"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_shares", "保有株式数"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_holdertype", "株主区分"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_since", "保有開始"),
    (f"{PREFIX}_agmshareholder", f"{PREFIX}_note", "メモ"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_shareholderid", "株主"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_name", "件名"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_shareholdernumber", "株主番号"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_shareholdername", "株主氏名"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_startedat", "開始日時"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_endedat", "終了日時"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_durationsec", "発言時間（秒）"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_transcript", "文字起こし"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_audiourl", "音声 URL"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_audiofilename", "音声ファイル名"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_savestatus", "保存状態"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_meetingid", "株主総会"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_name", "質問の要約"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_seq", "順番"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_category", "分類"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_excerpt", "発言の該当箇所"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_qacode", "問答コード"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_answerdraft", "回答案"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_citations", "根拠（JSON）"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_score", "一致度"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_adopted", "オペレーターが採用"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_unverifiednumbers", "根拠の無い数字"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_aidraft", "AI 要約・回答案（生成）"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_aimodel", "生成モデル"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_rating", "評価（1〜5）"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_ratingcomment", "評価のコメント"),
    (f"{PREFIX}_agmturn", f"{PREFIX}_numberheard", "聞き取った番号（原文）"),
    (f"{PREFIX}_agmmeeting", f"{PREFIX}_summaryurl", "まとめの保存先"),
    (f"{PREFIX}_agmlive", f"{PREFIX}_name", "件名"),
    (f"{PREFIX}_agmlive", f"{PREFIX}_status", "状態"),
    (f"{PREFIX}_agmlive", f"{PREFIX}_state", "画面の状態（JSON）"),
    (f"{PREFIX}_agmlive", f"{PREFIX}_revision", "版"),
    (f"{PREFIX}_agmlive", f"{PREFIX}_viewers", "閲覧者"),
    (f"{PREFIX}_agmlive", f"{PREFIX}_meetingid", "株主総会"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_turnid", "株主発言"),
    (f"{PREFIX}_agmquestion", f"{PREFIX}_qaid", "想定問答"),
]
LOCALIZE_OPTIONS = []

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

def resolve_publisher_id() -> str:
    """PUBLISHER_PREFIX から Publisher を一意に解決する。

    同一プレフィックスの Publisher が複数存在する環境があり、先頭要素を暗黙採用すると
    意図しない Publisher でソリューションが作られる。曖昧な場合は候補を提示して中断し、
    .env の PUBLISHER_UNIQUE_NAME（または PUBLISHER_ID）で明示させる。
    """
    explicit_id = os.environ.get("PUBLISHER_ID", "").strip()
    if explicit_id:
        return explicit_id

    unique_name = os.environ.get("PUBLISHER_UNIQUE_NAME", "").strip()
    flt = f"customizationprefix eq '{PREFIX}'"
    if unique_name:
        flt += f" and uniquename eq '{unique_name}'"
    pubs = api_get(f"publishers?$filter={flt}&$select=publisherid,uniquename,friendlyname")
    values = pubs.get("value", [])

    if not values:
        raise RuntimeError(
            f"Publisher with prefix='{PREFIX}'"
            + (f" and uniquename='{unique_name}'" if unique_name else "")
            + " not found. Please create it in Power Apps."
        )
    if len(values) > 1:
        listed = "\n".join(
            f"    - uniquename={v['uniquename']} / friendlyname={v.get('friendlyname')} / id={v['publisherid']}"
            for v in values
        )
        raise RuntimeError(
            f"Publisher with prefix='{PREFIX}' is ambiguous ({len(values)} found).\n"
            f"{listed}\n"
            "  → .env に PUBLISHER_UNIQUE_NAME（または PUBLISHER_ID）を設定して一意に指定してください。"
        )
    return values[0]["publisherid"]


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
    pub_id = resolve_publisher_id()

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
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 1_000_000_000_000)
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
    "Money": {"min": -922_337_203_685_477, "max": 922_337_203_685_477},
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


def validate_no_foreign_tables() -> None:
    """TABLES の論理名が「対象ソリューション外の既存テーブル」と衝突していないか検証する。

    同じ発行元プレフィックスを共有する環境では {prefix}_project のような一般的な名前が
    別プロジェクトで既に使われていることがある。そのまま実行すると他プロジェクトの
    テーブルに列を追記してしまうため、ソリューション未所属の既存テーブルを検出したら中断する。
    再実行時は自ソリューションのテーブルなので素通りし、べき等性は保たれる。
    """
    # EntityDefinitions は startswith 等の関数フィルターに対応しておらず 501（Not Implemented）になる。
    # 対象のテーブルを論理名で 1 件ずつ引き、404 は「存在しない＝衝突なし」として扱う
    hit: dict[str, str] = {}
    for logical in sorted({t["logical"] for t in TABLES}):
        try:
            found = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName,MetadataId")
        except requests.exceptions.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                continue
            raise
        hit[found["LogicalName"]] = found["MetadataId"]
    if not hit:
        return

    sol = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid").get("value", [])
    owned: set[str] = set()
    if sol:
        components = api_get(
            f"solutioncomponents?$select=objectid"
            f"&$filter=_solutionid_value eq {sol[0]['solutionid']} and componenttype eq 1"
        ).get("value", [])
        owned = {c["objectid"].lower() for c in components}

    foreign = sorted(name for name, mid in hit.items() if mid.lower() not in owned)
    if foreign:
        raise RuntimeError(
            f"The following table logical names already exist outside solution '{SOLUTION_NAME}':\n"
            + "\n".join(f"  - {n}" for n in foreign)
            + "\n  → 別プロジェクトのテーブルを破壊しないよう中断しました。"
            "\n     TABLES の logical 名を専用の名前空間（例: {prefix}_<abbr><entity>）に変更するか、"
            "\n     意図的に既存テーブルを拡張する場合のみ本チェックを外してください。"
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
    # 並行数はデフォルト 3。既存カスタムテーブルが多い（100件超）環境や他セッションが
    # 同時にメタデータ操作をしている環境では、並行数が高いほど 0x80040237（メタデータ
    # ロック競合）の retry_metadata 上限（5回）を超えて失敗しやすい（実測: 5並行で
    # 10テーブル中7テーブルが失敗、2並行で全成功）。失敗が多発する場合は 2 まで下げる。
    failed: dict[str, Exception] = {}
    with ThreadPoolExecutor(max_workers=min(len(TABLES), 2)) as executor:
        futures = {executor.submit(_create_single_table, tbl): tbl for tbl in TABLES}
        for future in as_completed(futures):
            tbl = futures[future]
            try:
                future.result()
            except Exception as exc:
                failed[tbl["logical"]] = exc

    # 恒久対策（再発防止）: 混雑環境では 2 並行でも retry_metadata の上限（5回）を
    # 超えて失敗することが実測された（10テーブル中4テーブルが失敗した事例あり）。
    # 並行実行の「後」に、失敗したテーブルだけを対象として直列（1件ずつ・並行数1）で
    # 自動的に再試行する。スクリプトは冪等（既存テーブル/列は検出してスキップ）なので、
    # この自動リトライだけで通常は解消し、ユーザーが手動で再実行する必要がなくなる。
    if failed:
        print(f"\n  ⚠ {len(failed)} table(s) failed during parallel creation (lock contention). "
              f"Retrying sequentially: {', '.join(failed)}")
        still_failed: list[str] = []
        for tbl in TABLES:
            if tbl["logical"] not in failed:
                continue
            time.sleep(15)  # メタデータロックの解放を待ってから直列リトライ
            try:
                _create_single_table(tbl)
                print(f"  ✅ {tbl['logical']}: recovered on sequential retry")
            except Exception as exc:
                detail_text = ""
                resp = getattr(exc, "response", None)
                if resp is not None:
                    try:
                        detail_text = f"\n  詳細: {resp.text}"
                    except Exception:
                        pass
                msg = f"Error creating table '{tbl['logical']}': {exc}{detail_text}"
                print(f"  ❌ {msg}")
                still_failed.append(msg)

        if still_failed:
            raise RuntimeError(
                "Errors occurred during table creation, even after sequential retry:\n"
                + "\n".join(still_failed)
                + "\n(スクリプトは冪等なので、そのまま再実行すれば作成済み分をスキップして続行できます)"
            )


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


def _prefetch_codes(entity_set: str, id_attr: str, code_attr: str = "") -> dict:
    """既存レコードの code→id マッピングを取得する（Step 6 のべき等化用）。

    Step 6 は行ごとの存在チェックを行わず api_post するだけだったため、再実行すると
    既存レコードが重複投入されていた。実行前に一括で code→id を取得しておき、
    ループ側で「既に存在すればスキップ」を判定できるようにする。
    """
    code_field = code_attr or f"{PREFIX}_code"
    resp = api_get(f"{entity_set}?$select={id_attr},{code_field}&$top=5000")
    existing: dict = {}
    for rec in resp.get("value", []):
        code = rec.get(code_field)
        if code:
            existing[code] = rec[id_attr]
    return existing


def _assert_json_safe(body: dict, label: str) -> None:
    """body に numpy スカラー型が残っていないかを api_post 直前に必ず検証する。

    項目15 の教訓: pandas.iterrows() の値は numpy.int64/float64 等になり得るが、
    requests の json= はこれをシリアライズできず TypeError で失敗する。_clean() で
    変換しているはずだが、将来 _clean() を経由しない新フィールドが追加された場合の
    回帰を防ぐため、成功する行も含め毎回（正常系でも）このチェックを通す。
    """
    import numpy as np
    bad = [k for k, v in body.items() if isinstance(v, np.generic)]
    if bad:
        raise TypeError(
            f"{label}: body に numpy スカラー型が残っています（キー: {bad}）。"
            " _clean() でネイティブ型に変換してから渡してください（項目15参照）。"
        )


def _post_debug(entity_set: str, body: dict, label: str):
    """api_post をラップし、numpy型混入チェック＋400 系エラー時のレスポンスボディ詳細化を行う。

    デモデータ投入は大量行を api_post で連続投入するため、詳細メッセージ無しで
    クラッシュすると原因究明ができない（項目 12 と同じパターン）。Step 6 の全エンティティ
    投入はこの関数を経由させ、成功する行でも _assert_json_safe を必ず通す。
    """
    _assert_json_safe(body, label)
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


# Excel列 → (テーブル論理名, 列論理名) のマッピング。Step 6 の投入ループを開始する前に、
# 実データの min/max を TABLES 定義の Decimal/Money 上限と突き合わせて事前検証する。
_DEMO_DATA_RANGE_CHECKS = [
    # (シート名, Excel列名, テーブル論理名, 列論理名)
    ("M_Group", "GroupLimitJPYm", f"{PREFIX}_group", f"{PREFIX}_grouplimitjpym"),
    ("M_Product", "UnitPriceJPY", f"{PREFIX}_commodity", f"{PREFIX}_unitpricejpy"),
    ("T_Contract", "QtyPerYear", f"{PREFIX}_contract", f"{PREFIX}_qtyperyear"),
    ("T_Contract", "UnitPriceJPY", f"{PREFIX}_contract", f"{PREFIX}_unitpricejpy"),
    ("T_Contract", "PenaltyPctPerDay", f"{PREFIX}_contract", f"{PREFIX}_penaltypctperday"),
    ("T_Shipment", "Qty", f"{PREFIX}_shipment", f"{PREFIX}_qty"),
    ("T_Shipment", "UnitPriceJPY", f"{PREFIX}_shipment", f"{PREFIX}_unitpricejpy"),
    ("T_Shipment", "AmountJPY", f"{PREFIX}_shipment", f"{PREFIX}_amountjpy"),
    ("T_Shipment", "AffectedAmtJPY", f"{PREFIX}_shipment", f"{PREFIX}_affectedamtjpy"),
    ("T_Shipment", "AltCostPct", f"{PREFIX}_shipment", f"{PREFIX}_altcostpct"),
    ("T_Shipment", "AltExtraCostJPY", f"{PREFIX}_shipment", f"{PREFIX}_altextracostjpy"),
    ("T_Shipment", "PenaltyJPY", f"{PREFIX}_shipment", f"{PREFIX}_penaltyjpy"),
    ("T_Investment", "EquityPct", f"{PREFIX}_investment", f"{PREFIX}_equitypct"),
    ("T_Investment", "BookValueJPYm", f"{PREFIX}_investment", f"{PREFIX}_bookvaluejpym"),
    ("T_Investment", "AnnualProfitJPYm", f"{PREFIX}_investment", f"{PREFIX}_annualprofitjpym"),
    ("T_CreditLine", "LimitJPYm", f"{PREFIX}_creditline", f"{PREFIX}_limitjpym"),
    ("T_CreditLine", "UsedJPYm", f"{PREFIX}_creditline", f"{PREFIX}_usedjpym"),
    ("T_EventImpact", "CostUpliftPct", f"{PREFIX}_eventimpact", f"{PREFIX}_costupliftpct"),
    ("T_EventImpact", "VolumeCutPct", f"{PREFIX}_eventimpact", f"{PREFIX}_volumecutpct"),
]


def _table_col_limit(table_logical: str, col_logical: str):
    """TABLES 定義から指定テーブル・列の Decimal/Money 列の (min, max) を取得する（対象外なら None）。"""
    for tbl in TABLES:
        if tbl["logical"] != table_logical:
            continue
        for col in tbl.get("columns", []):
            if col["logical"] == col_logical and col["type"] in ("Decimal", "Money"):
                return col.get("minValue", 0), col.get("maxValue", DATAVERSE_LIMITS[col["type"]]["max"])
    return None


def validate_demo_data_ranges(sheets: dict) -> None:
    """Excel実データの min/max を TABLES 定義の Decimal/Money 上限と突き合わせて検証する。

    項目16/17 の教訓: スキーマ上限ぎりぎりの設定でも実データがそれを超過するケースがあり、
    投入ループの途中で 400 エラーとして発覚すると原因究明・手戻り（Decimal→Money 変更や
    既存行削除）が大きい。Step 6 の投入ループを開始する前に必ず一括検証し、超過していない
    正常系でも毎回このチェックを実行することで、同じ問題の再発を防ぐ。
    """
    errors: list[str] = []
    for sheet_name, excel_col, table_logical, col_logical in _DEMO_DATA_RANGE_CHECKS:
        df = sheets.get(sheet_name)
        if df is None or excel_col not in df.columns:
            continue
        limit = _table_col_limit(table_logical, col_logical)
        if limit is None:
            continue
        min_v, max_v = limit
        col_data = df[excel_col].dropna()
        if col_data.empty:
            continue
        actual_min, actual_max = col_data.min(), col_data.max()
        if actual_max > max_v or actual_min < min_v:
            errors.append(
                f"{table_logical}.{col_logical}（Excel: {sheet_name}.{excel_col}）: "
                f"実データ {actual_min}..{actual_max} が定義上限 {min_v}..{max_v} を超えています"
            )

    if errors:
        raise ValueError(
            "デモデータの実測値が TABLES 定義の Decimal/Money 上限を超えています"
            "（Step 6 投入前チェック。項目16/17参照。TABLES の type/maxValue を見直してください）:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )


def create_demo_data():
    """data/demo/*.json を想定問答・IR 抜粋・株主総会に投入する（コードで照合して upsert。再実行しても重複しない）。"""
    import json as _json

    print("\n=== Step 6: Demo data ===")
    demo = _find_repo_root() / "data" / "demo"
    qa_items = _json.loads((demo / "qa-master.json").read_text(encoding="utf-8"))
    ir_items = _json.loads((demo / "ir-documents.json").read_text(encoding="utf-8"))
    company = _json.loads((demo / "company.json").read_text(encoding="utf-8"))

    def upsert(table: str, code: str, body: dict) -> str:
        entity_set = get_entity_set_name(table)
        pk = f"{table}id"
        found = api_get(f"{entity_set}?$select={pk}&$filter={PREFIX}_name eq '{code}'").get("value", [])
        _assert_json_safe(body, f"{table}:{code}")
        if found:
            api_patch(f"{entity_set}({found[0][pk]})", body)
            return found[0][pk]
        return api_post(entity_set, body, solution=SOLUTION_NAME)

    for item in ir_items:
        upsert(f"{PREFIX}_agmirexcerpt", item["id"], {
            f"{PREFIX}_name": item["id"],
            f"{PREFIX}_doctitle": item["docTitle"],
            f"{PREFIX}_doctype": item["docType"],
            f"{PREFIX}_section": item["section"],
            f"{PREFIX}_page": int(item["page"]),
            f"{PREFIX}_text": item["text"],
        })
    print(f"  IR excerpts: {len(ir_items)}")

    for item in qa_items:
        upsert(f"{PREFIX}_agmqa", item["id"], {
            f"{PREFIX}_name": item["id"],
            f"{PREFIX}_category": item["category"],
            f"{PREFIX}_question": item["question"],
            f"{PREFIX}_variants": "\n".join(item.get("questionVariants", [])),
            f"{PREFIX}_keywords": " ".join(item.get("keywords", [])),
            f"{PREFIX}_answer": item["answer"],
            f"{PREFIX}_answerpoints": "\n".join(item.get("answerPoints", [])),
            f"{PREFIX}_responder": item.get("responder", ""),
            f"{PREFIX}_sourceids": " ".join(item.get("sourceIds", [])),
            f"{PREFIX}_cautions": "\n".join(item.get("cautions", [])),
        })
    print(f"  Expected Q&A: {len(qa_items)}")

    upsert(f"{PREFIX}_agmmeeting", company["meetingTitle"], {
        f"{PREFIX}_name": company["meetingTitle"],
        f"{PREFIX}_meetingdate": "-".join(f"{int(x):02d}" for x in __import__("re").findall(r"\d+", company["meetingDate"])[:3]),
    })
    print(f"  Meeting: {company['meetingTitle']}")

    shareholders = _json.loads((demo / "shareholders.json").read_text(encoding="utf-8"))
    shareholder_ids: dict[str, str] = {}
    for item in shareholders:
        shareholder_ids[item["number"]] = upsert(f"{PREFIX}_agmshareholder", item["number"], {
            f"{PREFIX}_name": item["number"],
            f"{PREFIX}_shareholdername": item["name"],
            f"{PREFIX}_kana": item.get("kana", ""),
            f"{PREFIX}_shares": int(item.get("shares", 0)),
            f"{PREFIX}_holdertype": item.get("type", ""),
            f"{PREFIX}_since": item.get("since", ""),
            f"{PREFIX}_note": item.get("note", ""),
        })
    print(f"  Shareholders: {len(shareholders)}")

    # 過去の総会での発言（株主番号から過去の質問を引けることの確認用）
    history = _json.loads((demo / "shareholder-history.json").read_text(encoding="utf-8"))
    meeting_set = get_entity_set_name(f"{PREFIX}_agmmeeting")
    turn_set = get_entity_set_name(f"{PREFIX}_agmturn")
    qa_set = get_entity_set_name(f"{PREFIX}_agmqa")
    past_meeting = upsert(f"{PREFIX}_agmmeeting", history["meeting"]["title"], {
        f"{PREFIX}_name": history["meeting"]["title"],
        f"{PREFIX}_meetingdate": history["meeting"]["date"],
    })
    names = {s["number"]: s["name"] for s in shareholders}
    qa_ids = {q[f"{PREFIX}_name"]: q[f"{PREFIX}_agmqaid"]
              for q in api_get(f"{qa_set}?$select={PREFIX}_agmqaid,{PREFIX}_name").get("value", [])}
    for turn in history["turns"]:
        number = turn["shareholderNumber"]
        started = turn["startedAt"]
        turn_id = upsert(f"{PREFIX}_agmturn", turn["code"], {
            f"{PREFIX}_name": turn["code"],
            f"{PREFIX}_shareholdernumber": number,
            f"{PREFIX}_shareholdername": names.get(number, ""),
            f"{PREFIX}_startedat": started,
            f"{PREFIX}_durationsec": int(turn["durationSec"]),
            f"{PREFIX}_transcript": turn["transcript"],
            f"{PREFIX}_savestatus": "過去の総会（デモデータ）",
            f"{PREFIX}_meetingid@odata.bind": f"/{meeting_set}({past_meeting})",
            **({f"{PREFIX}_shareholderid@odata.bind": f"/{get_entity_set_name(f'{PREFIX}_agmshareholder')}({shareholder_ids[number]})"} if number in shareholder_ids else {}),
        })
        for q in turn["questions"]:
            code = f"{turn['code']}-Q{q['seq']}"
            upsert(f"{PREFIX}_agmquestion", code, {
                f"{PREFIX}_name": code,
                f"{PREFIX}_seq": int(q["seq"]),
                f"{PREFIX}_category": q["category"],
                f"{PREFIX}_excerpt": q["excerpt"],
                f"{PREFIX}_qacode": q["qaCode"],
                f"{PREFIX}_adopted": True,
                f"{PREFIX}_turnid@odata.bind": f"/{turn_set}({turn_id})",
                **({f"{PREFIX}_qaid@odata.bind": f"/{qa_set}({qa_ids[q['qaCode']]})"} if q["qaCode"] in qa_ids else {}),
            })
    print(f"  Past turns: {len(history['turns'])} ({history['meeting']['title']})")
    # リハーサル台本（同梱のデモ台本を Dataverse にも置く。アプリの台本タブで選べる）
    script = _json.loads((demo / "rehearsal-script.json").read_text(encoding="utf-8"))
    upsert(f"{PREFIX}_agmscript", script.get("title", "デモ台本"), {
        f"{PREFIX}_name": script.get("title", "デモ台本"),
        f"{PREFIX}_lines": _json.dumps(script["lines"], ensure_ascii=False),
        f"{PREFIX}_note": script.get("note", ""),
        f"{PREFIX}_status": "承認済み",
        f"{PREFIX}_createdvia": "デモデータ",
    })
    print(f"  Rehearsal script: {len(script['lines'])} lines")


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
        validate_no_foreign_tables() # Step 0: 他ソリューションのテーブルとの論理名衝突検出
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
    print("Next: create app / npx pa app add data-source / pac model genpage generate-types")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        traceback.print_exc()
        sys.exit(1)
