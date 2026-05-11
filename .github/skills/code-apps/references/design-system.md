---
name: design-system
description: "CodeAppsStarter のデザインシステムを利用して Code Apps の UI を構築する。shadcn/ui + Tailwind CSS v4 のコンポーネントライブラリによる画面設計・コンポーネント選定。"
category: ui
triggers:
  - "Code Apps デザイン"
  - "UI 設計"
  - "コンポーネント選定"
  - "画面レイアウト"
  - "ギャラリー"
  - "テーブル"
  - "カンバン"
  - "ガントチャート"
  - "ダッシュボード"
  - "フォーム"
  - "shadcn"
  - "Tailwind"
  - "デザイン例"
  - "StatsCards"
  - "KanbanBoard"
  - "ListTable"
  - "InlineEditTable"
  - "SearchFilterGallery"
  - "GanttChart"
  - "TreeStructure"
  - "日本地図"
  - "地図"
  - "マップ"
  - "都道府県"
  - "地域別"
  - "JapanMap"
---

# Code Apps デザインシステムスキル

**[CodeAppsStarter](https://github.com/geekfujiwara/CodeAppsStarter)** のコンポーネントライブラリを使い、
Code Apps の画面を設計・実装する。

> **前提**: アプリの初期化・Dataverse 接続・デプロイは `code-apps` スキル（[SKILL.md](../SKILL.md)）を参照。
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
フロー: code-apps（design-system）で設計 → ユーザー承認 → code-apps で実装
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


## コンポーネント・画面パターン

コンポーネントカタログ・ユーティリティ・テーマ変数・画面設計パターンの詳細は [コンポーネントリファレンス](references/component-catalog.md) を参照。

## レスポンシブファースト設計原則

**Code Apps はモバイル（MDA 内 iframe）での利用が主。モバイルファーストで設計し、デスクトップに拡張する。**

### 基本ルール

1. **モバイルレイアウトを最初に設計**。`md:` / `lg:` プレフィックスでデスクトップ拡張
2. **テキスト省略（truncate）を前提にする**。テーブル名・作業指示書名等の長い文字列は `truncate` で `...` 省略。クリックで詳細表示
3. **マルチカラムレイアウト**: モバイル=1カラムずつ表示（ステップ切替）、デスクトップ=`grid grid-cols-N`
4. **カード内テキストは必ず幅制約する**。`min-w-0` + `overflow-hidden` + `truncate` のチェーンを Card → CardContent → flex → text 要素まで通す

### ScrollArea 使用禁止（マルチカラム・truncate 併用時）

**Radix UI `ScrollArea` はテキスト省略（`truncate`）と併用してはならない。**

| 問題 | Radix `ScrollArea` の内部 Viewport が `overflow: scroll` を持ち、コンテンツの水平膨張を許容する |
|------|------|
| 症状 | `truncate`（`text-overflow: ellipsis`）が効かない。テキストが横にはみ出す |
| 原因 | `truncate` の前提は親要素の幅制約（`overflow: hidden`）だが、ScrollArea Viewport が水平スクロールを許可するため幅制約が無効化される |
| 解決策 | `ScrollArea` を素の `div` + `overflow-y-auto overflow-x-hidden` に置き換える |

```tsx
// ❌ NG: ScrollArea + truncate — テキストが省略されない
<ScrollArea className="min-w-0">
  <p className="truncate">長いテキスト...</p>
</ScrollArea>

// ✅ OK: div + overflow 制御 — truncate が正しく動作
<div className="overflow-y-auto overflow-x-hidden min-w-0">
  <p className="truncate">長いテキスト...</p>
</div>
```

> **適用範囲**: グリッドカラム・サイドパネル・カードリスト等、幅が制約された領域で
> テキスト省略が必要な場合すべて。縦スクロールのみが必要な場面では `ScrollArea` を使わず
> 素の `div` を使う。

### truncate チェーン（必須パターン）

`truncate` を効かせるには、**ルート要素から対象テキストまで `min-w-0` チェーンが途切れないこと**が必要:

```tsx
// グリッドセル → スクロール領域 → カード → テキスト の全階層で min-w-0
<div className="grid grid-cols-3 min-h-0 overflow-hidden">
  {/* 各カラム */}
  <div className="min-w-0 overflow-y-auto overflow-x-hidden">
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="shrink-0" />
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="truncate">長いテキストが...で省略される</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</div>
```

**チェックポイント**:
- `flex` / `grid` の子要素に `min-w-0`（flexbox のデフォルト `min-width: auto` を無効化）
- `overflow-hidden` がテキスト要素の直近の祖先にある
- `shrink-0` でアイコン等の固定幅要素が縮まないようにする
- `flex-1 min-w-0` で可変幅テキスト領域を確保

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
| 地域別データを地図で可視化 | `JapanMap`（SVG 都道府県クリック + 色分け + 地方フィルタ）— [日本地図パターン](references/japan-map-pattern.md) 参照 |
| AI エージェントと対話 | `CopilotChatPage`（Copilot Studio 直接統合チャット UI）— [Copilot チャットパターン](references/copilot-chat-pattern.md) 参照 |
