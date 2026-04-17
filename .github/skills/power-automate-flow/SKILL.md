---
name: power-automate-flow
description: "Power Automate クラウドフローを Dataverse Web API で作成・デプロイする。Use when: Power Automate, フロー作成, クラウドフロー, 接続参照, Connection Reference, workflow, トリガー, アクション, フローデプロイ, ステータス変更通知, メール通知"
---

# Power Automate クラウドフロー構築スキル

Dataverse Web API（workflow テーブル）で **ソリューション対応のクラウドフロー** を作成・デプロイする。

## 前提: 設計フェーズ完了後にデプロイに入る（必須）

**フローをデプロイする前に、フロー設計をユーザーに提示し承認を得ていること。**

設計提示時に含める内容:

| 項目           | 内容                                                               |
| -------------- | ------------------------------------------------------------------ |
| フロー名       | フローの名前と目的                                                 |
| トリガー       | 何をきっかけに実行するか（レコード変更時 / スケジュール / 手動等） |
| アクション一覧 | 条件分岐・メール送信・Teams 通知・データ更新等                     |
| 必要な接続     | 使用するコネクタ（Dataverse, Office 365 Outlook, Teams 等）        |
| 通知先・本文   | メールの宛先・件名・本文の概要                                     |

```
フロー: 設計提示 → ユーザー承認 → デプロイスクリプト実行
```

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME=IncidentManagement  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX=geek              ← ソリューション発行者の prefix
```

- フロー作成時は `MSCRM.SolutionUniqueName` ヘッダー必須
- 接続参照もソリューション内に作成（`MSCRM.SolutionUniqueName` ヘッダー）

> **認証**: Python スクリプトの認証は `power-platform-standard` スキルの `auth_helper.py` を使用。
> `from auth_helper import get_token, get_session, api_get, api_post, flow_api_call` で利用する。

- ソリューション外のフローは「マイフロー」に入り、ALM 管理できない

## 絶対遵守ルール

### 認証スコープが異なる（最重要）

```
Flow API:      https://service.flow.microsoft.com/.default
PowerApps API: https://service.powerapps.com/.default  ← 接続検索用
Graph API:     https://graph.microsoft.com/.default     ← ユーザー情報用
Dataverse API: https://{org}.crm7.dynamics.com/.default ← workflow テーブル操作用
```

### 接続は環境内に事前作成が必要

```
❌ API で接続の自動作成はできない
✅ Power Automate UI で事前に接続を作成 → API ではその接続 ID を参照するのみ
```

### 接続参照（Connection Reference）を使う

```
❌ connectionReferences に接続 ID を直接ハードコード（connectionName + source: "Embedded"）
   → ソリューション移行時に警告「接続ではなく接続参照を使用する必要があります」
   → 有効化失敗（AzureResourceManagerRequestFailed）になることがある

✅ connectionreferences テーブルに接続参照レコードを作成し、
   フロー定義で runtimeSource: "embedded" + connectionReferenceLogicalName で参照（★ 推奨）
   → ソリューション ALM 対応
   → 後述「Embedded 接続モードの 2 パターン」のパターン A を参照
```

### f-string と式の二重ブレース問題

```python
# ❌ f-string 内の Power Automate 式
body = f"@{{triggerOutputs()?['body/{PREFIX}_name']}}"
# ↑ f-string の {} エスケープと Power Automate の @{} が混在 → バグの原因

# ✅ f-string を使わない部分は通常文字列で構築
body_template = "@{triggerOutputs()?['body/{prefix}_name']}"
body = body_template.replace("{prefix}", PREFIX)

# ✅ または変数だけ f-string で、式部分は連結
body = f"<td>@{{triggerOutputs()?['body/{PREFIX}_name']}}</td>"
# ↑ 正しく動くが読みにくい。1箇所だけならOK、複数箇所は避ける
```

### べき等デプロイパターン

```python
# 既存フロー検索
existing = api_get("workflows",
    {"$filter": f"name eq '{FLOW_NAME}' and category eq 5"})

if existing["value"]:
    wf_id = existing["value"][0]["workflowid"]
    # 無効化 → 削除 → 再作成
    api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
    api_delete(f"workflows({wf_id})")

# 新規作成（Draft → Activate）
```

### フロー有効化が API で失敗するケースがある

```
❌ API で有効化: statecode=1, statuscode=2 → AzureResourceManagerRequestFailed
   → 接続の authenticatedUserObjectId が不足している場合に発生

✅ フォールバック: Power Automate UI で手動有効化
✅ 接続参照版を使えば有効化成功率が上がる
```

### AI Builder アクションは API で Draft 作成・有効化ともに可能

```
検証結果（operationId: aibuilderpredict_customprompt）:
  ✅ フロー作成（Draft） — AI Builder アクション含む定義の POST は成功
  ✅ フロー有効化（Activate） — statecode=1 の PATCH も成功

  ※ 前回の InvalidOpenApiFlow は AI Builder が原因ではなく、
    Teams PostMessageToConversation に body/subject（存在しないパラメータ）を
    指定していたことが原因だった。

推奨パターン:
  ✅ aibuilderpredict_customprompt を使用（PerformBoundAction は不可）
  ✅ connectionReferences に AI Builder 用 Dataverse 接続参照を別キーで登録
     CN_DV_AI = "shared_commondataserviceforapps_1"
  ✅ runtimeSource: "embedded" + connectionReferenceLogicalName でソリューション対応
  ✅ parameters: recordId（AI Model ID）, item/requestv2/... で入力を渡す
  ✅ AI 出力パス: body/responsev2/predictionOutput/text

NG パターン:
  ❌ PerformBoundAction / PerformUnboundAction + msdyn_PredictByReference
     → InvalidOpenApiFlow で作成自体が失敗する
```

### Teams PostMessageToConversation の注意

```
❌ body/subject パラメータを指定しない
   → PostMessageToConversation の operationSchema に body/subject は存在しない
   → 指定するとフロー有効化時に InvalidOpenApiFlow (0x80060467) が発生
   → エラーメッセージに具体的なパラメータ名が出ないため原因特定が困難

✅ 使用可能なパラメータ:
   poster, location, body/recipient/groupId, body/recipient/channelId, body/messageBody
```

### PowerApps API 接続検索のタイムアウト対策

PowerApps API（`api.powerapps.com`）での接続検索は 504 GatewayTimeout が頻発する。

```python
# ✅ リトライ + フォールバック接続 ID パターン
for attempt in range(3):
    try:
        r = requests.get(
            f"{POWERAPPS_API}/providers/Microsoft.PowerApps/apis/{connector}/connections",
            headers={"Authorization": f"Bearer {token}"},
            params={"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'"},
            timeout=120,
        )
    except requests.exceptions.Timeout:
        wait = 15 * (attempt + 1)
        time.sleep(wait)
        continue
    if r.status_code == 504:
        wait = 15 * (attempt + 1)
        time.sleep(wait)
        continue
    if r.ok:
        # Connected 状態の接続を抽出
        break

# フォールバック: 事前に確認済みの接続 ID を使用
if not found and connector in FALLBACK_CONNECTIONS:
    found = FALLBACK_CONNECTIONS[connector]
```

```
❌ タイムアウトで即座にエラー終了 → 一時的な問題で不必要に失敗
✅ 3 回リトライ（累進的 wait: 15s → 30s → 45s）
✅ フォールバック接続 ID をスクリプト上部に定義（事前に手動確認した値）
✅ timeout=120 を明示的に設定（デフォルトは無限待ち）
```

### 環境 ID の解決（Flow API / PowerApps API で必要）

PowerApps API での接続検索等には環境 ID が必要。DATAVERSE_URL から逆引きする。

```python
def resolve_environment_id() -> str:
    """Flow API で DATAVERSE_URL → 環境 ID を解決"""
    token = get_token(scope="https://service.flow.microsoft.com/.default")
    r = requests.get(
        "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments"
        "?api-version=2016-11-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    r.raise_for_status()
    for env in r.json().get("value", []):
        instance_url = (
            env.get("properties", {})
            .get("linkedEnvironmentMetadata", {})
            .get("instanceUrl", "")
            or ""
        ).rstrip("/")
        if instance_url == DATAVERSE_URL:
            return env["name"]  # ← 環境 ID
    raise RuntimeError(f"環境が見つかりません: {DATAVERSE_URL}")
```

```
✅ Flow API スコープ（https://service.flow.microsoft.com/.default）でトークン取得
✅ instanceUrl の末尾スラッシュを rstrip("/") で統一して比較
✅ 環境 ID は env["name"] フィールド（properties.displayName ではない）
❌ 環境 ID を .env にハードコード → 環境が変わると動かない
```

## 構築手順

### Step 1: 接続参照の作成

```python
# ソリューション内に接続参照を作成（べき等パターン）
def create_connection_reference(logical_name, display_name, connector_id, connection_id):
    # 既存チェック
    existing = api_get("connectionreferences",
        {"$filter": f"connectionreferencelogicalname eq '{logical_name}'"})

    if existing["value"]:
        ref_id = existing["value"][0]["connectionreferenceid"]
        # 接続が未紐づけなら更新
        if existing["value"][0].get("connectionid") != connection_id:
            api_patch(f"connectionreferences({ref_id})", {"connectionid": connection_id})
        return ref_id

    # 新規作成（MSCRM.SolutionUniqueName ヘッダー必須）
    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": connector_id,
        "connectionid": connection_id,
    }
    # retry_metadata() でリトライ（メタデータロック対策）
```

### Step 2: フロー定義の構築

```python
clientdata = {
    "properties": {
        "definition": {
            "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {
                "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                "$connections": {"defaultValue": {}, "type": "Object"},
            },
            "triggers": { ... },
            "actions": { ... },
        },
        "connectionReferences": {
            "connref_logical_name": {
                "connectionName": "connref_logical_name",
                "source": "Invoker",  # ← 接続参照モード
                "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                "tier": "NotSpecified",
            },
        },
    },
    "schemaVersion": "1.0.0.0",
}
```

### Step 3: workflow レコード作成

```python
workflow_body = {
    "name": FLOW_DISPLAY_NAME,
    "type": 1,
    "category": 5,       # 5 = Cloud Flow
    "statecode": 0,      # 0 = Draft
    "statuscode": 1,     # 1 = Draft
    "primaryentity": "none",
    "clientdata": json.dumps(clientdata, ensure_ascii=False),
    "description": "フローの説明",
}

# MSCRM.SolutionUniqueName ヘッダーでソリューション内に作成
headers["MSCRM.SolutionUniqueName"] = SOLUTION_NAME
api_post("workflows", workflow_body)
```

### Step 4: フロー有効化

```python
# Draft → Activated
api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})
# 失敗時はフォールバック: Power Automate UI で手動有効化
```

### Step 5: デバッグ JSON 出力（失敗時）

```python
# 失敗時はデバッグ用に JSON をファイル出力
with open("flow_debug.json", "w", encoding="utf-8") as f:
    json.dump(workflow_body, f, ensure_ascii=False, indent=2)
# → Power Automate UI で「マイフロー」→「インポート」で手動登録可能
```


## 代表的パターン

詳細なトリガー・アクションパターン（SharePoint、Dataverse、Teams、AI Builder、OneDrive PDF 変換等）は [トリガー・アクションパターンリファレンス](trigger-action-patterns.md) を参照。

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
# 接続 ID はハードコードしない。deploy_flow.py が PowerApps API で自動検索する
# 手動指定が必要な場合のみ以下を設定（通常は不要）
# DATAVERSE_CONNECTION_ID=shared-commondataser-xxxxx
# OUTLOOK_CONNECTION_ID=xxxxx
```
