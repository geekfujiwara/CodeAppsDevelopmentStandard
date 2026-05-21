---
name: power-automate
description: "Power Automate クラウドフローを Dataverse Web API（workflow テーブル）でソリューション対応で作成・デプロイする。接続参照パターンで API 有効化を100%成功させる。"
category: automation
triggers:
  - "Power Automate"
  - "フロー作成"
  - "クラウドフロー"
  - "接続参照"
  - "Connection Reference"
  - "workflow"
  - "トリガー"
  - "アクション"
  - "フローデプロイ"
  - "フロー有効化"
  - "メール通知"
---

# Power Automate クラウドフロー構築スキル

Dataverse Web API（workflow テーブル）で **ソリューション対応のクラウドフロー** を作成・デプロイし、**API で確実に有効化する**。

## 核心原則: 接続参照（Connection Reference）が有効化成功の鍵

```
★★★ 最重要教訓（2026-05 検証済み）★★★

フロー有効化で AzureResourceManagerRequestFailed が出る根本原因:
  → 接続参照なしで接続 ID を直接埋め込んだ場合、authenticatedUserObjectId が不足する

解決策: 接続参照テーブルに正しい接続を紐づけてから、フロー定義で参照する
  → 100% API 有効化に成功する

❌ 旧パターン（接続 ID 直接指定 → 有効化失敗のリスクあり）:
  "connectionReferences": {
      "shared_commondataserviceforapps": {
          "connectionName": "some-connection-id",
          "source": "Embedded",
          ...
      }
  }

✅ 新パターン（接続参照経由 → 100% 有効化成功）:
  "connectionReferences": {
      "shared_commondataserviceforapps": {
          "runtimeSource": "embedded",
          "connection": {
              "connectionReferenceLogicalName": "prefix_connref_logical_name"
          },
          "api": {"name": "shared_commondataserviceforapps"}
      }
  }
```

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
SOLUTION_NAME=ProjectName  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX=prefix    ← ソリューション発行者の prefix
```

- フロー作成時は `MSCRM.SolutionUniqueName` ヘッダー必須
- 接続参照もソリューション内に作成（`MSCRM.SolutionUniqueName` ヘッダー）

> **認証**: Python スクリプトの認証は `standard` スキルの `auth_helper.py` を使用。
> `from auth_helper import get_token, get_session, api_get, api_post, api_patch, api_delete, retry_metadata, DATAVERSE_URL` で利用する。

- ソリューション外のフローは「マイフロー」に入り、ALM 管理できない

## 絶対遵守ルール

### 認証スコープが異なる（最重要）

```
Flow API:      https://service.flow.microsoft.com/.default   ← 環境 ID 解決・/start
PowerApps API: https://service.powerapps.com/.default        ← 接続検索用
Graph API:     https://graph.microsoft.com/.default          ← ユーザー情報用
Dataverse API: https://{org}.crm7.dynamics.com/.default      ← workflow テーブル操作・接続参照作成
```

### 接続は環境内に事前作成が必要

```
❌ API で接続の自動作成はできない
✅ Power Automate UI で事前に接続を作成 → API ではその接続 ID を参照するのみ
   https://make.powerautomate.com/connections
```

### f-string と式の二重ブレース問題

```python
# ❌ f-string 内の Power Automate 式（{} エスケープが複雑でバグの原因）
body = f"@{{triggerOutputs()?['body/{PREFIX}_name']}}"

# ✅ f-string を使わない部分は通常文字列で構築
body_template = "@{triggerOutputs()?['body/{prefix}_name']}"
body = body_template.replace("{prefix}", PREFIX)

# ✅ または変数だけ f-string で、式部分は連結
body = f"<td>@{{triggerOutputs()?['body/{PREFIX}_name']}}</td>"
# ↑ 正しく動くが読みにくい。1箇所だけならOK、複数箇所は避ける
```

### べき等デプロイパターン

```python
# 既存フロー検索 → 無効化 → 削除 → 再作成
existing = api_get(f"workflows?$filter=name eq '{FLOW_NAME}' and category eq 5&$select=workflowid,statecode")
for f in existing.get("value", []):
    wf_id = f["workflowid"]
    if f["statecode"] == 1:  # Active → Draft
        api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
        time.sleep(2)
    api_delete(f"workflows({wf_id})")
    time.sleep(3)
# → 新規作成へ進む
```

### Dataverse Webhook トリガーのフローは /start 必須（★ 検証済み教訓）

```
❌ statecode=1 だけで終わる
   → Dataverse Create/Update トリガー（webhook 型）で webhook 登録が完了せず発火しない

✅ statecode=1 + statuscode=2 の後に /start を明示的に呼ぶ:
   POST .../providers/Microsoft.ProcessSimple/environments/{env-id}/flows/{workflow-id}/start?api-version=2016-11-01
   （Flow API スコープ: https://service.flow.microsoft.com/.default）
```

### GrantAccess / RevokeAccess は PerformUnboundAction で呼ぶ（★ 検証済み教訓）

```
❌ PerformBoundAction + GrantAccess / RevokeAccess
   → "Bound action 'GrantAccess' is not found" (BadRequest)

✅ PerformUnboundAction + actionName + Target パラメータ
   → Draft 作成・有効化に成功（2026-05-02 検証済み）

補足:
  - @odata.type をそのまま書くと式として解釈されるため @@odata.type でエスケープが必要
  - connectionReferences は runtimeSource: "embedded" + connectionReferenceLogicalName で渡す
  - payload（Target / PrincipalAccess / Revokee）は Compose アクションに分離すると
    Power Automate UI での編集性が上がる
```

### AI Builder アクションは API で Draft 作成・有効化ともに可能

```
検証結果（operationId: aibuilderpredict_customprompt）:
  ✅ フロー作成（Draft） — AI Builder アクション含む定義の POST は成功
  ✅ フロー有効化（Activate） — statecode=1 の PATCH も成功

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
★ チャネル投稿（Channel）:
  ❌ body/subject パラメータを指定しない
     → PostMessageToConversation の operationSchema に body/subject は存在しない
     → 指定するとフロー有効化時に InvalidOpenApiFlow (0x80060467) が発生
     → エラーメッセージに具体的なパラメータ名が出ないため原因特定が困難
  ✅ 使用可能なパラメータ:
     poster, location, body/recipient/groupId, body/recipient/channelId, body/messageBody

★ 1:1 チャット（Chat with Flow bot）:
  ✅ location は "Chat with Flow bot"
  ✅ body/recipient にメールアドレス（文字列）を指定
  ✅ host.connection キーを使用（connectionName ではない）
  ❌ body/recipient/to は存在しない → ExtraParameter で InvalidOpenApiFlow
  ❌ Dataverse workflows テーブルへの直接 INSERT → 接続認証不良で Runtime エラー
  ✅ デプロイは Flow API 経由を推奨

  詳細は trigger-action-patterns.md の
  「Teams 1:1 チャット投稿 — Chat with Flow bot」セクション参照
```

### Power Apps V2 トリガー・応答のパラメータ形式（★ 重要）

```
Power Automate UI で手動追加したパラメータと API でデプロイしたパラメータは
形式が異なるとフローが正しく動作しない。必ず UI 形式に合わせる。

★ 正しい形式（トリガー・応答共通）:
  ✅ "x-ms-content-hint": "TEXT"
  ✅ "x-ms-dynamically-added": true

❌ 間違った形式（API デプロイ時にありがちなミス）:
  ❌ "x-ms-powerflows-param-ispartial": false
  ❌ "isPartial": false

応答（Response）固有:
  ✅ schema に "additionalProperties": {} を含める（UI が自動付与）
  ✅ title と body のキー名を一致させる

詳細: references/trigger-action-patterns.md の
「Power Apps V2 トリガー」「PowerApp 応答アクション」セクションを参照
```

### PowerApps API 接続検索のタイムアウト対策

PowerApps API（`api.powerapps.com`）での接続検索は 504 GatewayTimeout が頻発する。

```python
# ✅ リトライ + timeout=120 パターン
for attempt in range(3):
    try:
        r = requests.get(
            f"https://api.powerapps.com/providers/Microsoft.PowerApps"
            f"/apis/{connector}/connections",
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
```

```
❌ タイムアウトで即座にエラー終了 → 一時的な問題で不必要に失敗
✅ 3 回リトライ（累進的 wait: 15s → 30s → 45s）
✅ timeout=120 を明示的に設定（デフォルトは無限待ち）
```

### Dataverse File 列へのファイルアップロード（★ 検証済み教訓）

```
❌ operationId: "UploadFile"
   → Dataverse コネクタに存在しない operationId
   → WorkflowOperationInputsApiOperationNotFound エラー

✅ operationId: "UpdateEntityFileImageFieldContent"
   → Dataverse コネクタの正式な File/Image 列更新オペレーション
   → Draft 作成・有効化ともに成功（2026-04-27 検証済み）
```

### 環境 ID の解決（Flow API / PowerApps API で必要）

```python
def resolve_environment_id() -> str:
    """Flow API で DATAVERSE_URL → 環境 ID を解決"""
    token = get_token(scope="https://service.flow.microsoft.com/.default")
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
            return env["name"]  # ← 環境 ID
    raise RuntimeError(f"環境が見つかりません: {dv_url}")
```

```
✅ Flow API スコープ（https://service.flow.microsoft.com/.default）でトークン取得
✅ instanceUrl の末尾スラッシュを rstrip("/") で統一して比較
✅ 環境 ID は env["name"] フィールド（properties.displayName ではない）
❌ 環境 ID を .env にハードコード → 環境が変わると動かない
```

## 構築手順（5ステップ — この順序で100%有効化成功）

### Step 1: 環境 ID 解決 + 接続検索

```python
# 環境 ID を DATAVERSE_URL から逆引き
env_id = resolve_environment_id()

# PowerApps API で接続を検索（リトライ付き）
connection_id = find_connection(env_id, "shared_commondataserviceforapps")
```

### Step 2: 接続参照の作成（★ 有効化成功の核心）

```python
def ensure_connection_reference(logical_name: str, display_name: str, connector_id: str, connection_id: str):
    """接続参照をべき等で作成。既存なら接続の紐づけを更新。"""
    existing = api_get(
        f"connectionreferences?$filter=connectionreferencelogicalname eq '{logical_name}'"
        "&$select=connectionreferenceid,connectionid"
    )
    if existing.get("value"):
        ref = existing["value"][0]
        if ref.get("connectionid") != connection_id:
            api_patch(f"connectionreferences({ref['connectionreferenceid']})", {"connectionid": connection_id})
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

# ── 使用例 ──
CONNREF_DATAVERSE = f"{PREFIX}_sharedcommondataserviceforapps"
CONNREF_OUTLOOK = f"{PREFIX}_sharedoffice365"

ensure_connection_reference(CONNREF_DATAVERSE, "Dataverse", "shared_commondataserviceforapps", dv_conn_id)
ensure_connection_reference(CONNREF_OUTLOOK, "Office 365 Outlook", "shared_office365", outlook_conn_id)
```

```
★ なぜこれが重要か:
  接続参照に正しい接続 ID が紐づいていれば、フロー有効化時に
  authenticatedUserObjectId が解決され、AzureResourceManagerRequestFailed は発生しない。

  接続参照なしの旧パターンでは、接続の認証情報が不足して有効化が失敗していた。
```

### Step 3: フロー定義の構築

```python
# フロー定義（Logic Apps スキーマ形式）
definition = {
    "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "$authentication": {"defaultValue": {}, "type": "SecureObject"},
        "$connections": {"defaultValue": {}, "type": "Object"},
    },
    "triggers": { ... },
    "actions": { ... },
}

# ★ 接続参照を参照する connectionReferences（有効化成功の鍵）
clientdata = {
    "properties": {
        "definition": definition,
        "connectionReferences": {
            "shared_commondataserviceforapps": {
                "runtimeSource": "embedded",
                "connection": {
                    "connectionReferenceLogicalName": CONNREF_DATAVERSE,
                },
                "api": {"name": "shared_commondataserviceforapps"},
            },
            "shared_office365": {
                "runtimeSource": "embedded",
                "connection": {
                    "connectionReferenceLogicalName": CONNREF_OUTLOOK,
                },
                "api": {"name": "shared_office365"},
            },
        },
    },
    "schemaVersion": "1.0.0.0",
}
```

```
★ connectionReferences のキー名は定義内の host.connectionName と一致させる:
  triggers/actions の host.connectionName = "shared_commondataserviceforapps"
  → connectionReferences の key も "shared_commondataserviceforapps"

★ AI Builder 用に同じコネクタの別キーが必要な場合:
  host.connectionName = "shared_commondataserviceforapps_1"
  → connectionReferences に "shared_commondataserviceforapps_1" を追加
  → 同じ接続参照を参照してもよい
```

### Step 4: workflow テーブルに Draft 作成

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
wf_id = api_post("workflows", workflow_body, solution=SOLUTION_NAME)
```

### Step 5: 有効化 + Webhook 登録

```python
# ★ Draft → Activated（接続参照が正しければ100%成功）
time.sleep(3)  # 作成直後は少し待つ
api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})

# ★ Dataverse Webhook トリガーの場合のみ /start を呼ぶ（Webhook 登録）
time.sleep(3)
token = get_token(scope="https://service.flow.microsoft.com/.default")
try:
    r = requests.post(
        f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple"
        f"/environments/{env_id}/flows/{wf_id}/start?api-version=2016-11-01",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    r.raise_for_status()
    print("  ✓ Webhook /start 登録")
except Exception as e:
    print(f"  ⚠ /start 登録失敗（フローは有効化済み。手動で Turn On すれば Webhook 登録される）: {e}")
```

```
★ /start が必要なトリガー（Webhook 型）:
  - SubscribeWebhookTrigger（Dataverse レコード変更）
  - OnNewFile（SharePoint Notification 型）

★ /start が不要なトリガー:
  - GetOnNewFileItems（SharePoint Polling 型）
  - Recurrence（スケジュール）
  - PowerAppV2（Code Apps からの手動呼び出し）
```

### デバッグ JSON 出力（失敗時のフォールバック）

```python
# 有効化が万一失敗した場合のフォールバック
try:
    api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})
except Exception as e:
    debug_path = "flow_definition_debug.json"
    with open(debug_path, "w", encoding="utf-8") as f:
        json.dump({"workflow_body": workflow_body, "error": str(e)}, f, ensure_ascii=False, indent=2)
    print(f"  ❌ 有効化失敗: {e}")
    print(f"  デバッグ JSON: {debug_path}")
    print("  → Power Automate UI で手動有効化してください")
    print(f"     https://make.powerautomate.com/environments/{env_id}/flows/{wf_id}")
    sys.exit(1)
```

## 代表的パターン

詳細なトリガー・アクションパターン（SharePoint、Dataverse、Teams、AI Builder、OneDrive PDF 変換等）は [トリガー・アクションパターンリファレンス](references/trigger-action-patterns.md) を参照。

## 通知デザイン（デフォルト適用 — ユーザー指定不要）

メール通知・Teams 通知が含まれるフローでは、[通知デザインテンプレート](references/notification-templates.md) を**デフォルトで適用する**。

```
★ ユーザーから特別な指定がなくても、以下のデザインが自動適用される:

メール通知:
  - テーブルレイアウト + インラインスタイル（メールクライアント互換）
  - カード型デザイン（白背景 + 角丸ボーダー + グレー外枠）
  - 色付きヘッダーライン（目的別: 青=通常, 緑=成功, 橙=警告, 赤=緊急）
  - ゼブラストライプのデータテーブル
  - 最大幅600px + 中央寄せ（モバイル対応）

Teams 通知:
  - シンプルな HTML（Teams の描画制約に準拠）
  - h3 ヘッダー + テーブル形式

❌ 禁止: グラデーション背景（Outlook/Gmail で描画されない）
❌ 禁止: flexbox/grid（メールクライアント非対応）
❌ 禁止: 外部 CSS / <style> タグ
```

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
# 接続 ID はハードコードしない。deploy_flow.py が PowerApps API で自動検索する
```

## よくあるエラーと解決策

| エラー                                  | 原因                                           | 解決策                                                         |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `AzureResourceManagerRequestFailed`     | 接続参照なしで直接接続 ID 指定                 | Step 2 の接続参照パターンに変更                                |
| `InvalidOpenApiFlow` (0x80060467)       | 存在しないパラメータを指定                     | operationSchema を確認（body/subject 等）                      |
| `WorkflowOperationInputsApiOperationNotFound` | 存在しない operationId                   | 正しい operationId を確認（UploadFile → UpdateEntityFileImageFieldContent） |
| PowerApps API 504 GatewayTimeout        | 接続検索のタイムアウト                         | 3回リトライ + timeout=120                                      |
| Webhook トリガーが発火しない            | /start 未呼び出し                              | 有効化後に Flow API /start を呼ぶ                              |
| フロー実行時に接続エラー                | 接続が Error/Disconnected 状態                 | Power Automate UI で接続を再認証                               |
| `AppLeaseMissing` / `ConnectionNotFound` | 環境が変わった / 接続 ID が古い               | PowerApps API で毎回 Connected 接続を検索                     |
