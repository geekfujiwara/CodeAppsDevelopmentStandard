# Power Automate トリガー・アクションパターンリファレンス

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
★ ベストプラクティス:
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

### Power Apps V2 トリガー（PowerAppV2）— パラメータ形式（★ 重要）

Code Apps から `npx power-apps add-flow` で呼び出すフローのトリガー。
パラメータの形式を間違えると Power Automate UI でパラメータが正しく表示されない。

```
★ 正しいパラメータ形式（UI で手動追加した場合と同一）:
  ✅ "x-ms-content-hint": "TEXT"
  ✅ "x-ms-dynamically-added": true

❌ 間違ったパラメータ形式（API 固有の古い形式）:
  ❌ "x-ms-powerflows-param-ispartial": false
  ❌ "isPartial": false
  → UI で表示が崩れる / Code Apps SDK の型生成に影響する可能性あり
```

```python
"triggers": {
    "manual": {
        "type": "Request",
        "kind": "PowerAppV2",
        "inputs": {
            "schema": {
                "type": "object",
                "properties": {
                    "text": {
                        "title": "bookingId",        # パラメータの表示名
                        "type": "string",
                        "x-ms-content-hint": "TEXT",  # ★ 必須
                        "x-ms-dynamically-added": True,  # ★ 必須
                        "description": "予約ID",
                    },
                    "text_1": {
                        "title": "workOrderName",
                        "type": "string",
                        "x-ms-content-hint": "TEXT",
                        "x-ms-dynamically-added": True,
                        "description": "作業指示書名",
                    },
                    # text_2, text_3 ... 同じ形式で追加
                },
                "required": ["text", "text_1"],  # 必須パラメータのみ
            },
        },
    },
},
```

```
パラメータ命名規則:
  ✅ 1つ目: "text"
  ✅ 2つ目以降: "text_1", "text_2", "text_3" ...（連番サフィックス）
  ✅ title: UI に表示される名前（任意の文字列）
  ✅ description: パラメータの説明

型のバリエーション:
  "x-ms-content-hint": "TEXT"    → 文字列
  "x-ms-content-hint": "NUMBER"  → 数値
  "x-ms-content-hint": "FILE"    → ファイル

Code Apps 側の生成結果:
  npx power-apps add-flow --flow-id {id} 実行後、
  src/generated/models/ にモデルが生成される:
    text → text (string, required)
    text_1 → text_1 (string, required)
    text_2 → text_2 (string, optional)  ※ required に含まれないもの
```

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

### OneDrive PDF 変換パターン（★ ベストプラクティス）

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

### Dataverse File / Image 列へのアップロード（UpdateEntityFileImageFieldContent）

Dataverse の File 型列（FileAttributeMetadata）や Image 型列にフローからファイルをアップロードするパターン。

```
★ 重要ポイント:
  ✅ operationId は "UpdateEntityFileImageFieldContent"（唯一の正解）
  ❌ "UploadFile" は Dataverse コネクタに存在しない → InvalidOpenApiFlow エラー
  ✅ item にはバイナリコンテンツを渡す（@base64ToBinary() 等）
  ✅ x-ms-file-name でファイル名を指定（日本語ファイル名も可）
  ✅ fileImageFieldName には File/Image 列の論理名を指定
  ✅ Draft 作成・有効化ともに API で成功（2026-04-27 検証済み）
```

```python
# ✅ Dataverse File 列に PDF をアップロード
"Upload_PDF_File": {
    "type": "OpenApiConnection",
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            "operationId": "UpdateEntityFileImageFieldContent",
            "connectionName": CONNREF_DATAVERSE,
        },
        "parameters": {
            "entityName": "accounts",      # エンティティセット名（複数形）
            "recordId": "@triggerOutputs()?['body/accountid']",
            "fileImageFieldName": f"{PREFIX}_filecolumn",    # File 型列の論理名
            "item": "@base64ToBinary(variables('pdfBase64'))",  # バイナリコンテンツ
            "x-ms-file-name": "document.pdf",               # 保存ファイル名
        },
        "authentication": "@parameters('$authentication')",
    },
}
```

```python
# ✅ 条件分岐で documentType ごとに異なる File 列にアップロードする例
"Check_Document_Type": {
    "type": "If",
    "runAfter": {"Send_Email": ["Succeeded"]},
    "expression": {
        "equals": ["@variables('documentType')", "prework"],
    },
    "actions": {
        "Upload_PreWork_PDF": {
            "type": "OpenApiConnection",
            "inputs": {
                "host": {
                    "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                    "operationId": "UpdateEntityFileImageFieldContent",
                    "connectionName": CONNREF_DATAVERSE,
                },
                "parameters": {
                    "entityName": "accounts",
                    "recordId": "@triggerOutputs()?['body/accountid']",
                    "fileImageFieldName": f"{PREFIX}_filecolumn1",
                    "item": "@base64ToBinary(variables('pdfBase64'))",
                    "x-ms-file-name": "document1.pdf",
                },
                "authentication": "@parameters('$authentication')",
            },
        },
    },
    "else": {
        "actions": {
            "Upload_Report_PDF": {
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "operationId": "UpdateEntityFileImageFieldContent",
                        "connectionName": CONNREF_DATAVERSE,
                    },
                    "parameters": {
                        "entityName": "accounts",
                        "recordId": "@triggerOutputs()?['body/accountid']",
                        "fileImageFieldName": f"{PREFIX}_filecolumn2",
                        "item": "@base64ToBinary(variables('pdfBase64'))",
                        "x-ms-file-name": "document2.pdf",
                    },
                    "authentication": "@parameters('$authentication')",
                },
            },
        },
    },
}
```

```
前提条件:
  ✅ Dataverse テーブルに File 型列（FileAttributeMetadata）が事前作成されていること
  ✅ File 列の MaxSizeInKB が保存するファイルサイズ以上であること（推奨: 10240 = 10MB）
  ✅ host.connectionName に Dataverse 接続参照の論理名を指定

よくあるエラー:
  ❌ operationId: "UploadFile" → WorkflowOperationInputsApiOperationNotFound
  ❌ item に base64 文字列をそのまま渡す → @base64ToBinary() でバイナリに変換が必要
  ❌ entityName を単数形で指定 → 複数形（エンティティセット名）を使用
```

### AI Builder「プロンプトを実行する」

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
★ ベストプラクティス:
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

### Teams チャネル投稿（PostMessageToConversation）

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

### Teams 1:1 チャット投稿 — Chat with Flow bot（PostMessageToConversation）

Teams の 1:1 チャットで Flow bot からユーザーにメッセージを送信するパターン。
チャネル投稿（`location: "Channel"`）とはパラメータ構造が異なるため注意。

```
★ 重要ポイント:
  ✅ location は "Chat with Flow bot"（チャネル投稿の "Channel" とは異なる）
  ✅ body/recipient にはユーザーのメールアドレス（文字列）を指定
  ❌ body/recipient/to は存在しない → InvalidOpenApiFlow の ExtraParameter エラー
  ❌ body/recipient/groupId, body/recipient/channelId はチャネル用 → 1:1 チャットでは使わない
  ✅ host では connection キーを使用（connectionName ではない）
  ✅ authentication パラメータは不要（connection キー使用時）
  ✅ デプロイは Flow API（https://api.flow.microsoft.com）経由を推奨
  ❌ Dataverse workflows テーブルへの直接 INSERT では接続認証不良が起きやすい
```

```python
# ✅ 正しいパターン: Chat with Flow bot（1:1 チャット）— 2026-05-24 検証済み
"Post_Teams_Chat": {
    "type": "OpenApiConnection",
    "runAfter": {"Previous_Action": ["Succeeded"]},
    "inputs": {
        "parameters": {
            "poster": "Flow bot",
            "location": "Chat with Flow bot",
            "body/recipient": "@outputs('Get_User')?['body/internalemailaddress']",
            "body/messageBody": "<p>通知メッセージ本文（HTML 対応）</p>",
        },
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_teams",
            "connection": "shared_teams-1",       # ★ connectionName ではなく connection
            "operationId": "PostMessageToConversation",
        },
    },
}
```

```
チャネル投稿（Channel）との比較:

| 項目              | チャネル投稿                | 1:1 チャット（Chat with Flow bot）     |
| ----------------- | --------------------------- | -------------------------------------- |
| location          | "Channel"                   | "Chat with Flow bot"                   |
| 宛先指定          | body/recipient/groupId +    | body/recipient（メールアドレス文字列） |
|                   | body/recipient/channelId    |                                        |
| host.connection   | connectionName キー         | connection キー                        |
| authentication    | @parameters('$authentication') | 不要                                |
| poster            | "Flow bot" or "User"        | "Flow bot"                             |

connectionReferences での登録:
  Flow API デプロイ時、connectionReferences には接続 ID を直接指定する。
  connection キーの値（例: "shared_teams-1"）と connectionReferences のキーを一致させる。

"shared_teams-1": {
    "connectionName": "{TEAMS_CONNECTION_ID}",    # 環境内の接続 ID
    "source": "Embedded",
    "id": "/providers/Microsoft.PowerApps/apis/shared_teams",
    "tier": "NotSpecified",
},

❌ よくあるエラー:
  ❌ body/recipient/to → ExtraParameter で InvalidOpenApiFlow
  ❌ body/recipient/To → 同上（大文字小文字違いでも不可）
  ❌ body/recipient をオブジェクト形式で渡す → Runtime "Missing body content"
  ❌ Dataverse workflows テーブルに直接 INSERT → 接続認証が正しく構成されず Runtime エラー
  ❌ connectionName キーを使用 → Flow API デプロイ時は connection キーが正しい

✅ デプロイ方法:
  Flow API（https://api.flow.microsoft.com/providers/Microsoft.PowerApps/apis/shared_logicflows/flows）
  でフローを作成・更新する。Dataverse workflows テーブルではなく Flow API を使うことで
  接続認証が正しく構成される。
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

### PowerApp 応答アクション（Respond to a PowerApp or flow）— パラメータ形式（★ 重要）

Code Apps にフロー実行結果を返す「応答」アクション。
トリガーと同様に、パラメータ形式を UI 手動追加と合わせる必要がある。

```
★ 正しいパラメータ形式（UI で手動追加した場合と同一）:
  ✅ "x-ms-content-hint": "TEXT"
  ✅ "x-ms-dynamically-added": true
  ✅ "additionalProperties": {} を schema に含める

❌ 間違ったパラメータ形式:
  ❌ "x-ms-powerflows-param-ispartial": false
  ❌ "description" フィールド（UI では生成されない）
  → UI で表示が崩れる / Code Apps SDK の型生成に影響する可能性あり
```

```python
"応答": {
    "runAfter": {"Previous_Action": ["Succeeded"]},
    "type": "Response",
    "kind": "PowerApp",
    "inputs": {
        "statusCode": 200,
        "body": {
            "airesult": "@{outputs('AI_Action')?['body/responsev2/predictionOutput/text']}",
            "bookingid": "@{triggerBody()['text']}",
        },
        "schema": {
            "type": "object",
            "properties": {
                "airesult": {
                    "title": "airesult",           # パラメータの表示名
                    "type": "string",
                    "x-ms-content-hint": "TEXT",    # ★ 必須
                    "x-ms-dynamically-added": True,  # ★ 必須
                },
                "bookingid": {
                    "title": "bookingid",
                    "type": "string",
                    "x-ms-content-hint": "TEXT",
                    "x-ms-dynamically-added": True,
                },
            },
            "additionalProperties": {},  # ★ 必須（UI が自動付与する）
        },
    },
},
```

```
重要ポイント:
  ✅ body の各キーと schema.properties のキーを一致させる
  ✅ body の値には Power Automate 式（@{...}）で動的コンテンツを設定
  ✅ schema の title は body のキー名と同一にする
  ✅ additionalProperties: {} を必ず含める（UI が自動生成する属性）

Code Apps 側の生成結果:
  npx power-apps add-flow --flow-id {id} 実行後、
  src/generated/models/ の ResponseActionOutput に型が生成される:
    airesult → airesult?: string  (optional)
    bookingid → bookingid?: string  (optional)
  → CodeappsFlowService.Run(input) の戻り値 result.data で参照

トリガー + 応答の全体構成例:
  PowerAppV2 トリガー（text, text_1 ... で入力受信）
  → アクション群（AI Builder 等で処理）
  → Response/PowerApp（処理結果を body で返却）
  → Code Apps 側で result.data.airesult 等で参照
```
