"""
Power Automate フローデプロイスクリプト — SharePoint ドキュメント自動インシデント登録
Dataverse workflows テーブル方式

SharePoint にファイルが追加されたら:
  1. ファイルコンテンツを取得
  2. AI Builder「プロンプトを実行する」で要約 + カテゴリ判定
  3. Dataverse カテゴリ検索
  4. Dataverse インシデント作成

AI Builder は operationId: aibuilderpredict_customprompt を使用。
（PerformBoundAction は InvalidOpenApiFlow でフロー有効化が失敗するため不可）
connectionReferences は runtimeSource + connectionReferenceLogicalName 形式。

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID を設定
  2. 接続を事前作成: SharePoint, Dataverse
     https://make.powerautomate.com/connections
  3. python scripts/deploy_flow_sp_incident_v2.py
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
from dotenv import load_dotenv
from auth_helper import (
    DATAVERSE_URL,
    get_session,
    get_token,
    retry_metadata,
)

load_dotenv()

PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")

API = f"{DATAVERSE_URL}/api/data/v9.2"
FLOW_DISPLAY_NAME = "SharePoint ドキュメント自動インシデント登録"

# SharePoint 設定（.env から取得）
SP_SITE_URL = os.environ.get("SP_SITE_URL", "https://YOUR_TENANT.sharepoint.com/sites/YOUR_SITE")
SP_FOLDER_PATH = os.environ.get("SP_FOLDER_PATH", "/Shared Documents/All")

# AI Builder Model ID（.env から取得）
AI_MODEL_ID = os.environ.get("AI_MODEL_ID", "")

# 接続参照の論理名
CONNREF_DATAVERSE = f"{PREFIX}_connref_dataverse_sp"
CONNREF_SHAREPOINT = f"{PREFIX}_connref_sharepoint_sp"

# ── 接続検索 ──────────────────────────────────────────────

FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"

CONNECTORS_NEEDED = {
    "shared_commondataserviceforapps": "Dataverse",
    "shared_sharepointonline": "SharePoint Online",
}

# PowerApps API がタイムアウトする場合のフォールバック接続 ID（.env から取得）
FALLBACK_CONNECTIONS = {
    "shared_commondataserviceforapps": os.environ.get("FALLBACK_CONN_DATAVERSE", ""),
    "shared_sharepointonline": os.environ.get("FALLBACK_CONN_SHAREPOINT", ""),
}


def resolve_environment_id() -> str:
    """Flow API で環境 ID を解決する"""
    print("\n=== Step 0: 環境 ID 解決 ===")
    token = get_token(scope="https://service.flow.microsoft.com/.default")
    r = requests.get(
        f"{FLOW_API}/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    r.raise_for_status()
    for env in r.json().get("value", []):
        iu = (env.get("properties", {}).get("linkedEnvironmentMetadata", {}).get("instanceUrl", "") or "").rstrip("/")
        if iu == DATAVERSE_URL:
            env_id = env["name"]
            print(f"  環境 ID: {env_id}")
            return env_id
    raise RuntimeError(f"環境が見つかりません: {DATAVERSE_URL}")


def find_connections(env_id: str) -> dict:
    """PowerApps API で Connected 状態の接続を検索（タイムアウト時リトライ）"""
    print("\n=== Step 1: 接続検索 ===")
    token = get_token(scope="https://service.powerapps.com/.default")
    connections = {}

    for connector_name, display in CONNECTORS_NEEDED.items():
        found = None
        for attempt in range(3):
            try:
                r = requests.get(
                    f"{POWERAPPS_API}/providers/Microsoft.PowerApps/apis/{connector_name}/connections",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    params={"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'"},
                    timeout=120,
                )
            except requests.exceptions.Timeout:
                wait = 15 * (attempt + 1)
                print(f"  {display}: Timeout, retry {attempt+1}/3 (wait {wait}s)...")
                time.sleep(wait)
                continue

            if r.status_code == 504:
                wait = 15 * (attempt + 1)
                print(f"  {display}: GatewayTimeout, retry {attempt+1}/3 (wait {wait}s)...")
                time.sleep(wait)
                continue

            if r.ok:
                for conn in r.json().get("value", []):
                    statuses = conn.get("properties", {}).get("statuses", [])
                    if any(s.get("status") == "Connected" for s in statuses):
                        found = conn["name"]
                        break
            break

        # フォールバック: API タイムアウト時に既知の接続 ID を使用
        if not found and connector_name in FALLBACK_CONNECTIONS:
            found = FALLBACK_CONNECTIONS[connector_name]
            print(f"  ⚠️  {display}: API タイムアウト → フォールバック接続使用: {found}")

        if not found:
            print(f"  ❌ {display} ({connector_name}): 接続が見つかりません")
            print(f"     → https://make.powerautomate.com/connections で作成してください")
            sys.exit(1)

        connections[connector_name] = found
        print(f"  ✅ {display}: {found}")

    return connections


# ── 接続参照 ──────────────────────────────────────────────

def create_connection_reference(logical_name, display_name, connector_id, connection_id):
    """接続参照をソリューション内に作成する（べき等パターン）"""
    print(f"\n  接続参照: {display_name} ({logical_name})")

    session = get_session()
    r = session.get(
        f"{API}/connectionreferences?"
        f"$filter=connectionreferencelogicalname eq '{logical_name}'"
        f"&$select=connectionreferenceid,connectionreferencelogicalname,connectionid"
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        ref_id = existing[0]["connectionreferenceid"]
        print(f"    既存: {ref_id}")
        current_conn = existing[0].get("connectionid", "")
        if current_conn != connection_id:
            print(f"    接続を更新: → {connection_id}")
            rp = session.patch(
                f"{API}/connectionreferences({ref_id})",
                json={"connectionid": connection_id},
            )
            if rp.ok:
                print(f"    ✅ 接続を紐づけました")
            else:
                print(f"    ⚠️  接続更新失敗 ({rp.status_code}): {rp.text[:200]}")
        return ref_id

    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": connector_id,
        "connectionid": connection_id,
    }

    def _create():
        s = get_session()
        s.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
        resp = s.post(f"{API}/connectionreferences", json=body)
        resp.raise_for_status()
        return resp

    result = retry_metadata(_create, f"接続参照 {logical_name}")
    if result and hasattr(result, "headers"):
        odata_id = result.headers.get("OData-EntityId", "")
        ref_id = odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else "unknown"
        print(f"    ✅ 作成成功: {ref_id}")
        return ref_id
    return None


# ── フロー定義構築 ─────────────────────────────────────────

def build_clientdata(connections: dict, connref_dv: str, connref_sp: str) -> str:
    """フロー定義を構築 — AI Builder aibuilderpredict_customprompt 使用

    UI が生成する実際のフロー定義構造に準拠:
    - connectionReferences: runtimeSource + connectionReferenceLogicalName 形式
    - AI Builder: operationId=aibuilderpredict_customprompt（PerformBoundAction は不可）
    - AI 出力パス: body/responsev2/predictionOutput/text
    """

    CN_DV = "shared_commondataserviceforapps"
    CN_SP = "shared_sharepointonline"
    # AI Builder 用の Dataverse 接続参照は別キーで登録
    CN_DV_AI = "shared_commondataserviceforapps_1"

    # カテゴリフィルタ — AI 出力のカテゴリ名で動的検索
    category_filter = PREFIX + "_name eq '@{body('Parse_AI_Output')?['category']}'"

    # odata.bind 式
    category_bind = (
        "/" + PREFIX + "_incidentcategories(@{first(outputs('List_Categories')?['body/value'])?['"
        + PREFIX + "_incidentcategoryid']})"
    )

    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$connections": {"defaultValue": {}, "type": "Object"},
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
        },
        "triggers": {
            "When_a_file_is_created": {
                "type": "OpenApiConnectionNotification",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_SP}",
                        "connectionName": CN_SP,
                        "operationId": "OnNewFile",
                    },
                    "parameters": {
                        "dataset": SP_SITE_URL,
                        "folderId": SP_FOLDER_PATH,
                        "inferContentType": True,
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
        "actions": {
            # 1. ファイルコンテンツ取得
            "Get_file_content": {
                "type": "OpenApiConnection",
                "runAfter": {},
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_SP}",
                        "connectionName": CN_SP,
                        "operationId": "GetFileContentByPath",
                    },
                    "parameters": {
                        "dataset": SP_SITE_URL,
                        "path": "@triggerOutputs()?['body/{Path}']",
                        "inferContentType": True,
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
            # 2. ファイル名を抽出
            "Compose_Filename": {
                "type": "Compose",
                "runAfter": {},
                "inputs": "@triggerOutputs()?['body/{FilenameWithExtension}']",
            },
            # 3. AI Builder「プロンプトを実行する」
            "Run_AI_Prompt": {
                "type": "OpenApiConnection",
                "runAfter": {
                    "Get_file_content": ["Succeeded"],
                    "Compose_Filename": ["Succeeded"],
                },
                "inputs": {
                    "host": {
                        "connectionName": CN_DV_AI,
                        "operationId": "aibuilderpredict_customprompt",
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_DV}",
                    },
                    "parameters": {
                        "recordId": AI_MODEL_ID,
                        "item/requestv2/filename": "@outputs('Compose_Filename')",
                        "item/requestv2/document/base64Encoded": "@body('Get_file_content')",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
            # 4. AI 出力パース
            "Parse_AI_Output": {
                "type": "ParseJson",
                "runAfter": {"Run_AI_Prompt": ["Succeeded"]},
                "inputs": {
                    "content": "@outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/text']",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "summary": {"type": "string"},
                            "category": {"type": "string"},
                        },
                    },
                },
            },
            # 5. カテゴリ検索（AI 判定結果で動的検索）
            "List_Categories": {
                "type": "OpenApiConnection",
                "runAfter": {"Parse_AI_Output": ["Succeeded"]},
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_DV}",
                        "connectionName": CN_DV,
                        "operationId": "ListRecords",
                    },
                    "parameters": {
                        "entityName": f"{PREFIX}_incidentcategories",
                        "$filter": category_filter,
                        "$top": 1,
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
            # 6. インシデント作成（AI タイトル＋要約で登録）
            "Create_Incident": {
                "type": "OpenApiConnection",
                "runAfter": {"List_Categories": ["Succeeded"]},
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_DV}",
                        "connectionName": CN_DV,
                        "operationId": "CreateRecord",
                    },
                    "parameters": {
                        "entityName": f"{PREFIX}_incidents",
                        "item": {
                            f"{PREFIX}_name": "@body('Parse_AI_Output')?['title']",
                            f"{PREFIX}_description": "@body('Parse_AI_Output')?['summary']",
                            f"{PREFIX}_status": 100000000,
                            f"{PREFIX}_CategoryId@odata.bind": category_bind,
                        },
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
    }

    # connectionReferences — UI が生成する runtimeSource 形式に準拠
    connection_references = {
        CN_SP: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_sp,
            },
            "api": {
                "name": CN_SP,
            },
        },
        CN_DV: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_dv,
            },
            "api": {
                "name": CN_DV,
            },
        },
        CN_DV_AI: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_dv,
            },
            "api": {
                "name": CN_DV,
            },
        },
    }

    clientdata = {
        "properties": {
            "definition": definition,
            "connectionReferences": connection_references,
        },
        "schemaVersion": "1.0.0.0",
    }
    return json.dumps(clientdata, ensure_ascii=False)


# ── メイン ─────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Power Automate フローデプロイ（Dataverse workflows 方式）")
    print(f"  フロー名: {FLOW_DISPLAY_NAME}")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print("=" * 60)

    # Step 0: 環境 ID 解決
    env_id = resolve_environment_id()

    # Step 1: 接続検索
    connections = find_connections(env_id)

    # Step 2: 接続参照の作成（ソリューション内）
    print("\n=== Step 2: 接続参照の作成 ===")
    connref_dv = create_connection_reference(
        logical_name=CONNREF_DATAVERSE,
        display_name="Dataverse (SP インシデント登録)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
        connection_id=connections["shared_commondataserviceforapps"],
    )
    connref_sp = create_connection_reference(
        logical_name=CONNREF_SHAREPOINT,
        display_name="SharePoint Online (SP インシデント登録)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
        connection_id=connections["shared_sharepointonline"],
    )

    # Step 3: 既存フロー検索（べき等パターン）
    print("\n=== Step 3: 既存フロー検索 ===")
    session = get_session()
    r = session.get(
        f"{API}/workflows?"
        f"$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5"
        f"&$select=workflowid,name,statecode"
    )
    r.raise_for_status()
    existing = r.json().get("value", [])

    if existing:
        wf_id = existing[0]["workflowid"]
        print(f"  既存フロー発見: {wf_id}")
        print("  → 無効化 → 削除 → 再作成")
        session.patch(
            f"{API}/workflows({wf_id})",
            json={"statecode": 0, "statuscode": 1},
        )
        rd = session.delete(f"{API}/workflows({wf_id})")
        if rd.ok:
            print(f"  削除完了: {wf_id}")
        else:
            print(f"  削除失敗 ({rd.status_code}): {rd.text[:300]}")

    # Step 4: フロー作成
    print("\n=== Step 4: フロー作成 ===")
    clientdata = build_clientdata(connections, CONNREF_DATAVERSE, CONNREF_SHAREPOINT)

    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": clientdata,
        "description": (
            "SharePoint にファイルが追加されると AI Builder で内容を解析し、"
            "要約・カテゴリ判定してインシデントを自動登録するフロー"
        ),
    }

    session_sol = get_session()
    session_sol.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    r2 = session_sol.post(f"{API}/workflows", json=workflow_body)

    if not r2.ok:
        print(f"  ❌ 作成失敗 ({r2.status_code}): {r2.text[:500]}")
        debug_path = "scripts/flow_sp_incident_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON: {debug_path}")
        sys.exit(1)

    location = r2.headers.get("OData-EntityId", "")
    wf_id = location.split("(")[-1].rstrip(")") if "(" in location else "unknown"
    print(f"  ✅ フロー作成成功 (Draft)")
    print(f"  Workflow ID: {wf_id}")

    # Step 5: フロー有効化
    print("\n=== Step 5: フロー有効化 ===")
    ra = get_session().patch(
        f"{API}/workflows({wf_id})",
        json={"statecode": 1, "statuscode": 2},
    )
    if ra.ok:
        print(f"  ✅ フロー有効化成功!")
    else:
        print(f"  ⚠️  API 有効化失敗 ({ra.status_code}): {ra.text[:200]}")
        print(f"  → Power Automate UI でフローを開き「オンにする」をクリックしてください")
        print(f"     https://make.powerautomate.com/")

    # Step 6: 確認
    print("\n=== Step 6: 確認 ===")
    session2 = get_session()
    r3 = session2.get(
        f"{API}/workflows?"
        f"$filter=name eq '{FLOW_DISPLAY_NAME}' and category eq 5"
        f"&$select=workflowid,name,statecode,statuscode"
    )
    r3.raise_for_status()
    flows = r3.json().get("value", [])
    if flows:
        fl = flows[0]
        state = "有効" if fl["statecode"] == 1 else "無効(Draft)"
        print(f"  ✅ {fl['name']} (ID: {fl['workflowid']}) — {state}")
    else:
        print("  ⚠️  フローが見つかりません")

    print("\n✅ 完了!")
    print(f"  トリガー: SharePoint ({SP_SITE_URL}) の {SP_FOLDER_PATH} にファイル追加時")
    print("  アクション: ファイル取得 → AI Builder 要約 → カテゴリ判定 → インシデント作成")
    print()
    print("  ★ AI Builder 「プロンプトを実行する」含む全アクションを API で定義済み。")
    print(f"  ★ operationId: aibuilderpredict_customprompt, Model: {AI_MODEL_ID}")


if __name__ == "__main__":
    main()
