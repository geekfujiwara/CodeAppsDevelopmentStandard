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
| デザインテンプレート | [デザインテンプレート集](design-templates.md) から選択した配色 |
| テーマ | ダーク/ライトモード対応 |

```
フロー: code-apps（design-pattern）で設計 → ユーザー承認 → code-apps で実装
```

## デザインテンプレート選択

新しい Code Apps の設計時は、まず **[デザインテンプレート集](design-templates.md)** を読み込み、ユーザーにテンプレートを提案すること。

**ワークフロー**:
1. `design-templates.md` を読み込む
2. テンプレート一覧表をユーザーに提示
3. ユーザーが番号で選択
4. 選択テンプレートの CSS Variables を `styles/index.pcss` の `:root` / `.dark` に適用
5. デフォルト未指定の場合は **1. Ocean Blue** を使用

> テンプレートはビルド時に確定する（ランタイム切替は行わない）。
> 切り替えるのは配色と `--radius` のみ。フォントはシステムフォント固定（下記「標準フォント方針」参照）、
> バッジ変数・`@theme inline` ブロックは変更しない。

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。
UI コンポーネントの実装先となる Code Apps も同一ソリューションに所属する。

## 名前とナビは最初から汎用にする

ソリューションとして配布する可能性が少しでもあるなら、**最初の 1 画面目から固有名詞を入れない**。
後からの改名はファイル横断になり、必ずどこか 1 箇所が取り残される。

| 場所 | 値 | 見える場所 |
|---|---|---|
| `.env` `VITE_CODEAPPS_APP_NAME` | アプリ表示名 | サイドバー・ヘッダー |
| `.env` `VITE_CODEAPPS_DOCUMENT_TITLE` | ブラウザタブ | ブラウザタブ・履歴 |
| `power.config.json` `appDisplayName` | Power Apps 上の名前 | メーカー ポータル・ソリューション |
| `.env` `VITE_CODEAPPS_THEME_STORAGE_KEY` | localStorage キー | （不可視） |

- **上 3 つは必ず同時に変える。** 片方だけ直すと、ポータルとアプリ内で名前が食い違う
  （`predeploy` のチェック 8 が検出する）。
- **UI 文言に固有名詞を直書きしない。** チャットの話者ラベルや空状態の文言に
  製品名・エージェント名を埋め込むと、`.env` を変えても画面に旧名が残る。
  役割名（「エージェント」「担当者」）で書く。
- ソリューション名・パブリッシャー接頭辞は**変えない**。変えるとテーブルの論理名が全部ずれる。
  表示名だけを汎用化すればよい。

**ナビは 5 項目を超えたらグループ化する。** `NAV_SECTIONS` は最初からセクション配列なので、
タイトルを分けるだけで済む。「概要（ダッシュボード・推移）」「業務」「マスタ」の 3 層が基本形。

```ts
// src/config.ts — 用途で分けておくと、機能追加時に入れ先が迷わない
const overviewItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "trend", label: "推移", path: "/trend" },
]
const operationItems: NavItem[] = [
  { key: "items", label: "一覧", path: "/items" },
]
const masterItems: NavItem[] = [
  { key: "rules", label: "ルール", path: "/rules" },
]

export const NAV_SECTIONS: NavSection[] = [
  { title: "概要", items: overviewItems },
  { title: "業務", items: operationItems },
  { title: "マスタ", items: masterItems },
]
```

> マスタ系（ルール・区分・宛先）を業務画面と同じ列に並べると、使う人が毎回探す。
> 進めるうちに必ず増えるので、**1 項目しか無くてもセクションを分けておく**。

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

コンポーネントカタログ・ユーティリティ・テーマ変数・画面設計パターンの詳細は [コンポーネントリファレンス](references/component-catalog.md) を参照。

## レスポンシブファースト設計原則

**Code Apps はモバイル（MDA 内 iframe）での利用が主。モバイルファーストで設計し、デスクトップに拡張する。**

### 基本ルール

1. **モバイルレイアウトを最初に設計**。`md:` / `lg:` プレフィックスでデスクトップ拡張
2. **テキスト省略（truncate）を前提にする**。テーブル名・作業指示書名等の長い文字列は `truncate` で `...` 省略。クリックで詳細表示
3. **マルチカラムレイアウト**: モバイル=1カラムずつ表示（ステップ切替）、デスクトップ=`grid grid-cols-N`
4. **カード内テキストは必ず幅制約する**。`min-w-0` + `overflow-hidden` + `truncate` のチェーンを Card → CardContent → flex → text 要素まで通す
5. **横スクロールバーを 1 本も出さない**。`grid` / `flex` の**直接の子には必ず `min-w-0`** を付け、
   長文は `[overflow-wrap:anywhere]`、幅の読めない塊（コード・表・JSON）は `overflow-x-auto` で閉じ込める

### ページの骨格（新規画面はここから書き始める）

崩れてから直すのではなく、最初からこの形で書く。`min-w-0` は後付けすると必ず抜ける。

```tsx
// 1 カラム（一覧・フォーム）
<div className="space-y-6">
  <PageHeader />
  <Card className="min-w-0">...</Card>
</div>

// 2 カラム（詳細画面：本文 + サイドパネル）
<div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
  <Card className="min-w-0">{/* 本文 */}</Card>
  <div className="min-w-0 space-y-4">{/* サイドパネル */}</div>
</div>

// 一覧ペイン + 詳細（マスター詳細）
<div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
  <div className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
    <ListPane />
  </div>
  <div className="min-w-0">{children}</div>
</div>
```

**サイズ指定の使い分け**:

| 書き方 | 意味 | 使う場面 |
| --- | --- | --- |
| `minmax(0,1fr)` | トラックが min-content 未満まで縮める | 可変幅カラム（ほぼ常にこれ） |
| `280px` / `320px` | 固定幅 | ナビ・一覧ペイン・メタ情報パネル |
| `1fr`（素） | min-content 以下に縮まない | **使わない**（長文で必ず溢れる） |

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

### `minmax(0,1fr)` を書いても子要素に `min-w-0` が要る

`grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` が効くのは**トラック**の伸長抑止まで。
グリッドアイテム自身は `min-width: auto` のままなので、min-content がトラックより広いと
アイテムがトラックを突き破り、ページ全体が横スクロールしてレスポンシブが崩れる。

```tsx
{/* NG: 長い本文やコード例を入れた途端に画面幅を超える */}
<div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
  <Card>...</Card>
  <div className="space-y-4">...</div>
</div>

{/* OK: アイテム側にも min-w-0 */}
<div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
  <Card className="min-w-0">...</Card>
  <div className="min-w-0 space-y-4">...</div>
</div>
```

### 折り返しは `break-words` ではなく `[overflow-wrap:anywhere]`

`break-words`（= `overflow-wrap: break-word`）は**描画時にだけ**折り返す。
min-content 幅の計算では無視されるため、長い URL や識別子を含む本文は
親の幅を押し広げ続ける。幅を詰めたいときは `anywhere` を使う。

| クラス | 描画時に折り返す | min-content を縮める | 用途 |
| --- | --- | --- | --- |
| `break-words` | ○ | **×** | 幅が固定済みの場所 |
| `[overflow-wrap:anywhere]` | ○ | ○ | 可変幅カラムに流し込む本文 |
| `break-all` | ○ | ○ | JSON・ID など単語境界が無い文字列 |

`<pre>` は `overflow-x-auto` を付けるとスクロールコンテナになり min-content が 0 になるため、
表・コードブロックはこちらでも防げる。

**長文を流し込む画面での確認手順**: 一番長い本文を持つレコードを開き、
ブラウザ幅を 1280 → 768 → 375 と狭めて横スクロールバーが出ないことを見る。
平均的なレコードだけで確認すると必ず見落とす。

## ダッシュボードは「数字 → 一覧」の導線として作る

ダッシュボードは眺めるものではなく、**気になる数字から該当データへ飛ぶ入口**。
最初からこの 3 点を満たす形で書く（後から直すと KPI の作り直しになる）。

### 1. KPI カードは小さく、1 行に並べる

`text-3xl` + 既定パディングのカードは 6 枚並べると縦を占有し、下のグラフが折り返し以下に隠れる。
KPI は**指標名・値・補足の 3 行**に収め、横一列に並ぶサイズにする。

```tsx
{/* 6 枚が 1 行に収まる。モバイルは 2 列 */}
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
  <Card className="h-full gap-0 py-3">
    <CardHeader className="gap-0 px-3 pb-0">
      <CardDescription className="flex min-w-0 items-center gap-1 text-xs">
        <span className="truncate">要確認</span>
        <ArrowRight className="size-3 shrink-0" />
      </CardDescription>
      <CardTitle className="text-xl leading-tight">12</CardTitle>
    </CardHeader>
    <CardContent className="px-3 pt-0.5">
      <p className="truncate text-[11px] leading-tight text-muted-foreground">スコア 2 以下 または NG</p>
    </CardContent>
  </Card>
</div>
```

| 項目 | 値 |
| --- | --- |
| カード余白 | `py-3` + `px-3`（既定の `py-6` は KPI には大きすぎる） |
| 値 | `text-xl`〜`text-2xl`（`text-3xl` は 3 枚までの画面用） |
| 補足 | `text-[11px]` の 1 行 + `truncate` |
| 列数 | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` |

### 2. 押せるカードは「実際に遷移」させる

同じページの下部にドリルダウン領域を開くだけの実装は、**画面外で開くため「押しても何も起きない」**と受け取られる。
押せる KPI は `<Link>` にして一覧画面へ遷移させ、押せることが分かるよう矢印アイコンとホバー色を付ける。

```tsx
{/* NG: 遠くのパネルが開くだけ。ユーザーからは無反応に見える */}
<button onClick={() => setDrill({ kind: "attention" })}>{card}</button>

{/* OK: 見るべき一覧へ飛ぶ。絞り込みはクエリで渡す */}
<Link to="/turns?view=attention" className="min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
  {card}
</Link>
```

- 遷移先が無い KPI（会話数の増減など）はリンクにせず、矢印も出さない。押せる／押せないを見た目で分ける。
- 同一ページ内のドリルダウンは、**遷移先の画面が存在しない切り口**（相手別・ツール別・日別など）にだけ残す。

### 3. 絞り込みはクエリパラメータ + タブで受け取る

遷移先はクエリを `useSearchParams` で読み、**タブの初期選択**に反映する。
タブ値と URL を双方向に同期させると、リンク・リロード・戻る操作のすべてで同じ画面が再現できる。

```tsx
const VIEWS = [
  { key: "all", label: "すべて", match: () => true },
  { key: "attention", label: "要確認", match: needsAttention },
  { key: "unlabeled", label: "未評価", match: (t: Row) => t.verdict === null },
] as const

const [searchParams, setSearchParams] = useSearchParams()
const requested = searchParams.get("view")
const view = VIEWS.some((v) => v.key === requested) ? requested! : "all"
const counts = Object.fromEntries(VIEWS.map((v) => [v.key, rows.filter(v.match).length]))

<Tabs value={view} onValueChange={(next) => setSearchParams(next === "all" ? {} : { view: next }, { replace: true })}>
  <TabsList>
    {VIEWS.map((v) => (
      <TabsTrigger key={v.key} value={v.key}>
        {v.label}
        <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[v.key]}</span>
      </TabsTrigger>
    ))}
  </TabsList>
</Tabs>
```

- **不正な値はフォールバックする**。`?view=xxx` で空表示にならないよう、既知のキー以外は `all` に落とす。
- **タブに件数を出す**。0 件のタブに飛ばされたとき、絞り込みが効いた結果だと分かる。
- **`replace: true`** を使う。タブ切り替えで履歴が積み上がると戻るボタンが機能しなくなる。
- **判定ロジックは `src/lib/` に置いて共有する**。「要確認」の閾値をダッシュボードと一覧で二重定義すると必ずずれる。
- タブが多いときは `<div className="min-w-0 overflow-x-auto">` で包む（`TabsList` は横に伸びる）。

> `scripts/pre-deploy-check.mjs` のチェック 9 が、リンクに書いたクエリを
> どの画面も `useSearchParams` で読んでいない状態を検出する。

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
| レコードの読み取り専用制御 | オーナーガード（ログインユーザー vs 担当者の比較で isReadOnly 判定）— [オーナーガードパターン](references/owner-guard-pattern.md) 参照 |
