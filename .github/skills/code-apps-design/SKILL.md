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


## コンポーネント・画面パターン

コンポーネントカタログ・ユーティリティ・テーマ変数・画面設計パターンの詳細は [コンポーネントリファレンス](./references/component-catalog.md) を参照。

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
