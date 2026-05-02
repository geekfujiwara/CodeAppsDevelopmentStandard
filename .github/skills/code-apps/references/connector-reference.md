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

# 2. コネクタを追加
pac code add-data-source -a {api-name} -c {connection-id}
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
pac code add-data-source -a shared_office365users -c {connection-id}
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
pac code add-data-source -a shared_sql -c {connection-id}
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
pac code add-data-source -a shared_sharepointonline -c {connection-id}
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

**API 名**: `dataverse`

### セットアップ

```bash
# 推奨: npx 経由（SDK v1.0.x 対応）
npx power-apps add-data-source --api-id dataverse \
  --resource-name {table-logical-name} \
  --org-url {DATAVERSE_URL} --non-interactive

# レガシー: pac cli 経由（SDK v0.3.x のみ動作）
pac code add-data-source -a dataverse -t {table-logical-name}
```

> **⚠️ 日本語環境での注意**: テーブルの DisplayName が日本語の場合、`Failed to sanitize string` エラーが発生する。`node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js` の `sanitizeName()` 関数内の正規表現を Unicode 対応にパッチすること。詳細は [開発標準 §1.2](./POWER_PLATFORM_DEVELOPMENT_STANDARD.md) を参照。

### 使用例

```typescript
import { DataverseService } from "../services/DataverseService";

// テーブルからレコード取得
const accounts = await DataverseService.GetItems(
  "accounts",
  "$select=name,revenue&$filter=revenue gt 1000000&$top=50",
);

// レコード作成
await DataverseService.PostItem("accounts", {
  name: "新規取引先",
  revenue: 5000000,
});

// レコード更新
await DataverseService.PatchItem("accounts", "{record-id}", {
  revenue: 7500000,
});

// レコード削除
await DataverseService.DeleteItem("accounts", "{record-id}");
```

---

## OneDrive for Business

**API 名**: `shared_onedriveforbusiness`

### セットアップ

```bash
pac code add-data-source -a shared_onedriveforbusiness -c {connection-id}
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
pac code add-data-source -a shared_teams -c {connection-id}
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
pac code add-data-source -a shared_msnweather -c {connection-id}
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
pac code add-data-source -a shared_microsofttranslator -c {connection-id}
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
pac code add-data-source -a shared_kusto -c {connection-id}
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
pac code add-data-source -a shared_office365groups -c {connection-id}
```

### 使用例

```typescript
import { Office365GroupsService } from "../services/Office365GroupsService";

// 所属グループ取得
const groups = await Office365GroupsService.ListOwnedGroups();

// グループメンバー取得
const members = await Office365GroupsService.ListGroupMembers("{group-id}");
```
