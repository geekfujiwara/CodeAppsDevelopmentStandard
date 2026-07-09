# Code Apps 構築リファレンス

> **本ドキュメントは SKILL.md「標準ワークフロー（Step 1〜6）」の詳細版である。**
> SKILL.md の 6 ステップと本リファレンスの 8 ステップの対応:
>
> | SKILL.md | 本リファレンス |
> |---|---|
> | Step 0 テンプレート scaffold + Step 1 init | Step 1 |
> | Step 2 vite.config.ts 確認 | Step 2 |
> | Step 3 環境設定 | （.env コピー — 本リファレンスでは省略） |
> | Step 4 初回ビルド＆デプロイ | Step 3 |
> | Step 5 データソース追加 | Step 4 |
> | Step 6 開発→再デプロイ | Step 5〜8（技術スタック → DataverseService → 型定義 → ビルド検証） |

## 構築手順

### Step 1: テンプレート scaffold + プロジェクト初期化

```bash
# ⓪ .gitignore が存在しなければテンプレートからコピー（node_modules/ 等の除外に必須）
cp -n .github/skills/standard/references/gitignore-template .gitignore

# ① テンプレート scaffold（vite.config.ts / plugins/plugin-power-apps.ts / styles/ / src/ 一式）
#    標準では @GeekPowerCode が scaffold する。手動で行う場合:
#    npx degit github:microsoft/PowerAppsCodeApps/templates/vite .

# Code Apps 採用が決まった時点で、Dataverse 構築（Phase 2）と並行して着手する
# （npm install はネットワーク待ちのみで Dataverse 構築をブロックしないため待たない）
# VS Code では本トラックを Code Apps サブエージェントとして並行起動。add-data-source は
# Dataverse Phase 2 完了後（★同期①）、add-flow は Power Automate Phase 5 完了後（★同期②）に実行する。
npm install --no-audit --no-fund

# ①.5 マネージド環境 / Code Apps 許可が有効化済みか確認（pac code init の前に必ず実行。
#     architecture 提案時に確認済みなら再実行不要）
python .github/skills/code-apps/scripts/check_code_apps_environment.py

# ①.5 マネージド環境 / Code Apps 許可が有効化済みか確認（pac code init の前に必ず実行。
#     architecture 提案時に確認済みなら再実行不要）
python .github/skills/code-apps/scripts/check_code_apps_environment.py

# ② Power Apps 初期化 — power.config.json のみ生成（PAC CLI 認証でテナント不一致なし）
pac code init -env {ENVIRONMENT_ID} -n "AppName"
# ↑ vite.config.ts や plugins/ は生成しない（①のテンプレート由来）
```

### Step 2: vite.config.ts 必須設定の確認（検証済 2026-06-15）

テンプレートに含まれる `vite.config.ts` を確認し、以下の必須設定が含まれていることを検証する。
**この手順を飛ばすと、デプロイ後にアセット 404 やモジュール解決エラーでアプリが起動しない。**

#### チェックリスト

```
□ base: "./" が設定されている
□ rollupOptions.external に "@microsoft/power-apps" が含まれていない
□ plugins に powerApps() が含まれている
□ resolve.alias に "@" → "./src" が設定されている
```

#### ① `base: "./"` — 相対パスベース（必須）

Power Apps はアプリを `powerplatformusercontent.com` の深いサブディレクトリパスでホストする。
`base` 未指定（デフォルト `"/"`）だとアセット参照がルート相対（`/assets/index-xxx.js`）になり、
すべての CSS / JS / フォントファイルが **404** になる。

```typescript
// ❌ アセットが 404 になる
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // base 未指定 → デフォルト "/" → 404
})

// ✅ 相対パスで正しく解決される
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",  // ← 必須
})
```

#### ② `@microsoft/power-apps` を external にしない（必須）

`@microsoft/power-apps` SDK は **バンドルに含めて vendor チャンクに統合** する。
`external` に指定するとビルド出力にベアモジュール指定子（`import { getClient } from "@microsoft/power-apps/data"`）が
そのまま残り、ブラウザが `Failed to resolve module specifier` エラーを出す。

```typescript
// ❌ ブラウザが "@microsoft/power-apps" を解決できずエラー
build: {
  rollupOptions: {
    external: ["@microsoft/power-apps"],  // 絶対に使わない
  }
}

// ✅ vendor チャンクにバンドル（external 指定なし）
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => {
        if (id.includes('node_modules')) {
          return 'vendor'
        }
      },
    },
  },
}
```

#### ③ `@microsoft/power-apps` のサブパスインポート（必須）

`@microsoft/power-apps` パッケージはルートエクスポート（`"."`）を提供していない。
必ずサブパスを指定してインポートする。

```typescript
// ❌ ビルドエラー: "." is not exported from package @microsoft/power-apps
import { getClient } from "@microsoft/power-apps";

// ✅ 正しいサブパスインポート
import { getClient } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import type { IContext } from "@microsoft/power-apps/app";
```

| サブパス | エクスポート |
|---|---|
| `@microsoft/power-apps/data` | `getClient`, `DataClient` 型, `IOperationResult` 型 |
| `@microsoft/power-apps/app` | `getContext`, `IContext` 型 |
| `@microsoft/power-apps/data/metadata/dataverse` | `EntityMetadata`, `GetEntityMetadataOptions` 型 |
| `@microsoft/power-apps/telemetry` | テレメトリ API |

#### ④ 完全な vite.config.ts テンプレート

```typescript
import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { powerApps, POWER_APPS_CORS_ORIGINS } from "./plugins/plugin-power-apps";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    powerApps()  // dev-only: CORS + 起動 URL 表示
  ],
  base: "./",  // ← 必須: Power Apps サブディレクトリ対応
  server: {
    cors: {
      origin: POWER_APPS_CORS_ORIGINS
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      // ⚠ external に @microsoft/power-apps を含めないこと
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'chart-vendor'
            if (id.includes('@dnd-kit')) return 'dnd-vendor'
            if (id.includes('clsx') || id.includes('tailwind-merge') ||
                id.includes('date-fns') || id.includes('class-variance-authority')) {
              return 'utils-vendor'
            }
            // React + @microsoft/power-apps + 全 React 依存 = vendor
            return 'vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
})
```

### Step 3: 初回ビルド＆デプロイ

```bash
# PAC CLI を使用（テナント不一致なし）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
```

> **注意**: `npx power-apps push` はテナント解決の不具合で 403/404 になることがある。
> `pac code push` を標準とする。`npm run deploy` が `pac code push` を内包する場合はそちらを使用。

### Step 4: Dataverse データソース追加

```bash
# テーブルごとに実行（PUBLISHER_PREFIX は .env から読み込み、ハードコード禁止）
# 日本語表示名エラー回避: 一時的に英語に切替
python scripts/toggle_table_lang.py en

# pac code add-data-source で追加
pac code add-data-source -a dataverse -t {PUBLISHER_PREFIX}_{table}
# 全テーブルに対して繰り返す

# 日本語に復元
python scripts/toggle_table_lang.py jp
```

> **重要**: テーブル論理名に `geek_xxx` のような literal を書かない。
> publisher prefix は環境ごとに異なるため、必ず `.env` の `PUBLISHER_PREFIX` を変数展開して使う。

### Step 5: 技術スタック（テンプレート scaffold で導入済み）

Tailwind CSS / TanStack React Query / React Router / UI プリミティブ（`@/components/ui/`）は
Step 1 の `npm install`（`template-snapshot/package.json` 由来）ですでに導入済みのため、
個別にインストールし直す必要はない。shadcn CLI（`npx shadcn@latest ...`）は使用しない。

> **重要**: ルーター生成は必ず `createHashRouter` を使用すること。
> `createBrowserRouter` は Power Apps iframe 内で初期ロード時に 404 になる。

```typescript
// src/router.tsx — 必ず createHashRouter を使用
import { createHashRouter, Navigate } from "react-router-dom";

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      // ...
    ],
  },
]);
```

### Step 6: DataverseService パターンで CRUD 実装

#### `getClient(dataSourcesInfo)` — dataSourcesInfo は必須引数

`getClient()` は **`dataSourcesInfo` を必ず渡す**。引数なしで呼ぶと SDK がデータソース情報を持たないため、
Power Apps ランタイム上で Dataverse に一切接続できない（エラーも出ずに空データになる）。

`dataSourcesInfo` は Step 4 の `pac code add-data-source` 実行時に `.power/schemas/appschemas/dataSourcesInfo.ts` に自動生成される。

```typescript
// src/lib/dataverse-service.ts
import { getClient } from "@microsoft/power-apps/data";
import type { IOperationOptions } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
// ※ フロー連携・Copilot Studio 連携時は統合 dataSourcesInfo を使用:
//   import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
//   → 詳細: references/data-source-patterns.md「統合 dataSourcesInfo」

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
❌ getClient() — 引数なし
   → SDK がデータソース情報を持たず Dataverse に接続できない（空データ / 無反応）

❌ client.get("inv_products?$select=...") — 生の HTTP メソッド
   → getClient(dataSourcesInfo) が返す DataClient には get/post/patch メソッドは存在しない
   → SDK 公式の retrieveMultipleRecordsAsync / createRecordAsync 等を使用すること

✅ getClient(dataSourcesInfo) + retrieveMultipleRecordsAsync
   → CSP 安全（postMessage ベース）で正しく Dataverse に接続される
```

#### Hook での使用パターン（TanStack React Query）

```typescript
// src/hooks/use-products.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataverseService } from "@/lib/dataverse-service";
import type { Product } from "@/types";

const DATA_SOURCE = "inv_products";  // dataSourcesInfo のキー名

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () =>
      DataverseService.GetItems<Product>(DATA_SOURCE, {
        select: ["inv_productid", "inv_name", "inv_productcode", "inv_category"],
        orderBy: ["inv_productcode asc"],
      }),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      DataverseService.CreateItem(DATA_SOURCE, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
```

> **IOperationOptions**: `{ select?, filter?, orderBy?, top?, skip?, maxPageSize? }`
> OData クエリ文字列ではなく、オブジェクト形式で指定する。

#### vite-env.d.ts — SDK の手動型宣言は不要

`@microsoft/power-apps` パッケージは `dist/data/index.d.ts` 等の正式な型定義を提供している。
`vite-env.d.ts` に `declare module "@microsoft/power-apps/data"` を手動で書くと
SDK の正式な型と競合し、`getClient` の引数 `dataSourcesInfo` が認識されなくなる。

```typescript
// vite-env.d.ts — ✅ CSS モジュール宣言のみ（SDK 型宣言は書かない）
declare module "*.css" {
  const content: string;
  export default content;
}
```

```
❌ vite-env.d.ts に declare module "@microsoft/power-apps/data" { ... } を追記
   → SDK の正式型定義を上書きし、getClient() が引数なしで呼べてしまう
   → 実行時に Dataverse に接続できない

✅ SDK パッケージの型定義をそのまま使用
   → getClient(dataSourcesInfo) が必須引数として型チェックされる
```

### Step 7: 型定義

```typescript
// Choice 値は 100000000 始まり
export enum RecordStatus {
  NEW = 100000000,
  IN_PROGRESS = 100000001,
  ON_HOLD = 100000002,
  RESOLVED = 100000003,
  CLOSED = 100000004,
}

export const statusLabels: Record<RecordStatus, string> = {
  [RecordStatus.NEW]: "新規",
  [RecordStatus.IN_PROGRESS]: "対応中",
  [RecordStatus.ON_HOLD]: "保留",
  [RecordStatus.RESOLVED]: "解決済",
  [RecordStatus.CLOSED]: "クローズ",
};

// Tailwind クラスも型安全に
export const statusColors: Record<RecordStatus, string> = {
  [RecordStatus.NEW]: "bg-blue-100 text-blue-800",
  [RecordStatus.IN_PROGRESS]: "bg-yellow-100 text-yellow-800",
  [RecordStatus.ON_HOLD]: "bg-gray-100 text-gray-800",
  [RecordStatus.RESOLVED]: "bg-green-100 text-green-800",
  [RecordStatus.CLOSED]: "bg-red-100 text-red-800",
};
```

### Step 8: ビルド＆再デプロイ

```bash
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
```

### Step 8.1: ビルド後検証 — Circular chunk 警告チェック（必須）

`npm run build` の出力に **`Circular chunk`** 警告が含まれていないか確認する。
この警告があると Power Apps ランタイムで `ReferenceError: Cannot access 'X' before initialization` が発生し、アプリが起動しない。

```
⚠️ Circular chunk: vendor -> react-vendor -> vendor.
   Please adjust the manual chunk logic for these chunks.
```

**原因**: `vite.config.ts` の `manualChunks` で React 関連を `react-vendor` に分離すると、
`vendor` チャンクに残った `@microsoft/power-apps` SDK 等が React に依存しているため循環参照が発生する。

**修正**: React 依存パッケージをすべて同一チャンクに統合する。
巨大ライブラリ（mermaid, cytoscape, katex, recharts, @dnd-kit）と
React 非依存ユーティリティ（clsx, tailwind-merge, date-fns）のみ分離可能。

```typescript
// vite.config.ts — ✅ 正しい manualChunks 設定
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => {
        if (id.includes('node_modules')) {
          if (id.includes('mermaid')) return 'mermaid-vendor'
          if (id.includes('cytoscape')) return 'cytoscape-vendor'
          if (id.includes('katex')) return 'katex-vendor'
          if (id.includes('recharts')) return 'chart-vendor'
          if (id.includes('@dnd-kit')) return 'dnd-vendor'
          if (id.includes('clsx') || id.includes('tailwind-merge') ||
              id.includes('date-fns') || id.includes('class-variance-authority')) {
            return 'utils-vendor'
          }
          // React + @radix-ui + @tanstack + @microsoft/power-apps 等は
          // すべて同一チャンクに統合（循環参照回避）
          return 'vendor'
        }
      },
    },
  },
}
```

```
❌ react-vendor と vendor を分離
   → @microsoft/power-apps が vendor に残り React を参照 → 循環参照 → ランタイムエラー

✅ 巨大ライブラリのみ分離、React 依存は全て vendor に統合
   → Circular chunk 警告なし → Power Apps で正常動作
```

### Step 8.2: ビルド後検証 — CSP 違反チェック（必須）

ビルド成功後、デプロイ前に以下を検証する:

```bash
# ① 外部 API 呼び出しがないこと（Dataverse SDK 経由以外の fetch/XMLHttpRequest）
grep -r "fetch(" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "getClient"

# ② learn.microsoft.com 等の外部 URL への接続がないこと
grep -rn "https://" src/ --include="*.ts" --include="*.tsx" | grep -v "// " | grep -v "crm7.dynamics.com"
```

上記に該当するコードが残っていたら削除する。Power Apps ランタイムは `connect-src 'none'` で外部通信をすべてブロックする。

### Step 8.3: テンプレート残留チェック（必須）

```bash
# テンプレートページが残っていないこと
ls src/pages/ | grep -v "dashboard\|not-found\|_layout"

# テンプレート専用コンポーネントが残っていないこと
grep -rn "learn-client\|learn-catalog\|chart-dashboard\|gantt-chart\|kanban-board\|tree-structure" src/ --include="*.ts" --include="*.tsx"
```
