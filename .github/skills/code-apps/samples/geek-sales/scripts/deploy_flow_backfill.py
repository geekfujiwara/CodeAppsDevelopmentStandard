"""
Power Automate フローデプロイ: サマリー同期（バックフィル）
================================================================
会話トランスクリプトをパースしてサマリーテーブルに書き込むフロー。
PowerApps トリガー → 即座にレスポンス（非同期パターン）→ バックグラウンドで同期。

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定
  2. Power Automate 接続ページで Dataverse 接続を事前作成
     https://make.powerautomate.com/connections
  3. pip install azure-identity requests python-dotenv
  4. python scripts/deploy_flow_backfill.py
"""
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 共通認証モジュール
_repo = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, _repo)
sys.path.insert(0, os.path.join(_repo, ".github", "skills", "standard", "scripts"))

from auth_helper import (
    api_get,
    api_patch,
    api_post,
    api_delete,
    get_token,
    flow_api_call,
    retry_metadata,
    resolve_environment_id,
    find_connection,
    DATAVERSE_URL,
)

# ── 環境変数 ──
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "CopilotStudioAnalysis")

FLOW_DISPLAY_NAME = "サマリー同期"
FLOW_DESCRIPTION = "会話トランスクリプトを解析してサマリーテーブルに書き込む（冪等・非同期 PowerApps トリガー）"

CONNECTOR_DV = "shared_commondataserviceforapps"
CONNREF_DATAVERSE = f"{PREFIX}_sharedcommondataserviceforapps"


# ══════════════════════════════════════════════════════════════
# Step 1 & 2: 環境 ID 解決 + 接続検索（auth_helper ユーティリティ）
# ══════════════════════════════════════════════════════════════
def setup_environment():
    """環境 ID と接続 ID を取得する。"""
    print("\n=== Step 1: 環境 ID 解決 ===")
    env_id = resolve_environment_id()
    print(f"  ✓ 環境 ID: {env_id}")

    print("\n=== Step 2: 接続検索 ===")
    conn_id = find_connection(env_id, CONNECTOR_DV, "Dataverse")
    print(f"  ✓ Dataverse: {conn_id}")
    return env_id, {CONNECTOR_DV: conn_id}


# ══════════════════════════════════════════════════════════════
# Step 3: 接続参照
# ══════════════════════════════════════════════════════════════
def ensure_connection_reference(logical_name, display_name, connector_id, connection_id):
    existing = api_get(
        f"connectionreferences?$filter=connectionreferencelogicalname eq '{logical_name}'"
        "&$select=connectionreferenceid,connectionid"
    )
    if existing.get("value"):
        ref = existing["value"][0]
        if ref.get("connectionid") != connection_id:
            api_patch(f"connectionreferences({ref['connectionreferenceid']})", {"connectionid": connection_id})
            print(f"    接続更新: {logical_name}")
        else:
            print(f"    既存OK: {logical_name}")
        return
    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": f"/providers/Microsoft.PowerApps/apis/{connector_id}",
        "connectionid": connection_id,
    }
    retry_metadata(
        lambda: api_post("connectionreferences", body, solution=SOLUTION_NAME),
        f"接続参照: {logical_name}",
    )
    print(f"    作成完了: {logical_name}")


def create_connection_references(connections: dict):
    print("\n=== Step 3: 接続参照の作成 ===")
    ensure_connection_reference(
        CONNREF_DATAVERSE, "Dataverse",
        CONNECTOR_DV, connections[CONNECTOR_DV],
    )
    print("  ✓ 接続参照 OK")


# ══════════════════════════════════════════════════════════════
# Step 4: フロー定義構築 + Draft 作成
# ══════════════════════════════════════════════════════════════
def build_flow_definition() -> dict:
    """サマリー同期フロー定義を構築

    パターン: PowerApps V2 トリガー → 即時レスポンス → バックグラウンド同期
    - 既存サマリーの transcriptid を取得し、未処理トランスクリプトのみ処理
    - 各トランスクリプトの content JSON をパースしてメッセージ数・結果を集計
    """
    summary_table = f"{PREFIX}_conversationsummaries"

    # -- 内部アクション（Apply_to_each 内部）--
    inner_actions = {
        # 1. フルレコード取得（content含む）
        "Get_Full_Transcript": {
            "type": "OpenApiConnection",
            "runAfter": {},
            "inputs": {
                "host": {
                    "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                    "connectionName": CONNECTOR_DV,
                    "operationId": "GetItem",
                },
                "parameters": {
                    "entityName": "conversationtranscripts",
                    "recordId": "@items('Apply_to_each')?['conversationtranscriptid']",
                    "$select": "content",
                },
                "authentication": "@parameters('$authentication')",
            },
        },
        # 2. メタデータパース
        "Compose_Metadata": {
            "type": "Compose",
            "runAfter": {},
            "inputs": "@if(empty(items('Apply_to_each')?['metadata']),json('{}'),json(items('Apply_to_each')?['metadata']))",
        },
        # 3-4. コンテンツパース → activities 取得
        "Compose_Safe_Content": {
            "type": "Compose",
            "runAfter": {"Get_Full_Transcript": ["Succeeded"]},
            "inputs": "@if(empty(outputs('Get_Full_Transcript')?['body/content']),'{}',outputs('Get_Full_Transcript')?['body/content'])",
        },
        "Compose_Parsed": {
            "type": "Compose",
            "runAfter": {"Compose_Safe_Content": ["Succeeded"]},
            "inputs": "@json(outputs('Compose_Safe_Content'))",
        },
        "Compose_Activities": {
            "type": "Compose",
            "runAfter": {"Compose_Parsed": ["Succeeded"]},
            "inputs": "@coalesce(outputs('Compose_Parsed')?['activities'],json('[]'))",
        },
        # 5-8. フィルタリング（並列）
        "Filter_User_Msgs": {
            "type": "Query",
            "runAfter": {"Compose_Activities": ["Succeeded"]},
            "inputs": {
                "from": "@outputs('Compose_Activities')",
                "where": "@and(equals(item()?['type'],'message'),equals(item()?['from']?['role'],1))",
            },
        },
        "Filter_Bot_Msgs": {
            "type": "Query",
            "runAfter": {"Compose_Activities": ["Succeeded"]},
            "inputs": {
                "from": "@outputs('Compose_Activities')",
                "where": "@and(equals(item()?['type'],'message'),not(equals(item()?['from']?['role'],1)))",
            },
        },
        "Filter_Events": {
            "type": "Query",
            "runAfter": {"Compose_Activities": ["Succeeded"]},
            "inputs": {
                "from": "@outputs('Compose_Activities')",
                "where": "@equals(item()?['type'],'event')",
            },
        },
        "Filter_Outcome_Activities": {
            "type": "Query",
            "runAfter": {"Compose_Activities": ["Succeeded"]},
            "inputs": {
                "from": "@outputs('Compose_Activities')",
                "where": "@equals(item()?['valueType'],'ConversationInfo')",
            },
        },
        # 9. 結果マッピング
        "Compose_Outcome": {
            "type": "Compose",
            "runAfter": {"Filter_Outcome_Activities": ["Succeeded"]},
            "inputs": (
                "@if(greater(length(body('Filter_Outcome_Activities')),0),"
                "if(equals(first(body('Filter_Outcome_Activities'))?['value']?['lastSessionOutcome'],'Resolved'),100000000,"
                "if(equals(first(body('Filter_Outcome_Activities'))?['value']?['lastSessionOutcome'],'Abandoned'),100000001,"
                "if(equals(first(body('Filter_Outcome_Activities'))?['value']?['lastSessionOutcome'],'Escalated'),100000002,"
                "100000003))),"
                "100000003)"
            ),
        },
        # 10. 所要時間
        "Compose_Duration": {
            "type": "Compose",
            "runAfter": {"Compose_Activities": ["Succeeded"]},
            "inputs": (
                "@if(greater(length(outputs('Compose_Activities')),1),"
                "div(sub(last(outputs('Compose_Activities'))?['timestampMs'],"
                "first(outputs('Compose_Activities'))?['timestampMs']),1000),0)"
            ),
        },
        # 11-12. ツールサーバー抽出
        "Filter_With_Server": {
            "type": "Query",
            "runAfter": {"Filter_Events": ["Succeeded"]},
            "inputs": {
                "from": "@body('Filter_Events')",
                "where": "@not(empty(coalesce(item()?['value']?['initializationResult']?['serverInfo']?['name'],'')))",
            },
        },
        "Select_Server_Names": {
            "type": "Select",
            "runAfter": {"Filter_With_Server": ["Succeeded"]},
            "inputs": {
                "from": "@body('Filter_With_Server')",
                "select": "@item()?['value']?['initializationResult']?['serverInfo']?['name']",
            },
        },
        # 13. サマリーレコード作成
        "Create_Summary": {
            "type": "OpenApiConnection",
            "runAfter": {
                "Compose_Metadata": ["Succeeded"],
                "Filter_User_Msgs": ["Succeeded"],
                "Filter_Bot_Msgs": ["Succeeded"],
                "Compose_Outcome": ["Succeeded"],
                "Compose_Duration": ["Succeeded"],
                "Select_Server_Names": ["Succeeded"],
            },
            "inputs": {
                "host": {
                    "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                    "connectionName": CONNECTOR_DV,
                    "operationId": "CreateRecord",
                },
                "parameters": {
                    "entityName": summary_table,
                    f"item/{PREFIX}_name": "@coalesce(items('Apply_to_each')?['name'],'')",
                    f"item/{PREFIX}_transcriptid": "@items('Apply_to_each')?['conversationtranscriptid']",
                    f"item/{PREFIX}_botname": "@coalesce(outputs('Compose_Metadata')?['BotName'],'')",
                    f"item/{PREFIX}_botid": "@coalesce(outputs('Compose_Metadata')?['BotId'],'')",
                    f"item/{PREFIX}_starttime": "@items('Apply_to_each')?['conversationstarttime']",
                    f"item/{PREFIX}_outcome": "@outputs('Compose_Outcome')",
                    f"item/{PREFIX}_channel": "@coalesce(first(outputs('Compose_Activities'))?['channelId'],'')",
                    f"item/{PREFIX}_usermsgcount": "@length(body('Filter_User_Msgs'))",
                    f"item/{PREFIX}_botmsgcount": "@length(body('Filter_Bot_Msgs'))",
                    f"item/{PREFIX}_tooleventcount": "@length(body('Filter_Events'))",
                    f"item/{PREFIX}_durationsec": "@outputs('Compose_Duration')",
                    f"item/{PREFIX}_toolservers": "@join(union(body('Select_Server_Names'),json('[]')),', ')",
                    f"item/{PREFIX}_firstusertext": "@coalesce(first(body('Filter_User_Msgs'))?['text'],'')",
                },
                "authentication": "@parameters('$authentication')",
            },
        },
    }

    # -- メインフロー定義 --
    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "manual": {
                "type": "Request",
                "kind": "PowerAppV2",
                "inputs": {
                    "schema": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
        },
        "actions": {
            # ★ 即座にレスポンス（非同期パターンの肝）
            "Respond_Started": {
                "type": "Response",
                "kind": "PowerApp",
                "runAfter": {},
                "inputs": {
                    "statusCode": 200,
                    "body": {
                        "status": "started",
                        "message": "サマリー同期を開始しました",
                    },
                    "schema": {
                        "type": "object",
                        "properties": {
                            "status": {"type": "string"},
                            "message": {"type": "string"},
                        },
                    },
                },
            },
            # 既存サマリーの transcriptid を取得
            "List_Existing_Summaries": {
                "type": "OpenApiConnection",
                "runAfter": {"Respond_Started": ["Succeeded"]},
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                        "connectionName": CONNECTOR_DV,
                        "operationId": "ListRecords",
                    },
                    "parameters": {
                        "entityName": summary_table,
                        "$select": f"{PREFIX}_transcriptid",
                    },
                    "authentication": "@parameters('$authentication')",
                },
                "runtimeConfiguration": {
                    "paginationPolicy": {"minimumItemCount": 5000},
                },
            },
            "Select_Existing_IDs": {
                "type": "Select",
                "runAfter": {"List_Existing_Summaries": ["Succeeded"]},
                "inputs": {
                    "from": "@body('List_Existing_Summaries')?['value']",
                    "select": f"@item()?['{PREFIX}_transcriptid']",
                },
            },
            # トランスクリプト一覧（content なし → GetItem で個別取得）
            "List_Transcripts": {
                "type": "OpenApiConnection",
                "runAfter": {"Select_Existing_IDs": ["Succeeded"]},
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                        "connectionName": CONNECTOR_DV,
                        "operationId": "ListRecords",
                    },
                    "parameters": {
                        "entityName": "conversationtranscripts",
                        "$select": "conversationtranscriptid,name,conversationstarttime,metadata",
                    },
                    "authentication": "@parameters('$authentication')",
                },
                "runtimeConfiguration": {
                    "paginationPolicy": {"minimumItemCount": 5000},
                },
            },
            # 未処理のみ抽出
            "Filter_New_Transcripts": {
                "type": "Query",
                "runAfter": {"List_Transcripts": ["Succeeded"]},
                "inputs": {
                    "from": "@body('List_Transcripts')?['value']",
                    "where": "@not(contains(body('Select_Existing_IDs'),item()?['conversationtranscriptid']))",
                },
            },
            # 各トランスクリプトを処理（順次実行 — スロットリング対策）
            "Apply_to_each": {
                "type": "Foreach",
                "runAfter": {"Filter_New_Transcripts": ["Succeeded"]},
                "foreach": "@body('Filter_New_Transcripts')",
                "actions": inner_actions,
                "runtimeConfiguration": {
                    "concurrency": {"repetitions": 1},
                },
            },
        },
    }

    return definition


def deploy_flow_draft() -> str:
    print("\n=== Step 4: フロー Draft 作成 ===")

    # べき等: 既存フロー削除
    existing = api_get(
        f"workflows?$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5"
        "&$select=workflowid,statecode"
    )
    for f in existing.get("value", []):
        wf_id = f["workflowid"]
        if f["statecode"] == 1:
            api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
            time.sleep(2)
        api_delete(f"workflows({wf_id})")
        print(f"  削除: {wf_id}")
        time.sleep(3)

    definition = build_flow_definition()

    clientdata = {
        "properties": {
            "definition": definition,
            "connectionReferences": {
                CONNECTOR_DV: {
                    "runtimeSource": "embedded",
                    "connection": {"connectionReferenceLogicalName": CONNREF_DATAVERSE},
                    "api": {"name": CONNECTOR_DV},
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }

    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": json.dumps(clientdata, ensure_ascii=False),
        "description": FLOW_DESCRIPTION,
    }

    try:
        wf_id = api_post("workflows", workflow_body, solution=SOLUTION_NAME)
        print(f"  ✓ フロー Draft 作成: {wf_id}")
        return wf_id
    except Exception as e:
        debug_path = "flow_backfill_debug.json"
        with open(debug_path, "w", encoding="utf-8") as fp:
            json.dump(workflow_body, fp, ensure_ascii=False, indent=2)
        print(f"  ❌ Draft 作成失敗: {e}")
        print(f"  デバッグ JSON 保存: {debug_path}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════════
# Step 5: 有効化（PowerApps トリガーは /start 不要）
# ══════════════════════════════════════════════════════════════
def activate_flow(wf_id: str):
    print("\n=== Step 5: フロー有効化 ===")
    time.sleep(3)
    try:
        api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})
        print("  ✓ フロー有効化成功")
    except Exception as e:
        print(f"  ❌ 有効化失敗: {e}")
        print(f"  → Power Automate UI で手動有効化してください")
        print(f"     https://make.powerautomate.com/flows/{wf_id}")
        sys.exit(1)


# ══════════════════════════════════════════════════════════════
# メイン
# ══════════════════════════════════════════════════════════════
def main():
    print("=" * 60)
    print("  Power Automate フローデプロイ: サマリー同期")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print("=" * 60)

    env_id, connections = setup_environment()
    create_connection_references(connections)
    wf_id = deploy_flow_draft()
    activate_flow(wf_id)

    print("\n" + "=" * 60)
    print("  ✅ デプロイ完了!")
    print(f"  フロー ID: {wf_id}")
    print(f"  → Power Automate: https://make.powerautomate.com/flows/{wf_id}")
    print("=" * 60)


if __name__ == "__main__":
    main()
