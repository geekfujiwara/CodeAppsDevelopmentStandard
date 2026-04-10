---
name: code-apps-dev
description: "Power Apps Code Apps（コードファースト）の初期化・Dataverse 接続・開発・デプロイ。Use when: Code Apps, power-apps init, power-apps push, add-data-source, DataverseService, Tailwind, shadcn, React, TypeScript, Vite, Code Apps デプロイ, nameUtils パッチ, 日本語サニタイズ"
---

# Code Apps 開発スキル

Power Apps Code Apps（コードファースト）を **TypeScript + React + Tailwind CSS + shadcn/ui** で開発する。

> **UI 設計・コンポーネント選定** は `code-apps-design` スキルを参照。
> このスキルは初期化・Dataverse 接続・デプロイに特化。

## 前提: 設計フェーズ完了後に実装に入る（必須）

**このスキルでコードを書く前に、`code-apps-design` スキルで UI 設計を行い、ユーザーの承認を得ていること。**

```
① code-apps-design スキルを読み込む
② 画面構成・コンポーネント選定・Lookup 名前解決パターンを設計
③ ユーザーに設計を提示し、「この設計で進めてよいですか？」と承認を得る
④ 承認後、このスキルに従って実装
```

> **設計で提示する内容**: 画面一覧（ページ名・ルート）、各画面のコンポーネント構成（ListTable / InlineEditTable / StatsCards / FormModal 等）、
> カラム定義、Lookup 名前解決の方法（`_xxx_value` + `useMemo` Map）、ナビゲーション構造

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME=IncidentManagement  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX=geek              ← ソリューション発行者の prefix
```

- Code Apps は `npx power-apps push` でソリューション内にデプロイされる（環境 ID で紐づけ）
- Dataverse データソース追加時はソリューション内のテーブルを参照
- 開発・テスト・本番の環境間移行はソリューションのエクスポート/インポートで行う

## 絶対遵守ルール（検証済み教訓）

### 環境の前提条件（デプロイ前に必ず確認）

```
1. Power Platform 管理センターで「コード アプリを許可する」がオン
   → オフの場合: CodeAppOperationNotAllowedInEnvironment (403) エラー

2. PAC CLI 認証プロファイルが対象環境用に作成済み
   pac auth create --name {profile-name} --environment {ENVIRONMENT_ID}
   pac auth list  # * が付いているのがアクティブ

3. power.config.json は npx power-apps init で生成する
   → テンプレートから手動コピーしない
   → 別環境の appId が残っていると: AppLeaseMissing (409) エラー
   → 新規環境では必ず npx power-apps init で新規生成
```

### .power/ と src/generated/ は SDK コマンドで生成（手動作成禁止）

`.power/` は `.gitignore` で除外されているため、git clone 後は `dataSourcesInfo.ts` が存在しない。
**カスタムスクリプトで生成せず、SDK コマンドで必ず再生成すること。**

```
❌ git clone 直後に npm run build
   → TS2307: Cannot find module '../../../.power/schemas/appschemas/dataSourcesInfo'

❌ カスタムスクリプト（generate_datasources_info.py 等）で手動生成
   → SDK が管理するファイルを自前で作ると整合性が崩れる

✅ npx power-apps add-data-source で各テーブルを再追加
   → .power/schemas/appschemas/dataSourcesInfo.ts が自動生成される
   → src/generated/ のモデル・サービスも同時に再生成される
   → その後 npm run build が成功する
```

### 先にデプロイ、後から開発（最重要）

```bash
# ✅ 正しい順序
npx power-apps init --display-name "アプリ名" --environment-id {ENV_ID} --non-interactive
npm install
npm run build
npx power-apps push --non-interactive    # ← まずデプロイ！
# この時点で Power Platform にアプリが登録され Dataverse 接続が確立
npx power-apps add-data-source ...       # ← その後にデータソース追加

# ❌ 間違い: ローカルで全部作ってから最後にデプロイ
#    → Dataverse 接続が確立されず add-data-source が失敗する
```

### npx power-apps を使う（pac code ではない）

```
❌ pac code add-data-source -a dataverse -t {table}
   → SDK v1.0.x でスクリプトパスが変更され "Could not find the PowerApps CLI script" エラー

✅ npx power-apps add-data-source --api-id dataverse \
     --resource-name {table_logical_name} \
     --org-url {DATAVERSE_URL} --non-interactive
```

### 日本語 DisplayName サニタイズエラーの回避

```
問題: テーブルの日本語表示名で "Failed to sanitize string インシデント" エラー
原因: nameUtils.js が ASCII 文字のみ許容
```

**修正対象**: `node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js`

```javascript
// ❌ 元のコード
name = name.replace(/[^a-zA-Z0-9_$]/g, "_");

// ✅ 修正後（CJK・Unicode 文字を許容）
name = name.replace(
  /[^a-zA-Z0-9_$\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g,
  "_",
);
```

**パッチ適用方法（重要）**: PowerShell では `$` のエスケープ問題でパッチが適用されないことがある。
**必ず Node.js スクリプト（`patch-nameutils.cjs`）を使うこと。**

```javascript
// patch-nameutils.cjs — プロジェクトルートに配置
const fs = require('fs');
const p = 'node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js';
let c = fs.readFileSync(p, 'utf8');
const oldPat = "[^a-zA-Z0-9_$]/g, '_')";
const newPat = "[^a-zA-Z0-9_$\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u3000-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF]/g, '_')";
if (c.includes(oldPat)) {
  c = c.replace(oldPat, newPat);
  fs.writeFileSync(p, c);
  console.log('Patched successfully');
} else {
  console.log('Already patched or pattern not found');
}
```

```bash
# パッチ適用コマンド
node patch-nameutils.cjs

# 検証
node -e "const c=require('fs').readFileSync('node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js','utf8');c.split('\n').forEach((l,i)=>{if(l.includes('replace')&&l.includes('a-zA-Z'))console.log(i+':',l.trim())})"
```

```
❌ PowerShell の文字列置換（$, バッククォート, 正規表現のエスケープが競合）
   → パッチが適用されたように見えて実際には変更されていないケースがある

✅ Node.js スクリプト（patch-nameutils.cjs）で確実に適用
   → 適用後に Select-String または node -e で検証必須
```

> `npm install` で node_modules が再生成されるとパッチが消える。データソース追加のたびに `node patch-nameutils.cjs` を実行すること。

### スキーマ名は英語のみ

```
✅ テーブル: geek_incident  列: geek_description
❌ テーブル: geek_インシデント  列: geek_説明
→ 日本語スキーマ名は pac code add-data-source で失敗する
```

### Power Apps CSP（Content Security Policy）違反の回避

Power Apps ランタイムは厳格な CSP を適用し、**外部 API への `fetch`/`XMLHttpRequest` はすべてブロックされる**（`connect-src 'none'`）。

```
❌ fetch("https://learn.microsoft.com/api/learn/catalog")
   → Connecting to '...' violates Content Security Policy: "connect-src 'none'"

❌ window.open("https://外部サイト") を含むページ
   → CSP または Power Apps の制約でブロック

✅ Dataverse SDK（getClient()）経由のデータアクセスのみ
   → Power Apps SDK は CSP の制約を受けない内部通信
```

**CodeAppsStarter テンプレートにはデモ用の外部 API 呼び出しが含まれる**ため、必ず削除すること。

### 基本設計方針: モーダル操作 + z-index ルール

**新規作成・編集・削除はすべてモーダル（Dialog / AlertDialog）で操作する。**
別ページに遷移させない。サイドバーのメニューは機能名のみ（「一覧」「新規作成」等の動詞を付けない）。

```
❌ /incidents/new → 別ページで新規作成フォーム
❌ サイドバーに「インシデント一覧」「新規作成」を個別メニュー

✅ /incidents ページ内で「新規作成」ボタン → Dialog モーダル表示
✅ 一覧テーブルで行クリック → 詳細ページ（閲覧+インライン編集）
✅ 削除ボタン → ConfirmDialog（AlertDialog）で確認
✅ サイドバーには「インシデント」のみ表示
```

**z-index ルール（サイドバーとモーダルの重なり問題回避）**:

```
サイドバー:       z-40（固定メニュー）
Dialog Overlay:   z-[300]（モーダル背景）
Dialog Content:   z-[400]（モーダル本体）
AlertDialog:      z-[300] / z-[400]（Dialog と同階層）

❌ サイドバー z-[100] + AlertDialog z-50
   → モーダル表示時にサイドバーがシャドウレイヤーの上に表示される

✅ サイドバー z-40 + AlertDialog/Dialog z-[300]/z-[400]
   → モーダルが常にサイドバーの上に表示される
```

### SDK 生成サービス必須（カスタム getClient() / dataSourcesInfo 禁止）

`npx power-apps add-data-source` で生成される **`src/generated/` のサービスと型を必ず使用する**。
カスタムの `getClient()` や自前の `dataSourcesInfo` でのデータ取得は禁止。

```
❌ カスタム dataSourcesInfo を自前で定義して getClient() に渡す
   → Power Apps ランタイムで Dataverse 接続が確立されない
   → ローカルでは動くがデプロイ後にデータ取得できない

✅ src/generated/services/ の SDK 生成サービスを使用
   → .power/schemas/appschemas/dataSourcesInfo.ts を経由
   → Power Apps ランタイムが自動で Dataverse 接続を解決
```

**SDK 生成コードの構成**（`npx power-apps add-data-source` 実行後に生成される）:

```
src/generated/
├── index.ts                                 # 全モデル・サービスの re-export
├── models/
│   ├── CommonModels.ts                      # IGetOptions, IGetAllOptions
│   ├── Geek_incidentsModel.ts               # Geek_incidents 型 + Choice 値
│   ├── Geek_incidentcategoriesModel.ts
│   ├── Geek_locationsModel.ts
│   ├── Geek_incidentcommentsModel.ts
│   └── SystemusersModel.ts
└── services/
    ├── Geek_incidentsService.ts             # create/update/delete/get/getAll
    ├── Geek_incidentcategoriesService.ts
    ├── Geek_locationsService.ts
    ├── Geek_incidentcommentsService.ts
    └── SystemusersService.ts
.power/schemas/appschemas/
└── dataSourcesInfo.ts                       # SDK が内部で使用（直接参照不要）
```

**推奨アーキテクチャ**: SDK 生成サービスの薄いラッパーを作成する。
**Lookup の名前表示は必ずクライアントサイド名前解決パターンを使う。**

```typescript
// src/services/incident-service.ts — SDK生成サービスのラッパー
import { Geek_incidentsService } from "@/generated/services/Geek_incidentsService";
import { SystemusersService } from "@/generated/services/SystemusersService";
import { Geek_incidentcategoriesService } from "@/generated/services/Geek_incidentcategoriesService";
import type {
  Geek_incidents,
  Geek_incidentsBase,
} from "@/generated/models/Geek_incidentsModel";

// システムフィールドは Dataverse が自動設定 → Create 時は除外
type SystemFields =
  | "geek_incidentid"
  | "ownerid"
  | "owneridtype"
  | "statecode"
  | "statuscode";
export type CreatePayload = Omit<Geek_incidentsBase, SystemFields> &
  Partial<
    Pick<
      Geek_incidentsBase,
      "ownerid" | "owneridtype" | "statecode" | "statuscode"
    >
  >;

// ★ select に Lookup GUID（_xxx_value）を必ず含める
export async function getIncidents(): Promise<Geek_incidents[]> {
  const result = await Geek_incidentsService.getAll({
    select: [
      "geek_incidentid", "geek_name", "geek_description",
      "geek_status", "geek_priority", "createdon",
      "_geek_incidentcategoryid_value", "_geek_assignedtoid_value",
      "_geek_itassetid_value", "_createdby_value",
    ],
    orderBy: ["createdon desc"],
  });
  return result.data;
}

// 名前解決用: systemuser 一覧を取得
export async function getSystemUsers() {
  const result = await SystemusersService.getAll({
    select: ["systemuserid", "fullname", "internalemailaddress"],
    filter: "isdisabled eq false and accessmode ne 3 and accessmode ne 4",
    orderBy: ["fullname asc"],
  });
  return result.data;
}

// 名前解決用: カテゴリ一覧を取得
export async function getCategories() {
  const result = await Geek_incidentcategoriesService.getAll({
    select: ["geek_incidentcategoryid", "geek_name"],
    orderBy: ["geek_name asc"],
  });
  return result.data;
}
```

**SDK 生成型の注意点（最初の実装から適用すること）**:

- **Lookup 名フィールド（`createdbyname`, `geek_assignedtoidname` 等）は SDK が返さない**
  → `_xxx_value`（GUID）+ クライアントサイド名前解決が必須（下記パターン参照）
- `createdon`, `modifiedon` は `string | undefined` → null チェック必須
- `geek_status`, `geek_priority` は `number | undefined` → null チェック必須
- Choice 値マップ（`Geek_incidentsgeek_status` 等）は SDK が生成するが、UI ラベルは別途定義

### Lookup 名はクライアントサイド名前解決が必須（最重要）

SDK 生成サービスの `getAll()` / `get()` は **フォーマット済み Lookup 名フィールド**
（`createdbyname`, `geek_assignedtoidname`, `geek_incidentcategoryidname` 等）を
**返さない**。最初のページ実装から以下のパターンを適用すること。

```
❌ Lookup 名フィールドに依存して表示（初回デプロイから壊れる）
   → item.createdbyname → undefined → 「-」や空白になる
   → item.geek_assignedtoidname → undefined → 担当者列が空
   → item.geek_incidentcategoryidname → undefined → カテゴリが空

✅ _xxx_value（GUID）+ useMemo で名前解決マップ（正しいパターン）
   → 関連テーブル（systemuser, category, itasset 等）を hooks で取得
   → useMemo で Map<GUID, 名前> を構築
   → テーブルカラムの render で GUID → 名前変換して表示
```

**ページ実装の推奨パターン（一覧ページ）**:

```typescript
// ① hooks で関連テーブルを取得
const { data: incidents = [] } = useIncidents()
const { data: users = [] } = useSystemUsers()
const { data: categories = [] } = useCategories()

// ② useMemo で GUID → 名前の Map を構築
const userMap = useMemo(() => {
  const m = new Map<string, string>()
  users.forEach((u) => m.set(u.systemuserid, u.fullname || u.internalemailaddress || ""))
  return m
}, [users])

const categoryMap = useMemo(() => {
  const m = new Map<string, string>()
  categories.forEach((c) => m.set(c.geek_incidentcategoryid, c.geek_name))
  return m
}, [categories])

// ③ テーブルカラムで render 関数を使って GUID → 名前を解決
const columns = [
  { key: "geek_name", label: "タイトル", sortable: true },
  {
    key: "_geek_incidentcategoryid_value",
    label: "カテゴリ",
    render: (item) => {
      const v = item._geek_incidentcategoryid_value as string | undefined
      return v ? categoryMap.get(v) || "" : ""
    },
  },
  {
    key: "_geek_assignedtoid_value",
    label: "担当者",
    render: (item) => {
      const v = item._geek_assignedtoid_value as string | undefined
      return v ? userMap.get(v) || "" : ""
    },
  },
  {
    key: "_createdby_value",
    label: "報告者",
    render: (item) => {
      const v = item._createdby_value as string | undefined
      return v ? userMap.get(v) || "" : ""
    },
  },
]
```

**詳細ページの推奨パターン**:

```typescript
// 詳細ページも同様に useMemo マップで解決
<FormColumns columns={2}>
  <div>
    <Label className="text-muted-foreground text-xs">担当者</Label>
    <p className="font-medium">
      {(incident._geek_assignedtoid_value && userMap.get(incident._geek_assignedtoid_value)) || "未割当"}
    </p>
  </div>
  <div>
    <Label className="text-muted-foreground text-xs">報告者</Label>
    <p className="font-medium">
      {(incident._createdby_value && userMap.get(incident._createdby_value)) || "-"}
    </p>
  </div>
</FormColumns>
```

### CodeAppsStarter テンプレートのクリーンアップ（必須）

CodeAppsStarter からプロジェクトを作成した場合、テンプレートのデモページ・コンポーネントが残る。
**アプリのテーマに無関係な要素はすべて削除**し、ユーザーのプロンプトに準拠したアプリのみ残す。

```
削除対象（インシデント管理の例）:
├── src/pages/home.tsx            ← テンプレートホーム（ロゴ表示）
├── src/pages/design-examples.tsx ← デザインショーケース（外部API呼出=CSP違反）
├── src/pages/guide.tsx           ← テンプレートガイド
├── src/pages/feedback.tsx        ← フィードバックページ
├── src/hooks/use-learn-catalog.ts ← Microsoft Learn API（CSP違反）
├── src/lib/learn-client.ts        ← 外部API呼出（CSP違反の根本原因）
├── src/lib/gallery-utils.ts       ← テンプレート専用ユーティリティ
├── src/lib/table-utils.tsx
├── src/lib/project-management-*.ts
├── src/components/chart-dashboard.tsx  ← recharts 依存
├── src/components/gantt-chart.tsx      ← テンプレートデモ
├── src/components/kanban-*.tsx         ← テンプレートデモ
├── src/components/tree-structure.tsx   ← mermaid 依存
├── src/components/gallery-*.ts(x)     ← テンプレートデモ
├── src/components/stats-cards.tsx      ← テンプレートデモ
├── src/components/*-gallery.tsx        ← テンプレートデモ
├── src/components/link-confirm-modal.tsx
├── src/components/code-block.tsx
├── src/components/hamburger-menu.tsx
├── src/components/csv-import-export.tsx
└── src/components/ui/chart.tsx    ← recharts 依存
```

**修正手順**:

1. `router.tsx`: テンプレートページのルートを削除、`/` を `/incidents` にリダイレクト
2. `_layout.tsx`: ヘッダーのアプリ名をテーマに合わせ変更、テンプレート外部リンク・フッター削除
3. `sidebar.tsx`: ナビゲーションをアプリのテーマに限定
4. テンプレート専用ファイルを削除
5. `npm remove mermaid recharts`（テンプレートデモ専用パッケージ）
6. `inline-edit-table.tsx` / `list-table.tsx` から `csv-import-export` 参照を削除
7. ビルド → 0 エラー確認 → デプロイ

> **残すコンポーネント**: `form-modal.tsx`, `inline-edit-table.tsx`, `list-table.tsx`, `loading-skeleton.tsx`,
> `fullscreen-wrapper.tsx`, `sidebar-layout.tsx`, `sidebar.tsx`, `mode-toggle.tsx`, `ui/` 配下全て。
> これらは将来の画面実装で活用できる汎用コンポーネント。

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

## 技術スタック

| レイヤー       | 技術                                   |
| -------------- | -------------------------------------- |
| UI             | React 18 + TypeScript                  |
| スタイリング   | Tailwind CSS + shadcn/ui               |
| データフェッチ | TanStack React Query                   |
| ルーティング   | React Router                           |
| ビルド         | Vite                                   |
| 状態管理       | React Query キャッシュ + React Context |
| Dataverse 通信 | DataverseService パターン              |

## TanStack React Query パターン

```typescript
// hooks/useIncidents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useIncidents() {
  return useQuery({
    queryKey: ["incidents"],
    queryFn: () =>
      DataverseService.GetItems(
        "geek_incidents",
        "$select=geek_name,geek_status&$orderby=createdon desc",
      ),
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateIncidentInput) =>
      DataverseService.PostItem("geek_incidents", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incidents"] }),
  });
}
```

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
ENVIRONMENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
```
