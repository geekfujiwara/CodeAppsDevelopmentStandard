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
#    取得元は templates/generic-base のみ。samples/geek-* は業務ページ実装の参照専用で scaffold 元にしない。
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills/code-apps/templates/generic-base .
#    ↑ Microsoft 公式の素の Vite テンプレート（npx degit github:microsoft/PowerAppsCodeApps/templates/vite .）は
#      共通コンポーネント・styles/ ・pre-deploy-check.mjs を含まないため、標準では使わない。

# Code Apps 採用が決まった時点で、Dataverse 構築（Phase 2）と並行して着手する
# （npm install はネットワーク待ちのみで Dataverse 構築をブロックしないため待たない）。
# VS Code では本トラックを Code Apps サブエージェントとして並行起動。add-data-source は
# connectionId / orgUrl が揃った時点で 1 回だけ実行し、add-flow は Power Automate Phase 5 完了後（★同期②）に実行する。
#
# npm install はローカルゴールデンキャッシュから node_modules を複製して高速化できる
# （社内プロキシへの毎回のフル依存取得を回避。詳細: references/template-cache.md）。
pwsh .github/skills/code-apps/scripts/scaffold_from_cache.ps1 -ProjectDir .
# ↑ 使えない環境ではフォールバック: npm install --no-audit --no-fund

# ①.5 マネージド環境 / Code Apps 許可が有効化済みか確認（pac code init の前に必ず実行。
#     architecture 提案時に確認済みなら再実行不要）
python .github/skills/code-apps/scripts/check_code_apps_environment.py

# ①.6 ソリューションと接続参照を用意（pac code init より前に実行）
#     接続 ID 直バインドはソリューションに入らないため、接続参照を先に作る。
#     既存 CR 流用ファース → 無ければ Dataverse Web API で新規作成（ポータル操作不要）
python .github/skills/code-apps/scripts/setup_connection_reference.py
#     → 出力される {CONNECTION_REFERENCE_LOGICAL_NAME} / {SOLUTION_ID} を Step 4 で使う

# ② Power Apps 初期化 — power.config.json のみ生成（PAC CLI 認証でテナント不一致なし）
pac code init -env {ENVIRONMENT_ID} -n "AppName"
# ↑ vite.config.ts や plugins/ は生成しない（①のテンプレート由来）
# ↑ pac code init にソリューション指定オプションは無い。ソリューション所属は Step 3 の初回 push で決まる
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

### Step 3: 初回ビルド＆デプロイ（`-s` 必須）

```bash
# PAC CLI を使用（テナント不一致なし）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
```

> **`-s` は初回 push でしか効かない（検証済 2026-06-15）**
> アプリの `almMode` が `Solution` になるのは **`appId` 未割当の初回 push のみ**。
> `almMode: Environment` で作られたアプリは、後から `-s` を付けてもソリューションに入らない（ポータル手作業が必要になる）。
> 詳細: [ソリューション ALM](solution-alm.md)

> **注意**: `npx power-apps push` はテナント解決の不具合で 403/404 になることがある。
> `pac code push` を標準とする。`npm run deploy` が `pac code push` を内包する場合はそちらを使用。

### Step 4: Dataverse コネクタ追加（1 回で全テーブルをカバー）

```bash
# 標準: Step 1 で用意した接続参照にバインドする（ソリューション同梱可）
npx power-apps add-data-source --api-id shared_commondataserviceforapps \
  -cr {CONNECTION_REFERENCE_LOGICAL_NAME} \
  -s {SOLUTION_ID} \
  --resource-name commondataserviceforapps \
  --org-url {DATAVERSE_URL} \
  --non-interactive

# PoC 等でソリューション不要な場合のみ: 接続 ID 直バインド
npx power-apps list-connections
npx power-apps add-data-source --api-id shared_commondataserviceforapps \
  --connection-id {DATAVERSE_CONNECTION_ID} \
  --resource-name commondataserviceforapps \
  --org-url {DATAVERSE_URL} \
  --non-interactive
```

> **接続参照にしても生成物は変わらない**: `--resource-name commondataserviceforapps` はコネクタ単位の指定で、
> 生成されるのは `MicrosoftDataverseService.ts` / `MicrosoftDataverseModel.ts` の 2 ファイルのみ（テーブル数に非依存）。
> `power.config.json` に `xrmConnectionReferenceLogicalName` が 1 行追加されるだけで、**アプリ側コードの変更は不要**。

> **Microsoft Learn との比較**: Learn の「How to: Connect your code app to Dataverse」は
> `pac code add-data-source -a dataverse -t <table-logical-name>` を Dataverse 接続の基本形として案内している。
> 本リファレンスでは、それとは別に **1 つの `MicrosoftDataverseService` を全テーブルで共有したい場合**の
> connector-first パターンとして `shared_commondataserviceforapps` を扱う。
> Learn にはこの 2 パターンの明確な性能比較は記載されていないため、標準では
> **接続方式よりもクエリ最適化（`$select` / `$filter` / ページング）と API 呼び出し回数の削減**を優先する。
>
> **重要**: 生成される `MicrosoftDataverseService` は **1 つだけ**で、`entityName` を実行時パラメータとして渡して全テーブルを扱う。
> テーブルごとに `add-data-source` を繰り返さない。`organization` に使う Dataverse URL は `.env` の `DATAVERSE_URL`
> などへ保持し、アプリ側では `getContext().app.dataverseOrgUrl` を優先して解決する。

### Step 4.5: 既存テーブルのメタデータ確定（既存テーブルに接続する場合は必須）

Step 4 の生成物（`MicrosoftDataverseModel.ts`）はコネクタ共通のスキーマで、**業務テーブルの列は含まれない**。
既存テーブルに接続する場合、以下を実装前に確定させないと Step 6 の CRUD で手戻りする。

| 確定させる情報 | 用途 |
|---|---|
| `EntitySetName` | `retrieveMultipleRecords` の `entityName` に渡す値（論理名ではない） |
| `PrimaryIdAttribute` | 更新・削除の対象 ID |
| `PrimaryNameAttribute` | 一覧の既定表示列 |
| 列の論理名と型 | `$select` / フォームの入力コントロール |
| 参照列の Targets | `$expand` の可否と関連先 |
| Picklist の値とラベル | ステータス表示・フィルタ（**値は 100000000 起点で、ラベルは API から取得しないと分からない**） |

```bash
# 論理名を渡すと上記を一括出力する（認証は auth_helper、非対話で完走）
python .github/skills/code-apps/scripts/inspect_table_metadata.py {prefix}_store {prefix}_salesplan --custom-only

# 型定義生成などに使う場合は JSON で出力
python .github/skills/code-apps/scripts/inspect_table_metadata.py {prefix}_salesplan --json > table-metadata.json
```

> Picklist の選択肢を UI 側にハードコードする場合も、**必ずこの出力の値を転記する**。
> 推測値（0/1/2 など）で実装すると、書き込みは成功するのに一覧で該当レコードが消える形の不具合になる。

### Step 5: 技術スタック導入

```bash
# Tailwind CSS
npm install -D tailwindcss @tailwindcss/vite

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card dialog table tabs badge input select textarea

# TanStack React Query
npm install @tanstack/react-query

# React Router
npm install react-router
```

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

### Step 6: MicrosoftDataverseService ラッパーで CRUD 実装

`shared_commondataserviceforapps` を追加すると、`src/generated/services/MicrosoftDataverseService.ts` が生成される。
このサービスは **単一・非型付け** で、各操作に `entityName` と `organization` を渡す設計である。

`organization` を省略した通常メソッドは `Invalid organization URL 'null' provided` で失敗しやすいため、
**常に `*WithOrganization` 系メソッドを薄いラッパーで包む**。

```typescript
// src/lib/dataverse-service.ts
import { getContext } from "@microsoft/power-apps/app";
import { MicrosoftDataverseService } from "@/generated/services/MicrosoftDataverseService";

const PREFER = "return=representation";
const READ_PREFER = 'odata.include-annotations="*"';
const ACCEPT = "application/json";

type DataverseRow = Record<string, unknown>;

let cachedOrgUrl: string | undefined;

async function getOrgUrl(): Promise<string> {
  if (cachedOrgUrl) return cachedOrgUrl;
  const ctx = await getContext();
  const orgUrl = ctx.app.dataverseOrgUrl;
  if (!orgUrl) throw new Error("Dataverse org URL を取得できません。");
  cachedOrgUrl = orgUrl;
  return orgUrl;
}

function unwrap<T>(result: { success?: boolean; data?: T; error?: { message?: string } }): T {
  if (result.success === false) {
    throw new Error(result.error?.message ?? "Unknown Dataverse connector error");
  }
  return result.data as T;
}

export const DataverseService = {
  async ListRecords(entityName: string, select?: string[], filter?: string) {
    const org = await getOrgUrl();
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      org,
      entityName,
      READ_PREFER,
      ACCEPT,
      undefined,
      undefined,
      select?.join(","),
      filter,
    );
    return unwrap<{ value?: DataverseRow[] }>(result).value ?? [];
  },
  async GetItem(entityName: string, recordId: string, select?: string[]) {
    const org = await getOrgUrl();
    const result = await MicrosoftDataverseService.GetItemWithOrganization(
      READ_PREFER,
      ACCEPT,
      org,
      entityName,
      recordId,
      undefined,
      undefined,
      select?.join(","),
    );
    return unwrap<DataverseRow>(result);
  },
  async CreateRecord(entityName: string, body: DataverseRow) {
    const org = await getOrgUrl();
    const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
      PREFER,
      ACCEPT,
      org,
      entityName,
      body,
    );
    return unwrap<void>(result);
  },
  async UpdateRecord(entityName: string, recordId: string, body: DataverseRow) {
    const org = await getOrgUrl();
    const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      PREFER,
      ACCEPT,
      org,
      entityName,
      recordId,
      body,
    );
    return unwrap<DataverseRow>(result);
  },
  async DeleteRecord(entityName: string, recordId: string) {
    const org = await getOrgUrl();
    const result = await MicrosoftDataverseService.DeleteRecordWithOrganization(org, entityName, recordId);
    return unwrap<void>(result);
  },
};
```

```
❌ MicrosoftDataverseService.ListRecords(...) のように organization を省略
   → Invalid organization URL 'null' provided

❌ テーブルごとに別 Service を生成する前提で設計
   → shared_commondataserviceforapps の利点（1 回の接続で全テーブル対応）を失う

✅ MicrosoftDataverseService.*WithOrganization + 薄いラッパー
   → org URL を 1 箇所で解決し、Lookup / React Query / エラーハンドリングを共通化できる
```

#### Hook での使用パターン（TanStack React Query）

```typescript
// src/hooks/use-products.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataverseService } from "@/lib/dataverse-service";
import type { ProductRow } from "@/types";

const ENTITY_SET = "{table-entity-set-name}";

export function useProducts() {
  return useQuery<ProductRow[]>({
    queryKey: ["products"],
    queryFn: () =>
      DataverseService.ListRecords(ENTITY_SET, [
        "{prefix}_productid",
        "{prefix}_name",
        "{prefix}_productcode",
        "{prefix}_category",
      ]),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      DataverseService.CreateRecord(ENTITY_SET, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
```

> **Lookup 書き込み規約**: Lookup 列は旧方式と同じく `parentcustomerid_account@odata.bind` のような
> `@odata.bind` をボディへ含める。

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
❌ vite-env.d.ts に generated service や SDK の型を手書きで再宣言
   → SDK / 生成コードの正式型定義と競合する

✅ SDK パッケージの型定義をそのまま使用
   → MicrosoftDataverseService / getContext() の型がそのまま使える
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
