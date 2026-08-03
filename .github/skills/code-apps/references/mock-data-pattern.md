# モックデータ開発パターン

Power Apps SDK 1.2.7 の `createMockDataExecutor` を使うと、Power Platform 環境へ接続せずに取得系画面を確認できる。
モックはローカル開発専用とし、本番成果物へ含めない。

## SDK 1.2.7 の制約

`MockDataStore` の実際の構造は「テーブル名 → レコード ID → レコード」であり、レコード配列ではない。

```typescript
export type MockDataStore<TRecord = unknown> = {
  [tableName: string]: {
    [id: string]: TRecord
  }
}
```

標準の `MockDataOperationExecutor` が成功を返すのは次の取得操作だけである。

- `retrieveRecordAsync`
- `retrieveMultipleRecordsAsync`

`createRecordAsync` / `updateRecordAsync` / `deleteRecordAsync` / `executeAsync` / ファイル操作は
`not supported by MockDataOperationExecutor` を返す。したがって、標準モックで確認できる範囲は一覧・詳細・空状態・取得エラー・
作成や更新の失敗時 UI までとする。書き込み成功を含むテストが必要な場合は、service 層を差し替えるか
`IDataOperationExecutor` を実装したテスト専用 executor を別途用意する。

取得時の `filter` / `select` / `orderBy` / `top` / `skip` も評価されず、複数取得は store 内の全レコードを返す。
検索・ソート・ページングの正確な結合テストには実環境か、オプションを解釈する独自 executor を使う。

## ファイル分割

モックデータと SDK のモック用 import は通常のアプリコードから分離する。

```text
src/
├── main.tsx
└── mocks/
    ├── enable-mock-data.ts
    └── mock-data.ts
```

### `src/mocks/mock-data.ts`

テーブルキーは `getClient()` の各メソッドへ渡すテーブル論理名と完全に一致させる。
生成サービスを使う場合は `.power/schemas/appschemas/dataSourcesInfo.ts` の該当テーブル定義も確認する。
公開サンプルではパブリッシャープレフィックスをハードコードしない。

```typescript
import type { MockDataStore } from "@microsoft/power-apps/data/executors"

const accountTable = `${import.meta.env.VITE_PUBLISHER_PREFIX}_accounts`
const firstAccountId = "00000000-0000-0000-0000-000000000001"

export const mockData = {
  [accountTable]: {
    [firstAccountId]: {
      accountid: firstAccountId,
      name: "サンプル取引先",
      statuscode: 1,
    },
  },
} satisfies MockDataStore
```

レコード ID は辞書のキーだけでなく、主キー列にも同じ値を設定する。

### `src/mocks/enable-mock-data.ts`

`import.meta.env.DEV` と明示的な feature flag の両方を満たす場合だけ、モック関連モジュールを動的 import する。
静的 import にすると、本番コードからモックデータを除去できない可能性がある。

```typescript
export async function enableMockData(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK !== "1") return

  const [{ createMockDataExecutor }, { setDataOperationExecutor }, { mockData }] =
    await Promise.all([
      import("@microsoft/power-apps/data/executors"),
      import("@microsoft/power-apps/internal/data"),
      import("./mock-data"),
    ])

  setDataOperationExecutor(createMockDataExecutor(mockData))
}
```

`setDataOperationExecutor` は公開 package export の `@microsoft/power-apps/internal/data` から import する。
`@microsoft/power-apps/data` からは export されていない。

### `src/main.tsx`

データ取得が始まる前に executor を差し替えるため、React の描画前に初期化を完了させる。

```typescript
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { enableMockData } from "./mocks/enable-mock-data"

async function bootstrap(): Promise<void> {
  await enableMockData()

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
```

## 有効化

コミットしない `.env.local` にだけ feature flag を設定する。

```dotenv
VITE_USE_MOCK=1
```

`VITE_USE_MOCK=0` や未設定では実環境の executor を使う。`VITE_` 変数はブラウザへ公開されるため、
モックレコードへ実データ・個人情報・トークンを入れてはならない。

## 本番混入チェック

`npm run deploy` はビルド後にも `npm run predeploy` を実行する。
`scripts/pre-deploy-check.mjs` は次の両方を検査する。

1. `src/` でモック API を使うファイルに DEV flag・feature flag・2 つの動的 import があること
2. `dist/` の JavaScript に次の文字列が残っていないこと

- `createMockDataExecutor`
- `setDataOperationExecutor`
- `@microsoft/power-apps/data/executors`

```bash
npm run build
npm run predeploy
```

チェックが失敗した場合は、モック関連の静的 import を削除し、`import.meta.env.DEV && VITE_USE_MOCK === "1"` の
分岐内にある動的 import へ移す。ソースマップは検査対象外のため、成果物の JavaScript から除去されていることを判定できる。

## チェックリスト

- [ ] store は「テーブル名 → ID → レコード」の形になっている
- [ ] テーブルキーは実際に SDK へ渡す論理名と一致している
- [ ] executor の設定は React 描画前に完了する
- [ ] `import.meta.env.DEV` と `VITE_USE_MOCK === "1"` の両方で制限している
- [ ] モック関連モジュールは動的 import している
- [ ] モックデータに実データや PII がない
- [ ] `npm run build` 後の `npm run predeploy` が成功する
