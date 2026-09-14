"""
Drawing Communication PoC — Dataverse 構築スクリプト
====================================================

図面コミュニケーション PoC のテーブル・Lookup・代替キー・Choice・日本語ラベル・
セキュリティロール・デモデータを、Dataverse Web API だけで冪等に構築する。

認証と API 呼び出しは .github/skills/standard/scripts/auth_helper.py の
api_get / api_post / api_patch / api_request / retry_metadata のみを使用する
（requests 直呼び・MSAL 直接呼び出しはしない）。

前提:
  - リポジトリルートの .env に DATAVERSE_URL / TENANT_ID / ENV_ID / PAC_AUTH_PROFILE
  - 発行元 geek（prefix geek）が対象環境に存在すること
  - pip install azure-identity requests python-dotenv

使い方（必ず -u を付けて実行する）:
  python -u scripts/setup_dataverse.py                 # 構築 → 日本語ラベル → ロール → デモデータ → 検証
  python -u scripts/setup_dataverse.py --skip-localize # 英語のまま構築（pac code add-data-source 前）
  python -u scripts/setup_dataverse.py --localize-only # 日本語ラベル以降のみ
  python -u scripts/setup_dataverse.py --skip-demo     # デモデータ投入をスキップ

表示名はいったん英語で作成し、Step 6 で日本語ラベル（LCID 1041）を上書きする。
スキーマ名・列名は常に英語のみ。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
except AttributeError:
    pass


# ── パス・環境変数 ────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent


def _find_repo_root() -> Path:
    for candidate in [SCRIPT_DIR, *SCRIPT_DIR.parents]:
        if (candidate / ".git").exists():
            return candidate
    return PROJECT_DIR


REPO_ROOT = _find_repo_root()

# 接続情報はリポジトリルートの .env に集約する。
# プロジェクト直下の .env はフロントエンドの VITE_ 変数用で、雛形値を含むため読み込まない。
load_dotenv(REPO_ROOT / ".env")


def _resolve_auth_helper_dir() -> str:
    candidates = [
        *[p / ".github" / "skills" / "standard" / "scripts" for p in [SCRIPT_DIR, *SCRIPT_DIR.parents]],
        SCRIPT_DIR,
    ]
    for candidate in candidates:
        if (candidate / "auth_helper.py").is_file():
            return str(candidate)
    raise ModuleNotFoundError(
        "auth_helper.py が見つかりません。.github/skills/standard/scripts/auth_helper.py を配置してください。"
    )


sys.path.insert(0, _resolve_auth_helper_dir())
from auth_helper import (  # noqa: E402
    DATAVERSE_URL,
    api_get,
    api_post,
    api_request,
    retry_metadata,
)

SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "").strip() or "DrawingCommunicationPoC"
SOLUTION_DISPLAY_NAME = os.environ.get("SOLUTION_DISPLAY_NAME", "").strip() or "Drawing Communication PoC"
PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip() or "geek"
PUBLISHER_UNIQUE_NAME = os.environ.get("PUBLISHER_UNIQUE_NAME", "").strip() or "geek"

if not DATAVERSE_URL:
    print("Error: DATAVERSE_URL が未設定です（リポジトリルートの .env を確認してください）", file=sys.stderr)
    raise SystemExit(1)

LCID_JA = 1041
LCID_EN = 1033


# ════════════════════════════════════════════════════════════════
# スキーマ定義
# ════════════════════════════════════════════════════════════════
# display = 英語表示名（作成時）、ja = 日本語表示名（Step 6 で上書き）。
# Choice の options は (値, 英語ラベル, 日本語ラベル)。

TABLES: list[dict] = [
    {
        "logical": f"{PREFIX}_drawing",
        "display": "Drawing", "plural": "Drawings", "ja": "図面", "ja_plural": "図面",
        "description": "Drawing header for the drawing communication PoC.",
        "ja_description": "図面コミュニケーション PoC の図面ヘッダー。",
        "name_display": "Drawing Key", "name_ja": "図面キー",
        "columns": [
            {"logical": f"{PREFIX}_title", "type": "String", "display": "Title", "ja": "タイトル", "maxLength": 200},
            {"logical": f"{PREFIX}_template", "type": "Picklist", "display": "Template", "ja": "テンプレート",
             "options": [
                 (100000000, "Surface laptop exterior", "ノート PC 外観図（三面図）"),
                 (100000001, "Horizontal pump assembly", "横形ポンプ総組立図"),
                 (100000002, "Generic equipment layout", "汎用機器配置図"),
             ]},
            {"logical": f"{PREFIX}_currentrevision", "type": "Integer", "display": "Current revision",
             "ja": "現在の改訂番号", "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_currenthash", "type": "String", "display": "Current hash",
             "ja": "現在のハッシュ", "maxLength": 64},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status", "ja": "状態",
             "options": [
                 (100000000, "Draft", "下書き"),
                 (100000001, "In review", "レビュー中"),
                 (100000002, "Released", "発行済"),
                 (100000003, "Archived", "アーカイブ"),
             ]},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingrevision",
        "display": "Drawing revision", "plural": "Drawing revisions", "ja": "図面改訂", "ja_plural": "図面改訂",
        "description": "Append-only revision of a drawing JSON.",
        "ja_description": "図面 JSON の追記専用改訂。",
        "name_display": "Revision Key", "name_ja": "改訂キー",
        "columns": [
            {"logical": f"{PREFIX}_revision", "type": "Integer", "display": "Revision", "ja": "改訂番号",
             "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_json", "type": "Memo", "display": "Drawing JSON", "ja": "図面 JSON",
             "maxLength": 200000},
            {"logical": f"{PREFIX}_hash", "type": "String", "display": "Hash", "ja": "ハッシュ", "maxLength": 64},
            {"logical": f"{PREFIX}_note", "type": "Memo", "display": "Note", "ja": "改訂メモ", "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingannotation",
        "display": "Drawing annotation", "plural": "Drawing annotations", "ja": "図面注釈", "ja_plural": "図面注釈",
        "description": "Annotation placed on a drawing sheet.",
        "ja_description": "図面上に配置する注釈。",
        "name_display": "Annotation Key", "name_ja": "注釈キー",
        "columns": [
            {"logical": f"{PREFIX}_title", "type": "String", "display": "Title", "ja": "件名", "maxLength": 200},
            {"logical": f"{PREFIX}_body", "type": "Memo", "display": "Body", "ja": "本文", "maxLength": 4000},
            {"logical": f"{PREFIX}_type", "type": "Picklist", "display": "Type", "ja": "種別",
             "options": [
                 (100000000, "Dimension", "寸法"),
                 (100000001, "Note", "指摘"),
                 (100000002, "Question", "質問"),
                 (100000003, "Change request", "変更依頼"),
             ]},
            {"logical": f"{PREFIX}_severity", "type": "Picklist", "display": "Severity", "ja": "重大度",
             "options": [
                 (100000000, "Info", "情報"),
                 (100000001, "Minor", "軽微"),
                 (100000002, "Major", "重大"),
             ]},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status", "ja": "状態",
             "options": [
                 (100000000, "Open", "未対応"),
                 (100000001, "In review", "レビュー中"),
                 (100000002, "Resolved", "対応済"),
                 (100000003, "Rejected", "却下"),
             ]},
            {"logical": f"{PREFIX}_source", "type": "Picklist", "display": "Source", "ja": "作成元",
             "options": [
                 (100000000, "Human", "人による入力"),
                 (100000001, "AI", "AI 提案"),
             ]},
            {"logical": f"{PREFIX}_positionx", "type": "Decimal", "display": "Position X (mm)", "ja": "位置 X (mm)",
             "precision": 2, "minValue": -10000, "maxValue": 10000},
            {"logical": f"{PREFIX}_positiony", "type": "Decimal", "display": "Position Y (mm)", "ja": "位置 Y (mm)",
             "precision": 2, "minValue": -10000, "maxValue": 10000},
            {"logical": f"{PREFIX}_elementid", "type": "String", "display": "Element id", "ja": "要素 ID",
             "maxLength": 100},
            {"logical": f"{PREFIX}_due", "type": "DateTime", "display": "Due date", "ja": "期限",
             "format": "DateOnly"},
            {"logical": f"{PREFIX}_commentcount", "type": "Integer", "display": "Comment count", "ja": "コメント数",
             "minValue": 0, "maxValue": 100000},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingcomment",
        "display": "Drawing comment", "plural": "Drawing comments", "ja": "注釈コメント", "ja_plural": "注釈コメント",
        "description": "Comment thread entry on a drawing annotation.",
        "ja_description": "図面注釈へのコメント。",
        "name_display": "Comment Key", "name_ja": "コメントキー",
        "columns": [
            {"logical": f"{PREFIX}_body", "type": "Memo", "display": "Body", "ja": "本文", "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingtask",
        "display": "Drawing task", "plural": "Drawing tasks", "ja": "図面タスク", "ja_plural": "図面タスク",
        "description": "Task created from a drawing annotation.",
        "ja_description": "図面注釈から作成するタスク。",
        "name_display": "Task Key", "name_ja": "タスクキー",
        "columns": [
            {"logical": f"{PREFIX}_title", "type": "String", "display": "Title", "ja": "件名", "maxLength": 200},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status", "ja": "状態",
             "options": [
                 (100000000, "Not started", "未着手"),
                 (100000001, "In progress", "対応中"),
                 (100000002, "Blocked", "保留"),
                 (100000003, "Completed", "完了"),
                 (100000004, "Cancelled", "取消"),
             ]},
            {"logical": f"{PREFIX}_priority", "type": "Picklist", "display": "Priority", "ja": "優先度",
             "options": [
                 (100000000, "Low", "低"),
                 (100000001, "Normal", "中"),
                 (100000002, "High", "高"),
                 (100000003, "Urgent", "緊急"),
             ]},
            {"logical": f"{PREFIX}_due", "type": "DateTime", "display": "Due date", "ja": "期限",
             "format": "DateOnly"},
            {"logical": f"{PREFIX}_completedon", "type": "DateTime", "display": "Completed on", "ja": "完了日時",
             "format": "DateAndTime"},
            {"logical": f"{PREFIX}_appliedrevision", "type": "Integer", "display": "Applied revision",
             "ja": "反映した改訂番号", "minValue": 0, "maxValue": 1000000},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingproposal",
        "display": "Drawing proposal", "plural": "Drawing proposals", "ja": "図面提案", "ja_plural": "図面提案",
        "description": "Unreviewed AI candidate drawing JSON awaiting a human decision.",
        "ja_description": "人の判断を待つ未審査の AI 候補図面 JSON。",
        "name_display": "Proposal Key", "name_ja": "提案キー",
        "columns": [
            {"logical": f"{PREFIX}_baserevision", "type": "Integer", "display": "Base revision", "ja": "基準改訂番号",
             "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_basehash", "type": "String", "display": "Base hash", "ja": "基準ハッシュ",
             "maxLength": 64},
            {"logical": f"{PREFIX}_candidatejson", "type": "Memo", "display": "Candidate JSON", "ja": "候補 JSON",
             "maxLength": 200000},
            {"logical": f"{PREFIX}_reason", "type": "Memo", "display": "Reason", "ja": "提案理由", "maxLength": 4000},
            {"logical": f"{PREFIX}_decision", "type": "Picklist", "display": "Decision", "ja": "採否",
             "options": [
                 (100000000, "Pending", "未判定"),
                 (100000001, "Accepted", "採用"),
                 (100000002, "Rejected", "却下"),
             ]},
            {"logical": f"{PREFIX}_agentconversationid", "type": "String", "display": "Agent conversation id",
             "ja": "エージェント会話 ID", "maxLength": 200},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingrequest",
        "display": "Drawing request", "plural": "Drawing requests", "ja": "図面要求", "ja_plural": "図面要求",
        "description": "User-owned asynchronous request turn sent to the drawing worker.",
        "ja_description": "図面ワーカーへ送る利用者所有の非同期要求ターン。",
        "name_display": "Request Key", "name_ja": "要求キー",
        "columns": [
            {"logical": f"{PREFIX}_conversationid", "type": "String", "display": "Conversation id",
             "ja": "会話 ID", "maxLength": 100},
            {"logical": f"{PREFIX}_turnid", "type": "String", "display": "Turn id", "ja": "ターン ID",
             "maxLength": 100},
            {"logical": f"{PREFIX}_version", "type": "Integer", "display": "Edit version", "ja": "編集バージョン",
             "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_basehash", "type": "String", "display": "Base hash", "ja": "基準ハッシュ",
             "maxLength": 64},
            {"logical": f"{PREFIX}_operation", "type": "Picklist", "display": "Operation", "ja": "操作",
             "options": [
                 (100000000, "Review drawing", "図面レビュー"),
                 (100000001, "Propose dimension change", "寸法変更提案"),
                 (100000002, "Explain drawing", "図面説明"),
             ]},
            {"logical": f"{PREFIX}_inputjson", "type": "Memo", "display": "Input JSON", "ja": "入力 JSON",
             "maxLength": 200000},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status", "ja": "状態",
             "options": [
                 (100000000, "Pending", "受付済"),
                 (100000001, "Running", "実行中"),
                 (100000002, "Completed", "完了"),
                 (100000003, "Failed", "失敗"),
             ]},
            {"logical": f"{PREFIX}_receipt", "type": "String", "display": "Receipt", "ja": "受付票",
             "maxLength": 200},
            {"logical": f"{PREFIX}_claimedon", "type": "DateTime", "display": "Claimed on", "ja": "処理開始日時",
             "format": "DateAndTime"},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingresult",
        "display": "Drawing result", "plural": "Drawing results", "ja": "図面結果", "ja_plural": "図面結果",
        "description": "Worker result correlated to exactly one drawing request turn.",
        "ja_description": "図面要求ターンに 1 対 1 で対応するワーカー結果。",
        "name_display": "Result Key", "name_ja": "結果キー",
        "columns": [
            {"logical": f"{PREFIX}_conversationid", "type": "String", "display": "Conversation id",
             "ja": "会話 ID", "maxLength": 100},
            {"logical": f"{PREFIX}_turnid", "type": "String", "display": "Turn id", "ja": "ターン ID",
             "maxLength": 100},
            {"logical": f"{PREFIX}_version", "type": "Integer", "display": "Edit version", "ja": "編集バージョン",
             "minValue": 0, "maxValue": 1000000},
            {"logical": f"{PREFIX}_basehash", "type": "String", "display": "Base hash", "ja": "基準ハッシュ",
             "maxLength": 64},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status", "ja": "状態",
             "options": [
                 (100000000, "Completed", "完了"),
                 (100000001, "Failed", "失敗"),
             ]},
            {"logical": f"{PREFIX}_resultjson", "type": "Memo", "display": "Result JSON", "ja": "結果 JSON",
             "maxLength": 200000},
            {"logical": f"{PREFIX}_error", "type": "Memo", "display": "Error", "ja": "エラー", "maxLength": 4000},
            {"logical": f"{PREFIX}_engine", "type": "Picklist", "display": "Engine", "ja": "実行エンジン",
             "options": [
                 (100000000, "Demo worker", "デモワーカー"),
                 (100000001, "Dataverse worker", "Dataverse ワーカー"),
             ]},
            {"logical": f"{PREFIX}_receipt", "type": "String", "display": "Receipt", "ja": "受付票",
             "maxLength": 200},
            {"logical": f"{PREFIX}_completedon", "type": "DateTime", "display": "Completed on", "ja": "完了日時",
             "format": "DateAndTime"},
        ],
    },
    {
        "logical": f"{PREFIX}_drawingnotification",
        "display": "Drawing notification", "plural": "Drawing notifications",
        "ja": "図面通知", "ja_plural": "図面通知",
        "description": "Teams notification attempt for an annotation or task, deduplicated by key.",
        "ja_description": "注釈・タスクの Teams 通知履歴（重複排除キー付き）。",
        "name_display": "Notification Key", "name_ja": "通知キー",
        "columns": [
            {"logical": f"{PREFIX}_channel", "type": "Picklist", "display": "Channel", "ja": "チャネル",
             "options": [
                 (100000000, "Teams", "Teams"),
                 (100000001, "Email", "メール"),
             ]},
            {"logical": f"{PREFIX}_messageid", "type": "String", "display": "Message id", "ja": "メッセージ ID",
             "maxLength": 200},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status", "ja": "状態",
             "options": [
                 (100000000, "Pending", "送信待ち"),
                 (100000001, "Sent", "送信済"),
                 (100000002, "Failed", "失敗"),
                 (100000003, "Skipped", "スキップ"),
             ]},
            {"logical": f"{PREFIX}_error", "type": "Memo", "display": "Error", "ja": "エラー", "maxLength": 4000},
            {"logical": f"{PREFIX}_sentat", "type": "DateTime", "display": "Sent at", "ja": "送信日時",
             "format": "DateAndTime"},
            {"logical": f"{PREFIX}_dedupekey", "type": "String", "display": "Dedupe key", "ja": "重複排除キー",
             "maxLength": 200},
        ],
    },
]

LOOKUPS: list[dict] = [
    {"from_table": f"{PREFIX}_drawing", "column_logical": f"{PREFIX}_teamid",
     "display": "Team", "ja": "チーム", "to_table": "team", "required": False},

    {"from_table": f"{PREFIX}_drawingrevision", "column_logical": f"{PREFIX}_drawingid",
     "display": "Drawing", "ja": "図面", "to_table": f"{PREFIX}_drawing", "required": True},
    {"from_table": f"{PREFIX}_drawingrevision", "column_logical": f"{PREFIX}_proposalid",
     "display": "Proposal", "ja": "採用した提案", "to_table": f"{PREFIX}_drawingproposal", "required": False},

    {"from_table": f"{PREFIX}_drawingannotation", "column_logical": f"{PREFIX}_drawingid",
     "display": "Drawing", "ja": "図面", "to_table": f"{PREFIX}_drawing", "required": True},
    {"from_table": f"{PREFIX}_drawingannotation", "column_logical": f"{PREFIX}_revisionid",
     "display": "Revision", "ja": "対象改訂", "to_table": f"{PREFIX}_drawingrevision", "required": False},
    {"from_table": f"{PREFIX}_drawingannotation", "column_logical": f"{PREFIX}_assigneeid",
     "display": "Assignee", "ja": "担当者", "to_table": "systemuser", "required": False},

    {"from_table": f"{PREFIX}_drawingcomment", "column_logical": f"{PREFIX}_annotationid",
     "display": "Annotation", "ja": "注釈", "to_table": f"{PREFIX}_drawingannotation", "required": True},
    {"from_table": f"{PREFIX}_drawingcomment", "column_logical": f"{PREFIX}_authorid",
     "display": "Author", "ja": "投稿者", "to_table": "systemuser", "required": False},

    {"from_table": f"{PREFIX}_drawingtask", "column_logical": f"{PREFIX}_annotationid",
     "display": "Annotation", "ja": "注釈", "to_table": f"{PREFIX}_drawingannotation", "required": True},
    {"from_table": f"{PREFIX}_drawingtask", "column_logical": f"{PREFIX}_assigneeid",
     "display": "Assignee", "ja": "担当者", "to_table": "systemuser", "required": False},

    {"from_table": f"{PREFIX}_drawingproposal", "column_logical": f"{PREFIX}_drawingid",
     "display": "Drawing", "ja": "図面", "to_table": f"{PREFIX}_drawing", "required": True},

    {"from_table": f"{PREFIX}_drawingresult", "column_logical": f"{PREFIX}_requestid",
     "display": "Request", "ja": "対応する要求", "to_table": f"{PREFIX}_drawingrequest", "required": True},

    {"from_table": f"{PREFIX}_drawingnotification", "column_logical": f"{PREFIX}_annotationid",
     "display": "Annotation", "ja": "注釈", "to_table": f"{PREFIX}_drawingannotation", "required": False},
    {"from_table": f"{PREFIX}_drawingnotification", "column_logical": f"{PREFIX}_taskid",
     "display": "Task", "ja": "タスク", "to_table": f"{PREFIX}_drawingtask", "required": False},
]

# 代替キー。Dataverse では作成が非同期（インデックス構築）のため、作成後に状態を確認する。
ALTERNATE_KEYS: list[dict] = [
    {"table": f"{PREFIX}_drawingrequest", "schema": f"{PREFIX}_drawingrequest_turnid",
     "display": "Turn id", "ja": "ターン ID", "attributes": [f"{PREFIX}_turnid"]},
    {"table": f"{PREFIX}_drawingresult", "schema": f"{PREFIX}_drawingresult_requestid",
     "display": "Request", "ja": "対応する要求", "attributes": [f"{PREFIX}_requestid"], "optional": True},
    {"table": f"{PREFIX}_drawingnotification", "schema": f"{PREFIX}_drawingnotification_dedupekey",
     "display": "Dedupe key", "ja": "重複排除キー", "attributes": [f"{PREFIX}_dedupekey"]},
]

ROLE_NAME = "Drawing Communication User"
ROLE_DESCRIPTION = (
    "Drawing Communication PoC: create and read own drawing requests, read own drawing results only."
)
# 一般利用者に与えるのは「自分の要求の作成・参照」と「自分の結果の参照」だけ。
# Basic = ユーザー所有レコードのみ。標準機能に必要な権限は Basic User から得る（ここへはコピーしない）。
ROLE_PRIVILEGES: list[tuple[str, list[str], str]] = [
    (f"{PREFIX}_drawingrequest", ["Create", "Read"], "Basic"),
    (f"{PREFIX}_drawingresult", ["Read"], "Basic"),
]

TEMPLATE_CHOICE = {
    "surface-laptop-exterior": 100000000,
    "horizontal-pump-assembly": 100000001,
    "generic-equipment-layout": 100000002,
}
DRAWING_STATUS_DRAFT = 100000000

DATAVERSE_LIMITS = {
    "Decimal": {"min": -100_000_000_000, "max": 100_000_000_000},
    "Integer": {"min": -2_147_483_648, "max": 2_147_483_647},
    "String": {"maxLength": 4000},
    "Memo": {"maxLength": 1_048_576},
}
MAX_SCHEMA_NAME_LENGTH = 50


# ════════════════════════════════════════════════════════════════
# 共通ヘルパー
# ════════════════════════════════════════════════════════════════

def label(text: str, lcid: int = LCID_EN) -> dict:
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": lcid}]}


def exists(path: str) -> bool:
    """メタデータ／レコードの存在チェック（404 を False として扱う）。"""
    try:
        api_get(path)
        return True
    except Exception as exc:
        resp = getattr(exc, "response", None)
        if resp is not None and resp.status_code == 404:
            return False
        if resp is not None and resp.status_code in (400, 500) and "Could not find" in (resp.text or ""):
            return False
        raise


def error_detail(exc: Exception) -> str:
    resp = getattr(exc, "response", None)
    if resp is None:
        return str(exc)
    try:
        return f"{exc}: {resp.text[:800]}"
    except Exception:
        return str(exc)


def get_entity_set_name(logical_name: str) -> str:
    return api_get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=EntitySetName")["EntitySetName"]


def get_navprop(from_logical: str, to_logical: str, referencing_attribute: str) -> str | None:
    rels = api_get(
        f"EntityDefinitions(LogicalName='{from_logical}')/ManyToOneRelationships"
        f"?$filter=ReferencedEntity eq '{to_logical}' and ReferencingAttribute eq '{referencing_attribute}'"
        f"&$select=ReferencingEntityNavigationPropertyName"
    )
    values = rels.get("value", [])
    return values[0]["ReferencingEntityNavigationPropertyName"] if values else None


def build_column_body(col: dict) -> dict:
    base = {
        "SchemaName": col["logical"],
        "DisplayName": label(col["display"]),
        "RequiredLevel": {"Value": col.get("required_level", "None")},
    }
    kind = col["type"]
    if kind == "String":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.StringAttributeMetadata"
        base["FormatName"] = {"Value": "Text"}
        base["MaxLength"] = col.get("maxLength", 200)
    elif kind == "Memo":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        base["Format"] = "Text"
        base["MaxLength"] = col.get("maxLength", 4000)
    elif kind == "Integer":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 1000000)
    elif kind == "Decimal":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        base["Precision"] = col.get("precision", 2)
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 1000000)
    elif kind == "DateTime":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        base["Format"] = col.get("format", "DateAndTime")
    elif kind == "Picklist":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": False,
            "OptionSetType": "Picklist",
            "Options": [{"Value": value, "Label": label(en)} for value, en, _ja in col["options"]],
        }
    else:
        raise ValueError(f"未対応の列型です: {kind}")
    return base


def primary_name_attribute(table: dict) -> dict:
    return {
        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "SchemaName": f"{PREFIX}_name",
        "DisplayName": label(table["name_display"]),
        "IsPrimaryName": True,
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "FormatName": {"Value": "Text"},
        "MaxLength": 200,
    }


# ── Step 0: 事前検証（API 呼び出し前） ─────────────────────────

def validate_definitions() -> None:
    print("\n=== Step 0: Local definition check ===")
    errors: list[str] = []

    for table in TABLES:
        if len(table["logical"]) > MAX_SCHEMA_NAME_LENGTH:
            errors.append(f"{table['logical']}: table schema name exceeds {MAX_SCHEMA_NAME_LENGTH} chars")
        for col in table["columns"]:
            name = f"{table['logical']}.{col['logical']}"
            if len(col["logical"]) > MAX_SCHEMA_NAME_LENGTH:
                errors.append(f"{name}: column schema name exceeds {MAX_SCHEMA_NAME_LENGTH} chars")
            limit = DATAVERSE_LIMITS.get(col["type"])
            if not limit:
                continue
            if "max" in limit:
                min_v = col.get("minValue", 0)
                max_v = col.get("maxValue", limit["max"])
                if max_v > limit["max"] or min_v < limit["min"]:
                    errors.append(f"{name}: value range {min_v}..{max_v} outside {limit['min']}..{limit['max']}")
            if "maxLength" in limit and col.get("maxLength", limit["maxLength"]) > limit["maxLength"]:
                errors.append(f"{name}: maxLength exceeds {limit['maxLength']}")

    for lookup in LOOKUPS:
        if len(lookup["column_logical"]) > MAX_SCHEMA_NAME_LENGTH:
            errors.append(f"{lookup['column_logical']}: lookup schema name exceeds {MAX_SCHEMA_NAME_LENGTH} chars")

    known = {t["logical"] for t in TABLES}
    for key in ALTERNATE_KEYS:
        if key["table"] not in known:
            errors.append(f"{key['schema']}: unknown table {key['table']}")

    if errors:
        raise ValueError("定義エラー（API 呼び出し前に検出）:\n" + "\n".join(f"  - {e}" for e in errors))
    print(f"  OK: {len(TABLES)} tables / "
          f"{sum(len(t['columns']) for t in TABLES)} columns / {len(LOOKUPS)} lookups / "
          f"{len(ALTERNATE_KEYS)} alternate keys")


def validate_no_foreign_tables(solution_id: str | None) -> None:
    """対象ソリューション外に同名テーブルがある場合は中断する（他プロジェクトの破壊防止）。"""
    wanted = {t["logical"] for t in TABLES}
    all_tables = api_get("EntityDefinitions?$select=LogicalName,MetadataId").get("value", [])
    hit = {t["LogicalName"]: t["MetadataId"] for t in all_tables if t["LogicalName"] in wanted}
    if not hit:
        return

    owned: set[str] = set()
    if solution_id:
        comps = api_get(
            f"solutioncomponents?$select=objectid"
            f"&$filter=_solutionid_value eq {solution_id} and componenttype eq 1"
        ).get("value", [])
        owned = {c["objectid"].lower() for c in comps}

    foreign = sorted(name for name, mid in hit.items() if mid.lower() not in owned)
    if foreign:
        raise RuntimeError(
            f"次のテーブルがソリューション '{SOLUTION_NAME}' の外に既存です:\n"
            + "\n".join(f"  - {n}" for n in foreign)
            + "\n  → 他プロジェクトの資産を壊さないよう中断しました。"
        )


# ── Step 1: ソリューション ───────────────────────────────────

def resolve_solution_id() -> str | None:
    sols = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")
    values = sols.get("value", [])
    return values[0]["solutionid"] if values else None


def ensure_solution() -> str:
    print("\n=== Step 1: Solution ===")
    solution_id = resolve_solution_id()
    if solution_id:
        print(f"  Solution '{SOLUTION_NAME}' already exists. Reusing.")
        return solution_id

    pubs = api_get(
        f"publishers?$filter=uniquename eq '{PUBLISHER_UNIQUE_NAME}'"
        f"&$select=publisherid,uniquename,customizationprefix"
    ).get("value", [])
    if not pubs:
        raise RuntimeError(f"Publisher '{PUBLISHER_UNIQUE_NAME}' が見つかりません。")
    publisher = pubs[0]
    if publisher["customizationprefix"] != PREFIX:
        raise RuntimeError(
            f"Publisher '{PUBLISHER_UNIQUE_NAME}' の prefix は "
            f"'{publisher['customizationprefix']}' で、期待値 '{PREFIX}' と異なります。"
        )

    api_post("solutions", {
        "uniquename": SOLUTION_NAME,
        "friendlyname": SOLUTION_DISPLAY_NAME,
        "version": "1.0.0.0",
        "publisherid@odata.bind": f"/publishers({publisher['publisherid']})",
    })
    print(f"  Solution '{SOLUTION_NAME}' created ({SOLUTION_DISPLAY_NAME})")
    solution_id = resolve_solution_id()
    if not solution_id:
        raise RuntimeError("ソリューションを作成しましたが読み戻せませんでした。")
    return solution_id


# ── Step 2: テーブル・列 ─────────────────────────────────────

def create_table(table: dict) -> None:
    logical = table["logical"]
    if exists(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId"):
        print(f"  Table '{logical}' already exists. Checking columns...")
    else:
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "SchemaName": logical,
            "DisplayName": label(table["display"]),
            "DisplayCollectionName": label(table["plural"]),
            "Description": label(table["description"]),
            "OwnershipType": "UserOwned",
            "IsActivity": False,
            "HasActivities": False,
            "HasNotes": False,
            "HasFeedback": False,
            "PrimaryNameAttribute": f"{PREFIX}_name",
            # 列も同じ POST で作ると、メタデータロックの取り合いが減り所要時間も短くなる。
            "Attributes": [primary_name_attribute(table)] + [build_column_body(c) for c in table["columns"]],
        }
        retry_metadata(lambda b=body: api_post("EntityDefinitions", b, solution=SOLUTION_NAME), f"Table {logical}")
        print(f"  Table '{logical}' created with {len(table['columns'])} columns")
        time.sleep(5)

    # 既存テーブル・前回失敗分の列を補完する。
    for col in table["columns"]:
        col_logical = col["logical"]
        if exists(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName"):
            continue
        retry_metadata(
            lambda c=col, ln=logical: api_post(
                f"EntityDefinitions(LogicalName='{ln}')/Attributes",
                build_column_body(c),
                solution=SOLUTION_NAME,
            ),
            f"Column {logical}.{col_logical}",
        )
        print(f"    Column '{col_logical}' added")
        time.sleep(3)


def create_tables() -> None:
    print("\n=== Step 2: Tables and columns ===")
    failures: list[str] = []
    for table in TABLES:
        try:
            create_table(table)
        except Exception as exc:
            print(f"  ❌ {table['logical']}: {error_detail(exc)}")
            failures.append(table["logical"])

    if failures:
        print(f"\n  Retrying failed tables sequentially: {', '.join(failures)}")
        still_failed: list[str] = []
        for table in TABLES:
            if table["logical"] not in failures:
                continue
            time.sleep(15)
            try:
                create_table(table)
                print(f"  ✅ {table['logical']}: recovered")
            except Exception as exc:
                still_failed.append(f"{table['logical']}: {error_detail(exc)}")
        if still_failed:
            raise RuntimeError("テーブル作成に失敗しました:\n" + "\n".join(f"  - {m}" for m in still_failed))


# ── Step 3: Lookup ───────────────────────────────────────────

def create_lookups() -> None:
    print("\n=== Step 3: Lookup relationships ===")
    errors: list[str] = []
    for lookup in LOOKUPS:
        from_table = lookup["from_table"]
        column = lookup["column_logical"]
        if exists(f"EntityDefinitions(LogicalName='{from_table}')/Attributes(LogicalName='{column}')?$select=LogicalName"):
            print(f"  Lookup '{from_table}.{column}' already exists. Skipping.")
            continue

        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
            "SchemaName": f"{from_table}_{column}",
            "ReferencedEntity": lookup["to_table"],
            "ReferencingEntity": from_table,
            "Lookup": {
                "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                "SchemaName": column,
                "DisplayName": label(lookup["display"]),
                "RequiredLevel": {"Value": "ApplicationRequired" if lookup["required"] else "None"},
            },
        }
        try:
            retry_metadata(
                lambda b=body: api_post("RelationshipDefinitions", b, solution=SOLUTION_NAME),
                f"Lookup {from_table}.{column}",
            )
            print(f"  Lookup '{from_table}.{column}' -> {lookup['to_table']} created")
        except Exception as exc:
            message = f"{from_table}.{column}: {error_detail(exc)}"
            print(f"  ❌ {message}")
            errors.append(message)
        time.sleep(3)

    if errors:
        raise RuntimeError("Lookup 作成に失敗しました:\n" + "\n".join(f"  - {e}" for e in errors))


# ── Step 4: 代替キー ─────────────────────────────────────────

def get_key_status(table: str, schema: str) -> str | None:
    keys = api_get(
        f"EntityDefinitions(LogicalName='{table}')/Keys?$select=SchemaName,EntityKeyIndexStatus,KeyAttributes"
    ).get("value", [])
    for key in keys:
        if key["SchemaName"].lower() == schema.lower():
            return key.get("EntityKeyIndexStatus")
    return None


def create_alternate_keys() -> None:
    print("\n=== Step 4: Alternate keys ===")
    for key in ALTERNATE_KEYS:
        table, schema = key["table"], key["schema"]
        status = get_key_status(table, schema)
        if status is None:
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityKeyMetadata",
                "SchemaName": schema,
                "DisplayName": label(key["display"]),
                "KeyAttributes": key["attributes"],
            }
            try:
                retry_metadata(
                    lambda b=body, t=table: api_post(
                        f"EntityDefinitions(LogicalName='{t}')/Keys", b, solution=SOLUTION_NAME
                    ),
                    f"Alternate key {schema}",
                )
            except Exception as exc:
                message = f"{schema}: {error_detail(exc)}"
                if key.get("optional"):
                    print(f"  ⚠ {message}（任意の代替キーのため続行します）")
                    continue
                raise RuntimeError(f"代替キー作成に失敗しました: {message}") from exc

        # インデックス構築は非同期。作成直後は Keys に現れないことがあるため Active まで待つ。
        for _ in range(20):
            status = get_key_status(table, schema)
            if status in ("Active", "Failed"):
                break
            time.sleep(6)
        print(f"  {schema} ({', '.join(key['attributes'])}): {status or 'not visible yet'}")


# ── Step 5: 公開 ─────────────────────────────────────────────

def publish_all() -> None:
    print("\n  Publishing customizations...")
    retry_metadata(lambda: api_post("PublishAllXml", {}), "PublishAllXml")
    print("  Publish complete")


# ── Step 6: 日本語ラベル ─────────────────────────────────────

ODATA_TYPE_BY_ATTRIBUTE = {
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


def localize_column(table_logical: str, column_logical: str, ja: str) -> None:
    meta = api_get(
        f"EntityDefinitions(LogicalName='{table_logical}')/Attributes(LogicalName='{column_logical}')"
        f"?$select=MetadataId,AttributeType"
    )
    odata_type = ODATA_TYPE_BY_ATTRIBUTE.get(meta.get("AttributeType", ""), "#Microsoft.Dynamics.CRM.AttributeMetadata")
    api_request(
        f"EntityDefinitions(LogicalName='{table_logical}')/Attributes({meta['MetadataId']})",
        {"@odata.type": odata_type, "MetadataId": meta["MetadataId"], "DisplayName": label(ja, LCID_JA)},
        method="PUT",
    )


def localize() -> None:
    print("\n=== Step 6: Japanese labels ===")
    for table in TABLES:
        logical = table["logical"]
        meta = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
        api_request(
            f"EntityDefinitions({meta['MetadataId']})",
            {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                "MetadataId": meta["MetadataId"],
                "DisplayName": label(table["ja"], LCID_JA),
                "DisplayCollectionName": label(table["ja_plural"], LCID_JA),
                "Description": label(table["ja_description"], LCID_JA),
            },
            method="PUT",
        )
        localize_column(logical, f"{PREFIX}_name", table["name_ja"])
        for col in table["columns"]:
            localize_column(logical, col["logical"], col["ja"])
            for value, _en, ja in col.get("options", []):
                api_post("UpdateOptionValue", {
                    "EntityLogicalName": logical,
                    "AttributeLogicalName": col["logical"],
                    "Value": value,
                    "Label": label(ja, LCID_JA),
                    "MergeLabels": True,
                })
        print(f"  {logical} -> {table['ja']}")

    for lookup in LOOKUPS:
        localize_column(lookup["from_table"], lookup["column_logical"], lookup["ja"])
    print(f"  {len(LOOKUPS)} lookup columns localized")


# ── Step 7: セキュリティロール ───────────────────────────────

PRIVILEGE_VERBS = ("Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share")


def entity_privileges(table_logical: str) -> dict[str, dict]:
    """テーブルの権限を PrivilegeType でひける形で返す。"""
    try:
        meta = api_get(f"EntityDefinitions(LogicalName='{table_logical}')?$select=Privileges")
        privileges = meta.get("Privileges") or []
        if privileges:
            return {p["PrivilegeType"]: p for p in privileges}
    except Exception:
        pass

    # 環境によっては $select=Privileges が使えないため privileges テーブルから引き直す。
    # 権限名は SchemaName ベースの場合と LogicalName ベースの場合があるため両方試す。
    schema_name = api_get(f"EntityDefinitions(LogicalName='{table_logical}')?$select=SchemaName")["SchemaName"]
    resolved: dict[str, dict] = {}
    for verb in PRIVILEGE_VERBS:
        for suffix in dict.fromkeys([schema_name, table_logical]):
            rows = api_get(
                f"privileges?$filter=name eq 'prv{verb}{suffix}'&$select=privilegeid,name"
            ).get("value", [])
            if rows:
                resolved[verb] = {
                    "PrivilegeId": rows[0]["privilegeid"],
                    "Name": rows[0]["name"],
                    "PrivilegeType": verb,
                }
                break
    return resolved


def ensure_security_role() -> dict:
    print("\n=== Step 7: Security role ===")
    root_bu = api_get("businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid,name")["value"][0]
    bu_id = root_bu["businessunitid"]

    existing = api_get(
        f"roles?$filter=name eq '{ROLE_NAME}' and _businessunitid_value eq {bu_id}&$select=roleid,name"
    ).get("value", [])
    if existing:
        role_id = existing[0]["roleid"]
        print(f"  Role '{ROLE_NAME}' already exists. Reusing.")
    else:
        role_id = api_post("roles", {
            "name": ROLE_NAME,
            "description": ROLE_DESCRIPTION,
            "businessunitid@odata.bind": f"/businessunits({bu_id})",
        }, solution=SOLUTION_NAME)
        print(f"  Role '{ROLE_NAME}' created")
        time.sleep(3)

    privileges: list[dict] = []
    summary: list[str] = []
    for table_logical, verbs, depth in ROLE_PRIVILEGES:
        available = entity_privileges(table_logical)
        for verb in verbs:
            privilege = available.get(verb)
            if not privilege:
                raise RuntimeError(f"{table_logical} の {verb} 権限が見つかりません。")
            privileges.append({"PrivilegeId": privilege["PrivilegeId"], "Depth": depth})
            summary.append(f"{privilege['Name']} ({depth})")

    # 最初のバッチは必ず全置換。Basic User の権限はこのロールへコピーしない。
    api_post(f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole", {"Privileges": privileges})
    print(f"  Privileges replaced: {', '.join(summary)}")
    return {"roleid": role_id, "name": ROLE_NAME, "privileges": summary}


# ── Step 8: デモデータ ───────────────────────────────────────

def canonical_json(value: object) -> str:
    """TS 側 canonicalJson と同じ表現（キー昇順・空白なし）を作る。"""
    if value is None or isinstance(value, (str, int, float, bool)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda pair: pair[0])
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{canonical_json(v)}" for k, v in items) + "}"
    raise TypeError(f"canonical_json: 未対応の型 {type(value)}")


def hash_text(text: str) -> str:
    """64bit FNV-1a（TS 側 hashText と同じ）。暗号学的ハッシュではない。"""
    value = 0xCBF29CE484222325
    prime = 0x100000001B3
    mask = 0xFFFFFFFFFFFFFFFF
    for byte in text.encode("utf-8"):
        value = ((value ^ byte) * prime) & mask
    return f"{value:016x}"


def load_demo_drawings() -> list[dict]:
    seed_path = SCRIPT_DIR / "demo-drawings.json"
    if not seed_path.is_file():
        raise FileNotFoundError(
            f"{seed_path} がありません。node scripts/generate-demo-drawings.mjs を実行してください。"
        )
    payload = json.loads(seed_path.read_text(encoding="utf-8"))
    entries = payload["drawings"]
    for entry in entries:
        computed = hash_text(canonical_json(entry["drawing"]))
        if computed != entry["hash"]:
            raise ValueError(
                f"{entry['drawing']['id']}: ハッシュが一致しません "
                f"(fixture={entry['hash']} / computed={computed})。"
                " demo-drawings.json を再生成してください。"
            )
    return entries


def find_by_name(entity_set: str, id_attribute: str, name: str) -> str | None:
    escaped = name.replace("'", "''")
    rows = api_get(
        f"{entity_set}?$filter={PREFIX}_name eq '{escaped}'&$select={id_attribute}&$top=1"
    ).get("value", [])
    return rows[0][id_attribute] if rows else None


def create_demo_data() -> dict:
    print("\n=== Step 8: Demo data ===")
    entries = load_demo_drawings()

    drawing_set = get_entity_set_name(f"{PREFIX}_drawing")
    revision_set = get_entity_set_name(f"{PREFIX}_drawingrevision")
    navprop = get_navprop(f"{PREFIX}_drawingrevision", f"{PREFIX}_drawing", f"{PREFIX}_drawingid")
    if not navprop:
        raise RuntimeError("drawingrevision -> drawing の NavProp を取得できませんでした。")

    created = {"drawings": 0, "revisions": 0}
    for entry in entries:
        drawing, drawing_hash = entry["drawing"], entry["hash"]
        name = drawing["id"]
        drawing_id = find_by_name(drawing_set, f"{PREFIX}_drawingid", name)
        if drawing_id:
            print(f"  drawing '{name}': already exists")
        else:
            drawing_id = api_post(drawing_set, {
                f"{PREFIX}_name": name,
                f"{PREFIX}_title": drawing["titleBlock"]["title"],
                f"{PREFIX}_template": TEMPLATE_CHOICE[drawing["templateId"]],
                f"{PREFIX}_currentrevision": drawing["revision"],
                f"{PREFIX}_currenthash": drawing_hash,
                f"{PREFIX}_status": DRAWING_STATUS_DRAFT,
            })
            created["drawings"] += 1
            print(f"  drawing '{name}' created")

        revision_name = f"{name}-r{drawing['revision']:03d}"
        if find_by_name(revision_set, f"{PREFIX}_drawingrevisionid", revision_name):
            print(f"  revision '{revision_name}': already exists")
            continue
        api_post(revision_set, {
            f"{PREFIX}_name": revision_name,
            f"{PREFIX}_revision": drawing["revision"],
            f"{PREFIX}_json": json.dumps(drawing, ensure_ascii=False, indent=2),
            f"{PREFIX}_hash": drawing_hash,
            f"{PREFIX}_note": "Initial revision generated from the drawing template.",
            f"{navprop}@odata.bind": f"/{drawing_set}({drawing_id})",
        })
        created["revisions"] += 1
        print(f"  revision '{revision_name}' created")

    print(f"  drawings created: {created['drawings']} / revisions created: {created['revisions']}")
    return created


# ── Step 9: ソリューション含有 ───────────────────────────────

def ensure_solution_membership(solution_id: str, role_id: str | None) -> None:
    print("\n=== Step 9: Solution membership ===")
    comps = api_get(
        f"solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq {solution_id}"
    ).get("value", [])
    existing = {(c["objectid"].lower(), c["componenttype"]) for c in comps}

    def add(component_id: str, component_type: int, label_text: str) -> None:
        if (component_id.lower(), component_type) in existing:
            print(f"  ✅ {label_text}: already in solution")
            return
        api_post("AddSolutionComponent", {
            "ComponentId": component_id,
            "ComponentType": component_type,
            "SolutionUniqueName": SOLUTION_NAME,
            "AddRequiredComponents": False,
            "DoNotIncludeSubcomponents": False,
        })
        print(f"  ➕ {label_text}: added")

    for table in TABLES:
        meta = api_get(f"EntityDefinitions(LogicalName='{table['logical']}')?$select=MetadataId")
        add(meta["MetadataId"], 1, table["logical"])

    if role_id:
        add(role_id, 20, f"role {ROLE_NAME}")


# ── Step 10: 検証とレポート ──────────────────────────────────

def verify(solution_id: str, role: dict | None, demo: dict | None) -> str:
    print("\n=== Step 10: Verification ===")
    lines: list[str] = []
    failures: list[str] = []

    solution = api_get(
        f"solutions({solution_id})?$select=uniquename,friendlyname,version,ismanaged"
    )
    lines.append("# Drawing Communication PoC — Dataverse 構築レポート")
    lines.append("")
    lines.append(f"- 生成日時: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    lines.append(f"- 環境: `{DATAVERSE_URL}`")
    lines.append(f"- ソリューション: `{solution['uniquename']}` / {solution['friendlyname']} / v{solution['version']}")
    lines.append(f"- 発行元プレフィックス: `{PREFIX}`")
    lines.append("")

    comps = api_get(
        f"solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq {solution_id}"
    ).get("value", [])
    component_ids = {c["objectid"].lower() for c in comps}

    lines.append("## テーブル")
    lines.append("")
    lines.append("| テーブル | 表示名 | EntitySet | 所有区分 | 列 | 件数 | ソリューション |")
    lines.append("|---|---|---|---|---|---|---|")
    for table in TABLES:
        logical = table["logical"]
        try:
            meta = api_get(
                f"EntityDefinitions(LogicalName='{logical}')"
                f"?$select=MetadataId,EntitySetName,OwnershipType,DisplayName"
            )
            display_name = meta.get("DisplayName") or {}
            display = ""
            for item in display_name.get("LocalizedLabels") or []:
                if item["LanguageCode"] == LCID_JA:
                    display = item["Label"]
            display = display or (display_name.get("UserLocalizedLabel") or {}).get("Label", "")

            attributes = api_get(
                f"EntityDefinitions(LogicalName='{logical}')/Attributes?$select=LogicalName"
            ).get("value", [])
            present = {a["LogicalName"] for a in attributes}
            expected = {c["logical"] for c in table["columns"]} | {f"{PREFIX}_name"}
            expected |= {lk["column_logical"] for lk in LOOKUPS if lk["from_table"] == logical}
            missing = sorted(expected - present)
            if missing:
                failures.append(f"{logical}: 列が不足 {missing}")

            rows = api_get(f"{meta['EntitySetName']}?$select={PREFIX}_name&$top=50").get("value", [])
            in_solution = "✅" if meta["MetadataId"].lower() in component_ids else "❌"
            if meta["MetadataId"].lower() not in component_ids:
                failures.append(f"{logical}: ソリューション未所属")
            if meta["OwnershipType"] != "UserOwned":
                failures.append(f"{logical}: OwnershipType={meta['OwnershipType']}")
            lines.append(
                f"| `{logical}` | {display} | `{meta['EntitySetName']}` | {meta['OwnershipType']} | "
                f"{len(expected)} | {len(rows)} | {in_solution} |"
            )
        except Exception as exc:
            failures.append(f"{logical}: {error_detail(exc)}")
            lines.append(f"| `{logical}` | — | — | — | — | — | ❌ |")

    lines.append("")
    lines.append("## Lookup リレーション")
    lines.append("")
    lines.append("| From | 列 | → To | 必須 | 状態 |")
    lines.append("|---|---|---|---|---|")
    for lookup in LOOKUPS:
        from_table, column = lookup["from_table"], lookup["column_logical"]
        try:
            meta = api_get(
                f"EntityDefinitions(LogicalName='{from_table}')/Attributes(LogicalName='{column}')"
                f"/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=RequiredLevel,Targets"
            )
            targets = meta.get("Targets", [])
            required = meta.get("RequiredLevel", {}).get("Value", "")
            ok = lookup["to_table"] in targets
            expected_required = "ApplicationRequired" if lookup["required"] else "None"
            if not ok or required != expected_required:
                failures.append(f"{from_table}.{column}: targets={targets} required={required}")
            lines.append(
                f"| `{from_table}` | `{column}` | `{','.join(targets)}` | {required} | "
                f"{'✅' if ok else '❌'} |"
            )
        except Exception as exc:
            failures.append(f"{from_table}.{column}: {error_detail(exc)}")
            lines.append(f"| `{from_table}` | `{column}` | — | — | ❌ |")

    lines.append("")
    lines.append("## 代替キー")
    lines.append("")
    lines.append("| テーブル | キー | 列 | 状態 |")
    lines.append("|---|---|---|---|")
    for key in ALTERNATE_KEYS:
        status = get_key_status(key["table"], key["schema"])
        if status != "Active" and not key.get("optional"):
            failures.append(f"{key['schema']}: status={status}")
        lines.append(
            f"| `{key['table']}` | `{key['schema']}` | `{', '.join(key['attributes'])}` | {status or '未作成'} |"
        )

    lines.append("")
    lines.append("## セキュリティロール")
    lines.append("")
    if role:
        role_meta = api_get(f"roles({role['roleid']})?$select=roleid,name")
        try:
            privileges = api_get(
                f"roles({role['roleid']})/roleprivileges_association?$select=name&$top=100"
            ).get("value", [])
        except Exception as exc:
            privileges = []
            failures.append(f"role {ROLE_NAME}: 権限の読み戻しに失敗 {error_detail(exc)}")
        actual_privilege_names = {item["name"] for item in privileges}
        expected_privilege_names = {item.split(" ", 1)[0] for item in role["privileges"]}
        missing_privileges = sorted(expected_privilege_names - actual_privilege_names)
        lines.append(f"- ロール: `{role_meta['name']}`")
        lines.append(
            f"- 対象権限数: {len(expected_privilege_names)}（ロール全体: {len(privileges)}。"
            "Dataverse が付与する基盤権限を含む）"
        )
        for item in role["privileges"]:
            lines.append(f"  - {item}")
        lines.append("- 割り当て: 実施していない（設計どおり）")
        if role["roleid"].lower() not in component_ids:
            failures.append(f"role {ROLE_NAME}: ソリューション未所属")
        if missing_privileges:
            failures.append(f"role {ROLE_NAME}: 対象権限が不足 {missing_privileges}")
    else:
        lines.append("- 未作成（--skip-role 指定）")

    lines.append("")
    lines.append("## デモデータ")
    lines.append("")
    drawing_set = get_entity_set_name(f"{PREFIX}_drawing")
    revision_set = get_entity_set_name(f"{PREFIX}_drawingrevision")
    drawings = api_get(
        f"{drawing_set}?$select={PREFIX}_name,{PREFIX}_title,{PREFIX}_currentrevision,{PREFIX}_currenthash"
        f"&$orderby={PREFIX}_name"
    ).get("value", [])
    revisions = api_get(
        f"{revision_set}?$select={PREFIX}_name,{PREFIX}_revision,{PREFIX}_hash&$orderby={PREFIX}_name"
    ).get("value", [])
    lines.append("| 図面 | タイトル | 改訂 | ハッシュ |")
    lines.append("|---|---|---|---|")
    for row in drawings:
        lines.append(
            f"| `{row[f'{PREFIX}_name']}` | {row.get(f'{PREFIX}_title', '')} | "
            f"{row.get(f'{PREFIX}_currentrevision')} | `{row.get(f'{PREFIX}_currenthash')}` |"
        )
    lines.append("")
    lines.append(f"- 改訂レコード: {len(revisions)} 件")
    if demo is not None and len(drawings) < 3:
        failures.append(f"demo drawings={len(drawings)}（3 件必要）")

    lines.append("")
    lines.append("## 判定")
    lines.append("")
    if failures:
        lines.append("❌ 次の検証に失敗しました。")
        for item in failures:
            lines.append(f"- {item}")
    else:
        lines.append("✅ テーブル・列・Lookup・代替キー・ロール・ソリューション所属・デモデータをすべて確認しました。")

    for item in failures:
        print(f"  ❌ {item}")
    if not failures:
        print("  ✅ all checks passed")

    return "\n".join(lines) + "\n"


# ── メイン ──────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Drawing Communication PoC Dataverse setup")
    parser.add_argument("--skip-localize", action="store_true", help="日本語ラベル以降をスキップする")
    parser.add_argument("--localize-only", action="store_true", help="日本語ラベル以降だけを実行する")
    parser.add_argument("--skip-demo", action="store_true", help="デモデータ投入をスキップする")
    parser.add_argument("--skip-role", action="store_true", help="セキュリティロール作成をスキップする")
    parser.add_argument(
        "--report",
        default=str(REPO_ROOT / "_scratch" / "drawing-communication-dataverse-report.md"),
        help="検証レポートの出力先（環境固有の値を含むため既定は _scratch）",
    )
    args = parser.parse_args()

    print("=" * 64)
    print("  Drawing Communication PoC — Dataverse setup")
    print("=" * 64)
    print(f"  Environment : {DATAVERSE_URL}")
    print(f"  Solution    : {SOLUTION_NAME} ({SOLUTION_DISPLAY_NAME})")
    print(f"  Publisher   : {PUBLISHER_UNIQUE_NAME} / prefix {PREFIX}")

    validate_definitions()

    solution_id = resolve_solution_id()
    if not args.localize_only:
        validate_no_foreign_tables(solution_id)
        solution_id = ensure_solution()
        create_tables()
        create_lookups()
        create_alternate_keys()
        publish_all()
    elif not solution_id:
        raise RuntimeError(f"ソリューション '{SOLUTION_NAME}' が存在しません。--localize-only を外して実行してください。")

    if args.skip_localize:
        print("\n⏭  --skip-localize: 日本語ラベル以降をスキップしました")
        print("   次: pac code add-data-source 実行後に --localize-only で再実行してください")
        return

    localize()
    publish_all()

    role = None if args.skip_role else ensure_security_role()
    demo = None if args.skip_demo else create_demo_data()

    ensure_solution_membership(solution_id, role["roleid"] if role else None)

    report = verify(solution_id, role, demo)
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")
    print(f"\n  Report: {report_path}")
    print("\n✅ Dataverse setup complete")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n❌ Error: {exc}")
        traceback.print_exc()
        sys.exit(1)
