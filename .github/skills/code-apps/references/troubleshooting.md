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

## 6. `orderBy` は配列形式で指定する

### 症状

`retrieveMultipleRecordsAsync` で `orderBy` を文字列で指定するとソートが効かない、
またはサイレントにエラーが発生してレコードが 0 件返る。

### 原因

Code Apps SDK の `retrieveMultipleRecordsAsync` options オブジェクトでは、
`orderBy` は **文字列配列** (`string[]`) として渡す仕様。
文字列を渡してもランタイムエラーにならないが、SDK 内部の OData クエリ構築で
正しく処理されない場合がある。

### 例

```typescript
// ❌ 文字列（ソートが効かない / 結果が不安定）
const result = await client.retrieveMultipleRecordsAsync(
  "rcwr_resourceareapriorities",
  {
    filter: `_rcwr_territoryid_value eq ${territoryId}`,
    orderBy: "rcwr_priority asc",  // ← 文字列
  }
);

// ✅ 配列（正しい形式）
const result = await client.retrieveMultipleRecordsAsync(
  "rcwr_resourceareapriorities",
  {
    filter: `_rcwr_territoryid_value eq ${territoryId}`,
    orderBy: ["rcwr_priority asc"],  // ← 配列
  }
);
```

### 複数キーソートの例

```typescript
orderBy: ["rcwr_priority asc", "createdon desc"]
```

### チェックポイント

- `select`, `filter` は文字列（または `select` は文字列配列）
- `orderBy` は **必ず文字列配列**
- `top` は数値

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
