# データソースパターン（SDK 生成サービス・dataSourcesInfo）

## 原則

1. **Dataverse コネクタは `npx pa app add data-source` で接続参照に 1 回追加** → `.power/schemas/appschemas/dataSourcesInfo.ts` が自動更新
2. **手動で `dataSourcesInfo.ts` にカスタムテーブル定義を追記してはならない**
3. **`systemuser` を含む Dataverse テーブルは生成された `MicrosoftDataverseService` から扱う**。
  `src/lib/dataSourcesInfo.ts` は生成ファイルを re-export するだけでよく、手動定義は不要
4. **`src/lib/dataSourcesInfo.ts`** への手動追記は、SDK の `pa app add data-source` で追加**できなかった**システムテーブルやコネクタに限る（最後の手段）
5. 実行前に `pa auth status` / `pa auth switch` で対象テナントを明示する（詳細: [トラブルシューティング #12](troubleshooting.md#12-npx-power-apps-add-data-source-がテナント不一致で-403-エラー)）。
  日本語 DisplayName で失敗する場合は `toggle_table_lang.py` で英語化してから再実行する。
  `pac code add-data-source` は npm CLI で解消できない場合のみの移行時代替とする。

## SDK 生成コードの構成

### `npx pa app add data-source`（標準）

以下のフル構成を生成する:

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

## MultiSelectPicklist（複数選択列）

Dataverse Web API の MultiSelectPicklist はカンマ区切り文字列（`"100,200,300"`）で送受信する一方、
生成される TypeScript 型と UI state では `number[]` として扱う。`@microsoft/power-apps/data` の
`serializeMultiSelectPicklistFields` / `deserializeMultiSelectPicklistFields` を使い、この変換を
**service 層の入口・出口だけ**に固定する。ページ・フォームコンポーネントから直接変換しない。

対象列はテーブルごとに一元管理する。列名は Dataverse の論理名を使い、`as const` を外さない。

```typescript
import {
  deserializeMultiSelectPicklistFields,
  serializeMultiSelectPicklistFields,
} from "@microsoft/power-apps/data"

const MULTISELECT_FIELDS = ["{prefix}_categories"] as const
```

`ListRecords` と `GetItem` の戻り値は、UI へ返す前に必ず deserialize する。deserialize はレコードを
in-place で変換するため、取得結果をそのまま UI state に渡せる。

```typescript
const records = unwrap<{ value?: DataverseRow[] }>(result).value ?? []
return records.map((record) =>
  deserializeMultiSelectPicklistFields(record, MULTISELECT_FIELDS),
)

const record = unwrap<DataverseRow>(result)
return deserializeMultiSelectPicklistFields(record, MULTISELECT_FIELDS)
```

`CreateRecord` と `UpdateRecord` では SDK 呼び出しの直前に serialize する。serialize は入力レコードを
破壊せず、変換済みのシャローコピーを返すため、フォーム state を変更しない。

```typescript
const payload = serializeMultiSelectPicklistFields(body, MULTISELECT_FIELDS)
await MicrosoftDataverseService.CreateRecordWithOrganization(
  PREFER, ACCEPT, org, entityName, payload,
)
```

> **空配列は列のクリア**: `[]` は serialize により `null` になる。Dataverse が拒否する空文字列
> （`""`）を送ってはならない。取得時の空文字列は deserialize により `[]` になる。

## 統合 dataSourcesInfo（フロー・Copilot Studio 使用時は必須）

`getClient(dataSourcesInfo)` はシングルトン。最初の呼び出しで渡した `dataSourcesInfo` にフロー/コネクタが含まれないと
`Data source not found` エラーになる。

### 基本: 生成ファイルをそのまま re-export（systemuser も add-data-source 済みの場合）

Dataverse コネクタを npm CLI で追加できていれば、
`src/lib/dataSourcesInfo.ts` は生成ファイルを再エクスポートするだけでよい（手書き定義・型注釈は不要）。

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export default dataSourcesInfo;
```

> 旧 `pac code add-data-source -a dataverse -t systemuser` でも `systemusers` が生成 `dataSourcesInfo` に含まれることは検証済みだが、
> 新規プロジェクトでは npm CLI が生成する `MicrosoftDataverseService` を使用する。
> `DataSourcesInfo` 型は SDK が公開エクスポートしていないため、手書きの型注釈を付けようとすると import エラーになる。
> → [トラブルシューティング #26](troubleshooting.md)

### 応用: SDK で追加できなかったテーブル/コネクタを足す場合のみ spread

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export default {
  ...powerInfo,
  // SDK の pa app add data-source で追加できなかったシステムテーブル/コネクタのみここに足す
  bots: { tableId: "bot", version: "", primaryKey: "botid", dataSourceType: "Dataverse", apis: {} },
  // コネクタは npx pa app add flow で追加後にここにマージ
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

## ページングと総件数（`count: true`、5000 件上限）

`@microsoft/power-apps@1.2.7` で `IOperationResult.count` の仕様が明確化された。
`retrieveMultipleRecordsAsync` の `options` に `count: true` を渡すと、
**`top` / `skip` に依存しないサーバー側の総件数**（Dataverse では `@odata.count` アノテーション）を
1 リクエストで取得できる。

```typescript
// hooks/useRecordsPage.ts
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

export function useRecordsPage(page: number, pageSize = 20, filter?: string) {
  const queryClient = useQueryClient();
  const countKey = ["records", "count", filter] as const;

  return useQuery({
    queryKey: ["records", "page", page, pageSize, filter],
    queryFn: async () => {
      const cachedCount = queryClient.getQueryData<number>(countKey);
      const result = await client.retrieveMultipleRecordsAsync<Record<string, unknown>>("{prefix}_records", {
        top: pageSize,
        skip: (page - 1) * pageSize,
        filter,
        count: cachedCount === undefined,
      });
      if (!result.success) throw result.error;
      if (result.count !== undefined) queryClient.setQueryData(countKey, result.count);
      return { rows: result.data ?? [], count: result.count ?? cachedCount };
    },
    placeholderData: keepPreviousData, // ページ切替時に前ページの内容を表示したまま次を取得
  });
}
```

`data.count` をページャの総件数に使う。検索条件を変えると `countKey` も変わるため、新しい条件では
再度 `count: true` が送られ、同じ条件でのページ移動ではキャッシュ済み件数が再利用される。

```typescript
const totalCount = pageQuery.data?.count;
const totalPages = totalCount === undefined || totalCount >= 5000
  ? undefined
  : Math.ceil(totalCount / pageSize);
```

### 5000 件上限の扱い

- Dataverse の `@odata.count` は **5000 件で頭打ち**になる。結果セットが 5000 件を超える場合、
  `result.count` は実際の総件数ではなく `5000` を返す。
- UI 上のページャ・件数表示は、`count === 5000` のときに「5000 件」ではなく
  **「5000+ 件」「5000 件以上」のように上限到達を明示**する。実件数として断定表示しない。

```tsx
// 総件数表示コンポーネント側
<span>{count >= 5000 ? "5,000+ 件" : `${count.toLocaleString()} 件`}</span>
```

### 5000 件超が見込まれる画面は `skipToken` 方式へ切り替える

総件数ページャ（ページ番号ボタン + 総ページ数）は `count` が正確な範囲（5000 件以下が見込まれる）でのみ使う。
以下のいずれかに該当する画面は、総件数に依存しない **`skipToken` による「次へ」方式**（カーソルページング／無限スクロール）に切り替える。

- 対象テーブルのレコード数が恒常的に 5000 件を超える、または将来的に超える見込みがある
- 検索・フィルタ条件を絞らずに全件を対象にする一覧画面
- 総ページ数の表示が必須要件ではない（「次へ」「前へ」のみで十分な）画面

SDK はレスポンスの `@odata.nextLink` から抽出したトークンを `result.skipToken` として返す。
次リクエストでは `skip` の代わりにその値を `skipToken` へ渡す。

```typescript
const result = await client.retrieveMultipleRecordsAsync<Record<string, unknown>>("{prefix}_records", {
  top: pageSize,
  skipToken: currentSkipToken,
});
if (!result.success) throw result.error;

const nextSkipToken = result.skipToken;
const hasNextPage = nextSkipToken !== undefined;
```

ページ番号ボタンは表示せず、「次へ」ボタンは `result.skipToken` の有無で制御する。「前へ」も必要なら、
ページごとに使用した `skipToken` を履歴として保持する。

### 総件数は初回のみ取得してキャッシュする

`count: true` は毎回 `@odata.count` 集計コストが乗るため、**ページ移動のたびに再取得しない**。
初回ロード時（キャッシュに総件数がない場合）と検索条件変更時のみ `count: true` を送り、以降のページ取得は
`count: false`（省略）にして、取得済みの総件数を state / React Query キャッシュに保持する。
`keepPreviousData`（TanStack Query）を併用し、ページ切替時の画面ちらつきも防ぐ。

## 基本設計方針

- **新規作成・編集・削除はすべてモーダル**（別ページ遷移しない）
- サイドバー z-40 / Dialog z-[300]/z-[400] で重なり問題を回避

## 外部システムの資産を Dataverse にミラーして読む（検証済 2026-08-13）

Code App から「Dataverse の外にある資産」（App Service 上のファイル、エージェントの設定、
別システムのマスターなど）を表示したくなったとき、**Code App から直接その API を叩こうとしない**。

理由:

- Code App は `apps.powerapps.com` オリジンで動くため、相手側に CORS 設定が要る
- ブラウザに置ける資格情報が無い。API キーを `.env` に入れても `VITE_` 変数はバンドルに焼き込まれ、公開される
- 相手が Bot Framework / Entra 認証だと、そもそもブラウザ単独では正しいトークンを取れない

**所有者側から Dataverse へ書き込ませ、Code App は普段どおり Dataverse を読む**のが正解。

| 役割 | やること |
|---|---|
| 資産の所有者（バックエンド） | マネージド ID で Dataverse にミラー テーブルを upsert する常駐処理を持つ |
| Dataverse | ミラー テーブル。所有者が唯一の書き手で、アプリは読み取り専用として扱う |
| Code App | `add-data-source` 済みの生成サービスで普通に読む。専用の取得経路を作らない |

### ミラー側（バックエンド）の実装で外さない点

- **主キーは元データの安定した識別子**にする（ファイル名、業務コードなど）。GUID を新規採番すると
  再同期のたびに行が増える
- **1 回のパスで「全件 upsert → 残った行は削除」**まで行う。削除まで面倒を見ないと、
  元データから消えた項目がアプリ側に残り続ける
- そのため、権限は Create/Read/Write に加えて **Delete も必要**。ミラー用テーブルに限って許可する
- 周期は「元データが変わる頻度」で決める。設定ファイル程度なら 30 分で十分。
  起動直後に 1 回流してから周期に入ると、デプロイ直後の確認が楽
- ミラーの失敗で本業を止めない。例外は警告ログに落として次の周期に任せる

### 確認するとき

- ホスト側の App Service が **Always On 無し（F1/無料枠）だと、デプロイしただけでは常駐処理が起きない**。
  `/health` などを 1 回叩いてプロセスを起こしてから、テーブルに行が入ったかを見る
- ミラー行には**同期日時の列**を必ず持たせる。アプリ側に出しておくと、
  「表示が古い」のか「同期が止まっている」のかを利用者が自分で切り分けられる

### アプリ側

- ミラー テーブル用の `src/lib/<name>.ts` を 1 枚作り、列名マップと変換関数だけ置く。
  他のテーブルと実装を変えない
- 編集 UI を付けない。**書き手が 2 つになると、次の同期で黙って上書きされる**。
  画面には「所有者はどこか」を 1 行書いておく

