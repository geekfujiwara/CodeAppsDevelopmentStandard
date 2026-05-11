# Code Apps コンポーネントカタログ

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

// 例: 任意のテーブルの列定義（{prefix} とテーブル名はプロジェクトに合わせて置き換え）
const columns: TableColumn<YourEntity>[] = [
  { key: "{prefix}_name", label: "タイトル", sortable: true },
  { key: "{prefix}_status", label: "ステータス", sortable: true,
    render: (value) => renderStatusBadge(value) },
  { key: "{prefix}_priority", label: "優先度", sortable: true,
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
  searchPlaceholder="レコードを検索..."
/>
```

#### StatsCards の使い方

```typescript
import { AlertCircle, Clock, Target } from "lucide-react"

// 例: ダッシュボード用統計カード（プロジェクトの KPI に合わせて置き換え）
const stats: StatCardData[] = [
  {
    title: "新規登録",
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

// 例: title と description はプロジェクトのエンティティ名に合わせて置き換え
<FormModal
  open={isOpen}
  onOpenChange={setIsOpen}
  title="レコード作成"
  description="新しいレコードを登録します"
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
      <CardTitle>レコード一覧</CardTitle>
      <Button onClick={() => setShowCreateModal(true)}>新規作成</Button>
    </CardHeader>
    <CardContent>
      <ListTable
        data={items}
        columns={columns}
        searchKeys={["{prefix}_name", "{prefix}_description"]}
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
      <CardTitle>{item.{prefix}_name}</CardTitle>
      <Badge>{statusLabels[item.{prefix}_status]}</Badge>
    </CardHeader>
    <CardContent>
      <FormColumns columns={2}>
        <div><Label>優先度</Label><p>{priorityLabels[item.{prefix}_priority]}</p></div>
        <div><Label>カテゴリ</Label><p>{categoryMap.get(item._{prefix}_categoryid_value)}</p></div>
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

### パターン 6: 日本地図ダッシュボード

詳細な実装パターン・コンポーネント定義・Dataverse 連携は [日本地図パターン](japan-map-pattern.md) を参照。
SVG アセットは `public/maps/` に格納（map-full.svg / map-mobile.svg / map-circle.svg / map-polygon.svg）。

```tsx
// ページ構成: StatsCards → JapanMap + 詳細パネル + ListTable
<div className="space-y-6">
  <StatsCards cards={regionStats} />
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>地域別データ</CardTitle>
        <Select value={selectedRegion} onValueChange={setSelectedRegion}>
          <SelectTrigger className="w-40"><SelectValue placeholder="地方を選択" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全国</SelectItem>
            <SelectItem value="hokkaido">北海道</SelectItem>
            <SelectItem value="tohoku">東北</SelectItem>
            <SelectItem value="kanto">関東</SelectItem>
            <SelectItem value="chubu">中部</SelectItem>
            <SelectItem value="kinki">近畿</SelectItem>
            <SelectItem value="chugoku">中国</SelectItem>
            <SelectItem value="shikoku">四国</SelectItem>
            <SelectItem value="kyushu-okinawa">九州・沖縄</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <JapanMap data={prefectureData} selectedRegion={selectedRegion} onPrefectureClick={setSelectedPrefecture} />
        <MapLegend items={legendItems} />
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>{selectedPrefecture ? prefectureNames[selectedPrefecture] : "都道府県を選択"}</CardTitle></CardHeader>
      <CardContent><PrefectureDetail code={selectedPrefecture} data={prefectureData} /></CardContent>
    </Card>
  </div>
  <Card>
    <CardContent>
      <ListTable data={tableData} columns={prefectureColumns} searchKeys={["name"]} />
    </CardContent>
  </Card>
</div>
```

### パターン 7: Copilot Studio チャット UI

詳細な実装パターン・コンポーネント定義・Copilot Studio 連携は [Copilot チャットパターン](copilot-chat-pattern.md) を参照。
Copilot Studio コネクタの設定は [copilot-studio-connector.md](copilot-studio-connector.md) を参照。

```tsx
// ページ構成: ヘッダー + チャット領域 + 入力フォーム
// Copilot Studio エージェントと直接対話するフルスクリーンチャット
<div className="flex flex-col overflow-hidden" style={{ height: "calc(100dvh - 64px - 2rem)" }}>
  {/* ヘッダー */}
  <div className="px-4 pt-3 pb-2 border-b bg-background shrink-0">
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={handleResetChat}>
        <RotateCcw className="h-3 w-3" /> リセット
      </Button>
      {/* ★ 追加アクションボタン */}
    </div>
    <div className="flex items-center gap-1.5 mt-2">
      <Bot className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium">Copilot</span>
    </div>
  </div>

  {/* チャット領域 */}
  <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
    {/* 初期画面: Bot アイコン + クイックアクション */}
    {/* メッセージバブル: user=bg-primary / assistant=bg-muted+Markdown */}
    {/* 思考中インジケーター */}
  </div>

  {/* 入力フォーム */}
  <div className="px-4 py-3 border-t bg-background shrink-0">
    <form className="flex items-center gap-2">
      <Input placeholder="質問を入力..." className="pl-10" />
      <Button type="submit" size="icon"><Send className="h-4 w-4" /></Button>
    </form>
  </div>
</div>
```

### パターン 8: オーナーガード（読み取り専用制御）

レコードの担当者とログインユーザーを比較し、他のユーザーのレコードを読み取り専用にするパターン。
承認ワークフロー・タスク再割当・チーム共有ビューで使用。
詳細な実装・SDK 制約・カスタマイズガイドは [オーナーガードパターン](owner-guard-pattern.md) を参照。

```tsx
// 1. ユーザー → 担当者 ID 解決（queryFn 内）
const currentUserId = await getCurrentUserId().catch(() => null);
const myRecordId = currentUserId
  ? await getMyRecordId(currentUserId, "bookableresources", "bookableresourceid").catch(() => null)
  : null;

// 2. オーナー判定
const isOwnRecord = !myRecordId
  || myRecordId.toLowerCase() === record._owner_value.toLowerCase();
const isReadOnly = statusId === COMPLETED || statusId === CANCELED || !isOwnRecord;

// 3. amber バナー（他の担当者）
{!isOwnRecord && (
  <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400
    bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg
    border border-amber-200 dark:border-amber-800">
    <Info className="h-4 w-4 shrink-0" />
    <span className="flex-1">
      このレコードは別の担当者（{ownerName}）に割り当てられています。読み取り専用です。
    </span>
  </div>
)}

// 4. アクションボタン非表示
const renderActions = () => {
  if (isReadOnly) return null;
  return (
    <div className="flex gap-2">
      <Button onClick={handleApprove}>承認</Button>
      <Button variant="destructive" onClick={handleReject}>差戻し</Button>
    </div>
  );
};
```
