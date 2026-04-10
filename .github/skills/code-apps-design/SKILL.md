---
name: code-apps-design
description: "CodeAppsStarter のデザインシステムを利用して Code Apps の UI を構築する。Use when: Code Apps デザイン, UI 設計, コンポーネント選定, 画面レイアウト, ギャラリー, テーブル, カンバン, ガントチャート, ダッシュボード, フォーム, shadcn, Tailwind, デザイン例, StatsCards, KanbanBoard, ListTable, InlineEditTable, SearchFilterGallery, GanttChart, TreeStructure"
---

# Code Apps デザインシステムスキル

**[CodeAppsStarter](https://github.com/geekfujiwara/CodeAppsStarter)** のコンポーネントライブラリを使い、
Code Apps の画面を設計・実装する。

> **前提**: アプリの初期化・Dataverse 接続・デプロイは `code-apps-dev` スキルを参照。
> このスキルは UI 設計・コンポーネント選定・画面構成に特化。

## 設計フェーズ（ユーザー承認必須）

**このスキルで設計した内容は、ユーザーに提示して承認を得てから実装に進む。**

設計提示時に含める内容:

| 項目 | 内容 |
|------|------|
| 画面一覧 | ページ名・ルート・各画面の役割 |
| コンポーネント選定 | 各画面で使うコンポーネント（ListTable / StatsCards / FormModal / InlineEditTable 等） |
| カラム定義 | テーブルのカラム構成・render 関数 |
| Lookup 名前解決 | `_xxx_value` + `useMemo` Map パターンでどの Lookup を解決するか |
| ナビゲーション | サイドバー項目・ページ遷移 |
| テーマ | ダーク/ライトモード対応 |

```
フロー: code-apps-design で設計 → ユーザー承認 → code-apps-dev で実装
```

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。
UI コンポーネントの実装先となる Code Apps も同一ソリューションに所属する。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| スタイリング | Tailwind CSS v4 + CSS カスタムプロパティ |
| UIプリミティブ | shadcn/ui（Radix UI ベース） |
| アイコン | lucide-react |
| チャート | Recharts |
| ドラッグ＆ドロップ | dnd-kit v6 |
| ダイアグラム | Mermaid |
| 通知 | sonner |
| データテーブル | TanStack React Table v8 |

## コンポーネントカタログ

### ページレイアウト

| コンポーネント | インポート | 用途 |
|--------------|-----------|------|
| `SidebarLayout` + `Sidebar` | `@/components/sidebar-layout`, `@/components/sidebar` | サイドバー付きレイアウト。`SidebarProvider` でラップし `useSidebarContext` で制御 |
| `HamburgerMenu` | `@/components/hamburger-menu` | モバイル用ハンバーガーメニュー |
| `FullscreenWrapper` | `@/components/fullscreen-wrapper` | コンテンツをフルスクリーン表示するラッパー |
| `ModeToggle` | `@/components/mode-toggle` | ダーク/ライト/システムテーマ切替 |

### データ表示 — テーブル系

| コンポーネント | インポート | 用途 | 主な Props |
|--------------|-----------|------|-----------|
| `ListTable` | `@/components/list-table` | 検索・ソート・ページネーション付きテーブル | `data: T[]`, `columns: TableColumn<T>[]`, `filters?: FilterConfig<T>[]`, `searchKeys?: string[]` |
| `InlineEditTable` | `@/components/inline-edit-table` | インライン編集テーブル（text/textarea/lookup/select）、行追加・削除、CSV インポート対応 | `data: T[]`, `columns: EditableColumn<T>[]`, `onUpdate`, `onAdd`, `onDelete` |

#### ListTable の列定義

```typescript
import { ListTable } from "@/components/list-table"
import type { TableColumn } from "@/components/list-table"

const columns: TableColumn<Incident>[] = [
  { key: "geek_name", label: "タイトル", sortable: true },
  { key: "geek_status", label: "ステータス", sortable: true,
    render: (value) => renderStatusBadge(value) },
  { key: "geek_priority", label: "優先度", sortable: true,
    render: (value) => renderPriorityBadge(value) },
  { key: "createdon", label: "作成日", sortable: true,
    render: (value) => new Date(value).toLocaleDateString("ja-JP") },
]
```

#### InlineEditTable の列定義

```typescript
import { InlineEditTable } from "@/components/inline-edit-table"
import type { EditableColumn } from "@/components/inline-edit-table"

const columns: EditableColumn<Employee>[] = [
  { key: "id", label: "ID", editable: false, type: "text", width: "w-20" },
  { key: "name", label: "名前", editable: true, type: "text", width: "w-32" },
  { key: "department", label: "部署", editable: true, type: "lookup", width: "w-40",
    options: [
      { value: "dev", label: "開発部" },
      { value: "design", label: "デザイン部" },
    ],
    placeholder: "部署を選択",
    searchPlaceholder: "部署を検索...",
  },
  { key: "role", label: "役職", editable: true, type: "select", width: "w-40",
    options: [
      { value: "engineer", label: "エンジニア" },
      { value: "manager", label: "マネージャー" },
    ],
    placeholder: "役職を選択",
  },
]
```

### データ表示 — ギャラリー系

| コンポーネント | インポート | 用途 | 主な Props |
|--------------|-----------|------|-----------|
| `SearchFilterGallery` | `@/components/search-filter-gallery` | 検索＋フィルタ＋カードギャラリー＋ページネーション＋追加ボタン（オールインワン） | `items: GalleryItem[]`, `filters?: FilterConfig[]`, `showAddButton?`, `onAddItem?` |
| `FilterableGallery` | `@/components/filterable-gallery` | 検索＋マルチフィルタドロップダウン＋ページネーション | `items: GalleryItem[]`, `filters?: FilterConfig[]`, `columns?: 2\|3\|4` |
| `PaginatedGallery` | `@/components/paginated-gallery` | ページネーション付きカードギャラリー | `items: GalleryItem[]`, `itemsPerPage?`, `columns?: 2\|3\|4` |
| `GalleryGrid` | `@/components/gallery-grid` | シンプルなカードグリッド | `items: GalleryItem[]`, `columns?: 2\|3\|4` |
| `StatsCards` | `@/components/gallery-components` | 統計メトリクスカード（アイコン、値、トレンド） | `cards: StatCardData[]` |

#### ギャラリーの一括インポート

```typescript
// gallery-components.ts から主要コンポーネントを一括インポート
import {
  StatsCards, GalleryGrid, PaginatedGallery,
  FilterableGallery, SearchFilterGallery
} from "@/components/gallery-components"
import type { StatCardData, GalleryItem, FilterConfig } from "@/components/search-filter-gallery"
```

#### SearchFilterGallery の使い方

```typescript
const filters: FilterConfig[] = [
  { key: "status", label: "ステータス",
    options: [
      { value: "新規", label: "新規" },
      { value: "対応中", label: "対応中" },
    ]
  },
]

<SearchFilterGallery
  items={galleryItems}
  filters={filters}
  showAddButton={true}
  onAddItem={() => setShowCreateModal(true)}
  searchPlaceholder="インシデントを検索..."
/>
```

#### StatsCards の使い方

```typescript
import { AlertCircle, Clock, Target } from "lucide-react"

const stats: StatCardData[] = [
  {
    title: "新規インシデント",
    value: "12",
    description: "今月の新規件数",
    icon: AlertCircle,
    trend: { value: 15, label: "先月比", isPositive: false },
  },
  {
    title: "対応中",
    value: "8",
    description: "現在対応中の件数",
    icon: Clock,
  },
]
<StatsCards cards={stats} />
```

### プロジェクト管理系

| コンポーネント | インポート | 用途 | 主な Props |
|--------------|-----------|------|-----------|
| `KanbanBoard` | `@/components/kanban-board` | ドラッグ＆ドロップカンバンボード（todo/in-progress/done）| `KanbanTask[]`, CRUD + モーダルフォーム内蔵 |
| `TaskPriorityList` | `@/components/task-priority-list` | 優先度別ドラッグソートリスト（フィルタ＋CRUD） | タスク配列, ドラッグ並び替え, モーダル編集 |
| `GanttChart` | `@/components/gantt-chart` | ガントチャート（ドラッグリサイズ、タイムスケール切替） | `GanttTask[]`, スケール: list/1month/3months/6months/1year |
| `TreeStructure` | `@/components/tree-structure` | 階層ツリービュー（追加/削除/ドラッグ並替、Mermaid エクスポート） | `TreeNode[]`, assembly/part/material タイプ |

#### プロジェクト管理コンポーネントの一括インポート

```typescript
// project-management-components.ts から一括インポート
import {
  KanbanBoard, KanbanColumn, KanbanTaskCard,
  TaskPriorityList, GanttChart
} from "@/components/project-management-components"
import type {
  TaskPriority, TaskStatus, TaskCategory,
  KanbanTask, GanttTask
} from "@/components/project-management-components"
import {
  TaskConverter, getPriorityLabel, getCategoryConfig,
  calculateDuration, formatProgress, sortByPriority, groupByStatus
} from "@/components/project-management-components"
```

### フォーム・モーダル系

| コンポーネント | インポート | 用途 | 主な Props |
|--------------|-----------|------|-----------|
| `FormModal` | `@/components/form-modal` | モーダルダイアログ（スクロール対応、保存/キャンセル） | `open`, `onOpenChange`, `title`, `maxWidth?`, `onSave?` |
| `FormSection` | `@/components/form-modal` | フォーム内セクション区切り | `title`, `children` |
| `FormColumns` | `@/components/form-modal` | フォーム内の複数カラムレイアウト | `columns?: 2\|3`, `children` |
| `LinkConfirmModal` | `@/components/link-confirm-modal` | 外部リンク遷移確認ダイアログ | `isOpen`, `onClose`, `url`, `title` |
| `CsvImportExport` | `@/components/csv-import-export` | CSVインポート/エクスポート/バリデーション | `CsvColumn<T>[]`, `CsvOperationType` |

#### フォームモーダルの使い方

```tsx
import { FormModal, FormSection, FormColumns } from "@/components/form-modal"

<FormModal
  open={isOpen}
  onOpenChange={setIsOpen}
  title="インシデント作成"
  description="新しいインシデントを登録します"
  maxWidth="max-w-2xl"
  onSave={handleSave}
  saveLabel="作成"
>
  <FormSection title="基本情報">
    <FormColumns columns={2}>
      <div>
        <Label>タイトル</Label>
        <Input value={title} onChange={...} />
      </div>
      <div>
        <Label>優先度</Label>
        <Select value={priority} onValueChange={...}>
          <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="100000000">緊急</SelectItem>
            <SelectItem value="100000001">高</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </FormColumns>
  </FormSection>
  <FormSection title="詳細">
    <Label>説明</Label>
    <Textarea value={description} onChange={...} />
  </FormSection>
</FormModal>
```

### ビジュアライゼーション

| コンポーネント | インポート | 用途 |
|--------------|-----------|------|
| `ChartDashboard` | `@/components/chart-dashboard` | 集計ダッシュボード（棒・折れ線・円グラフ） |
| `CodeBlock` | `@/components/code-block` | シンタックスハイライト付きコードブロック |
| `LoadingSkeletonGrid` | `@/components/loading-skeleton` | ローディングスケルトン |

### shadcn/ui プリミティブ（24 種）

すべて `@/components/ui/` からインポート:

| カテゴリ | コンポーネント |
|---------|--------------|
| **ボタン・入力** | `Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Select`, `Combobox` |
| **表示** | `Badge`, `Card`, `Table`, `Tabs`, `Separator`, `Progress`, `Skeleton`, `Tooltip` |
| **オーバーレイ** | `Dialog`, `AlertDialog`, `ConfirmDialog`, `DropdownMenu`, `Popover`, `Command` |
| **ナビゲーション** | `ScrollArea` |
| **日付** | `Calendar` |
| **チャート** | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` |

## ユーティリティ

| ファイル | インポート | 関数 |
|---------|-----------|------|
| `utils.ts` | `@/lib/utils` | `cn()` — clsx + tailwind-merge でクラス名結合 |
| `gallery-utils.ts` | `@/lib/gallery-utils` | `getBadgeColorClass(text)` — テキストからバッジ色クラス取得, `flattenItems<T>()` — ネスト配列のフラット化 |
| `table-utils.tsx` | `@/lib/table-utils` | `renderPriorityBadge(value)`, `renderStatusBadge(value)` — テーブル用バッジレンダラー |
| `project-management-utils.ts` | `@/lib/project-management-utils` | `getPriorityLabel()`, `getPriorityColorClass()`, `getCategoryConfig()`, `getStatusColorClass()`, `calculateDuration()`, `formatDate()`, `formatProgress()`, `sortByPriority()`, `groupByStatus()` |
| `project-management-types.ts` | `@/lib/project-management-types` | `TaskPriority`, `TaskStatus`, `TaskCategory`, `BaseTask`, `KanbanTask`, `GanttTask`, `TaskConverter` |

## テーマ・カスタムプロパティ

テーマカラーは `styles/index.pcss` の CSS カスタムプロパティで定義:

```css
:root {
  --primary: #3b82f6;    /* blue-500 */
  --secondary: #dbeafe;  /* blue-100 */
  --accent: #60a5fa;     /* blue-400 */
  --destructive: #ef4444; /* red-500 */
  --chart-1 ~ --chart-5: グラデーションブルー
  --badge-beginner / --badge-intermediate / --badge-advanced / --badge-administrator
}
```

ダーク/ライトは `ThemeProvider` + `useTheme()` フック + `ModeToggle` で切替。

## Provider 階層（App.tsx）

```tsx
PowerProvider → ThemeProvider → SonnerProvider → QueryProvider → RouterProvider
```

## 画面設計パターン

### パターン 1: 一覧画面（テーブル + フィルタ + 作成ボタン）

```tsx
// ページ構成: StatsCards → ListTable + フィルタ + 作成ボタン
<div className="space-y-6">
  <StatsCards cards={stats} />
  <Card>
    <CardHeader>
      <CardTitle>インシデント一覧</CardTitle>
      <Button onClick={() => navigate("/incidents/new")}>新規作成</Button>
    </CardHeader>
    <CardContent>
      <ListTable
        data={incidents}
        columns={columns}
        searchKeys={["geek_name", "geek_description"]}
      />
    </CardContent>
  </Card>
</div>
```

### パターン 2: ダッシュボード画面

```tsx
// StatsCards → ChartDashboard → 最近のアクティビティ
<div className="space-y-6">
  <StatsCards cards={summaryStats} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <Card><ChartDashboard /></Card>
    <Card><ListTable data={recentItems} columns={recentColumns} /></Card>
  </div>
</div>
```

### パターン 3: カード型ギャラリー画面

```tsx
// SearchFilterGallery = 検索 + フィルタ + カード + ページネーション
<SearchFilterGallery
  items={items}
  filters={filterConfigs}
  showAddButton={true}
  onAddItem={handleAdd}
/>
```

### パターン 4: プロジェクト管理画面

```tsx
// Tabs で KanbanBoard / GanttChart / TaskPriorityList を切替
<Tabs defaultValue="kanban">
  <TabsList>
    <TabsTrigger value="kanban">カンバン</TabsTrigger>
    <TabsTrigger value="gantt">ガントチャート</TabsTrigger>
    <TabsTrigger value="list">タスクリスト</TabsTrigger>
  </TabsList>
  <TabsContent value="kanban"><KanbanBoard /></TabsContent>
  <TabsContent value="gantt"><GanttChart tasks={ganttTasks} /></TabsContent>
  <TabsContent value="list"><TaskPriorityList /></TabsContent>
</Tabs>
```

### パターン 5: 詳細画面（フォーム + 関連データ）

```tsx
// Card で基本情報 + Tabs で関連テーブル
<div className="space-y-6">
  <Card>
    <CardHeader>
      <CardTitle>{incident.geek_name}</CardTitle>
      <Badge>{statusLabels[incident.geek_status]}</Badge>
    </CardHeader>
    <CardContent>
      <FormColumns columns={2}>
        <div><Label>優先度</Label><p>{priorityLabels[incident.geek_priority]}</p></div>
        <div><Label>カテゴリ</Label><p>{incident.geek_incidentcategoryid?.geek_name}</p></div>
      </FormColumns>
    </CardContent>
  </Card>
  <Tabs defaultValue="comments">
    <TabsList><TabsTrigger value="comments">コメント</TabsTrigger></TabsList>
    <TabsContent value="comments">
      <InlineEditTable data={comments} columns={commentColumns} />
    </TabsContent>
  </Tabs>
</div>
```

## コンポーネント選定ガイド

| やりたいこと | 推奨コンポーネント |
|------------|-----------------|
| データ一覧を表示 | `ListTable`（検索・ソート・ページネーション付き） |
| データを直接編集 | `InlineEditTable`（インライン編集 + CSV インポート） |
| カード型で一覧 | `SearchFilterGallery`（フル機能）or `FilterableGallery` |
| KPI を表示 | `StatsCards`（アイコン + 数値 + トレンド） |
| カンバンで管理 | `KanbanBoard`（ドラッグ＆ドロップ） |
| スケジュール表示 | `GanttChart`（タイムスケール切替 + ドラッグリサイズ） |
| 優先度管理 | `TaskPriorityList`（ドラッグソート + フィルタ） |
| 階層データ | `TreeStructure`（ツリー + Mermaid エクスポート） |
| レコード作成/編集 | `FormModal` + `FormSection` + `FormColumns` |
| CSV 操作 | `CsvImportExport`（バリデーション付きインポート/エクスポート） |
| 集計チャート | `ChartDashboard`（棒・折れ線・円） |
| 確認ダイアログ | `ConfirmDialog`（destructive 対応）or `AlertDialog` |
| ローディング | `LoadingSkeletonGrid`（variant: default/compact/detailed） |
| コード表示 | `CodeBlock`（コピー機能付き） |
