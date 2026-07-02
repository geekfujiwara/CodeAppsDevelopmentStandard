---
name: design-pattern
description: "Code Apps のデザインシステムを利用して UI を構築する。shadcn/ui + Tailwind CSS v4 のコンポーネントライブラリによる画面設計・コンポーネント選定。"
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
  - "デザインテンプレート"
  - "テンプレート"
  - "配色"
  - "カラースキーム"
  - "テーマカラー"
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

Code Apps 標準のコンポーネントライブラリ（shadcn/ui + Tailwind CSS）を使い、
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
| デザインテンプレート（レイアウト） | [デザインテンプレート集](design-templates.md) から選択した画面の骨格 |
| カラーパレット | [カラーパレット集](color-palettes.md) から選択した配色 |
| テーマ | ダーク/ライトモード対応 |

```
フロー: code-apps（design-system）で設計 → ユーザー承認 → code-apps で実装
```

## 画面設計ブロック（テンプレ化させない設計フロー）

**テーブルの数だけ機械的に「一覧＋フォーム」CRUD 画面を量産しない。** 画面ごとに以下のように
データの特性を AskUserQuestion で確認し、当てはまるブロックを組み合わせて画面を組み上げる。

### AskUserQuestion で確認する項目（テーブル単位）

| 確認項目 | 該当すると選ぶブロック |
|---|---|
| 順序を持つステータス／ステージがあるか？ | `KanbanBoard`（ドラッグでステータス変更） or `StagePath`（矢羽でクリック即時変更） |
| 期間（開始/終了）を持つレコードがあるか？ | `GanttChart`（dnd-kit、ドラッグリサイズ中心）、もしくは自由配置・ズームが必要なら **ReactFlow** カスタムノード（[ReactFlow パターン](reactflow-patterns.md)） |
| 他レコードとの関係性・依存・フローを見せたいか？ | **ReactFlow**（ノード＋エッジ）— [ReactFlow パターン](reactflow-patterns.md) |
| 地域・位置情報を持つか？ | `JapanMap`（[日本地図パターン](japan-map-pattern.md)） |
| 階層構造（親子・ツリー）か？ | `TreeStructure` |
| 集計・比率を見せたいか？ | `ChartDashboard`（Recharts: 棒・円・折れ線） |
| 単純な一覧・検索だけで良いか？ | `ListTable` / `InlineEditTable`（この場合のみ従来通りの CRUD テーブル） |

### ReactFlow を第一候補とする方針

**可視化ニーズが少しでもあれば、ReactFlow を必ず一度は候補として提示する。** 単純な集計（件数・合計・比率）は
`ChartDashboard`（Recharts）で十分だが、**関係性・時間軸配置・自由なノード配置・ガントチャート**を伴う場面では
 ReactFlow（`@xyflow/react`）を優先する。**1 画面につき最低 1 つは可視化ブロック**（チャート／地図／ReactFlow）を
含めることを検討し、単なる一覧+フォームのテンプレで終わらせない。

具体的な実装パターン（ガントチャートカスタムノード・関係図・依存フロー・色分けハッシュ関数）は
[ReactFlow 可視化パターン](reactflow-patterns.md) を参照。

### ブロックを組み合わせて画面を確定する手順

1. テーブルごとに上記表の AskUserQuestion を実施し、該当するブロックを列挙する
2. 同一画面内で複数ブロックを Tabs / グリッドで組み合わせる（例: 一覧＋カンバン＋ガントを Tabs で切替）
3. 組み上がったブロック構成を以下の「設計提示時に含める内容」に反映してユーザーに提示し、承認を得る

## デザインテンプレート（レイアウト）＋カラーパレット選択

新しい Code Apps の設計時は、まず **[デザインテンプレート集（レイアウト）](design-templates.md)** で画面の骨格を提案し、続いて **[カラーパレット集](color-palettes.md)** で配色を提案すること。

**ワークフロー**:
1. `design-templates.md` を読み込み、レイアウト一覧表を提示 → ユーザーが番号で選択（デフォルト: **1. Sidebar**）
2. `color-palettes.md` を読み込み、カラーパレット一覧表を提示 → ユーザーが番号で選択（デフォルト: **1. Ocean Blue**）
3. 選択パレットの CSS Variables を `styles/index.pcss` の `:root` / `.dark` に適用
4. 選択レイアウトのアプリシェルで実装

> レイアウトも配色もビルド時に確定する（ランタイム切替は行わない）。
> 配色で切り替えるのは色と `--radius` のみ。フォントはシステムフォント固定（下記「標準フォント方針」参照）、
> バッジ変数・`@theme inline` ブロックは変更しない。

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。
UI コンポーネントの実装先となる Code Apps も同一ソリューションに所属する。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| スタイリング | Tailwind CSS v4 + CSS カスタムプロパティ |
| UIプリミティブ | shadcn/ui（Radix UI ベース） |
| アイコン | lucide-react（shadcn 内部の標準）/ 任意で @fluentui/react-icons（Fluent UI v2、[fluent-icons.md](fluent-icons.md)） |
| チャート | Recharts |
| ドラッグ＆ドロップ | dnd-kit v6 |
| ダイアグラム | Mermaid |
| 通知 | sonner |
| データテーブル | TanStack React Table v8 |

## 標準フォント方針

**Power Pages は Google Fonts 可、Code Apps は不可** とする。

- **Power Pages**: 外部公開サイトのため、テンプレートごとの Google Fonts 読み込みを許可
- **Code Apps**: テンプレートに Google Fonts を入れず、ローカル/システムフォントのみを使用

```css
:root {
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "Hiragino Sans",
    "Yu Gothic UI",
    Meiryo,
    sans-serif;
}
```

> Code Apps では `index.html` に Google Fonts の `<link>` を追加しない。Power Pages 側のフォント方針とは分けて扱う。


## コンポーネント・画面パターン

コンポーネントカタログ・ユーティリティ・テーマ変数・画面設計パターンの詳細は [コンポーネントリファレンス](component-catalog.md) を参照。

## モダンで美しい UI の原則

「一覧＋フォーム」を並べただけの素朴な CRUD で終わらせず、以下の原則で**洗練された見た目**に仕上げる。
色は必ず [カラーパレット集](color-palettes.md) の CSS 変数（`--primary` / `--muted` / `--border` / `--cat-*` 等）で
指定し、ハードコードしない。

| 原則 | 具体化 |
|---|---|
| 角丸と余白のリズム | `--radius` を基準に `rounded-lg`/`rounded-xl`。カード内は `p-3`〜`p-6`、要素間は `gap-2`〜`gap-4` で一定に |
| 影は軽く、階層は控えめに | 既定は `shadow-sm`、ホバーで `hover:shadow-md`。多重の濃い影・けばけばしいグラデは使わない |
| ステータスは「帯」でなく「チップ」 | フルカラーの背景帯は圧迫感が出る。`rounded-full px-2 py-0.5` の淡色チップ＋`--badge-*` で表現 |
| ホバーで軽く反応 | `transition-shadow`/`transition-colors`、必要なら `hover:-translate-y-0.5` の微小リフトのみ |
| アクセントは 1 つに絞る | 主要動作・選択状態は `--primary`（ブランド色）に統一。多色で主張させない |
| 色の上の文字は必ず可読に | 濃い塗り（進捗フィル・カテゴリ色）の上のラベルは `bg-background/85` の半透明チップに乗せる。色ごとの輝度計算より確実 |
| カテゴリ色は共通パレット | 種類の色分けは `categoryColor()`/`--cat-*`（[共通カテゴリ配色](color-palettes.md)）。黒・グレーは使わない |
| 余白で情報を整理 | 罫線を増やすより余白と `text-muted-foreground` の階層で読ませる。`Card` のヘッダ/本文を分ける |
| 空状態・読み込みを設計 | 空リストは破線ボーダーの説明ブロック、読み込みは `LoadingSkeleton*`。無言の空白を残さない |
| ダーク/ライト両対応 | 直値の色を書かず変数を使えば自動対応。両モードでコントラストを目視確認する |

> ガント・カンバン等の可視化ブロックでこれらを具体化した実装（単色フィル＋半透明チップ、チップ型ヘッダ、
> `DragOverlay`、ドラッグリサイズハンドル）は [ReactFlow 可視化パターン](reactflow-patterns.md) を参照。

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

### ScrollArea を flex レイアウトで使う場合は `h-0` を併用する

`ScrollArea` に `flex-1` だけを指定してもスクロールが効かない。
`flex-1` のデフォルト `min-height: auto` により、ScrollArea がコンテンツ全体の高さまで膨張してしまうため。
`h-0` を併用して min-height を 0 にリセットすることで、flex-grow で伸縮しつつ高さが確定する。

```tsx
// ❌ flex-1 だけ → スクロールが効かず見切れる
<div className="flex flex-col h-full">
  <div className="shrink-0">ヘッダー</div>
  <ScrollArea className="flex-1 px-4">...</ScrollArea>
</div>

// ✅ flex-1 + h-0 → スクロールが正しく動作
<div className="flex flex-col h-full">
  <div className="shrink-0">ヘッダー</div>
  <ScrollArea className="flex-1 h-0 px-4">...</ScrollArea>
</div>
```

> 親コンテナにも `overflow-hidden` を指定すること（ScrollArea が親を超えて膨張するのを防ぐ）。

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
| 自由配置・ズーム可能なガントチャート | `ReactFlow` カスタムノード（時間軸配置 + 進捗フィル）— [ReactFlow パターン](reactflow-patterns.md) |
| 関係性・依存関係・フロー図・組織図を可視化 | `ReactFlow`（ノード + エッジ）— [ReactFlow パターン](reactflow-patterns.md) |
| 組織図 × 予算達成状況 | `ReactFlow` OrgChart（Office 365 Users + 売上目標/実績）— [ReactFlow パターン §4](reactflow-patterns.md#パターン-4-組織図--予算達成状況orgchart) |
| セールスパイプライン可視化 | `ReactFlow` Pipeline（リード→商談フロー + 件数・金額・CVR）— [ReactFlow パターン §5](reactflow-patterns.md#パターン-5-セールスパイプラインリード--商談フロー可視化) |
| ステージ矢羽（シェブロン） | `StagePath`（Salesforce 風の矢羽表示 + クリックでステージ変更）— [矢羽パターン](stage-path-pattern.md) |
| 優先度管理 | `TaskPriorityList`（ドラッグソート + フィルタ） |
| 階層データ | `TreeStructure`（ツリー + Mermaid エクスポート） |
| レコード作成/編集 | `FormModal` + `FormSection` + `FormColumns` |
| CSV 操作 | `CsvImportExport`（バリデーション付きインポート/エクスポート） |
| 集計チャート | `ChartDashboard`（棒・折れ線・円） |
| 確認ダイアログ | `ConfirmDialog`（destructive 対応）or `AlertDialog` |
| ローディング | `LoadingSkeletonGrid`（variant: default/compact/detailed） |
| コード表示 | `CodeBlock`（コピー機能付き） |
| 地域別データを地図で可視化 | `JapanMap`（SVG 都道府県クリック + 色分け + 地方フィルタ）— [日本地図パターン](japan-map-pattern.md) 参照 |
| AI エージェントと対話 | `CopilotChatPage`（Copilot Studio 直接統合チャット UI）— [Copilot チャットパターン](copilot-chat-pattern.md) 参照 |
| レコードの読み取り専用制御 | オーナーガード（ログインユーザー vs 担当者の比較で isReadOnly 判定）— [オーナーガードパターン](owner-guard-pattern.md) 参照 |
