#!/usr/bin/env python3
"""Idempotently create/verify the Dataverse schema behind the AI teammate evaluation hub.

The evaluation-app Code App (``templates/evaluation-app/src/lib/eval-*.ts``) reads/writes these
tables through ``AF`` / ``F`` / ``RF`` / ``XF`` / ``JF`` / ``TF`` column maps, all prefixed with
``PUBLISHER_PREFIX``:

  - ``<prefix>_evalagent``  (entity set ``<prefix>_evalagents``) — one row per AI teammate
  - ``<prefix>_evalturn``   (entity set ``<prefix>_evalturns``)  — one row per mirrored conversation turn
  - ``<prefix>_evalrule``   (entity set ``<prefix>_evalrules``)  — scoring rules (built-in + custom)
  - ``<prefix>_evalresult`` (entity set ``<prefix>_evalresults``) — one row per (turn, rule) score
  - ``<prefix>_evaljob``    (entity set ``<prefix>_evaljob``s)   — evaluation run queue/status
  - ``<prefix>_evaltestrun``    — one automated test (same prompt, several teammates)
  - ``<prefix>_evaltestresult`` — one teammate's answer, timing, and score within a test
  - ``<prefix>_skill``      (entity set ``<prefix>_skills``)    — copy of each teammate's SKILL.md files
  - ``<prefix>_aiteammatefeedback`` — improvement requests the teammate files on a user's behalf

This script creates any that are missing and adds any column any of them is missing
(existing columns/tables are left alone — safe to rerun). It never touches a table it did not
create if that table already belongs to a different solution (see ``_foreign_tables``).

Uses only ``auth_helper.api_get`` / ``api_post`` / ``retry_metadata`` (no direct ``requests`` /
MSAL calls). The column-metadata body shapes mirror
``.github/skills/dataverse/scripts/setup_dataverse.py``'s ``build_column_body`` pattern, but this
script does not import that module — it only owns its own small, fixed TABLES list, so a project's
huge custom TABLES definition is never pulled in here by accident.

Usage:
    python scripts/setup_evaluation_dataverse.py --check
    python scripts/setup_evaluation_dataverse.py

Exit codes:
    0 = already fully created and correct (or, on --check, all good)
    1 = fatal problem (solution missing, foreign-table name collision, Dataverse error)
    3 = --check only: tables/columns are missing but nothing conflicts — `--execute`-equivalent
        (running this script without --check) is expected to create them cleanly
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path

NOT_CREATED_EXIT = 3

PUBLISHER_PREFIX_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")

# componenttype 1 == Entity, in solutioncomponents.
COMPONENT_TYPE_ENTITY = 1

# Seconds to wait for Dataverse metadata to propagate after a create/add-column call. Overridden
# to 0 by unit tests (via ``_sleep``) so the mocked-Dataverse test suite runs instantly.
TABLE_SETTLE_SECONDS = 30
COLUMN_SETTLE_SECONDS = 5


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


def _resolve_auth_helper_dir() -> str:
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent.parent / "standard" / "scripts",
        here.parent,
        *[p / ".github" / "skills" / "standard" / "scripts" for p in here.parents],
        *here.parents,
    ]
    for candidate in candidates:
        if (candidate / "auth_helper.py").is_file():
            return str(candidate)
    raise ModuleNotFoundError(
        "auth_helper.py not found. Copy .github/skills/standard/scripts/auth_helper.py "
        "next to this script or into the project root."
    )


sys.path.insert(0, _resolve_auth_helper_dir())
from auth_helper import api_get, api_patch, api_post, retry_metadata  # noqa: E402


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def label_jp(text: str) -> dict:
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


def build_column_body(col: dict) -> dict:
    """Same shape as dataverse/scripts/setup_dataverse.py's build_column_body (kept in sync by
    hand, not imported, so this script has no dependency on that module's project-specific TABLES)."""
    base = {
        "SchemaName": col["logical"],
        "DisplayName": label_jp(col["display"]),
        "RequiredLevel": {"Value": "None"},
    }
    col_type = col["type"]
    if col_type == "Memo":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        base["Format"] = "Text"
        base["MaxLength"] = col.get("maxLength", 2000)
    elif col_type == "Picklist":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
            "IsGlobal": False,
            "OptionSetType": "Picklist",
            "Options": [{"Value": value, "Label": label_jp(text)} for value, text in col["options"]],
        }
    elif col_type == "DateTime":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        base["Format"] = col.get("format", "DateAndTime")
    elif col_type == "String":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.StringAttributeMetadata"
        base["FormatName"] = {"Value": "Text"}
        base["MaxLength"] = col.get("maxLength", 200)
    elif col_type == "Integer":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 1_000_000)
    elif col_type == "Decimal":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        base["Precision"] = col.get("precision", 2)
        base["MinValue"] = col.get("minValue", 0)
        base["MaxValue"] = col.get("maxValue", 100_000)
    elif col_type == "Boolean":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
            "TrueOption": {"Value": 1, "Label": label_jp(col.get("true_label", "はい"))},
            "FalseOption": {"Value": 0, "Label": label_jp(col.get("false_label", "いいえ"))},
        }
    else:
        raise ValueError(f"Unknown column type: {col_type}")
    return base


def build_lookup_body(table_logical: str, col: dict) -> dict:
    """A lookup is a relationship, not an attribute, so it goes to RelationshipDefinitions."""
    return {
        "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": f"{table_logical}_{col['logical'].split('_', 1)[-1]}",
        "ReferencedEntity": col["target"],
        "ReferencingEntity": table_logical,
        "Lookup": {
            "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": col["logical"],
            "DisplayName": label_jp(col["display"]),
            "RequiredLevel": {"Value": "None"},
        },
        "AssociatedMenuConfiguration": {
            "Behavior": "DoNotDisplay",
            "Group": "Details",
            "Label": label_jp(col["display"]),
            "Order": 10000,
        },
        "CascadeConfiguration": {
            "Assign": "NoCascade",
            "Delete": "RemoveLink",
            "Merge": "NoCascade",
            "Reparent": "NoCascade",
            "Share": "NoCascade",
            "Unshare": "NoCascade",
        },
    }


def build_tables(prefix: str) -> list[dict]:
    """Table/column definitions for the evaluation-hub tables, matching the ``F`` / ``RF`` /
    ``XF`` / ``JF`` column maps the evaluation-app TypeScript reads (src/lib/eval-*.ts).

    Agent identity lives in ``<prefix>_agentkey``, never in the publisher prefix: one hub holds
    many teammates, and the prefix belongs to the solution. The key is a plain string rather than
    a lookup on purpose - a teammate must be able to log its turns before anyone has registered
    it in the master table, otherwise telemetry disappears exactly when onboarding goes wrong."""
    return [
        {
            "logical": f"{prefix}_evalagent",
            "display": "AI チームメイト",
            "plural": "AI チームメイト",
            "description": "評価 Hub が管理する AI チームメイトのマスタ",
            "columns": [
                {"logical": f"{prefix}_agentkey", "display": "Agent Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_role", "display": "Role", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_description", "display": "Description", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_managerkey", "display": "Manager Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_upn", "display": "UPN", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_agenticuserid", "display": "Agentic User Id", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_webappname", "display": "Web App Name", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_endpoint", "display": "Endpoint", "type": "String", "maxLength": 500},
                {"logical": f"{prefix}_photourl", "display": "Photo Url", "type": "String", "maxLength": 500},
                {"logical": f"{prefix}_skills", "display": "Skills", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_status", "display": "Status", "type": "Picklist", "options": [(1, "稼働中"), (2, "停止中"), (3, "構築中"), (4, "廃止")]},
                {"logical": f"{prefix}_sortorder", "display": "Sort Order", "type": "Integer", "minValue": 0, "maxValue": 100_000},
            ],
        },
        {
            "logical": f"{prefix}_evalturn",
            "display": "評価ターン",
            "plural": "評価ターン",
            "description": "AI チームメイトが処理した 1 会話ターンのミラー（評価対象）",
            "columns": [
                {"logical": f"{prefix}_agentkey", "display": "Agent Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_runid", "display": "Run Id", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_evaluatedon", "display": "Evaluated On", "type": "DateTime"},
                {"logical": f"{prefix}_occurredon", "display": "Occurred On", "type": "DateTime"},
                {"logical": f"{prefix}_actor", "display": "Actor", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_source", "display": "Source", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_query", "display": "Query", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_response", "display": "Response", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_toolcalls", "display": "Tool Calls", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_toolcount", "display": "Tool Count", "type": "Integer", "minValue": 0, "maxValue": 1000},
                {"logical": f"{prefix}_toolcallaccuracy", "display": "Tool Call Accuracy", "type": "Integer", "minValue": 0, "maxValue": 5},
                {"logical": f"{prefix}_taskadherence", "display": "Task Adherence", "type": "Integer", "minValue": 0, "maxValue": 5},
                {"logical": f"{prefix}_toolcallaccuracyreason", "display": "Tool Call Accuracy Reason", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_taskadherencereason", "display": "Task Adherence Reason", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_humancomment", "display": "Human Comment", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_humanverdict", "display": "Human Verdict", "type": "Picklist", "options": [(1, "OK"), (2, "NG")]},
                {"logical": f"{prefix}_mergedinto", "display": "Merged Into", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_mergedfrom", "display": "Merged From", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_turncount", "display": "Turn Count", "type": "Integer", "minValue": 0, "maxValue": 100_000},
                {"logical": f"{prefix}_conversation", "display": "Conversation", "type": "Memo", "maxLength": 1_048_576},
            ],
        },
        {
            "logical": f"{prefix}_evalrule",
            "display": "評価ルール",
            "plural": "評価ルール",
            "description": "評価に使うルール（組み込み + カスタム）",
            "columns": [
                {"logical": f"{prefix}_rulekey", "display": "Rule Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_summary", "display": "Summary", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_prompt", "display": "Prompt", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_scoreguide", "display": "Score Guide", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_target", "display": "Target", "type": "Picklist", "options": [(1, "応答"), (2, "ツール呼び出し"), (3, "応答とツール呼び出し")]},
                {"logical": f"{prefix}_enabled", "display": "Enabled", "type": "Boolean"},
                {"logical": f"{prefix}_weight", "display": "Weight", "type": "Decimal", "precision": 2, "minValue": 0, "maxValue": 100},
                {"logical": f"{prefix}_sortorder", "display": "Sort Order", "type": "Integer", "minValue": 0, "maxValue": 100_000},
                {"logical": f"{prefix}_builtin", "display": "Built In", "type": "Boolean"},
            ],
        },
        {
            "logical": f"{prefix}_evalresult",
            "display": "評価結果",
            "plural": "評価結果",
            "description": "1 (ターン, ルール) 組ごとの採点結果",
            "columns": [
                {"logical": f"{prefix}_agentkey", "display": "Agent Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_turnname", "display": "Turn Name", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_rulekey", "display": "Rule Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_rulename", "display": "Rule Name", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_score", "display": "Score", "type": "Integer", "minValue": 0, "maxValue": 5},
                {"logical": f"{prefix}_reason", "display": "Reason", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_evidence", "display": "Evidence", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_suggestions", "display": "Suggestions", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_runid", "display": "Run Id", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_evaluatedon", "display": "Evaluated On", "type": "DateTime"},
            ],
        },
        {
            "logical": f"{prefix}_evaljob",
            "display": "評価ジョブ",
            "plural": "評価ジョブ",
            "description": "評価実行の待ち行列と進捗",
            "columns": [
                {"logical": f"{prefix}_agentkeys", "display": "Agent Keys", "type": "String", "maxLength": 2000},
                {"logical": f"{prefix}_status", "display": "Status", "type": "Picklist", "options": [(1, "待機中"), (2, "実行中"), (3, "完了"), (4, "失敗"), (5, "キャンセル")]},
                {"logical": f"{prefix}_scope", "display": "Scope", "type": "Picklist", "options": [(1, "未評価のみ"), (2, "全件"), (3, "期間指定")]},
                {"logical": f"{prefix}_rulekeys", "display": "Rule Keys", "type": "String", "maxLength": 2000},
                {"logical": f"{prefix}_fromdate", "display": "From Date", "type": "DateTime"},
                {"logical": f"{prefix}_todate", "display": "To Date", "type": "DateTime"},
                {"logical": f"{prefix}_requestedby", "display": "Requested By", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_requestedon", "display": "Requested On", "type": "DateTime"},
                {"logical": f"{prefix}_startedon", "display": "Started On", "type": "DateTime"},
                {"logical": f"{prefix}_completedon", "display": "Completed On", "type": "DateTime"},
                {"logical": f"{prefix}_targetcount", "display": "Target Count", "type": "Integer", "minValue": 0, "maxValue": 1_000_000},
                {"logical": f"{prefix}_donecount", "display": "Done Count", "type": "Integer", "minValue": 0, "maxValue": 1_000_000},
                {"logical": f"{prefix}_message", "display": "Message", "type": "Memo", "maxLength": 4000},
            ],
        },
        {
            "logical": f"{prefix}_evaltestrun",
            "display": "自動テスト",
            "plural": "自動テスト",
            "description": "同じ依頼を複数の AI チームメイトに投げて比べるテスト",
            "columns": [
                {"logical": f"{prefix}_agentkeys", "display": "Agent Keys", "type": "String", "maxLength": 2000},
                {"logical": f"{prefix}_prompt", "display": "Prompt", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_rulekeys", "display": "Rule Keys", "type": "String", "maxLength": 2000},
                {"logical": f"{prefix}_status", "display": "Status", "type": "Picklist", "options": [(1, "待機中"), (2, "実行中"), (3, "完了"), (4, "失敗"), (5, "キャンセル")]},
                {"logical": f"{prefix}_requestedby", "display": "Requested By", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_requestedon", "display": "Requested On", "type": "DateTime"},
                {"logical": f"{prefix}_completedon", "display": "Completed On", "type": "DateTime"},
                {"logical": f"{prefix}_targetcount", "display": "Target Count", "type": "Integer", "minValue": 0, "maxValue": 1000},
                {"logical": f"{prefix}_donecount", "display": "Done Count", "type": "Integer", "minValue": 0, "maxValue": 1000},
                {"logical": f"{prefix}_note", "display": "Note", "type": "Memo", "maxLength": 4000},
            ],
        },
        {
            "logical": f"{prefix}_evaltestresult",
            "display": "自動テスト結果",
            "plural": "自動テスト結果",
            "description": "自動テストの 1 チームメイト分の応答と評価",
            "columns": [
                {"logical": f"{prefix}_runname", "display": "Run Name", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_agentkey", "display": "Agent Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_prompt", "display": "Prompt", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_status", "display": "Status", "type": "Picklist", "options": [(1, "待機中"), (2, "実行中"), (3, "完了"), (4, "失敗"), (5, "キャンセル")]},
                {"logical": f"{prefix}_response", "display": "Response", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_toolcalls", "display": "Tool Calls", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_durationms", "display": "Duration Ms", "type": "Integer", "minValue": 0, "maxValue": 2_000_000_000},
                {"logical": f"{prefix}_startedon", "display": "Started On", "type": "DateTime"},
                {"logical": f"{prefix}_completedon", "display": "Completed On", "type": "DateTime"},
                {"logical": f"{prefix}_error", "display": "Error", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_turnname", "display": "Turn Name", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_autoscore", "display": "Auto Score", "type": "Decimal", "precision": 2, "minValue": 0, "maxValue": 5},
                {"logical": f"{prefix}_autosummary", "display": "Auto Summary", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_humanverdict", "display": "Human Verdict", "type": "Picklist", "options": [(1, "OK"), (2, "NG")]},
                {"logical": f"{prefix}_humancomment", "display": "Human Comment", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_issueurl", "display": "Issue Url", "type": "String", "maxLength": 500},
            ],
        },
        {
            "logical": f"{prefix}_skill",
            "display": "スキル",
            "plural": "スキル",
            # The SKILL.md files live on the agent host, which the Code App cannot read, so each
            # teammate's SkillSync pushes a copy here for the hub to show.
            "description": "AI チームメイトが読んでいるスキルの写し",
            "columns": [
                {"logical": f"{prefix}_agentkey", "display": "Agent Key", "type": "String", "maxLength": 100},
                {"logical": f"{prefix}_skillkey", "display": "Skill Key", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_title", "display": "Title", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_summary", "display": "Summary", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_body", "display": "Body", "type": "Memo", "maxLength": 1_048_576},
                {"logical": f"{prefix}_builtin", "display": "Built In", "type": "Boolean"},
                {"logical": f"{prefix}_syncedon", "display": "Synced On", "type": "DateTime"},
            ],
        },
        {
            "logical": f"{prefix}_aiteammatefeedback",
            "display": "AI チームメイトへの要望",
            "plural": "AI チームメイトへの要望",
            # Written by the teammate itself through the Dataverse MCP create_record, so createdon
            # is the agent - who actually asked is kept in the requester lookup and the text pair.
            "description": "利用者からの改善要望・不具合報告",
            "columns": [
                {"logical": f"{prefix}_summary", "display": "Summary", "type": "Memo", "maxLength": 4000},
                {"logical": f"{prefix}_requirements", "display": "Requirements", "type": "Memo", "maxLength": 100_000},
                {"logical": f"{prefix}_purpose", "display": "Purpose", "type": "Picklist", "options": [(1, "改善要望"), (2, "新機能提案"), (3, "不具合報告"), (4, "使い方の相談"), (5, "その他")]},
                {"logical": f"{prefix}_category", "display": "Category", "type": "Picklist", "options": [(1, "メール対応"), (2, "予定調整"), (3, "Teamsチャット"), (4, "資料作成"), (5, "Web検索"), (6, "Dataverse照会"), (7, "その他")]},
                {"logical": f"{prefix}_status", "display": "Status", "type": "Picklist", "options": [(1, "新規受付"), (2, "検討中"), (3, "対応予定"), (4, "対応中"), (5, "対応済み"), (6, "却下")]},
                {"logical": f"{prefix}_requestedbyname", "display": "Requested By Name", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_requestedbyemail", "display": "Requested By Email", "type": "String", "maxLength": 200},
                {"logical": f"{prefix}_requester", "display": "Requester", "type": "Lookup", "target": "systemuser"},
                {"logical": f"{prefix}_githubissueurl", "display": "GitHub Issue Url", "type": "String", "maxLength": 500},
            ],
        },
    ]


def get_solution_id(solution_name: str) -> str | None:
    values = api_get(
        f"solutions?$filter=uniquename eq '{solution_name}'&$select=solutionid"
    ).get("value", [])
    return values[0]["solutionid"] if values else None


def existing_tables(prefix: str) -> dict[str, str]:
    """Returns {logical_name: MetadataId} for tables under this prefix that already exist."""
    # EntityDefinitions rejects startswith() with 501, so the prefix is matched client side.
    rows = api_get("EntityDefinitions?$select=LogicalName,MetadataId").get("value", [])
    return {
        row["LogicalName"]: row["MetadataId"]
        for row in rows
        if row["LogicalName"].startswith(f"{prefix}_eval")
    }


def foreign_tables(prefix: str, wanted: set[str], solution_id: str) -> list[str]:
    """Tables that already exist under this prefix but do not belong to *solution_id*."""
    found = existing_tables(prefix)
    hit = {name: metadata_id for name, metadata_id in found.items() if name in wanted}
    if not hit:
        return []
    owned = {
        row["objectid"].lower()
        for row in api_get(
            "solutioncomponents?$select=objectid"
            f"&$filter=_solutionid_value eq {solution_id} and componenttype eq {COMPONENT_TYPE_ENTITY}"
        ).get("value", [])
    }
    return sorted(name for name, metadata_id in hit.items() if metadata_id.lower() not in owned)


def existing_columns(logical: str) -> set[str]:
    rows = api_get(
        f"EntityDefinitions(LogicalName='{logical}')/Attributes?$select=LogicalName"
    ).get("value", [])
    return {row["LogicalName"] for row in rows}


def missing_columns(tbl: dict, prefix: str) -> list[dict]:
    if tbl["logical"] not in existing_tables(prefix):
        return list(tbl["columns"])
    present = existing_columns(tbl["logical"])
    return [col for col in tbl["columns"] if col["logical"] not in present]


def create_table(tbl: dict, solution_name: str, prefix: str) -> None:
    logical = tbl["logical"]

    def _create() -> None:
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "SchemaName": logical,
            "DisplayName": label_jp(tbl["display"]),
            "DisplayCollectionName": label_jp(tbl["plural"]),
            "Description": label_jp(tbl["description"]),
            "OwnershipType": "UserOwned",
            "IsActivity": False,
            "HasActivities": False,
            "HasNotes": False,
            "HasFeedback": False,
            "PrimaryNameAttribute": f"{prefix}_name",
            "Attributes": [
                {
                    "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                    "SchemaName": f"{prefix}_name",
                    "DisplayName": label_jp("Name"),
                    "IsPrimaryName": True,
                    "RequiredLevel": {"Value": "ApplicationRequired"},
                    "FormatName": {"Value": "Text"},
                    "MaxLength": 200,
                }
            ],
        }
        api_post("EntityDefinitions", body, solution=solution_name)
        print(f"  + table '{logical}' created")

    retry_metadata(_create, f"table {logical}")
    _sleep(TABLE_SETTLE_SECONDS)


def add_columns(tbl: dict, columns: list[dict], solution_name: str) -> None:
    logical = tbl["logical"]
    for col in columns:
        def _add(c=col) -> None:
            if c["type"] == "Lookup":
                api_post("RelationshipDefinitions", build_lookup_body(logical, c), solution=solution_name)
            else:
                api_post(
                    f"EntityDefinitions(LogicalName='{logical}')/Attributes",
                    build_column_body(c),
                    solution=solution_name,
                )
            print(f"    + column '{c['logical']}' added")

        retry_metadata(_add, f"column {col['logical']}")
        _sleep(COLUMN_SETTLE_SECONDS)


def publish_all() -> None:
    api_post("PublishAllXml", {})


def run_check(prefix: str, solution_name: str) -> int:
    solution_id = get_solution_id(solution_name)
    if solution_id is None:
        print(f"NG: solution '{solution_name}' does not exist. Create it first (dataverse skill).", file=sys.stderr)
        return 1

    tables = build_tables(prefix)
    wanted = {tbl["logical"] for tbl in tables}
    conflicts = foreign_tables(prefix, wanted, solution_id)
    if conflicts:
        print("NG: the following tables already exist outside this solution:", file=sys.stderr)
        for name in conflicts:
            print(f"  - {name}", file=sys.stderr)
        return 1

    found = existing_tables(prefix)
    not_created: list[str] = []
    for tbl in tables:
        if tbl["logical"] not in found:
            not_created.append(f"table {tbl['logical']} (not created yet)")
            continue
        present = existing_columns(tbl["logical"])
        for col in tbl["columns"]:
            if col["logical"] not in present:
                not_created.append(f"column {tbl['logical']}.{col['logical']} (not created yet)")

    if not_created:
        print("PLANNED (will be created by running this script without --check):")
        for item in not_created:
            print(f"  - {item}")
        return NOT_CREATED_EXIT

    print(f"OK: all {len(tables)} evaluation-hub tables and their columns already exist.")
    return 0


def register_agent(prefix: str, env: dict[str, str]) -> None:
    """Upsert this teammate's master row so the hub can name it, place it on the org chart and
    filter by it. Keyed on the agent key, never on the publisher prefix."""
    key = (env.get("AGENT_NAME") or "").strip()
    if not key:
        print("WARN: AGENT_NAME is not set; skipping master registration.", file=sys.stderr)
        return

    record = {
        f"{prefix}_name": (env.get("AGENT_DISPLAY_NAME") or key).strip(),
        f"{prefix}_agentkey": key,
        f"{prefix}_role": (env.get("AGENT_ROLE") or "").strip(),
        f"{prefix}_managerkey": (env.get("AGENT_MANAGER_KEY") or "").strip(),
        f"{prefix}_agenticuserid": (env.get("AGENTIC_USER_ID") or "").strip(),
        f"{prefix}_webappname": (env.get("AGENT_WEBAPP_NAME") or "").strip(),
        f"{prefix}_status": 1,
    }
    record = {name: value for name, value in record.items() if value != ""}

    entity_set = f"{prefix}_evalagents"
    query = f"{entity_set}?$select={prefix}_evalagentid&$filter={prefix}_agentkey eq '{key}'"
    rows = api_get(query).get("value", [])
    if rows:
        # Display name and role are edited in the hub, so a redeploy must not overwrite them.
        volatile = {name: value for name, value in record.items() if name.endswith(("_webappname", "_agenticuserid"))}
        if volatile:
            api_patch(f"{entity_set}({rows[0][f'{prefix}_evalagentid']})", volatile)
        print(f"OK: teammate '{key}' is already registered.")
        return

    api_post(entity_set, record)
    print(f"OK: registered teammate '{key}' in {entity_set}.")


def run_execute(prefix: str, solution_name: str, env: dict[str, str]) -> int:
    solution_id = get_solution_id(solution_name)
    if solution_id is None:
        print(f"NG: solution '{solution_name}' does not exist. Create it first (dataverse skill).", file=sys.stderr)
        return 1

    tables = build_tables(prefix)
    wanted = {tbl["logical"] for tbl in tables}
    conflicts = foreign_tables(prefix, wanted, solution_id)
    if conflicts:
        print("NG: the following tables already exist outside this solution:", file=sys.stderr)
        for name in conflicts:
            print(f"  - {name}", file=sys.stderr)
        return 1

    for tbl in tables:
        if tbl["logical"] not in existing_tables(prefix):
            create_table(tbl, solution_name, prefix)
        to_add = missing_columns(tbl, prefix)
        if to_add:
            add_columns(tbl, to_add, solution_name)

    publish_all()
    print(f"OK: {len(tables)} evaluation-hub tables verified/created in solution '{solution_name}'.")
    register_agent(prefix, env)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", type=Path, default=Path(".env"))
    parser.add_argument("--publisher-prefix", default=None)
    parser.add_argument("--solution-name", default=None)
    parser.add_argument("--check", action="store_true", help="Verify only; create nothing")
    args = parser.parse_args()

    env = {**load_dotenv(args.env), **os.environ}
    prefix = args.publisher_prefix or env.get("PUBLISHER_PREFIX", "")
    solution_name = args.solution_name or env.get("SOLUTION_NAME", "")

    if not prefix or not PUBLISHER_PREFIX_PATTERN.fullmatch(prefix):
        print(f"NG: PUBLISHER_PREFIX is missing or invalid: {prefix!r}", file=sys.stderr)
        return 1
    if not solution_name:
        print("NG: SOLUTION_NAME is required (.env or --solution-name)", file=sys.stderr)
        return 1

    if args.check:
        return run_check(prefix, solution_name)
    return run_execute(prefix, solution_name, env)


if __name__ == "__main__":
    raise SystemExit(main())
