# Code Apps 構築リファレンス

## 構築手順

### Step 1: プロジェクト初期化

```bash
npx power-apps init --display-name "アプリ名" \
  --environment-id {ENVIRONMENT_ID} --non-interactive
npm install
```

### Step 2: 先にビルド＆デプロイ

```bash
npm run build
npx power-apps push --non-interactive
```

### Step 3: Dataverse データソース追加

```bash
# テーブルごとに実行
npx power-apps add-data-source --api-id dataverse \
  --resource-name geek_incident \
  --org-url https://xxx.crm7.dynamics.com --non-interactive

# 日本語エラーが出たら nameUtils.js をパッチしてリトライ
```

### Step 4: 技術スタック導入

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

### Step 5: DataverseService パターンで CRUD 実装

```typescript
import { DataverseService } from "../services/DataverseService";

// 一覧取得
const incidents = await DataverseService.GetItems(
  "geek_incidents",
  "$select=geek_name,geek_status,geek_priority" +
    "&$expand=geek_incidentcategoryid($select=geek_name)" +
    "&$expand=createdby($select=fullname)" +
    "&$orderby=createdon desc",
);

// レコード作成（Lookup は @odata.bind で設定）
await DataverseService.PostItem("geek_incidents", {
  geek_name: "ネットワーク障害",
  geek_description: "本社3Fで接続不可",
  geek_priority: 100000000, // 緊急
  geek_status: 100000000, // 新規
  "geek_incidentcategoryid@odata.bind": `/geek_incidentcategories(${categoryId})`,
  "geek_assignedtoid@odata.bind": `/systemusers(${userId})`,
});

// レコード更新
await DataverseService.PatchItem("geek_incidents", incidentId, {
  geek_status: 100000001, // 対応中
});

// レコード削除
await DataverseService.DeleteItem("geek_incidents", incidentId);
```

### Step 6: 型定義

```typescript
// Choice 値は 100000000 始まり
export enum IncidentStatus {
  NEW = 100000000,
  IN_PROGRESS = 100000001,
  ON_HOLD = 100000002,
  RESOLVED = 100000003,
  CLOSED = 100000004,
}

export const statusLabels: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: "新規",
  [IncidentStatus.IN_PROGRESS]: "対応中",
  [IncidentStatus.ON_HOLD]: "保留",
  [IncidentStatus.RESOLVED]: "解決済",
  [IncidentStatus.CLOSED]: "クローズ",
};

// Tailwind クラスも型安全に
export const statusColors: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: "bg-blue-100 text-blue-800",
  [IncidentStatus.IN_PROGRESS]: "bg-yellow-100 text-yellow-800",
  [IncidentStatus.ON_HOLD]: "bg-gray-100 text-gray-800",
  [IncidentStatus.RESOLVED]: "bg-green-100 text-green-800",
  [IncidentStatus.CLOSED]: "bg-red-100 text-red-800",
};
```

### Step 7: ビルド＆再デプロイ

```bash
npm run build
npx power-apps push --non-interactive
```

### Step 7.1: ビルド後検証 — Circular chunk 警告チェック（必須）

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

### Step 7.2: ビルド後検証 — CSP 違反チェック（必須）

ビルド成功後、デプロイ前に以下を検証する:

```bash
# ① 外部 API 呼び出しがないこと（Dataverse SDK 経由以外の fetch/XMLHttpRequest）
grep -r "fetch(" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "getClient"

# ② learn.microsoft.com 等の外部 URL への接続がないこと
grep -rn "https://" src/ --include="*.ts" --include="*.tsx" | grep -v "// " | grep -v "crm7.dynamics.com"
```

上記に該当するコードが残っていたら削除する。Power Apps ランタイムは `connect-src 'none'` で外部通信をすべてブロックする。

### Step 7.3: テンプレート残留チェック（必須）

```bash
# テンプレートページが残っていないこと
ls src/pages/ | grep -v "incident\|not-found\|_layout"

# テンプレート専用コンポーネントが残っていないこと
grep -rn "learn-client\|learn-catalog\|chart-dashboard\|gantt-chart\|kanban-board\|tree-structure" src/ --include="*.ts" --include="*.tsx"
```
