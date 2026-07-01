# Code Apps デザインテンプレート集（レイアウト）

> **用途**: Code Apps の設計フェーズで **画面の骨格（レイアウト）** をユーザーに提案し、選択されたレイアウトのアプリシェル構造（React + Tailwind + shadcn/ui）で実装する。
> **配色とは別軸**: このファイルは **レイアウト（画面構造）** のみを定義する。色は [カラーパレット集](color-palettes.md) を参照。設計フェーズでは **レイアウトを選択 → 配色を選択** の順で提案する。
> **ランタイム切替ではない**: デプロイされるアプリは常に 1 レイアウト。設計時に選択する。

> **既存 samples はそのまま**: `samples/` の各アプリ（geek-sales / geek-hr 等）は **Sidebar レイアウト（下記 #1）** をベースに機能実装済み。テンプレートは色違いではなく、**画面の骨格の違い**で選ぶ。

---

## テンプレート選択ワークフロー

```
1. ユーザーが Code Apps の構築を依頼
2. エージェントがこのファイルを読み込み、レイアウト一覧＋プレビューを提示
3. ユーザーが視覚プレビューを確認して 1 つ選択
4. 続いて color-palettes.md でカラーパレットを選択
5. design-system.md の設計フェーズ（画面一覧・コンポーネント選定）と合わせてユーザー承認を得る
6. 承認後、選択レイアウトのアプリシェルで実装（配色は選択パレットの CSS Variables を適用）
```

### 提案フォーマット（ユーザーに見せる形式）

```
## デザインテンプレート（レイアウト）を選んでください

| # | レイアウト名 | 骨格 | 向いている用途 | プレビュー |
|---|-----------|------|--------------|-----------|
| 1 | Sidebar（標準） | 固定左ナビ + フル高さコンテンツ | 業務アプリ全般（samples の標準） | previews/layout-sidebar.html |
| 2 | Dashboard | ヘッダー + KPI スタットカード + メイン | 数値サマリ重視の管理画面 | previews/layout-dashboard.html |
| 3 | Workspace | 2 カラム（左作業パネル + 右メイン） | フィルタ/操作と詳細を並置 | previews/layout-workspace.html |
| 4 | Hero Cards | ヒーロー + 特徴カード + セクション | ポータルのトップ/ランディング | previews/layout-hero-cards.html |
| 5 | Minimal | 中央 1 カラム（最大幅制限） | フォーム中心・単機能アプリ | previews/layout-minimal.html |

プレビュー HTML をブラウザで開くと実際の骨格を確認できます。
番号で選んでください（デフォルト: 1）
```

> このレイアウト集は、外部公開 WebChat のライトモード・レイアウト
> （copilot-studio スキルの [webchat-sdk-light-templates.md](../../copilot-studio/references/webchat-sdk-light-templates.md)）を
> Code Apps（React + Tailwind + shadcn/ui）のアプリシェルに変換したもの。用途は同じ発想で選ぶ。

---

## 共通ルール

### レイアウトは「アプリシェル」で表現する

レイアウトは配色（CSS Variables）ではなく、**アプリシェル（`App.tsx` / `src/components/layout/*`）の構造**で決まる。
どのレイアウトでも:

- ルーティングは `react-router` を使う（ページはレイアウト内の `<Outlet />` / メイン領域に描画）。
- 色は [color-palettes.md](color-palettes.md) の CSS Variables（`--background` / `--card` / `--sidebar` 系など）を使い、レイアウト側では **色をハードコードしない**。
- コンポーネントは shadcn/ui（`Card` / `Button` / `Sidebar` / `Table` など）を使う。
- ダーク/ライト切替は `ThemeProvider` + `ModeToggle`。フォントはシステムフォント固定（Google Fonts 禁止）。

### レスポンシブ（sticky 重なり対策）

2 カラム系（Workspace / Dashboard）で左パネルや右パネルを `sticky` にする場合、
シングルカラムに落とすブレークポイントで **必ず `position: static` に戻す**（`sticky` が残ると縦スクロール時に重なる）。
Tailwind では `lg:sticky lg:top-6`（＝小画面では sticky を付けない）で表現する。

---

## テンプレート定義

### 1. Sidebar（標準・デフォルト）

**印象/用途**: 業務アプリ全般。ナビ項目が多い CRUD 中心のアプリ。**既存 samples の標準レイアウト**。
**骨格**:

```
┌────────────┬──────────────────────────────┐
│            │  ヘッダー（タイトル / ModeToggle）│
│  固定       ├──────────────────────────────┤
│  左ナビ     │                              │
│  (Sidebar) │  メイン（<Outlet /> ページ）     │
│            │                              │
└────────────┴──────────────────────────────┘
```

**使用コンポーネント**: shadcn `Sidebar` / `SidebarProvider` / `SidebarTrigger`、`Card`、`Table`。
**アプリシェル骨格**:

```tsx
<SidebarProvider>
  <AppSidebar />               {/* 固定左ナビ（ロゴ + メニュー） */}
  <SidebarInset>
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="ml-auto"><ModeToggle /></div>
    </header>
    <main className="flex-1 p-6"><Outlet /></main>
  </SidebarInset>
</SidebarProvider>
```

---

### 2. Dashboard

**印象/用途**: 数値サマリ重視の管理画面。トップに KPI、その下に一覧やグラフ。
**骨格**:

```
┌──────────────────────────────────────────┐
│  ヘッダー（タイトル / ModeToggle）            │
├──────────────────────────────────────────┤
│ [KPI] [KPI] [KPI] [KPI]   ← スタットカード列  │
├────────────────────────┬─────────────────┤
│  メイン（一覧 / グラフ）    │  サブ（内訳 / 直近）│
└────────────────────────┴─────────────────┘
```

**使用コンポーネント**: `Card`（KPI）、`Table`、chart（recharts + `--chart-1〜5`）。
**アプリシェル骨格**:

```tsx
<div className="min-h-svh bg-background">
  <header className="flex h-14 items-center border-b px-6">
    <h1 className="font-semibold">{title}</h1>
    <div className="ml-auto"><ModeToggle /></div>
  </header>
  <main className="mx-auto max-w-7xl space-y-6 p-6">
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map(k => <StatCard key={k.id} {...k} />)}
    </section>
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2"><Outlet /></div>
      <aside className="space-y-4">{/* 内訳・直近 */}</aside>
    </div>
  </main>
</div>
```

---

### 3. Workspace

**印象/用途**: 左に作業パネル（フィルタ・アクション・カテゴリ）、右にメイン。操作と結果を並置する業務ポータル。
**骨格**:

```
┌──────────────────────────────────────────┐
│  ヘッダー                                    │
├──────────────┬───────────────────────────┤
│  左パネル      │                           │
│ (フィルタ/操作)  │  メイン（<Outlet />）        │
│  lg:sticky    │                           │
└──────────────┴───────────────────────────┘
```

**使用コンポーネント**: `Card`（左パネル）、`Button` / `Input` / `Select`（操作）、右は `Table` / 詳細。
**アプリシェル骨格**:

```tsx
<div className="min-h-svh bg-background">
  <header className="flex h-14 items-center border-b px-6">…</header>
  <div className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[320px_1fr]">
    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      {/* フィルタ・カテゴリ・アクション */}
    </aside>
    <main><Outlet /></main>
  </div>
</div>
```

> `lg:sticky lg:top-6` は **大画面のみ** sticky。小画面ではシングルカラムに落ちて重ならない。

---

### 4. Hero Cards

**印象/用途**: ポータルのトップ/ランディング。ヒーロー見出し + 機能への入口カード + セクション。
**骨格**:

```
┌──────────────────────────────────────────┐
│            ヒーロー（見出し + CTA）           │
├────────────┬────────────┬────────────────┤
│  特徴カード   │  特徴カード   │  特徴カード       │
├────────────┴────────────┴────────────────┤
│            セクション（一覧 / 説明）          │
└──────────────────────────────────────────┘
```

**使用コンポーネント**: `Card`（特徴カード、`Link` でページ遷移）、`Button`（CTA）。
**アプリシェル骨格**:

```tsx
<div className="min-h-svh bg-background">
  <header className="flex h-14 items-center border-b px-6">…</header>
  <main className="mx-auto max-w-6xl space-y-12 p-6">
    <section className="space-y-4 py-10 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{subtitle}</p>
      <Button asChild><Link to="/start">はじめる</Link></Button>
    </section>
    <section className="grid gap-6 md:grid-cols-3">
      {features.map(f => (
        <Card key={f.id} className="transition hover:-translate-y-1">…</Card>
      ))}
    </section>
    <section><Outlet /></section>
  </main>
</div>
```

---

### 5. Minimal

**印象/用途**: フォーム中心・単機能アプリ。中央 1 カラムで最大幅を絞り、余白で読みやすく。
**骨格**:

```
┌──────────────────────────────────────────┐
│  ヘッダー（中央寄せ / ModeToggle）            │
├──────────────────────────────────────────┤
│              ┌──────────────┐              │
│              │  中央コンテンツ   │  ← max-w   │
│              │  (<Outlet />)  │              │
│              └──────────────┘              │
└──────────────────────────────────────────┘
```

**使用コンポーネント**: `Card`、`Form`（react-hook-form + zod）、`Input` / `Button`。
**アプリシェル骨格**:

```tsx
<div className="min-h-svh bg-background">
  <header className="flex h-14 items-center justify-center border-b px-6">
    <h1 className="font-semibold">{title}</h1>
    <div className="absolute right-6"><ModeToggle /></div>
  </header>
  <main className="mx-auto max-w-xl p-6"><Outlet /></main>
</div>
```

---

## 実装フロー

1. 上表でレイアウトを提示 → ユーザーが 1 つ選択。
2. [color-palettes.md](color-palettes.md) でカラーパレットを提示 → ユーザーが 1 つ選択。
3. [design-system.md](design-system.md) で画面一覧・コンポーネント選定 → 承認。
4. 承認後、選択レイアウトのアプリシェルを `App.tsx` / `src/components/layout/*` に実装し、
   選択パレットの CSS Variables を `styles/index.pcss` に適用して実装する。

> **既存 samples を出発点にする場合**: samples は Sidebar レイアウト。他レイアウトにするときはアプリシェルのみ差し替え、
> ページ（`src/pages/*`）とデータ層はそのまま流用できる。新規テーマの scaffold は **@GeekPowerCode** に依頼する。
