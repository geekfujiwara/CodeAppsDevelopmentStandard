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

> **認証**: Python スクリプトの認証は `power-platform-standard` スキルに記載の `scripts/auth_helper.py` を使用。
> `from auth_helper import get_token, get_session, api_get, api_post, flow_api_call` で利用する。

- ソリューション外のフローは「マイフロー」に入り、ALM 管理できない

## 絶対遵守ルール（検証済み教訓）

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

### AI Builder アクションは API で Draft 作成・有効化ともに可能（検証済み 2026-04-13）

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

### Teams PostMessageToConversation の注意（検証済み 2026-04-13）

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
with open("scripts/flow_debug.json", "w", encoding="utf-8") as f:
    json.dump(workflow_body, f, ensure_ascii=False, indent=2)
# → Power Automate UI で「マイフロー」→「インポート」で手動登録可能
```

## 代表的トリガーパターン

### SharePoint ファイル作成トリガー（2 種類あり — 注意）

| 項目         | OnNewFile (Notification型)                                | GetOnNewFileItems (Polling型) ★推奨                                           |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| operationId  | `OnNewFile`                                               | `GetOnNewFileItems`                                                           |
| type         | `OpenApiConnectionNotification`                           | `OpenApiConnection`                                                           |
| recurrence   | **不要**                                                  | 必要（interval: 1, frequency: Minute）                                        |
| 取得内容     | ファイルコンテンツ（body）含む                            | プロパティのみ（名前・パス・更新日等）                                        |
| 用途         | ~~ファイル内容を直接読む~~ → 非推奨（情報が古い場合あり） | **推奨**: GetFileContent で別途取得                                           |
| パラメータ   | `dataset`(サイトURL) + `folderId`(フォルダパス)           | `dataset`(サイトURL) + `table`(ライブラリID) + `folderPath`                   |
| splitOn      | なし                                                      | `@triggerOutputs()?['body/value']`                                            |
| ファイル参照 | `triggerOutputs()?['body/{Path}']`                        | `triggerBody()?['{Identifier}']`, `triggerBody()?['{FilenameWithExtension}']` |

```
★ ベストプラクティス（検証済み 2026-04-13）:
  OnNewFile (Notification型) は情報が古く利用できないケースがある。
  GetOnNewFileItems (Polling型) + GetFileContent の組み合わせを推奨。
```

```python
# ★ 推奨パターン: GetOnNewFileItems（Polling型）+ GetFileContent
"ファイルが作成されたとき_(プロパティのみ)": {
    "recurrence": {"interval": 1, "frequency": "Minute"},
    "splitOn": "@triggerOutputs()?['body/value']",
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
            "operationId": "GetOnNewFileItems",
            "connectionName": "shared_sharepointonline",
        },
        "parameters": {
            "dataset": site_url,
            "table": library_id,          # ライブラリ ID（GUID）
            "folderPath": folder_path,    # フォルダパス（例: "/Shared Documents/All"）
        },
    },
},

# ファイルコンテンツは GetFileContent + {Identifier} で別途取得
"ファイル_コンテンツの取得": {
    "runAfter": {},
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
            "operationId": "GetFileContent",
            "connectionName": "shared_sharepointonline",
        },
        "parameters": {
            "dataset": site_url,
            "id": "@triggerBody()?['{Identifier}']",   # ★ Identifier で取得
            "inferContentType": True,
        },
    },
},
```

```
❌ OnNewFile (Notification型) — 情報が古く利用できないケースあり
❌ GetFileContentByPath + triggerOutputs()?['body/{Path}'] — パスが取得できない場合あり
✅ GetOnNewFileItems + GetFileContent + {Identifier} — 安定動作
✅ ファイル名は triggerBody()?['{FilenameWithExtension}'] で直接参照（Compose 不要）
✅ table パラメータにはライブラリ ID（GUID）を指定
```

```python
# 非推奨パターン: OnNewFile（Notification型）— 参考のみ
"When_a_file_is_created": {
    "type": "OpenApiConnectionNotification",
    "inputs": {
        "host": {
            "connectionName": "shared_sharepointonline",
            "operationId": "OnNewFile",
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
        },
        "parameters": {
            "dataset": site_url,
            "folderId": folder_path,
            "inferContentType": True,
        },
        "authentication": "@parameters('$authentication')",
    },
},
```

### Dataverse レコード変更 Webhook

```python
"triggers": {
    "When_status_changes": {
        "type": "OpenApiConnectionWebhook",
        "inputs": {
            "host": {
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                "connectionName": CONNREF_DATAVERSE,
                "operationId": "SubscribeWebhookTrigger",
            },
            "parameters": {
                "subscriptionRequest/message": 3,              # Update
                "subscriptionRequest/entityname": f"{PREFIX}_tablename",
                "subscriptionRequest/scope": 4,                # Organization
                "subscriptionRequest/filteringattributes": f"{PREFIX}_column",
                "subscriptionRequest/runas": 3,                # Modifying user
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}
```

### message 値: 1=Create, 2=Delete, 3=Update, 4=Create or Update

## 代表的アクションパターン

### Dataverse レコード取得

```python
"Get_Record": {
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "connectionName": CONNREF_DATAVERSE,
            "operationId": "GetItem",
        },
        "parameters": {
            "entityName": "systemusers",
            "recordId": "@triggerOutputs()?['body/_createdby_value']",
            "$select": "internalemailaddress,fullname",
        },
        "authentication": "@parameters('$authentication')",
    },
}
```

### メール送信（Office 365 Outlook）

```python
"Send_Email": {
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
            "connectionName": CONNREF_OUTLOOK,
            "operationId": "SendEmailV2",
        },
        "parameters": {
            "emailMessage/To": "@outputs('Get_Record')?['body/internalemailaddress']",
            "emailMessage/Subject": "件名 @{outputs('Compose_Label')}",
            "emailMessage/Body": "<html><body>HTML本文</body></html>",
            "emailMessage/Importance": "Normal",
        },
        "authentication": "@parameters('$authentication')",
    },
}
```

### Compose（変数計算・ラベル変換）

```python
"Compose_Status_Label": {
    "type": "Compose",
    "runAfter": {"Previous_Action": ["Succeeded"]},
    "inputs": (
        "@if(equals(triggerOutputs()?['body/{prefix}_status'],100000000),'新規',"
        "if(equals(triggerOutputs()?['body/{prefix}_status'],100000001),'対応中','不明'))"
    ),
}
```

### Lookup (odata.bind) で関連テーブルを紐付け（CreateRecord）

```python
# Dataverse で Lookup（関連テーブル）を設定する場合は odata.bind 式を使う
"Create_Record": {
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "connectionName": CONNREF_DATAVERSE,
            "operationId": "CreateRecord",
        },
        "parameters": {
            "entityName": f"{PREFIX}_incidents",
            "item": {
                f"{PREFIX}_name": "@{outputs('Compose_Title')}",
                f"{PREFIX}_status": 100000000,
                # ★ Lookup は odata.bind でエンティティパスを指定
                f"{PREFIX}_CategoryId@odata.bind": (
                    f"/{PREFIX}_incidentcategories("
                    f"@{{first(outputs('List_Categories')?['body/value'])?['{PREFIX}_incidentcategoryid']}})"
                ),
            },
        },
        "authentication": "@parameters('$authentication')",
    },
}
```

```
❌ Lookup を通常フィールドとして GUID 文字列で設定 → 紐付かない
✅ {LookupSchemaName}@odata.bind に /{entitySetName}({recordId}) 式を設定
✅ first() + outputs() で前のアクションの検索結果から ID を取得
```

### 条件分岐（If）

```python
"Check_Condition": {
    "type": "If",
    "expression": {
        "not": {
            "equals": [
                "@coalesce(outputs('Get_Record')?['body/field'],'')",
                "",
            ]
        }
    },
    "actions": { ... },      # true 時
    "else": {"actions": {}},  # false 時
}
```

### AI Builder のファイルタイプ制限（★ 重要 — 公式ドキュメント準拠）

参照: https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-inputs-prompt#limitations

```
AI Builder AI プロンプト（aibuilderpredict_customprompt）が直接処理できるファイル形式:

✅ 標準対応形式（そのまま渡せる）:
  PNG, JPG, JPEG, PDF

✅ Code Interpreter 有効時に追加対応:
  Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx)
  → プロンプト設定で Code Interpreter をオンにする必要あり
  → https://learn.microsoft.com/en-us/microsoft-copilot-studio/code-interpreter-for-prompts

❌ 非対応形式（直接渡すと UnsupportedFileType エラー）:
  msg, eml, html, md, rtf, odp, ods, odt, epub 等
  ※ Code Interpreter オンでも上記は非対応

制限値:
  ・ファイルサイズ: 全ファイル合計 25 MB 未満
  ・ページ数: 50 ページ未満
  ・処理タイムアウト: 100 秒
  ・大きなドキュメント（特にテーブル行）は抽出精度が低下する場合あり

重要:
  ・Copilot Studio エージェントのツールとしてのファイル入力は未対応
  ・ファイル処理は Power Automate フロー経由で実行する

★ ベストプラクティス: OneDrive for Business の ConvertFile アクションで PDF に変換してから渡す
  → 下記「OneDrive PDF 変換パターン」を参照
```

### OneDrive PDF 変換パターン（★ ベストプラクティス — 検証済み 2026-04-13）

AI Builder が非対応のファイル形式を処理するために、OneDrive for Business の ConvertFile で PDF に変換する。

```
フロー構成（7 ステップ）:
  1. GetOnNewFileItems — SP でファイル検知（Polling）
  2. GetFileContent — ファイルコンテンツ取得（{Identifier}）
  3. CreateFile — OneDrive /temp に一時保存
  4. ConvertFile — PDF に変換（type: PDF）
  5. aibuilderpredict_customprompt — AI Builder で処理
  6. PostMessageToConversation — Teams 投稿（等の後続処理）
  7. DeleteFile — OneDrive 一時ファイル削除（クリーンアップ）

OneDrive ConvertFile の PDF 変換対応形式 (https://aka.ms/onedriveconversions):
  doc, docx, epub, eml, htm, html, md, msg, odp, ods, odt,
  pps, ppsx, ppt, pptx, rtf, tif, tiff, xls, xlsm, xlsx

必要な接続:
  ✅ OneDrive for Business（shared_onedriveforbusiness）— 環境に事前作成必須
  ✅ 接続参照もソリューション内に作成
```

```python
# OneDrive 一時ファイル作成（SharePoint から取得したコンテンツを保存）
"ファイルの作成": {
    "runAfter": {"ファイル_コンテンツの取得": ["Succeeded"]},
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
            "operationId": "CreateFile",
            "connectionName": "shared_onedriveforbusiness",
        },
        "parameters": {
            "folderPath": "/temp",                                    # 一時フォルダ
            "name": "@triggerBody()?['{FilenameWithExtension}']",    # 元のファイル名
            "body": "@body('ファイル_コンテンツの取得')",            # ファイルコンテンツ
        },
    },
},

# PDF 変換（OneDrive ConvertFile）
"ファイルの変換": {
    "runAfter": {"ファイルの作成": ["Succeeded"]},
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
            "operationId": "ConvertFile",
            "connectionName": "shared_onedriveforbusiness",
        },
        "parameters": {
            "id": "@outputs('ファイルの作成')?['body/Id']",   # 作成したファイルの ID
            "type": "PDF",                                     # 変換先フォーマット
        },
    },
},

# AI Builder にPDF変換後のコンテンツを渡す
"Run_AI_Prompt": {
    "runAfter": {"ファイルの変換": ["Succeeded"]},
    "inputs": {
        "parameters": {
            "recordId": AI_MODEL_ID,
            "item/requestv2/filename": "@triggerBody()?['{FilenameWithExtension}']",
            "item/requestv2/document/base64Encoded": "@body('ファイルの変換')",  # ★ 変換後の PDF
        },
    },
},

# 一時ファイル削除（クリーンアップ — 必ず実装する）
"ファイルの削除": {
    "runAfter": {"Post_to_Teams": ["Succeeded"]},
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
            "operationId": "DeleteFile",
            "connectionName": "shared_onedriveforbusiness",
        },
        "parameters": {
            "id": "@outputs('ファイルの作成')?['body/Id']",  # 作成時と同じ ID
        },
    },
},
```

```
★ 重要ポイント:
  ✅ ConvertFile は body('ファイルの変換') で PDF バイナリを返す
  ✅ AI Builder の document/base64Encoded にそのまま渡せる（追加の base64 エンコード不要）
  ✅ 一時フォルダ（/temp）を使い、処理後に必ず DeleteFile でクリーンアップ
  ✅ ファイル ID は outputs('ファイルの作成')?['body/Id'] で参照（CreateFile の output）
  ❌ 一時ファイルの削除を忘れるとストレージを圧迫する
  ❌ ConvertFile は OneDrive 上のファイルのみ対応（SharePoint 直接は不可）
```

### AI Builder「プロンプトを実行する」（検証済み 2026-04-13）

```python
# AI Builder 用の接続参照は Dataverse と同じコネクタだが別キーで登録
CN_DV = "shared_commondataserviceforapps"
CN_DV_AI = "shared_commondataserviceforapps_1"

# アクション定義
"Run_AI_Prompt": {
    "runAfter": {
        "ファイル_コンテンツの取得": ["Succeeded"],
    },
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": f"/providers/Microsoft.PowerApps/apis/{CN_DV}",
            "operationId": "aibuilderpredict_customprompt",
            "connectionName": CN_DV_AI,  # ★ Dataverse とは別キー
        },
        "parameters": {
            "recordId": AI_MODEL_ID,  # msdyn_aimodel の GUID
            # ファイル名は triggerBody から直接参照（Compose 不要）
            "item/requestv2/filename": "@triggerBody()?['{FilenameWithExtension}']",
            # ドキュメント入力（base64 エンコード）
            "item/requestv2/document/base64Encoded": "@body('ファイル_コンテンツの取得')",
        },
    },
}

# connectionReferences に AI Builder 用を追加（同じ接続参照を参照可能）
CN_DV_AI: {
    "runtimeSource": "embedded",
    "connection": {
        "connectionReferenceLogicalName": CONNREF_DATAVERSE,  # Dataverse と同じ接続参照 OK
    },
    "api": {"name": CN_DV},
},
```

```
✅ operationId: "aibuilderpredict_customprompt"（Draft 作成＆有効化ともに成功）
❌ operationId: "PerformBoundAction" + msdyn_PredictByReference（InvalidOpenApiFlow）
✅ connectionReferences に別キー（_1 サフィックス）で登録、同じ接続参照を参照可能
```

### AI Builder 出力の参照方法（★ 重要 — ParseJson は不要）

```
★ ベストプラクティス（検証済み 2026-04-13）:
  AI Builder の JSON 出力は structuredOutput で直接参照できる。
  ParseJson アクションは不要。アクション数が減り、フローがシンプルになる。

✅ structuredOutput で直接参照（推奨）:
  outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/structuredOutput/title']
  outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/structuredOutput/summary']
  outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/structuredOutput/category']

❌ predictionOutput/text → ParseJson（非推奨 — 冗長）:
  outputs('Run_AI_Prompt')?['body/responsev2/predictionOutput/text']
  → ParseJson → body('Parse_AI_Output')?['title']
```

✅ 後続アクションでは body('Parse_AI_Output')?['key'] で参照

````

### Teams チャネル投稿（PostMessageToConversation）（検証済み 2026-04-13）

```python
"Post_to_Teams": {
    "type": "OpenApiConnection",
    "runAfter": {"Previous_Action": ["Succeeded"]},
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_teams",
            "connectionName": "shared_teams",
            "operationId": "PostMessageToConversation",
        },
        "parameters": {
            "poster": "Flow bot",
            "location": "Channel",
            "body/recipient/groupId": TEAMS_GROUP_ID,      # チーム ID
            "body/recipient/channelId": TEAMS_CHANNEL_ID,  # チャネル ID
            "body/messageBody": "<h3>タイトル</h3><p>本文</p>",  # HTML 可
        },
        "authentication": "@parameters('$authentication')",
    },
}
````

```
❌ body/subject パラメータは存在しない → InvalidOpenApiFlow の原因
✅ 使用可能: poster, location, body/recipient/groupId, body/recipient/channelId, body/messageBody
✅ messageBody は HTML 対応
✅ チャネル ID/チーム ID はユーザーに Teams で右クリック → 「チャネルへのリンクを取得」で URL をもらう
   URL 例: https://teams.cloud.microsoft/l/channel/19%3A...%40thread.tacv2/...?groupId=xxx&tenantId=yyy
   → groupId パラメータ = チーム ID
   → /channel/ と次の / の間を URL デコード = チャネル ID
```

### 接続 ID はハードコード禁止（重要）

```
❌ deploy_flow.py に接続 ID をハードコード（PREFERRED_CONNECTIONS 等）
   → 環境が変わると ConnectionNotFound エラー
   → 既存接続が Error 状態だと新しい接続が使われない

✅ 毎回 PowerApps API で Connected 状態の接続を自動検索
   → find_connections() で connector ごとに環境内を検索
   → statuses に "Connected" を含むもののみ使用
   → 見つからない場合はユーザーに手動作成を案内して終了
```

### Embedded 接続モードの 2 パターン

フロー定義の connectionReferences には 2 つの書き方がある。用途に応じて使い分ける。

```python
# パターン A: 接続参照経由（ソリューション ALM 対応・推奨）
# → connectionReferenceLogicalName で接続参照レコードを参照
# → Copilot Studio トリガーフロー等、ソリューション移行を想定する場合
"shared_office365": {
    "runtimeSource": "embedded",
    "connection": {
        "connectionReferenceLogicalName": "geek_connref_outlook",
    },
    "api": {"name": "shared_office365"},
},

# パターン B: 接続 ID 直接指定（単一環境・簡易デプロイ）
# → connectionName に実際の接続 ID を設定
# → 環境固有。移行時に接続 ID の書き換えが必要
"shared_commondataserviceforapps": {
    "connectionName": "your-connection-id-here",  # 接続 ID
    "source": "Embedded",
    "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
    "tier": "NotSpecified",
},
```

```
❌ source: "Invoker" で接続参照なし → フロー実行者の接続が使われるが非決定的
✅ パターン A: ソリューション移行が想定される場合（Copilot Studio トリガー等）
✅ パターン B: 単一環境で完結する場合（環境固有のフロー）
注意: パターン B は Power Automate UI でソリューション移行時に
      「接続ではなく接続参照を使用する必要があります」の警告が出る
```

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
