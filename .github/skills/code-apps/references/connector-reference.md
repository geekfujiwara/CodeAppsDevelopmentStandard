# コネクタ設定 詳細リファレンス

Power Apps Code Apps でサポートされるコネクタの設定方法と使用例を記載します。

---

## 目次

- [コネクタ追加の基本手順](#コネクタ追加の基本手順)
- [Office 365 Users](#office-365-users)
- [SQL Server / Azure SQL](#sql-server--azure-sql)
- [SharePoint](#sharepoint)
- [Dataverse](#dataverse)
- [OneDrive for Business](#onedrive-for-business)
- [Microsoft Teams](#microsoft-teams)
- [MSN Weather](#msn-weather)
- [Microsoft Translator V2](#microsoft-translator-v2)
- [Azure Data Explorer](#azure-data-explorer)
- [Office 365 Groups](#office-365-groups)

---

## コネクタ追加の基本手順

すべてのコネクタは以下の統一手順で追加します:

```bash
# 1. 接続 ID を確認
pac connection list

# 2. コネクタを接続参照として追加
npx pa app add data-source --connector {api-name} --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

追加後、以下が自動生成されます:

- `src/services/{ServiceName}Service.ts` - コネクタ操作のサービスクラス
- `src/models/{ModelName}.ts` - TypeScript 型定義
- `power.config.json` の `dataSources` セクションが更新

---

## Office 365 Users

**API 名**: `shared_office365users`

### セットアップ

```bash
npx pa app add data-source --connector shared_office365users --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 主要メソッド

| メソッド                          | 説明                               |
| --------------------------------- | ---------------------------------- |
| `MyProfile_V2(select?)`           | 現在のユーザーのプロフィールを取得 |
| `UserProfile_V2(id, select?)`     | 指定ユーザーのプロフィールを取得   |
| `UserPhoto_V2(id)`                | ユーザーの写真を取得               |
| `SearchUser_V2(searchTerm, top?)` | ユーザーを検索                     |
| `DirectReports_V2(id)`            | 直属の部下を取得                   |
| `Manager_V2(id)`                  | マネージャーを取得                 |

### 使用例

```typescript
import { Office365UsersService } from "../services/Office365UsersService";

// プロフィール取得
const profile = await Office365UsersService.MyProfile_V2(
  "id,displayName,jobTitle,department,mail,userPrincipalName",
);

// ユーザー写真取得
try {
  const photo = await Office365UsersService.UserPhoto_V2(profile.data.id);
  // photo.data を Blob として処理
} catch {
  console.info("ユーザー写真が設定されていません");
}

// ユーザー検索
const results = await Office365UsersService.SearchUser_V2("田中", 10);
```

---

## SQL Server / Azure SQL

**API 名**: `shared_sql`

### セットアップ

```bash
npx pa app add data-source --connector shared_sql --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { SqlService } from "../services/SqlService";

// テーブルからデータ取得
const items = await SqlService.GetItems("{server}", "{database}", "{table}");

// レコード挿入
await SqlService.PostItem("{server}", "{database}", "{table}", {
  Name: "新規レコード",
  Status: "Active",
});

// レコード更新
await SqlService.PatchItem("{server}", "{database}", "{table}", "{id}", {
  Status: "Completed",
});

// ストアドプロシージャ実行
const result = await SqlService.ExecuteStoredProcedure(
  "{server}",
  "{database}",
  "{procedure}",
  { param1: "value1" },
);
```

---

## SharePoint

**API 名**: `shared_sharepointonline`

### セットアップ

```bash
npx pa app add data-source --connector shared_sharepointonline --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { SharePointService } from "../services/SharePointService";

// リストアイテム取得
const items = await SharePointService.GetItems(
  "{site-url}",
  "{list-id}",
  "$filter=Status eq 'Active'&$top=100",
);

// リストアイテム作成
await SharePointService.PostItem("{site-url}", "{list-id}", {
  Title: "新規アイテム",
  Status: "Draft",
});
```

---

## Dataverse

**API 名**: `shared_commondataserviceforapps`

### セットアップ

```bash
# 標準: 接続参照（Connection Reference）にバインドして 1 回だけ追加（全テーブル共通・ソリューション同梱可）
# 接続参照は事前に scripts/setup_connection_reference.py で用意しておく
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-ref {CONNECTION_REFERENCE_LOGICAL_NAME} \
  --solution-id {SOLUTION_ID} \
  --org-url {DATAVERSE_URL} --non-interactive

# PoC 等でソリューション不要な場合のみ: 接続 ID 直バインド
npx pa connection list
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-id {connection-id} \
  --org-url {DATAVERSE_URL} --non-interactive
```

| バインド方式 | `power.config.json` | ソリューション同梱 | 用途 |
|---|---|---|---|
| `--connection-ref {logical-name} --solution-id {SOLUTION_ID}` | `xrmConnectionReferenceLogicalName` | ✅ | **標準**（ALM・環境間移送） |
| `--connection-id {id}` | `authenticationType: "Oauth"` | ✗ | PoC・使い捨て |

> **接続参照にしても「1 回で全テーブル」は不変**（検証済み）
> `--connector shared_commondataserviceforapps` は**コネクタ単位**の指定でテーブル名ではない。
> 接続参照バインドでも生成物は `MicrosoftDataverseService.ts` / `MicrosoftDataverseModel.ts` の 2 ファイルのみ、
> 生成メソッドも同一で、テーブルは実行時の `entityName` で指定する。**アプリ側コードの変更は不要**。
> 詳細・確認コマンドは [ソリューション ALM リファレンス](solution-alm.md)。

> **接続参照は CLI では作成できない**
> `--connection-ref` に未存在の論理名を渡すと `Failed to resolve connection ID for reference '...'` で失敗する（自動作成されない）。
> `pac connection create` / `npx pa connection create` はいずれも**接続**を作るコマンドで接続参照ではない。
> Dataverse Web API（`POST /connectionreferences`）で作成する
> [scripts/setup_connection_reference.py](../scripts/setup_connection_reference.py) を標準とする。

> **バインドを差し替えるとき**: `pa app add data-source` は既存データソースを上書きせず `_1` 等の別名で増える。
> 先に削除してから再追加する（フラグ名は `-n/--data-source-name`。`--data-source` は無効）。
> ```bash
> npx pa app remove data-source --connector shared_commondataserviceforapps \
>   --data-source-name commondataserviceforapps --force
> ```

> **Microsoft Learn との比較**
> - Learn の Dataverse 接続ガイドは `pac code add-data-source -a dataverse -t <table-logical-name>` を基本手順としている
> - この節は **connector-first** に寄せて、`shared_commondataserviceforapps` から
>   `MicrosoftDataverseService` / `MicrosoftDataverseModel` を生成する場合の使い方を説明している
> - つまり **Learn 標準 = テーブル単位の型付き追加**、**本節 = 単一コネクタで全テーブル共通 CRUD** という違いがある
> - Microsoft Learn には両者の明確な性能差は記載されていない。通常は接続方式よりも
>   Dataverse クエリの絞り込み、ページング、不要な API 呼び出しの削減の方が効く
> - なお `-a dataverse -t {table}` 方式は `databaseReferences` 側に載るため**接続参照にできない**。
>   ALM 適性の面でも connector-first の方が有利
>
> **ポイント**
> - 1 回の追加で `MicrosoftDataverseService` / `MicrosoftDataverseModel` が生成され、`entityName` を実行時パラメータとして全テーブルを扱える。
> - `ListRecordsWithOrganization` / `CreateRecordWithOrganization` など **`*WithOrganization` 系**を使い、`organization` に対象環境の Dataverse URL を必ず渡す。
> - `organization` を省略すると `Invalid organization URL 'null' provided` で失敗する。
> - Lookup 列の `@odata.bind` 書き込み規約はネイティブ Dataverse 接続と同様に使える。

### 使用例

```typescript
import { getContext } from "@microsoft/power-apps/app";
import { MicrosoftDataverseService } from "../generated/services/MicrosoftDataverseService";

const ctx = await getContext();
const organization = ctx.app.dataverseOrgUrl;

// テーブルからレコード取得（entityName を毎回渡す）
const accounts = await MicrosoftDataverseService.ListRecordsWithOrganization(
  organization,
  "accounts",
  'odata.include-annotations="*"',
  "application/json",
  undefined,
  undefined,
  "name,revenue",
  "revenue gt 1000000",
  "createdon desc",
  undefined,
  undefined,
  50,
);

// レコード作成
await MicrosoftDataverseService.CreateRecordWithOrganization(
  "return=representation",
  "application/json",
  organization,
  "accounts",
  {
    name: "新規取引先",
    revenue: 5000000,
    "primarycontactid@odata.bind": "/contacts({contact-id})",
  },
);

// レコード更新
await MicrosoftDataverseService.UpdateRecordWithOrganization(
  "return=representation",
  "application/json",
  organization,
  "accounts",
  "{record-id}",
  { revenue: 7500000 },
);

// レコード削除
await MicrosoftDataverseService.DeleteRecordWithOrganization(
  organization,
  "accounts",
  "{record-id}",
);
```

---

## OneDrive for Business

**API 名**: `shared_onedriveforbusiness`

### セットアップ

```bash
npx pa app add data-source --connector shared_onedriveforbusiness --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { OneDriveService } from "../services/OneDriveService";

// ファイル一覧取得
const files = await OneDriveService.ListFolder("{folder-path}");

// ファイルコンテンツ取得
const content = await OneDriveService.GetFileContent("{file-id}");

// ファイルアップロード
await OneDriveService.CreateFile("{folder-path}", "{filename}", fileContent);
```

---

## Microsoft Teams

**API 名**: `shared_teams`

### セットアップ

```bash
npx pa app add data-source --connector shared_teams --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { TeamsService } from "../services/TeamsService";

// チーム一覧取得
const teams = await TeamsService.GetAllTeams();

// チャネル一覧取得
const channels = await TeamsService.GetChannelsForGroup("{team-id}");

// メッセージ送信
await TeamsService.PostMessageToChannel("{team-id}", "{channel-id}", {
  body: { content: "メッセージ内容" },
});
```

---

## MSN Weather

**API 名**: `shared_msnweather`

### セットアップ

```bash
npx pa app add data-source --connector shared_msnweather --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { MsnWeatherService } from "../services/MsnWeatherService";

// 現在の天気を取得
const weather = await MsnWeatherService.CurrentWeather("Tokyo, JP", "ja-JP");

// 天気予報を取得
const forecast = await MsnWeatherService.TodaysForecast("Tokyo, JP", "ja-JP");
```

---

## Microsoft Translator V2

**API 名**: `shared_microsofttranslator`

### セットアップ

```bash
npx pa app add data-source --connector shared_microsofttranslator --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { TranslatorService } from "../services/TranslatorService";

// テキスト翻訳
const translated = await TranslatorService.Translate(
  "Hello, World!",
  "ja", // 翻訳先言語
);
```

---

## Azure Data Explorer

**API 名**: `shared_kusto`

### セットアップ

```bash
npx pa app add data-source --connector shared_kusto --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { KustoService } from "../services/KustoService";

// KQL クエリ実行
const result = await KustoService.RunQuery(
  "{cluster-url}",
  "{database}",
  "StormEvents | take 10",
);
```

---

## Office 365 Groups

**API 名**: `shared_office365groups`

### セットアップ

```bash
npx pa app add data-source --connector shared_office365groups --connection-ref {connection-reference-logical-name} --solution-id {SOLUTION_ID} --org-url {DATAVERSE_URL} --non-interactive
```

### 使用例

```typescript
import { Office365GroupsService } from "../services/Office365GroupsService";

// 所属グループ取得
const groups = await Office365GroupsService.ListOwnedGroups();

// グループメンバー取得
const members = await Office365GroupsService.ListGroupMembers("{group-id}");
```
