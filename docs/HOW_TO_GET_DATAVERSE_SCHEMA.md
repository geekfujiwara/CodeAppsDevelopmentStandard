# DataverseテーブルスキーマをCLIから取得する方法

> **📘 関連ドキュメント**
>
> スキーマ取得は、Dataverse接続の一部です。接続全体の流れを理解したい方は、まず以下をご覧ください:
> - **[DataverseテーブルCLIガイド](./DATAVERSE_TABLE_CLI_GUIDE.md)** ⭐ 新フロー: CLIでテーブル作成・スキーマ設計
> - **[Dataverse接続 完全ガイド](./DATAVERSE_CONNECTION_GUIDE.md)** - データソース追加からCRUD実装まで完全網羅

Power Platform CLIでDataverseテーブルのスキーマ情報（選択肢列の許容値を含む）を取得する方法をまとめました。

> **📢 新しい開発方針**: テーブル設計はCLIで行います。手動UIでの確認やXMLエクスポートは廃止しました。
> 新規・既存テーブルのどちらも `pac` CLIでスキーマを取得・管理します。

## ✅ 推奨される方法

### 方法1: pac solution export でYAML/XML定義を取得 ⭐ 最推奨

既存テーブルのスキーマをCLIで取得する最も確実な方法です。

```bash
# 1. ソリューションにテーブルを追加
pac solution add-component \
  --solution-name "GeekTaskManager" \
  --component "geek_project_task" \
  --component-type "Table"

# 2. ソリューションをエクスポート
pac solution export \
  --name "GeekTaskManager" \
  --path ./solutions/exports \
  --managed false

# 3. ZIPを展開してテーブル定義を確認
unzip ./solutions/exports/GeekTaskManager.zip -d ./solutions/exports/GeekTaskManager

# 4. テーブル定義XMLを確認
cat ./solutions/exports/GeekTaskManager/Entities/geek_project_task/Entity.xml
```

**取得できる情報:**
- ✅ 全カラムの型・表示名・必須/任意
- ✅ 選択肢列（Picklist）の全許容値
- ✅ リレーションシップ定義
- ✅ テーブルの論理名・スキーマ名

**メリット:**
- ✅ 完全自動化が可能
- ✅ 選択肢値を含む完全なスキーマが取得できる
- ✅ Gitでバージョン管理できる
- ✅ CI/CDパイプラインに組み込める

---

### 方法2: pac modelbuilder build でC#型定義を生成（スキーマ確認用）

選択肢列の値を含むスキーマ情報をC#コードとして生成します。

```bash
# 既存テーブルからC#型定義を生成
pac modelbuilder build \
  --outdirectory ./generated-models \
  --entitynamesfilter "geek_project_task;geek_project" \
  --generateGlobalOptionSets \
  --language CS

# 生成されたC#コードには選択肢列の定義が含まれます:
# public enum geek_priority
# {
#     Critical = 0,
#     High = 1,
#     Medium = 2,
#     Low = 3
# }
```

**メリット:**
- ✅ 選択肢の値が定数として生成される
- ✅ 型安全
- ✅ CLI自動化可能

**デメリット:**
- C#コード（TypeScriptではない）
- 手動でTypeScriptに変換が必要

---

### 方法3: npx @microsoft/power-apps-cli add-data-source の生成ファイルを活用

既にプロジェクトに追加されているデータソースのスキーマは、生成されたファイルから確認できます。

```bash
# データソースを追加（スキーマも自動取得）
npx @microsoft/power-apps-cli add-data-source -a dataverse -t geek_project_task
```

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

---

### 方法4: Power Platform Maker Portal（参考・補助的用途）

1. **https://make.powerapps.com** にアクセス
2. **テーブル** → 対象テーブル（例: `geek_project_task`）を選択
3. **列** タブで各列の詳細を確認
4. 選択肢列（Picklist）をクリックすると、**許容値と表示名**が表示される

**用途:** CLIで取得できない情報を補足確認する際に使用します（主要な手段ではありません）。

---

### 方法5: Dataverse Web API（高度な自動化）

PowerShellやcURLでDataverse Web APIを直接呼び出してメタデータを取得できます。

```powershell
# 認証トークンを取得（既存のpac認証を使用）
$orgUrl = "https://org12345.crm7.dynamics.com" # 環境のURL

# EntityDefinitionsエンドポイントでテーブルメタデータを取得
$tableName = "geek_project_task"
$apiUrl = "$orgUrl/api/data/v9.2/EntityDefinitions(LogicalName='$tableName')?`$select=LogicalName,SchemaName&`$expand=Attributes(`$select=LogicalName,SchemaName,AttributeType;`$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Picklist')"

Invoke-RestMethod -Uri $apiUrl -Headers @{
    "Authorization" = "Bearer $token"
    "OData-MaxVersion" = "4.0"
    "OData-Version" = "4.0"
    "Accept" = "application/json"
}
```

---

## 📝 推奨ワークフロー（CLIベース）

```bash
# 1. pac CLIで既存テーブルのスキーマをエクスポート
pac solution export --name "MySolution" --path ./schemas --managed false

# 2. 展開してEntity.xmlを確認・編集
unzip ./schemas/MySolution.zip -d ./schemas/MySolution

# 3. 新規列を追加する場合はEntity.xmlを直接編集

# 4. 変更をPushして反映
pac solution push --solution-folder ./schemas/MySolution
```

---

## ✅ まとめ

| 方法 | 難易度 | 自動化 | 選択肢値 | 推奨度 |
|------|--------|--------|----------|--------|
| pac solution export | ⭐⭐ 普通 | ✅ 可能 | ✅ 完全 | ⭐⭐⭐⭐⭐ ⭐ **最推奨** |
| pac modelbuilder build | ⭐⭐ 普通 | ✅ 可能 | ✅ 完全 | ⭐⭐⭐⭐ |
| add-data-source スキーマJSON | ⭐ 簡単 | ✅ 可能 | ❌ 型のみ | ⭐⭐⭐ |
| Web API | ⭐⭐⭐ 難しい | ✅ 可能 | ✅ 完全 | ⭐⭐⭐ |
| Maker Portal | ⭐ 簡単 | ❌ 不可 | ✅ 完全 | ⭐⭐（補助的）|

**結論:**
- **スキーマ取得**: `pac solution export` でCLIから取得（最推奨）
- **型定義生成**: `pac modelbuilder build` で自動生成
- **Code Apps統合**: `npx @microsoft/power-apps-cli add-data-source` で自動生成

---

## 📚 参考リンク

- [DataverseテーブルCLIガイド](./DATAVERSE_TABLE_CLI_GUIDE.md) ⭐ 新フロー
- [Dataverse Web API リファレンス](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/overview)
- [EntityMetadata Web API](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/retrieve-metadata-web-api)
- [pac solution コマンドリファレンス](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/reference/solution)
- [pac modelbuilder コマンドリファレンス](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/reference/modelbuilder)
