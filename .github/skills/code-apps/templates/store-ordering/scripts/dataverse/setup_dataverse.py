"""
店舗発注デモ: Dataverse テーブル構築
=========================================
dataverse スキルの setup_dataverse.py テンプレートから作成。テーブル定義は dataverse/schema.json、
デモデータの投入は demo_data.py（シナリオ切り替え・リセットと共通）。

    python -u scripts/dataverse/setup_dataverse.py

以下はテンプレートの説明（共通ロジックはテンプレートのまま）。
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
# ▼▼▼ プロジェクト固有: ここをカスタマイズ ▼▼▼
# ════════════════════════════════════════════════════════════════

# テーブル定義は dataverse/schema.json が唯一の定義元
import json as _json

_SCHEMA = _json.loads((Path(__file__).resolve().parents[2] / "dataverse" / "schema.json").read_text(encoding="utf-8"))


def _p(name: str) -> str:
    return f"{PREFIX}_{name}"


TABLES = [
    {
        "logical": _p(t["logical"]),
        "display": t["display"],
        "plural": t["plural"],
        "name_display": t["name_display"],
        "description": t["description"],
        "columns": [{**c, "logical": _p(c["logical"])} for c in t["columns"]],
    }
    for t in _SCHEMA["tables"]
]

LOOKUPS = [
    {
        "from_table": _p(lk["from_table"]),
        "column_logical": _p(lk["column_logical"]),
        "display": lk["display"],
        "to_table": _p(lk["to_table"]),
    }
    for lk in _SCHEMA["lookups"]
]

# 表示名は作成時に日本語（1041）で付けるため、後からのローカライズは不要
LOCALIZE_TABLES = []
LOCALIZE_COLUMNS = []
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
        if base["Format"] == "DateOnly":
            # UserLocal のままだと read_query の日付比較がタイムゾーン分ずれる（'2026-10-30' が一致しない）
            base["DateTimeBehavior"] = {"Value": "DateOnly"}
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

def ensure_date_only_behavior():
    """日付だけの列を DateTimeBehavior=DateOnly にそろえる（UserLocal で作られた既存列の修正。べき等）。

    UserLocal のままだと Dataverse MCP の read_query で `<prefix>_date = '2026-10-30'` が一致せず、
    値も 2026-10-30T09:00:00（JST に換算）で返る。DateOnly にすると日付のまま比較・表示される。
    """
    print("\n=== Step 3b: DateOnly behavior ===")
    changed = 0
    for tbl in TABLES:
        for col in tbl.get("columns", []):
            if col["type"] != "DateTime" or col.get("format") != "DateOnly":
                continue
            path = (
                f"EntityDefinitions(LogicalName='{tbl['logical']}')/Attributes(LogicalName='{col['logical']}')"
                "/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
            )
            meta = api_get(path)
            if (meta.get("DateTimeBehavior") or {}).get("Value") == "DateOnly":
                continue
            meta.pop("@odata.context", None)
            meta["@odata.type"] = "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
            meta["DateTimeBehavior"] = {"Value": "DateOnly"}

            def _put(m=meta, t=tbl["logical"]):
                api_request(f"EntityDefinitions(LogicalName='{t}')/Attributes({m['MetadataId']})", m, method="PUT")

            retry_metadata(_put, f"DateOnly {tbl['logical']}.{col['logical']}")
            print(f"  {tbl['logical']}.{col['logical']}: UserLocal -> DateOnly")
            changed += 1
    print(f"  {changed} column(s) changed" if changed else "  all DateOnly")

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

def create_demo_data():
    """合成データの投入は scripts/dataverse/demo_data.py に任せる（シナリオ切り替え・リセットと同じ処理）。"""
    import subprocess

    print("\n=== Step 6: Demo data (demo_data.py load) ===")
    scenario = os.environ.get("SCENARIO", "").strip() or "demo-1030-rain"
    subprocess.run(
        [sys.executable, "-u", str(Path(__file__).with_name("demo_data.py")), "load", "--scenario", scenario],
        check=True,
    )


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
        validate_no_foreign_tables() # Step 0: 他ソリューションのテーブルとの論理名衝突検出
        ensure_solution()            # Step 1: ソリューション
        create_tables()              # Step 2: テーブル作成
        create_lookups()             # Step 3: Lookup
        ensure_date_only_behavior()  # Step 3b: 日付列を DateOnly に
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
