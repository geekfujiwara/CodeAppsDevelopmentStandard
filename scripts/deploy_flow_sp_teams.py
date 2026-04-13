"""
Power Automate フローデプロイスクリプト — SharePoint ドキュメント要約 → Teams 通知
Dataverse workflows テーブル方式

★ ベストプラクティス: PDF 変換パターン
AI Builder は PDF/画像 (jpeg, png, gif, pdf) のみ対応。
Office ドキュメント等は OneDrive for Business の ConvertFile で PDF 変換してから渡す。

SharePoint にファイルが追加されたら:
  1. ファイルコンテンツを取得
  2. OneDrive for Business の /temp に一時保存
  3. OneDrive ConvertFile で PDF に変換
  4. AI Builder「プロンプトを実行する」で要約
  5. Teams チャネルに要約を投稿
  6. OneDrive の一時ファイルを削除

OneDrive ConvertFile の PDF 変換対応形式 (https://aka.ms/onedriveconversions):
  doc, docx, epub, eml, htm, html, md, msg, odp, ods, odt,
  pps, ppsx, ppt, pptx, rtf, tif, tiff, xls, xlsm, xlsx

使い方:
  1. .env に DATAVERSE_URL, TENANT_ID を設定
  2. 接続を事前作成: SharePoint, Dataverse, Teams, OneDrive for Business
     https://make.powerautomate.com/connections
  3. python scripts/deploy_flow_sp_teams.py
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
FLOW_DISPLAY_NAME = "SharePoint ドキュメント要約 Teams 通知"

# SharePoint 設定（.env から取得）
SP_SITE_URL = os.environ.get("SP_SITE_URL", "https://YOUR_TENANT.sharepoint.com/sites/YOUR_SITE")
SP_LIBRARY_ID = os.environ.get("SP_LIBRARY_ID", "")
SP_FOLDER_PATH = os.environ.get("SP_FOLDER_PATH", "/Shared Documents/All")

# AI Builder Model ID（.env から取得）
AI_MODEL_ID = os.environ.get("AI_MODEL_ID", "")

# Teams 設定（.env から取得）
TEAMS_GROUP_ID = os.environ.get("TEAMS_GROUP_ID", "")
TEAMS_CHANNEL_ID = os.environ.get("TEAMS_CHANNEL_ID", "")

# OneDrive for Business 一時フォルダ（PDF 変換用）
ONEDRIVE_TEMP_FOLDER = "/temp"

# 接続参照の論理名
CONNREF_DATAVERSE = f"{PREFIX}_connref_dataverse_spteams"
CONNREF_SHAREPOINT = f"{PREFIX}_connref_sharepoint_spteams"
CONNREF_TEAMS = f"{PREFIX}_connref_teams_spteams"
CONNREF_ONEDRIVE = f"{PREFIX}_connref_onedrive_spteams"

# ── 接続検索 ──────────────────────────────────────────────

FLOW_API = "https://api.flow.microsoft.com"
POWERAPPS_API = "https://api.powerapps.com"

CONNECTORS_NEEDED = {
    "shared_commondataserviceforapps": "Dataverse",
    "shared_sharepointonline": "SharePoint Online",
    "shared_teams": "Microsoft Teams",
    "shared_onedriveforbusiness": "OneDrive for Business",
}

# PowerApps API がタイムアウトする場合のフォールバック接続 ID（.env から取得）
FALLBACK_CONNECTIONS = {
    "shared_commondataserviceforapps": os.environ.get("FALLBACK_CONN_DATAVERSE", ""),
    "shared_sharepointonline": os.environ.get("FALLBACK_CONN_SHAREPOINT", ""),
    "shared_teams": os.environ.get("FALLBACK_CONN_TEAMS", ""),
    "shared_onedriveforbusiness": os.environ.get("FALLBACK_CONN_ONEDRIVE", ""),
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
        iu = (
            env.get("properties", {})
            .get("linkedEnvironmentMetadata", {})
            .get("instanceUrl", "")
            or ""
        ).rstrip("/")
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
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    params={
                        "api-version": "2016-11-01",
                        "$filter": f"environment eq '{env_id}'",
                    },
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
            print(
                f"     → https://make.powerautomate.com/connections で作成してください"
            )
            sys.exit(1)

        connections[connector_name] = found
        print(f"  ✅ {display}: {found}")

    return connections


# ── 接続参照 ──────────────────────────────────────────────


def create_connection_reference(
    logical_name, display_name, connector_id, connection_id
):
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
                print(
                    f"    ⚠️  接続更新失敗 ({rp.status_code}): {rp.text[:200]}"
                )
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
        ref_id = (
            odata_id.split("(")[-1].rstrip(")") if "(" in odata_id else "unknown"
        )
        print(f"    ✅ 作成成功: {ref_id}")
        return ref_id
    return None


# ── フロー定義構築 ─────────────────────────────────────────


def build_clientdata(
    connections: dict, connref_dv: str, connref_sp: str, connref_teams: str,
    connref_onedrive: str,
) -> str:
    """フロー定義を構築 — ベストプラクティス: OneDrive PDF 変換 + AI Builder

    AI Builder は PDF/画像のみ対応。Office ドキュメント等は OneDrive for Business の
    ConvertFile アクションで事前に PDF 変換する。

    フロー構成:
      1. GetOnNewFileItems — SP でファイル作成を検知（Polling 1分）
      2. GetFileContent — ファイルコンテンツ取得
      3. CreateFile — OneDrive /temp に一時保存
      4. ConvertFile — PDF に変換
      5. aibuilderpredict_customprompt — AI Builder で要約
      6. PostMessageToConversation — Teams に投稿
      7. DeleteFile — OneDrive 一時ファイル削除

    OneDrive ConvertFile の PDF 変換対応形式 (https://aka.ms/onedriveconversions):
      doc, docx, epub, eml, htm, html, md, msg, odp, ods, odt,
      pps, ppsx, ppt, pptx, rtf, tif, tiff, xls, xlsm, xlsx
    """

    CN_DV = "shared_commondataserviceforapps"
    CN_SP = "shared_sharepointonline"
    CN_TEAMS = "shared_teams"
    CN_DV_AI = "shared_commondataserviceforapps_1"
    CN_ONEDRIVE = "shared_onedriveforbusiness"

    # Teams 投稿メッセージ — AI 出力を structuredOutput から直接参照
    teams_message_body = (
        "<h3>📄 新規ドキュメント要約</h3>"
        "<hr>"
        "<p><strong>タイトル: "
        "@{outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/structuredOutput/title']}"
        "</strong></p>"
        "<p><strong>カテゴリ: "
        "@{outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/structuredOutput/category']}"
        "</strong></p>"
        "<p><strong>📝 要約: "
        "@{outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/structuredOutput/summary']}"
        "</strong></p>"
        "<p></p>"
        "<hr>"
        "<p>📎 ファイル名: @{triggerBody()?['{FilenameWithExtension}']}</p>"
    )

    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$connections": {"defaultValue": {}, "type": "Object"},
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
        },
        "triggers": {
            # Polling 型トリガー（プロパティのみ取得）— 1 分間隔
            "ファイルが作成されたとき_(プロパティのみ)": {
                "recurrence": {"interval": 1, "frequency": "Minute"},
                "splitOn": "@triggerOutputs()?['body/value']",
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_SP}",
                        "operationId": "GetOnNewFileItems",
                        "connectionName": CN_SP,
                    },
                    "parameters": {
                        "dataset": SP_SITE_URL,
                        "table": SP_LIBRARY_ID,
                        "folderPath": SP_FOLDER_PATH,
                    },
                },
            },
        },
        "actions": {
            # 1. ファイルコンテンツ取得（Identifier で取得）
            "ファイル_コンテンツの取得": {
                "runAfter": {},
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_SP}",
                        "operationId": "GetFileContent",
                        "connectionName": CN_SP,
                    },
                    "parameters": {
                        "dataset": SP_SITE_URL,
                        "id": "@triggerBody()?['{Identifier}']",
                        "inferContentType": True,
                    },
                },
            },
            # 2. OneDrive に一時ファイル作成
            "ファイルの作成": {
                "runAfter": {"ファイル_コンテンツの取得": ["Succeeded"]},
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_ONEDRIVE}",
                        "operationId": "CreateFile",
                        "connectionName": CN_ONEDRIVE,
                    },
                    "parameters": {
                        "folderPath": ONEDRIVE_TEMP_FOLDER,
                        "name": "@triggerBody()?['{FilenameWithExtension}']",
                        "body": "@body('ファイル_コンテンツの取得')",
                    },
                },
            },
            # 3. PDF に変換（OneDrive ConvertFile）
            "ファイルの変換": {
                "runAfter": {"ファイルの作成": ["Succeeded"]},
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_ONEDRIVE}",
                        "operationId": "ConvertFile",
                        "connectionName": CN_ONEDRIVE,
                    },
                    "parameters": {
                        "id": "@outputs('ファイルの作成')?['body/Id']",
                        "type": "PDF",
                    },
                },
            },
            # 4. AI Builder「プロンプトを実行する」（変換後の PDF を渡す）
            "Run_AI_Prompt": {
                "runAfter": {"ファイルの変換": ["Succeeded"]},
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_DV}",
                        "operationId": "aibuilderpredict_customprompt",
                        "connectionName": CN_DV_AI,
                    },
                    "parameters": {
                        "recordId": AI_MODEL_ID,
                        "item/requestv2/filename": "@triggerBody()?['{FilenameWithExtension}']",
                        "item/requestv2/document/base64Encoded": "@body('ファイルの変換')",
                    },
                },
            },
            # 5. Teams チャネルに投稿
            "Post_to_Teams": {
                "runAfter": {"Run_AI_Prompt": ["Succeeded"]},
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_TEAMS}",
                        "operationId": "PostMessageToConversation",
                        "connectionName": CN_TEAMS,
                    },
                    "parameters": {
                        "poster": "Flow bot",
                        "location": "Channel",
                        "body/recipient/groupId": TEAMS_GROUP_ID,
                        "body/recipient/channelId": TEAMS_CHANNEL_ID,
                        "body/messageBody": teams_message_body,
                    },
                },
            },
            # 6. OneDrive 一時ファイル削除（クリーンアップ）
            "ファイルの削除": {
                "runAfter": {"Post_to_Teams": ["Succeeded"]},
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_ONEDRIVE}",
                        "operationId": "DeleteFile",
                        "connectionName": CN_ONEDRIVE,
                    },
                    "parameters": {
                        "id": "@outputs('ファイルの作成')?['body/Id']",
                    },
                },
            },
        },
    }

    # connectionReferences — runtimeSource + connectionReferenceLogicalName 形式
    connection_references = {
        CN_SP: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_sp,
            },
            "api": {"name": CN_SP},
        },
        CN_DV: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_dv,
            },
            "api": {"name": CN_DV},
        },
        CN_DV_AI: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_dv,
            },
            "api": {"name": CN_DV},
        },
        CN_TEAMS: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_teams,
            },
            "api": {"name": CN_TEAMS},
        },
        CN_ONEDRIVE: {
            "runtimeSource": "embedded",
            "connection": {
                "connectionReferenceLogicalName": connref_onedrive,
            },
            "api": {"name": CN_ONEDRIVE},
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
    print("  Power Automate フローデプロイ（AI Builder 検証）")
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
        display_name="Dataverse (SP Teams 通知)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
        connection_id=connections["shared_commondataserviceforapps"],
    )
    connref_sp = create_connection_reference(
        logical_name=CONNREF_SHAREPOINT,
        display_name="SharePoint Online (SP Teams 通知)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
        connection_id=connections["shared_sharepointonline"],
    )
    connref_teams = create_connection_reference(
        logical_name=CONNREF_TEAMS,
        display_name="Microsoft Teams (SP Teams 通知)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_teams",
        connection_id=connections["shared_teams"],
    )
    connref_onedrive = create_connection_reference(
        logical_name=CONNREF_ONEDRIVE,
        display_name="OneDrive for Business (PDF 変換)",
        connector_id="/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
        connection_id=connections["shared_onedriveforbusiness"],
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
    clientdata = build_clientdata(
        connections, CONNREF_DATAVERSE, CONNREF_SHAREPOINT, CONNREF_TEAMS,
        CONNREF_ONEDRIVE,
    )

    workflow_body = {
        "name": FLOW_DISPLAY_NAME,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": clientdata,
        "description": (
            "SharePoint にファイルが追加されると OneDrive で PDF 変換後、"
            "AI Builder で内容を要約し Teams チャネルに投稿するフロー"
        ),
    }

    session_sol = get_session()
    session_sol.headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
    r2 = session_sol.post(f"{API}/workflows", json=workflow_body)

    if not r2.ok:
        print(f"  ❌ フロー作成失敗 ({r2.status_code}): {r2.text[:500]}")
        debug_path = "scripts/flow_sp_teams_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(workflow_body, f, ensure_ascii=False, indent=2)
        print(f"  デバッグ JSON: {debug_path}")
        print("\n★ 検証結果: フロー作成（Draft）段階で失敗")
        sys.exit(1)

    location = r2.headers.get("OData-EntityId", "")
    wf_id = (
        location.split("(")[-1].rstrip(")") if "(" in location else "unknown"
    )
    print(f"  ✅ フロー作成成功 (Draft)")
    print(f"  Workflow ID: {wf_id}")
    print(f"\n★ 検証結果: AI Builder aibuilderpredict_customprompt を含むフロー定義の作成は【成功】")

    # Step 5: フロー有効化
    print("\n=== Step 5: フロー有効化 ===")
    ra = get_session().patch(
        f"{API}/workflows({wf_id})",
        json={"statecode": 1, "statuscode": 2},
    )
    if ra.ok:
        print(f"  ✅ フロー有効化成功!")
        print(f"\n★ 検証結果: フロー有効化も【成功】— InvalidOpenApiFlow は発生せず")
    else:
        error_text = ra.text[:500]
        print(f"  ⚠️  API 有効化失敗 ({ra.status_code}): {error_text}")
        if "InvalidOpenApiFlow" in error_text:
            print(f"\n★ 検証結果: フロー有効化で【InvalidOpenApiFlow 発生】")
            print(f"  → AI Builder アクションは API デプロイでは有効化不可")
        else:
            print(f"\n★ 検証結果: フロー有効化失敗（InvalidOpenApiFlow 以外の理由）")
        print(
            f"  → Power Automate UI でフローを開き「オンにする」をクリックしてください"
        )
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
    print(f"  トリガー: SharePoint GetOnNewFileItems (Polling 1分間隔)")
    print(f"  サイト: {SP_SITE_URL}")
    print(f"  ライブラリ ID: {SP_LIBRARY_ID}, フォルダ: {SP_FOLDER_PATH}")
    print(f"  アクション: ファイル取得 → OneDrive PDF変換 → AI Builder 要約 → Teams 投稿 → 一時ファイル削除")
    print(f"  PDF変換対応: doc,docx,ppt,pptx,xls,xlsx,epub,eml,htm,html,md,msg,odp,ods,odt等")
    print(f"  AI 出力参照: structuredOutput/{{key}} (ParseJson 不要)")
    print(f"  Teams 投稿先: groupId={TEAMS_GROUP_ID}")
    print(f"                channelId={TEAMS_CHANNEL_ID}")


if __name__ == "__main__":
    main()
