"""
3つの問題を修正:
1. フローを Flow API 経由で有効化
2. 正しい Flow API ID を取得して ExternalTriggerComponent を更新
3. エージェントを再公開
"""
import json
import sys
import os
import time
import uuid

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))
from auth_helper import (
    DATAVERSE_URL,
    api_delete,
    api_get,
    api_patch,
    api_post,
    flow_api_call,
    get_token,
)
import requests
from dotenv import load_dotenv
load_dotenv()

BOT_ID = os.getenv("BOT_ID", "")
BOT_SCHEMA = os.getenv("BOT_SCHEMA", "")
SOLUTION_NAME = os.getenv("SOLUTION_NAME", "IncidentManagement")
WF_ID = os.getenv("WF_ID", "")


def resolve_env_id():
    """DATAVERSE_URL から Flow API 用の環境 ID を解決"""
    print("  環境 ID を解決中...")
    envs = flow_api_call("GET", "/providers/Microsoft.ProcessSimple/environments")
    for env in envs.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        if instance_url == DATAVERSE_URL:
            env_id = env["name"]
            print(f"  ✅ 環境 ID: {env_id}")
            return env_id
    raise RuntimeError(f"環境が見つかりません: {DATAVERSE_URL}")


# グローバル変数として解決
ENV_ID = None


def step1_activate_flow():
    """Flow API 経由でフローを有効化"""
    print("=" * 60)
    print("Step 1: フローの有効化（Flow API 経由）")
    print("=" * 60)

    # まず Flow API でフローを検索
    result = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows",
    )

    flow_api_id = None
    for flow in result.get("value", []):
        props = flow.get("properties", {})
        if props.get("workflowEntityId") == WF_ID:
            flow_api_id = flow["name"]
            state = props.get("state", "Unknown")
            print(f"  Flow API ID: {flow_api_id}")
            print(f"  現在の状態: {state}")
            break

    if not flow_api_id:
        # フローが Draft の場合、Flow API に未反映の可能性がある
        # Dataverse API で直接有効化を再試行
        print("  Flow API にフローが見つかりません。Dataverse API で有効化を試行...")
        try:
            api_patch(f"workflows({WF_ID})", {"statecode": 1, "statuscode": 2})
            print("  ✅ Dataverse API での有効化成功")
            # 反映を待つ
            time.sleep(5)
            # 再検索
            result = flow_api_call(
                "GET",
                f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows",
            )
            for flow in result.get("value", []):
                props = flow.get("properties", {})
                if props.get("workflowEntityId") == WF_ID:
                    flow_api_id = flow["name"]
                    print(f"  ✅ Flow API ID: {flow_api_id}")
                    break
        except Exception as e:
            err_text = ""
            if hasattr(e, "response") and e.response is not None:
                err_text = e.response.text[:500]
            print(f"  ❌ Dataverse API 有効化も失敗: {e}")
            print(f"  レスポンス: {err_text}")

            # Flow API 経由で start を試みる
            print("  → Flow API 経由で有効化を試行...")
            result2 = flow_api_call(
                "GET",
                f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows",
            )
            for flow in result2.get("value", []):
                props = flow.get("properties", {})
                if props.get("workflowEntityId") == WF_ID:
                    flow_api_id = flow["name"]
                    break

            if flow_api_id:
                try:
                    flow_api_call(
                        "POST",
                        f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows/{flow_api_id}/start",
                    )
                    print(f"  ✅ Flow API start 成功")
                except Exception as e2:
                    print(f"  ❌ Flow API start 失敗: {e2}")
                    print("  → Power Automate UI で手動有効化してください")

    else:
        # Flow API でフローが見つかった - 有効化を試みる
        try:
            flow_api_call(
                "POST",
                f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows/{flow_api_id}/start",
            )
            print(f"  ✅ Flow API start 成功")
        except Exception as e:
            err_text = ""
            if hasattr(e, "response") and e.response is not None:
                err_text = e.response.text[:500]
            print(f"  ⚠️ Flow API start 失敗: {e}")
            print(f"  レスポンス: {err_text}")
            # Dataverse API での直接有効化
            try:
                api_patch(f"workflows({WF_ID})", {"statecode": 1, "statuscode": 2})
                print("  ✅ Dataverse API での有効化成功")
            except Exception as e2:
                err_text2 = ""
                if hasattr(e2, "response") and e2.response is not None:
                    err_text2 = e2.response.text[:500]
                print(f"  ❌ Dataverse API 有効化も失敗: {e2}")
                print(f"  レスポンス: {err_text2}")
                print("  → Power Automate UI で手動有効化してください")

    return flow_api_id


def step2_verify_flow_state():
    """フローの状態を再確認"""
    print("\n" + "=" * 60)
    print("Step 2: フロー状態の確認")
    print("=" * 60)

    wf = api_get(
        f"workflows({WF_ID})?$select=statecode,statuscode,name"
    )
    sc = wf.get("statecode")
    print(f"  statecode: {sc} ({'Activated' if sc == 1 else 'Draft'})")
    print(f"  statuscode: {wf.get('statuscode')}")
    return sc == 1


def step3_get_correct_flow_api_id():
    """正しい Flow API ID を取得"""
    print("\n" + "=" * 60)
    print("Step 3: 正しい Flow API ID の再取得")
    print("=" * 60)

    result = flow_api_call(
        "GET",
        f"/providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows",
    )

    for flow in result.get("value", []):
        props = flow.get("properties", {})
        if props.get("workflowEntityId") == WF_ID:
            flow_api_id = flow["name"]
            print(f"  Dataverse workflow ID: {WF_ID}")
            print(f"  Flow API ID: {flow_api_id}")
            if flow_api_id == WF_ID:
                print("  ⚠️ flowId と flowName が同一（通常は異なる）")
            else:
                print("  ✅ flowId ≠ flowName（正常）")
            return flow_api_id

    print("  ❌ Flow API でフローが見つかりません")
    return None


def step4_fix_external_trigger(flow_api_id):
    """ExternalTriggerComponent を正しいフォーマットで再作成"""
    print("\n" + "=" * 60)
    print("Step 4: ExternalTriggerComponent の修正")
    print("=" * 60)

    # 既存の Outlook トリガーを削除
    existing = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{BOT_ID}' and componenttype eq 17"
        "&$select=botcomponentid,name,schemaname,data"
    )

    for comp in existing.get("value", []):
        data = comp.get("data", "")
        if "Office 365 Outlook" in data:
            comp_id = comp["botcomponentid"]
            print(f"  既存メールトリガー削除: {comp_id}")
            api_delete(f"botcomponents({comp_id})")

    trigger_guid = str(uuid.uuid4())
    prefix = "eml"
    schema = f"{BOT_SCHEMA}.ExternalTriggerComponent.{prefix}.{trigger_guid}"

    # 既存の動作しているトリガーと同じ YAML フォーマットに合わせる
    # kind: の後はシングル改行、flowId: の後はダブル改行
    data_yaml = (
        "kind: ExternalTriggerConfiguration\n"
        "externalTriggerSource:\n"
        "  kind: WorkflowExternalTrigger\n"
        f"  flowId: {WF_ID}\n"
        "\n"
        "extensionData:\n"
        f"  flowName: {flow_api_id}\n"
        f"  flowUrl: /providers/Microsoft.ProcessSimple/environments/{ENV_ID}/flows/{flow_api_id}\n"
        "  triggerConnectionType: Office 365 Outlook\n"
    )

    print(f"  YAML データ:\n{data_yaml}")

    body = {
        "name": "新しいメールが届いたとき (V3)",
        "componenttype": 17,
        "schemaname": schema,
        "data": data_yaml,
        "parentbotid@odata.bind": f"/bots({BOT_ID})",
    }

    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MSCRM.SolutionName": SOLUTION_NAME,
    }

    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/botcomponents",
        headers=headers,
        json=body,
    )

    if r.ok:
        print(f"  ✅ ExternalTriggerComponent 再登録成功")
        print(f"     schema: {schema}")
    else:
        print(f"  ❌ 登録失敗: {r.status_code}")
        print(f"  {r.text[:1000]}")


def step5_publish_bot():
    """エージェントを公開して公開日を確認"""
    print("\n" + "=" * 60)
    print("Step 5: エージェントの再公開")
    print("=" * 60)

    # 公開前の日時
    bot_before = api_get(f"bots({BOT_ID})?$select=publishedon")
    print(f"  公開前 publishedon: {bot_before.get('publishedon')}")

    try:
        api_post(f"bots({BOT_ID})/Microsoft.Dynamics.CRM.PvaPublish", {})
        print("  PvaPublish 呼び出し完了")
    except Exception as e:
        err_text = ""
        if hasattr(e, "response") and e.response is not None:
            err_text = e.response.text[:500]
        print(f"  ❌ PvaPublish 失敗: {e}")
        print(f"  レスポンス: {err_text}")
        return

    # 公開処理の反映を待つ
    time.sleep(5)

    bot_after = api_get(f"bots({BOT_ID})?$select=publishedon")
    print(f"  公開後 publishedon: {bot_after.get('publishedon')}")

    if bot_before.get("publishedon") != bot_after.get("publishedon"):
        print("  ✅ 公開日が更新されました")
    else:
        print("  ⚠️ 公開日が変わっていません。もう少し待って確認...")
        time.sleep(10)
        bot_after2 = api_get(f"bots({BOT_ID})?$select=publishedon")
        print(f"  再確認 publishedon: {bot_after2.get('publishedon')}")
        if bot_before.get("publishedon") != bot_after2.get("publishedon"):
            print("  ✅ 公開日が更新されました")
        else:
            print("  ⚠️ 公開日が更新されていません。Copilot Studio UI で手動公開してください")


def main():
    global ENV_ID
    print("🔧 3つの問題を修正します\n")

    # 環境 ID を解決
    ENV_ID = resolve_env_id()

    # Step 1: フローを有効化
    flow_api_id = step1_activate_flow()

    # Step 2: フロー状態確認
    is_active = step2_verify_flow_state()

    # Step 3: 正しい Flow API ID を取得
    correct_flow_api_id = step3_get_correct_flow_api_id()
    if not correct_flow_api_id:
        correct_flow_api_id = flow_api_id or WF_ID

    # Step 4: ExternalTriggerComponent を修正
    step4_fix_external_trigger(correct_flow_api_id)

    # Step 5: エージェント再公開
    step5_publish_bot()

    print("\n" + "=" * 60)
    print("完了サマリー")
    print("=" * 60)
    if not is_active:
        print("  ⚠️ フローがまだ Draft です。Power Automate UI で手動有効化してください:")
        print("     https://make.powerautomate.com → ソリューション → インシデント管理")
        print("     → Word日報出力 - メール受信トリガー → オンにする")


if __name__ == "__main__":
    main()
