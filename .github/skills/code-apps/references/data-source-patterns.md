# データソースパターン（SDK 生成サービス・dataSourcesInfo）

## 原則

1. **カスタムテーブルは `pac code add-data-source` で追加** → `.power/schemas/appschemas/dataSourcesInfo.ts` が自動更新
2. **手動で `dataSourcesInfo.ts` にカスタムテーブル定義を追記してはならない**
3. **`src/lib/dataSourcesInfo.ts`** にはシステムテーブル（systemuser, bot 等）とコネクタのみ手動追記

## SDK 生成コードの構成

### `npx power-apps add-data-source` の場合（フル生成）

```
src/generated/
├── index.ts
├── models/
│   ├── CommonModels.ts
│   ├── {Prefix}_{entities}Model.ts    # エンティティ型 + Choice 値
│   └── SystemusersModel.ts
└── services/
    ├── {Prefix}_{entities}Service.ts   # create/update/delete/get/getAll
    └── SystemusersService.ts
```

### `pac code add-data-source` の場合（最小構成）

```
src/generated/
├── models/
│   └── CommonModels.ts    # IGetOptions のみ
└── services/              # 空（サービスファイルなし）

.power/schemas/
├── appschemas/
│   └── dataSourcesInfo.ts  # テーブルエントリ（primaryKey等）
└── dataverse/
    └── {table}.Schema.json  # テーブルスキーマ
```

→ この場合は `getClient(dataSourcesInfo)` を直接使用してサービスレイヤーを自前構築する。

## 自前サービスレイヤーの実装パターン（検証済 2026-06-15）

`getClient()` は **`dataSourcesInfo` が必須引数**。引数なしで呼ぶと Dataverse に接続できない。

```typescript
// src/lib/dataverse-service.ts
import { getClient } from "@microsoft/power-apps/data";
import type { IOperationOptions } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

const client = getClient(dataSourcesInfo);

export const DataverseService = {
  async GetItems<T>(dataSourceName: string, options?: IOperationOptions): Promise<T[]> {
    const result = await client.retrieveMultipleRecordsAsync<T>(dataSourceName, options);
    if (!result.success) throw result.error;
    return result.data ?? [];
  },
  async CreateItem<T>(dataSourceName: string, body: Record<string, unknown>): Promise<T> {
    const result = await client.createRecordAsync<Record<string, unknown>, T>(dataSourceName, body);
    if (!result.success) throw result.error;
    return result.data;
  },
  async UpdateItem<T>(dataSourceName: string, id: string, body: Record<string, unknown>): Promise<T> {
    const result = await client.updateRecordAsync<Record<string, unknown>, T>(dataSourceName, id, body);
    if (!result.success) throw result.error;
    return result.data;
  },
  async DeleteItem(dataSourceName: string, id: string): Promise<void> {
    const result = await client.deleteRecordAsync(dataSourceName, id);
    if (!result.success) throw result.error;
  },
};
```

```
❌ getClient() — 引数なし → Dataverse に接続できない
❌ client.get("entitySet?$select=...") — DataClient に get/post メソッドは存在しない
✅ getClient(dataSourcesInfo) + retrieveMultipleRecordsAsync 等の SDK 公式メソッド
```

## 統合 dataSourcesInfo（フロー・Copilot Studio 使用時は必須）

`getClient()` はシングルトン。最初に初期化された dataSourcesInfo にフロー/コネクタが含まれないと
`Data source not found` エラーになる。

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export const dataSourcesInfo = {
  ...powerInfo,
  // SDK で追加できないシステムテーブル
  systemusers: { tableId: "systemuser", version: "", primaryKey: "systemuserid", dataSourceType: "Dataverse", apis: {} },
  bots: { tableId: "bot", version: "", primaryKey: "botid", dataSourceType: "Dataverse", apis: {} },
  // コネクタは npx power-apps add-flow で追加後にここにマージ
};
```

## CSP 安全な SDK メソッド一覧

| メソッド | CSP 安全 | 備考 |
|---|---|---|
| `retrieveMultipleRecordsAsync` | ✅ postMessage | 一覧取得 |
| `retrieveRecordAsync` | ✅ postMessage | 単一取得 |
| `createRecordAsync` | ✅ postMessage | 作成 |
| `updateRecordAsync` | ✅ postMessage | 更新 |
| `deleteRecordAsync` | ✅ postMessage | 削除 |
| `executeAsync` | ❌ fetch ベース | CSP ブロック |

## 型定義の注意

`ListTable<T>` コンポーネントは `T extends Record<string, unknown>` 制約を持つ。

```typescript
// ❌ インデックスシグネチャなし → TS2344
export interface Customer { geek_customerid: string; }

// ✅ インデックスシグネチャ付き
export interface Customer { [key: string]: unknown; geek_customerid: string; }
```

## 基本設計方針

- **新規作成・編集・削除はすべてモーダル**（別ページ遷移しない）
- サイドバー z-40 / Dialog z-[300]/z-[400] で重なり問題を回避
