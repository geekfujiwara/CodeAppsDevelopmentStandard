# データソースパターン（SDK 生成サービス・dataSourcesInfo）

## 原則

1. **カスタムテーブルは `pac code add-data-source` で追加** → `.power/schemas/appschemas/dataSourcesInfo.ts` が自動更新
2. **手動で `dataSourcesInfo.ts` にカスタムテーブル定義を追記してはならない**
3. **`systemuser` も `pac code add-data-source -t systemuser` で追加できる**（検証済 2026-06-15）。
   追加できれば `src/lib/dataSourcesInfo.ts` は生成ファイルを re-export するだけでよく、手動定義は不要
4. **`src/lib/dataSourcesInfo.ts`** への手動追記は、SDK の add-data-source で追加**できなかった**システムテーブルやコネクタに限る（最後の手段）

## SDK 生成コードの構成

### `pac code add-data-source` / `npx power-apps add-data-source` 共通（検証済 2026-06-15）

どちらのコマンドも以下のフル構成を生成する:

```
src/generated/
├── index.ts                           # 全 Model/Service の re-export
├── models/
│   ├── CommonModels.ts                # IGetOptions, IGetAllOptions
│   ├── {Prefix}_{entities}Model.ts    # エンティティ型 + Choice 値定数
│   └── SystemusersModel.ts            # （systemuser 追加時のみ）
└── services/
    ├── {Prefix}_{entities}Service.ts   # create/update/delete/get/getAll + getMetadata
    └── SystemusersService.ts           # （systemuser 追加時のみ）

.power/schemas/
├── appschemas/
│   └── dataSourcesInfo.ts             # テーブルエントリ（primaryKey 等）
└── dataverse/
    └── {table}.Schema.json            # テーブルスキーマ JSON
```

生成された Service クラスは内部で `getClient(dataSourcesInfo)` を使用しており、
そのまま使用するか、自前の DataverseService ラッパーを作成するかは自由。

> **自前 DataverseService を推奨する理由**: 生成 Service（`Inv_productsService.create(...)` 等）は
> エンティティごとに分かれているため、共通のエラーハンドリングや TanStack React Query との統合が煩雑になる。
> 汎用 CRUD ラッパーを 1 ファイルで管理する方がコードの見通しが良い。

### TanStack React Query フックパターン

自前 `DataverseService` ラッパーを React Query で包むと、キャッシュ・再フェッチ・楽観的更新が簡潔になる。

```typescript
// hooks/useRecords.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useRecords() {
  return useQuery({
    queryKey: ["records"],
    queryFn: () =>
      DataverseService.GetItems(
        "{prefix}_records",
        "$select={prefix}_name,{prefix}_status&$orderby=createdon desc",
      ),
  });
}

export function useCreateRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecordInput) =>
      DataverseService.PostItem("{prefix}_records", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["records"] }),
  });
}
```

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

`getClient(dataSourcesInfo)` はシングルトン。最初の呼び出しで渡した `dataSourcesInfo` にフロー/コネクタが含まれないと
`Data source not found` エラーになる。

### 基本: 生成ファイルをそのまま re-export（systemuser も add-data-source 済みの場合）

`systemuser` を含む全テーブルを `pac code add-data-source` で追加できていれば、
`src/lib/dataSourcesInfo.ts` は生成ファイルを再エクスポートするだけでよい（手書き定義・型注釈は不要）。

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export default dataSourcesInfo;
```

> `pac code add-data-source -a dataverse -t systemuser` で `systemusers` が生成 `dataSourcesInfo` に含まれる（検証済 2026-06-15）。
> `DataSourcesInfo` 型は SDK が公開エクスポートしていないため、手書きの型注釈を付けようとすると import エラーになる。
> → [トラブルシューティング #26](troubleshooting.md)

### 応用: SDK で追加できなかったテーブル/コネクタを足す場合のみ spread

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export default {
  ...powerInfo,
  // SDK の add-data-source で追加できなかったシステムテーブル/コネクタのみここに足す
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
