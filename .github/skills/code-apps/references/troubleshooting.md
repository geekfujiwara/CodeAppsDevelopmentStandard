# Code Apps トラブルシューティング

Code Apps（TypeScript + React）開発で頻出する問題と対処法。

> 参考: このリファレンスは [Code Apps スキル一覧](../SKILL.md) から参照する想定です。関連資料や他のリファレンスは `SKILL.md` の冒頭一覧から確認できます。

---

## 1. Dataverse フィルターで GUID にシングルクォートを付けてはいけない

### 症状

`retrieveMultipleRecordsAsync` のフィルターでレコードが 0 件返る。エラーは出ない。

### 原因

Code Apps SDK の OData フィルターでは、GUID 値を文字列としてシングルクォートで囲むと一致しない。
Dataverse Web API / Code Apps SDK では、GUID 比較は **`eq guid-value`（クォートなし）** の形式で書くのが適切。
`eq 'guid-value'` のような書き方は GUID を文字列比較しているように見えやすく、Code Apps SDK では期待どおり動作しない。

### 例

```typescript
// ❌ レコードが返らない
filter: `_parentaccountid_value eq '${accountId}'`

// ✅ 正しい構文
filter: `_parentaccountid_value eq ${accountId}`
```

### 影響範囲

すべてのルックアップ列フィルター（`_xxx_value eq ...`）に共通。
`retrieveMultipleRecordsAsync` / `retrieveRecordAsync` 両方に適用される。

---

## 2. power.config.json の未使用 connectionReferences でデプロイ 400 エラー

### 症状

`pac code push` / `npx power-apps push` で HTTP 400 エラー。

### 原因

`power.config.json` の `connectionReferences` に、環境に存在しない接続参照
（削除済みフロー・Copilot Studio コネクタ等）が残っている。

### 対処

```jsonc
// power.config.json — 使用していない connectionReferences を削除
{
  "connectionReferences": {
    // ❌ 存在しないフロー接続 → 削除する
    // "workflowDetails": { ... }
  }
}
```

### 予防

コネクタやフローを削除した後は、`power.config.json` の `connectionReferences` から
対応エントリを手動削除すること。

---

## 3. pac code push のテレメトリエラーは無視可能

### 症状

デプロイ後に以下のエラーが出力される:
```
CliLogger: failed to initialize OneDS telemetry writer Error: Network request failed
```

### 判断基準

`App pushed successfully` が出力されていればデプロイは成功。
テレメトリ初期化のタイムアウトは pac CLI 内部の telemetry 送信の問題であり、アプリには影響しない。

---

## 4. OData FormattedValue でルックアップ表示名を取得する

### 課題

ルックアップ列（`_ownerid_value` 等）の ID だけでは表示名がわからない。
追加クエリで `systemuser` テーブルを引くのは N+1 問題になる。

### 解決策

`select` にルックアップ列名を含めると、SDK が自動的に OData アノテーションを返す。

```typescript
const result = await client.retrieveMultipleRecordsAsync(
  "opportunities",
  {
    select: ["opportunityid", "name", "_ownerid_value"],  // ← ルックアップ列を含める
    filter: `_parentaccountid_value eq ${accountId}`,
  },
);

const record = result.data[0];

// 表示名の取得
const ownerName = record["_ownerid_value@OData.Community.Display.V1.FormattedValue"];
// → "山田 太郎"
```

### 利用可能なアノテーション

| アノテーション | 内容 |
|---|---|
| `@OData.Community.Display.V1.FormattedValue` | ルックアップ先の表示名 |
| `@Microsoft.Dynamics.CRM.lookuplogicalname` | ルックアップ先のテーブル論理名 |

### 型定義の注意

TypeScript の interface にアノテーション付きプロパティを含める場合:
```typescript
export interface Opportunity {
  opportunityid: string;
  name: string;
  _ownerid_value?: string;
  "_ownerid_value@OData.Community.Display.V1.FormattedValue"?: string;
}
```

---

## 5. MDA レコードフォームへのリンク URL パターン

### 用途

Code Apps から Dynamics 365 / モデル駆動型アプリのレコードフォームを開くリンクを生成する。

### URL パターン

```
https://{org}.crm7.dynamics.com/main.aspx?pagetype=entityrecord&etn={entityLogicalName}&id={recordId}
```

### エンティティ論理名の対応表

| 表示名 | 論理名 |
|---|---|
| 取引先企業 | `account` |
| 営業案件 | `opportunity` |
| 提案製品 | `opportunityproduct` |
| サポート案件 | `incident` |
| 作業指示書 | `msdyn_workorder` |
| 顧客資産 | `msdyn_customerasset` |
| IoT アラート | `msdyn_iotalert` |
| 機能の場所 | `msdyn_functionallocation` |

### 実装例

```typescript
const MDA_BASE = "https://{org}.crm7.dynamics.com/main.aspx";

function getMdaUrl(entityLogicalName: string, recordId: string): string {
  return `${MDA_BASE}?pagetype=entityrecord&etn=${entityLogicalName}&id=${recordId}`;
}
```

> **Note**: `appid` パラメータを省略すると、ユーザーのデフォルト MDA で開く。
> 特定のアプリで開きたい場合は `&appid={app-guid}` を追加する。

---

## 6. orderBy は必ず配列で渡す（文字列不可）

### 症状

`retrieveMultipleRecordsAsync` が `{ success: false, error: {} }` を返し、
コンソールに以下のエラーが表示される:

```
Invalid operation parameters: orderBy must be an array of strings
```

### 原因

Code Apps SDK の `orderBy` パラメータは **文字列の配列** のみ受け付ける。
文字列を直接渡すとバリデーションエラーになり、クエリが実行されない。

### 例

```typescript
// ❌ 文字列 → バリデーションエラー
const result = await client.retrieveMultipleRecordsAsync(
  "opportunities",
  {
    select: ["opportunityid", "name"],
    filter: `_parentaccountid_value eq ${accountId}`,
    orderBy: "createdon desc",  // ← string はダメ
  },
);

// ✅ 配列 → 正常動作
const result = await client.retrieveMultipleRecordsAsync(
  "opportunities",
  {
    select: ["opportunityid", "name"],
    filter: `_parentaccountid_value eq ${accountId}`,
    orderBy: ["createdon desc"],  // ← string[] が必須
  },
);
```

### 補足

- 複数カラムでソートする場合: `orderBy: ["createdon desc", "name asc"]`
- TypeScript の型定義では `string[]` になっているが、コード補完時に文字列を渡しても tsc エラーにならないケースがあるため注意
- このエラーは HTTP 400 ではなく SDK 内部のバリデーションで発生するため、ネットワークタブには何も出ない

---

## 7. `$select` (select オプション) がカスタムテーブルで 0 件を返す

### 症状

`retrieveMultipleRecordsAsync` に `select` オプションを指定すると、
フィルター条件に一致するレコードが存在するにもかかわらず結果が 0 件になる。
`select` を省略すると正常にレコードが返る。

### 原因

一部のカスタムテーブル（特に Lookup 列が多い中間テーブルやリレーションテーブル）で、
Code Apps SDK が `$select` 付き OData クエリを正しく処理できないケースがある。
原因は SDK 内部の列名解決またはメタデータキャッシュに起因すると推測される。

### 影響を受けやすいテーブルの特徴

- カスタムの中間テーブル（N:N リレーション的な用途）
- Lookup 列が 3 つ以上あるテーブル
- ルックアップ値 (`_xxx_value`) をフィルター条件に使用している場合

### 回避策

```typescript
// ❌ select 指定で 0 件になる場合がある
const result = await client.retrieveMultipleRecordsAsync(
  "rcwr_resourceareapriorities",
  {
    select: ["rcwr_name", "_rcwr_resourceid_value", "_rcwr_territoryid_value"],
    filter: `_rcwr_territoryid_value eq ${territoryId} and rcwr_isactive eq true`,
    orderBy: ["rcwr_priority asc"],
  }
);

// ✅ select を省略して全列取得（確実に動作する）
const result = await client.retrieveMultipleRecordsAsync(
  "rcwr_resourceareapriorities",
  {
    filter: `_rcwr_territoryid_value eq ${territoryId} and rcwr_isactive eq true`,
    orderBy: ["rcwr_priority asc"],
  }
);
```

### 注意

- `select` を省略すると全列が返るため、レスポンスサイズが大きくなる。
  レコード数が少ないマスタ系テーブルでは問題にならないが、
  トランザクション系テーブルでは `top` と併用してレコード数を制限する。
- **標準テーブル**（`bookableresourcebookings` 等）では `select` が正常に動作する。
  問題が起きるのは主にカスタムテーブル。

---

## 8. pac code add-data-source が日本語 DisplayName で「Failed to sanitize string」エラー

### 症状

```
Failed to update database references: Failed to sanitize string 顧客一覧
```

`patch-nameutils.cjs` を適用し、`node -e` で検証しても PAC CLI で同じエラーが再現する。

### 原因

`patch-nameutils.cjs` は `node_modules/@microsoft/power-apps-actions/` 内の `nameUtils.js` を修正するが、
**`pac code add-data-source` は PAC CLI 内蔵の .NET ランタイム経由で別の `nameUtils.js` を実行する**。
PAC CLI の `.stage` ディレクトリ配下には複数バージョンが存在し、パッチの到達が不確実。

### 対処: テーブル表示名を一時的に英語に切り替え

```bash
# 1. API で DisplayName/DisplayCollectionName を英語に変更
python toggle_table_lang.py en

# 2. pac code add-data-source 実行
pac code add-data-source -a dataverse -t {prefix}_tablename

# 3. API で日本語に復元
python toggle_table_lang.py jp
```

### 前提

- `auth_helper.py` が設定済み（Dataverse API 認証）
- `toggle_table_lang.py` にプロジェクトのテーブル定義を記述済み

### 備考

- `npx power-apps add-data-source` が正常に使える環境ではこの問題は発生しない
  （`patch-nameutils.cjs` で解決できる）
- この問題が起きるのは `npx power-apps` がテナント不一致で使えず `pac code` を
  使わざるを得ない環境のみ

---

## 9. `pac code add-data-source` がサービスファイルを生成しない

### 症状

`pac code add-data-source -a dataverse -t {table}` は成功するが、
`src/generated/services/` が空のまま。`src/generated/models/CommonModels.ts` のみ存在。

### 原因

`pac code add-data-source` は `npx power-apps add-data-source` と生成物が異なる。
PAC CLI 版は最小構成（スキーマ JSON + `dataSourcesInfo.ts` + `CommonModels.ts`）のみを生成し、
per-table の TypeScript Model/Service ファイルは生成しない。

### 対処

`getClient(dataSourcesInfo)` を直接使用してサービスレイヤーを自前構築する。
Code Apps SKILL.md の「★ 例外: `pac code add-data-source` が最小構成のみ生成する場合」セクションを参照。

### 生成されるファイル比較

| ファイル | `npx power-apps` | `pac code` |
|---|---|---|
| `.power/schemas/dataverse/*.Schema.json` | ✅ | ✅ |
| `.power/schemas/appschemas/dataSourcesInfo.ts` | ✅ | ✅ |
| `src/generated/models/CommonModels.ts` | ✅ | ✅ |
| `src/generated/models/{Table}Model.ts` | ✅ | ❌ |
| `src/generated/services/{Table}Service.ts` | ✅ | ❌ |
| `src/generated/index.ts` | ✅ | ❌ |

---

## 10. `npx power-apps add-data-source` がテナント不一致で 403 エラー

### 症状

```
Error: Request failed with status code 403
```

`--org-url` を指定しても解消しない。内部トークンが別テナント（Power Platform 内部テナント `bffa0856...` 等）に向いている。

### 原因

`npx power-apps add-data-source` は PAC CLI とは**独立した認証コンテキスト**を持つ。
`pac auth create` で正しいテナントに認証していても、`npx power-apps` の内部キャッシュは別テナントのトークンを保持し続ける場合がある。

### 対処

1. `npx power-apps logout` → 再実行しても解消しない場合がある
2. **推奨ワークアラウンド**: `pac code add-data-source` を使用する（認証は PAC CLI プロファイルを使うため正しいテナントに向く）
3. `pac code` で日本語サニタイズ問題が発生した場合は `toggle_table_lang.py` ワークアラウンドを適用

### 教訓

`npx power-apps` と `pac code` は認証基盤が異なる:
- `npx power-apps`: npm パッケージ独自のトークンキャッシュ（制御困難）
- `pac code`: PAC CLI 認証プロファイル（`pac auth list` で確認可能）

---

## 11. テンプレートファイル削除時に `use-theme.ts` が消える

### 症状

テンプレートの不要ページを削除する際に `Remove-Item "src/hooks/*" -Force` を実行すると、
`src/hooks/use-theme.ts` も削除され、ビルドが壊れる。

```
TS2307: Cannot find module '@/hooks/use-theme'
```

### 原因

テンプレートの `src/hooks/` ディレクトリにはプロジェクト共通の `use-theme.ts` が含まれている。
ワイルドカード削除で巻き添えになる。

### 対処

テンプレートのサンプルページを削除する際は、**ファイル単位で明示的に削除**する。
`src/hooks/use-theme.ts` は保護すること（変更禁止）。

```powershell
# ✅ 正しい: 個別ファイルを指定して削除
Remove-Item "src/pages/incidents.tsx","src/pages/incident-detail.tsx","src/pages/kanban.tsx","src/pages/assets.tsx" -Force
Remove-Item "src/types/incident.ts" -Force

# ❌ 危険: ディレクトリごとワイルドカード削除
Remove-Item "src/hooks/*" -Force
```

---

## 12. SDK `executeAsync` が CSP でブロックされる

### 症状

`add-dataverse-api` で生成したサービス（WhoAmI 等）を呼ぶと空エラーが返る。

```typescript
const result = await WhoAmIService.Execute();
// → { success: false, error: {} }
```

ブラウザコンソールに CSP 違反: `Refused to connect to '...' because it violates the document's Content Security Policy`.

### 原因

Code Apps は iframe 内で `connect-src: 'none'` の CSP が適用される。
`executeAsync` は内部で `fetch()` を使用するため CSP でブロックされる。

### 対処

**postMessage ベースの SDK メソッドのみが CSP 安全**:

| メソッド | CSP 安全 | 用途 |
|---|---|---|
| `retrieveMultipleRecordsAsync` | ✅ | 一覧取得 |
| `retrieveRecordAsync` | ✅ | 単一レコード取得 |
| `createRecordAsync` | ✅ | レコード作成 |
| `updateRecordAsync` | ✅ | レコード更新 |
| `deleteRecordAsync` | ✅ | レコード削除 |
| `executeAsync` | ❌ | カスタムアクション（CSP ブロック） |
| `fetch()` 直接 | ❌ | 全て（CSP ブロック） |

`WhoAmI` が必要な場合は `systemuser` テーブルの `azureactivedirectoryobjectid` で
SDK `getContext().user.objectId`（Entra AAD Object ID）から systemuserid をマッピングする。

---

## 13. GUID 比較でフィルタが機能しない

### 症状

Lookup 列の `_xxx_value` でフィルタしても該当レコードが返らない。

```typescript
const myRecords = allRecords.filter(r => r._ownerid_value === currentUserId);
// → 常に空配列
```

### 原因

Dataverse API は GUID を大文字小文字混在で返す（例: `A1B2c3D4-...`）。
JavaScript の `===` 比較は大文字小文字を区別するため一致しない。

### 対処

```typescript
// ✅ 正しい: toLowerCase() で統一
const myRecords = allRecords.filter(
  r => r._ownerid_value?.toLowerCase() === currentUserId.toLowerCase()
);
```

すべての GUID 比較（`_resource_value`, `_userid_value`, `systemuserid` 等）で `.toLowerCase()` を適用する。

---

## 14. 初回デプロイコマンドの選択

### 症状

`npx power-apps push` が認証エラーで失敗する。

### 原因

`npx power-apps push` は npm パッケージの認証を使用し、テナント不一致が発生する場合がある（#10 と同根）。

### 対処

**初回デプロイは `pac code push` を使用する**:

```bash
# ✅ PAC CLI 認証プロファイルを使用（テナント問題なし）
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}

# power.config.json が未生成でも -env + -s で初回デプロイ可能
# 初回デプロイ後に power.config.json が自動生成される
```

### 備考

- `pac code push` は `npm run build` の成果物（`dist/`）を Power Platform にアップロードする
- `-env` でターゲット環境、`-s` でソリューションを指定
- 2回目以降は `power.config.json` に appId が記録されるため `-env` `-s` は省略可能
