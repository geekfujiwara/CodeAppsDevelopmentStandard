# AI Builder + Power Automate 連携リファレンス

Power Automate フロー内で AI Builder プロンプト (`aibuilderpredict_customprompt`) を呼び出し、
Dataverse レコードの自動分析・自動更新を行うパターン。

## デプロイ順序【必須】

```
1. AI Model を作成 + AIModelPublish でアクティブ化（MUST BE FIRST）
2. 接続参照を作成（Dataverse コネクタ用）
3. フロー定義を構築してデプロイ
4. フローを有効化
5. Webhook /start を呼び出し（Dataverse トリガーの場合）

★ Model が Active でないとフロー有効化が失敗する
  → "GetPredictionSchema failed with BadRequest"
```

## フロー定義の構造

### 接続参照の構成（2 つ必要）

AI Builder 呼び出しには Dataverse コネクタの接続参照が **2 つ** 必要:

```python
# 1. メインの Dataverse 接続（トリガー・レコード操作用）
CONNREF_DV = f"{PREFIX}_sharedcommondataserviceforapps_{FEATURE_NAME}"

# 2. AI Builder 用の Dataverse 接続（aibuilderpredict 用）
CONNREF_DV_AI = f"{PREFIX}_sharedcommondataserviceforapps_{FEATURE_NAME}_ai"
```

### connectionReferences セクション

```python
clientdata = {
    "properties": {
        "definition": flow_definition,
        "connectionReferences": {
            # メイン接続（トリガー・ListRecords・GetItem・UpdateRecord）
            CONNECTOR_DV: {
                "runtimeSource": "embedded",
                "connection": {"connectionReferenceLogicalName": CONNREF_DV},
                "api": {"name": CONNECTOR_DV},
            },
            # AI Builder 用接続（aibuilderpredict_customprompt）
            f"{CONNECTOR_DV}_1": {
                "runtimeSource": "embedded",
                "connection": {"connectionReferenceLogicalName": CONNREF_DV_AI},
                "api": {"name": CONNECTOR_DV},
            },
        },
    },
    "schemaVersion": "1.0.0.0",
}
```

### aibuilderpredict_customprompt アクション

```python
{
    "Run_AI_Prompt": {
        "type": "OpenApiConnection",
        "inputs": {
            "host": {
                "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                "operationId": "aibuilderpredict_customprompt",
                "connectionName": f"{CONNECTOR_DV}_1",  # ★ AI Builder 用接続を使う
            },
            "parameters": {
                "recordId": ai_model_id,  # ★ Active な msdyn_aimodel の GUID
                "item/requestv2/input_var_name": "@{...}",  # 入力変数
            },
            "authentication": "@parameters('$authentication')",
        },
        "runAfter": {"Previous_Action": ["Succeeded"]},
    },
}
```

### レスポンスの参照

```
# テキスト出力の場合
@outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/text']

# JSON 出力の場合も同じパスで JSON 文字列が返る
```

## ★ f-string 必須ルール（dict キーに動的値）

Python の dict キーに変数を含める場合、**f-string が必須**:

```python
# ❌ 誤り — PREFIX が展開されない
parameters = {
    "item/{PREFIX}_aiinsights": "..."  # → リテラル文字列 "{PREFIX}_aiinsights" になる
}

# ✅ 正解 — f-string で変数を展開
parameters = {
    f"item/{PREFIX}_aiinsights": "..."  # → "item/geek_aiinsights" になる
}
```

このバグはエラーメッセージが明確:
```
does not contain a definition for parameter 'item/{PREFIX}_aiinsights'
```

## 接続の検索（PowerApps API）

```python
def find_dataverse_connection(env_id: str) -> str:
    """PowerApps API で Dataverse 接続を検索（リトライ付き）"""
    token = get_token(scope="https://service.powerapps.com/.default")  # ★ PowerApps スコープ
    for attempt in range(3):
        try:
            r = requests.get(
                f"https://api.powerapps.com/providers/Microsoft.PowerApps"
                f"/apis/{CONNECTOR_DV}/connections",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "api-version": "2016-11-01",
                    "$filter": f"environment eq '{env_id}'",
                },
                timeout=120,  # ★ 長めのタイムアウト必須
            )
        except requests.exceptions.Timeout:
            time.sleep(15 * (attempt + 1))
            continue
        if r.status_code == 504:  # ★ 504 が頻発する
            time.sleep(15 * (attempt + 1))
            continue
        if r.ok:
            for conn in r.json().get("value", []):
                status = conn.get("properties", {}).get("statuses", [{}])[0].get("status", "")
                if status == "Connected":
                    return conn["name"]
            break
    raise RuntimeError("Dataverse 接続が見つかりません")
```

## 環境 ID の解決

```python
def resolve_environment_id() -> str:
    """DATAVERSE_URL から環境 ID を逆引き"""
    token = get_token(scope="https://service.flow.microsoft.com/.default")  # ★ Flow スコープ
    r = requests.get(
        "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments"
        "?api-version=2016-11-01",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    r.raise_for_status()
    dv_url = DATAVERSE_URL.rstrip("/")
    for env in r.json().get("value", []):
        instance_url = (
            env.get("properties", {})
            .get("linkedEnvironmentMetadata", {})
            .get("instanceUrl", "")
            or ""
        ).rstrip("/")
        if instance_url == dv_url:
            return env["name"]
    raise RuntimeError(f"環境が見つかりません: {dv_url}")
```

## フロー有効化 + Webhook 登録

```python
# フロー有効化（statecode=1, statuscode=2）
api_patch(f"workflows({workflow_id})", {"statecode": 1, "statuscode": 2})

# Dataverse WebHook トリガーの場合は /start が必要
token = get_token(scope="https://service.flow.microsoft.com/.default")
requests.post(
    f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple"
    f"/environments/{env_id}/flows/{workflow_id}/start?api-version=2016-11-01",
    headers={"Authorization": f"Bearer {token}"},
    timeout=60,
)
```

## API スコープの使い分け（重要）

| 操作 | スコープ |
|------|----------|
| Dataverse API（テーブル操作） | DATAVERSE_URL + `/.default`（auth_helper デフォルト） |
| Flow API（環境一覧、フロー /start） | `https://service.flow.microsoft.com/.default` |
| PowerApps API（接続検索） | `https://service.powerapps.com/.default` |

## Dataverse WebHook トリガー定義

```python
{
    "triggers": {
        "When_record_changed": {
            "type": "OpenApiConnectionWebhook",
            "inputs": {
                "host": {
                    "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR_DV}",
                    "connectionName": CONNECTOR_DV,
                    "operationId": "SubscribeWebhookTrigger",
                },
                "parameters": {
                    "subscriptionRequest/message": 4,  # 1=Create, 2=Delete, 3=Update, 4=Create+Update
                    "subscriptionRequest/entityname": f"{PREFIX}_tablename",
                    "subscriptionRequest/scope": 4,    # Organization
                    "subscriptionRequest/filteringattributes": "col1,col2,col3",
                    "subscriptionRequest/runas": 3,    # Modifying user
                },
                "authentication": "@parameters('$authentication')",
            },
        },
    },
}
```

## 完全なデプロイスクリプト構造

```python
"""
AI Builder + Power Automate 統合デプロイ
"""
import json, os, time, requests
from dotenv import load_dotenv
load_dotenv()
from auth_helper import api_get, api_post, api_patch, api_delete, get_token, DATAVERSE_URL

# ── Phase 1: AI Builder Model デプロイ ──
def deploy_ai_model() -> str:
    # 1. べき等チェック（既存 Active Model 検索）
    # 2. Model 作成 (msdyn_TemplateId@odata.bind)
    # 3. AIModelPublish (1ステップ Active 化)
    # 4. 検証 (statecode == 1)
    ...

# ── Phase 2: Power Automate フロー デプロイ ──
def deploy_flow(env_id: str, ai_model_id: str) -> str:
    # 1. 接続検索 (PowerApps API, リトライ付き)
    # 2. 接続参照作成 (2つ: メイン + AI Builder)
    # 3. フロー定義構築 + POST (workflows テーブル)
    # 4. 有効化 + /start
    ...

# ── メイン ──
def main():
    model_id = deploy_ai_model()
    env_id = resolve_environment_id()
    deploy_flow(env_id, model_id)

if __name__ == "__main__":
    main()
```

## トラブルシューティング

### フロー有効化失敗

| エラー | 原因 | 対策 |
|--------|------|------|
| `GetPredictionSchema failed with BadRequest` | Model が Draft | 先に AIModelPublish |
| `does not contain a definition for parameter` | f-string 忘れ | dict キーを f"..." に |
| `InvalidOpenApiFlow` (0x80060467) | 操作パラメータ不正 | 操作スキーマを確認 |
| 504 Gateway Timeout（接続検索） | PowerApps API が遅い | 3回リトライ + timeout=120 |

### 接続参照作成失敗

| エラー | 原因 | 対策 |
|--------|------|------|
| 接続が見つからない | 環境に接続未作成 | Power Automate UI で事前作成 |
| connectionid が空 | 接続ステータスが Connected でない | UI で再認証 |

### Teams PostMessageToConversation 注意

```
❌ body/subject パラメータを指定 → InvalidOpenApiFlow
   操作スキーマに body/subject は存在しない

✅ 使用可能パラメータのみ:
   - poster
   - location
   - body/recipient/groupId
   - body/recipient/channelId
   - body/messageBody
```
