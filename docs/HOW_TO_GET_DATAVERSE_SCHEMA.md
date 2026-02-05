# DataverseテーブルスキーマをCLIから取得する方法

> **📘 関連ドキュメント**
>
> スキーマ取得は、Dataverse接続の一部です。接続全体の流れを理解したい方は、まず以下をご覧ください:
> - **[Dataverse接続 完全ガイド](./DATAVERSE_CONNECTION_GUIDE.md)** - データソース追加からCRUD実装まで完全網羅

Power Platform CLIでDataverseテーブルのスキーマ情報（選択肢列の許容値を含む）を取得する方法をまとめました。

## ❌ 直接的なCLIコマンドは存在しない

残念ながら、`pac`コマンドには以下のような直接的なスキーマ取得コマンドは**存在しません**:
- `pac table describe`（存在しない）
- `pac metadata get`（存在しない）
- `pac schema export`（存在しない）

## ✅ 推奨される方法

### 方法1: Power Platform Maker Portal（最も簡単）

1. **https://make.powerapps.com** にアクセス
2. **テーブル** → 対象テーブル（例: `geek_project_task`）を選択
3. **列** タブで各列の詳細を確認
4. 選択肢列（Picklist）をクリックすると、**許容値と表示名**が表示される

**メリット:**
- GUIで視覚的に確認できる
- 最も正確で最新の情報
- エクスポート機能あり（Excel形式）

**デメリット:**
- 手動作業
- 自動化が困難

---

### 方法2: Dataverse Web API（自動化可能）

PowerShellやcURLでDataverse Web APIを直接呼び出してメタデータを取得できます。

#### PowerShellスクリプト例:

```powershell
# 認証トークンを取得（既存のpac認証を使用）
$env = "28130368-fe41-e701-a32b-2b413ac21d0b"
$orgUrl = "https://org12345.crm7.dynamics.com" # 環境のURL

# EntityDefinitionsエンドポイントでテーブルメタデータを取得
$tableName = "geek_project_task"
$apiUrl = "$orgUrl/api/data/v9.2/EntityDefinitions(LogicalName='$tableName')?`$select=LogicalName,SchemaName&`$expand=Attributes(`$select=LogicalName,SchemaName,AttributeType;`$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Picklist')"

# pac authで認証済みトークンを使用
# 実際のトークン取得方法は環境に依存
Invoke-RestMethod -Uri $apiUrl -Headers @{
    "Authorization" = "Bearer $token"
    "OData-MaxVersion" = "4.0"
    "OData-Version" = "4.0"
    "Accept" = "application/json"
}
```

#### 選択肢列の値を取得:

```powershell
# 特定の選択肢列のメタデータを取得
$attributeName = "geek_priority"
$apiUrl = "$orgUrl/api/data/v9.2/EntityDefinitions(LogicalName='$tableName')/Attributes(LogicalName='$attributeName')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"

# レスポンス例:
# {
#   "OptionSet": {
#     "Options": [
#       { "Value": 0, "Label": { "UserLocalizedLabel": { "Label": "Critical" } } },
#       { "Value": 1, "Label": { "UserLocalizedLabel": { "Label": "High" } } }
#     ]
#   }
# }
```

**メリット:**
- 完全な自動化が可能
- CI/CDパイプラインに組み込める
- プログラム的に処理できる

**デメリット:**
- 認証トークンの取得が複雑
- APIエンドポイントの知識が必要

---

### 方法3: `pac code add-data-source` の生成ファイルを活用

既にプロジェクトに追加されているデータソースのスキーマは、生成されたファイルから確認できます。

#### 確認場所:

```
.power/schemas/dataverse/
├── ______.Schema.json       (geek_projecrt)
└── _________.Schema.json    (geek_project_task)
```

ただし、**選択肢列の許容値は含まれていません**。型情報のみです。

```json
{
  "geek_priority": {
    "type": "string",
    "title": "priority",
    "x-ms-dataverse-attribute": "geek_priority",
    "x-ms-dataverse-type": "PicklistType"
  }
}
```

**メリット:**
- プロジェクトに既に存在
- 型情報は正確

**デメリット:**
- 選択肢の許容値が含まれていない
- 手動で確認が必要

---

### 方法4: `pac modelbuilder build` でC#コード生成（間接的）

C#のエンティティクラスを生成することで、間接的にスキーマ情報を取得できます。

```powershell
pac modelbuilder build `
  --outdirectory "./dataverse-models" `
  --entitynamesfilter "geek_project_task;geek_projecrt" `
  --generateGlobalOptionSets `
  --language CS
```

生成されるC#コードには、選択肢列の定義が含まれます:

```csharp
public enum geek_priority
{
    Critical = 0,
    High = 1
}
```

**メリット:**
- 選択肢の値が定数として生成される
- 型安全

**デメリット:**
- C#コード（TypeScriptではない）
- 手動でTypeScriptに変換が必要
- プロジェクトに直接使えない

---

### 方法5: Power Apps Copilot / Dataverse Accelerator（参考）

Power Appsの開発者向けツールを使用:

1. **Dataverse Accelerator** VS Code拡張機能をインストール
2. テーブルを右クリック → "View Metadata"
3. JSON形式でスキーマ情報が表示される

---

## 📝 実践的なワークフロー（推奨）

### ステップ1: Power Platform Maker Portalで確認

```
1. https://make.powerapps.com を開く
2. テーブル → geek_project_task
3. 列 → geek_priority
4. 選択肢の値をメモ:
   - 0: Critical
   - 1: High
```

### ステップ2: スキーマリファレンスファイルに記録

プロジェクトに`DATAVERSE_SCHEMA_REFERENCE.md`を作成して記録:

```markdown
## geek_priority（優先度）
| 値 | 表示名 | 備考 |
|----|--------|------|
| 0  | Critical | 重要 |
| 1  | High     | 高   |
```

### ステップ3: TypeScriptマッピングファイルに反映

```typescript
// src/utils/dataverseChoiceMapping.ts
export const PriorityChoiceMap = {
  Critical: 0,
  High: 1
};
```

---

## 🔧 自動化スクリプト例（PowerShell）

完全自動でスキーマを取得するPowerShellスクリプト:

```powershell
# get-dataverse-schema.ps1
param(
    [string]$TableName = "geek_project_task"
)

# 現在の認証情報を取得
$authList = pac auth list --json | ConvertFrom-Json
$activeAuth = $authList | Where-Object { $_.IsUniversal -eq $true }

if (!$activeAuth) {
    Write-Error "認証されていません。pac auth create を実行してください。"
    exit 1
}

$orgUrl = $activeAuth.Url

# Web APIでメタデータを取得
# 注: 実際にはpac auth後のトークンを使用する必要があります
# この例は簡略化されています

Write-Host "テーブル: $TableName のスキーマを取得中..." -ForegroundColor Cyan
Write-Host "環境URL: $orgUrl" -ForegroundColor Gray

# 実際の実装では、Azure AD認証トークンを取得してAPIを呼び出します
# この部分は環境に応じてカスタマイズが必要です

Write-Host "`n完了！Maker Portalで手動確認をお勧めします:" -ForegroundColor Green
Write-Host "https://make.powerapps.com" -ForegroundColor Cyan
```

---

## ✅ まとめ

| 方法 | 難易度 | 自動化 | 選択肢値 | 推奨度 |
|------|--------|--------|----------|--------|
| Maker Portal | ⭐ 簡単 | ❌ 不可 | ✅ 完全 | ⭐⭐⭐⭐⭐ |
| Web API | ⭐⭐⭐ 難しい | ✅ 可能 | ✅ 完全 | ⭐⭐⭐⭐ |
| スキーマJSON | ⭐⭐ 普通 | ✅ 可能 | ❌ 型のみ | ⭐⭐ |
| modelbuilder | ⭐⭐⭐ 難しい | ✅ 可能 | ✅ 完全 | ⭐⭐ |
| VS Code拡張 | ⭐⭐ 普通 | ❌ 不可 | ✅ 完全 | ⭐⭐⭐ |

**結論:** 
- **開発初期**: Maker Portalで手動確認 → `DATAVERSE_SCHEMA_REFERENCE.md`に記録
- **本番運用**: Web APIを使った自動スクリプトを検討

---

## 📚 参考リンク

- [Dataverse Web API リファレンス](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/overview)
- [EntityMetadata Web API](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/retrieve-metadata-web-api)
- [Power Platform CLI リファレンス](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/reference/auth)
