# Code Apps デザインテンプレート集

> **用途**: Code Apps の設計フェーズでユーザーにデザインテンプレートを提案し、選択されたテンプレートの CSS 変数一式を `styles/index.pcss` の `:root` / `.dark` に適用する。
> **ランタイム切替ではない**: デプロイされるアプリは常に 1 テンプレート。設計時に選択する（ダーク/ライトの切替は従来どおり `ThemeProvider` + `ModeToggle` で行う）。

---

## テンプレート選択ワークフロー

```
1. ユーザーが Code Apps の構築を依頼
2. エージェントがこのファイルを読み込み、テンプレート一覧を提示
3. ユーザーが 1 つ選択
4. apply_design_template.py で styles/index.pcss の :root / .dark に適用（--radius 含む）
5. design-system.md の設計フェーズ（画面一覧・コンポーネント選定）と合わせてユーザー承認を得る
```

### スクリプトで適用（推奨）

手動コピーではなく [`scripts/apply_design_template.py`](../scripts/apply_design_template.py) を使う。
このファイル（design-templates.md）をパースして適用するため、ドキュメントと適用結果が乖離しない:

```bash
# テンプレート一覧
python .github/skills/code-apps/scripts/apply_design_template.py --list

# テンプレート 3 を適用（--dry-run で事前確認可）
python .github/skills/code-apps/scripts/apply_design_template.py 3 --project <プロジェクトルート>
```

- 対象は `styles/index.pcss`（なければ `src/index.css`）の `:root` / `.dark` ブロック内の変数値のみ
- `--badge-*` と `@theme inline` ブロックは自動的に保護される
- 冪等（再実行しても変更なしと報告される）

### 提案フォーマット（ユーザーに見せる形式）

テンプレート一覧を以下の形式で提示すること:

```
## デザインテンプレートを選んでください

| # | テンプレート名 | 配色 | 印象 |
|---|--------------|------|------|
| 1 | Ocean Blue | 🔵 ブルー | 爽やか・標準・業務アプリ全般 |
| 2 | Indigo / Violet | 🟣 インディゴ + バイオレット | モダン・先進的・クリエイティブ |
| 3 | Emerald / Teal | 🟢 エメラルド + ティール | ナチュラル・安心感・ヘルスケア |
| 4 | Amber / Orange | 🟠 アンバー + オレンジ | エネルギッシュ・製造・建設 |
| 5 | Rose / Pink | 🌸 ローズ + ピンク | 親しみやすい・カジュアル・サービス業 |
| 6 | Slate Mono | ⚫ スレート（モノトーン） | ミニマル・堅実・エンタープライズ |

番号で選んでください（デフォルト: 1）
```

---

## 共通ルール

### フォントは全テンプレート共通（システムフォント固定）

**Code Apps は Google Fonts 禁止**（[design-system.md](design-system.md) の標準フォント方針参照）。
テンプレートで切り替えるのは **配色と `--radius` のみ**。フォントは変更しない:

```css
:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
}
```

### バッジ変数は全テンプレート共通

`--badge-beginner` / `--badge-intermediate` / `--badge-advanced` / `--badge-administrator` / `--badge-developer` は
**ステータスの意味（色の記号性）を担う**ため、テンプレートを切り替えても CodeAppsStarter のデフォルト値のまま変更しない。

### `@theme inline` ブロックは変更しない

`styles/index.pcss` の `@theme inline` は CSS 変数 → Tailwind ユーティリティのマッピング定義であり、
テンプレート適用時に書き換えるのは `:root` / `.dark` の **変数値のみ**。

### 適用対象の変数一覧

各テンプレートは以下の変数を上書きする（CodeAppsStarter `styles/index.pcss` 準拠）:

`--radius` / `--background` / `--foreground` / `--card` / `--card-foreground` / `--popover` / `--popover-foreground` /
`--primary` / `--primary-foreground` / `--secondary` / `--secondary-foreground` / `--muted` / `--muted-foreground` /
`--accent` / `--accent-foreground` / `--accent-hover` / `--destructive` / `--border` / `--input` / `--ring` /
`--chart-1` 〜 `--chart-5` / `--sidebar` 系 8 変数 / `--header-bg` / `--menu-bg`

---

## テンプレート定義

### 1. Ocean Blue（デフォルト）

**印象**: 爽やか・標準・業務アプリ全般
**--radius**: `0.625rem`

CodeAppsStarter の初期テーマそのもの。`styles/index.pcss` を変更せずそのまま使う。

#### Light Mode `:root`

```css
--background: #f0f7ff;
--foreground: #0c2d5e;
--card: #ffffff;
--card-foreground: #0c2d5e;
--popover: #ffffff;
--popover-foreground: #0c2d5e;
--primary: #3b82f6;
--primary-foreground: #ffffff;
--secondary: #dbeafe;
--secondary-foreground: #1e3a8a;
--muted: #e0f2fe;
--muted-foreground: #475569;
--accent: #60a5fa;
--accent-foreground: #ffffff;
--accent-hover: #bfdbfe;
--destructive: #ef4444;
--border: #bfdbfe;
--input: #bfdbfe;
--ring: #3b82f6;
--chart-1: #3b82f6;
--chart-2: #60a5fa;
--chart-3: #93c5fd;
--chart-4: #bfdbfe;
--chart-5: #dbeafe;
--sidebar: #f8fafc;
--sidebar-foreground: #0c2d5e;
--sidebar-primary: #3b82f6;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #dbeafe;
--sidebar-accent-foreground: #1e3a8a;
--sidebar-border: #bfdbfe;
--sidebar-ring: #3b82f6;
--header-bg: #ffffff;
--menu-bg: #f0f7ff;
```

#### Dark Mode `.dark`

```css
--background: #0a1929;
--foreground: #e3f2fd;
--card: #1e293b;
--card-foreground: #e3f2fd;
--popover: #1e293b;
--popover-foreground: #e3f2fd;
--primary: #60a5fa;
--primary-foreground: #0a1929;
--secondary: #1e3a8a;
--secondary-foreground: #dbeafe;
--muted: #1e3a8a;
--muted-foreground: #94a3b8;
--accent: #60a5fa;
--accent-foreground: #0a1929;
--accent-hover: #1e3a8a;
--destructive: #ef4444;
--border: #1e3a8a;
--input: #1e3a8a;
--ring: #60a5fa;
--chart-1: #60a5fa;
--chart-2: #93c5fd;
--chart-3: #bfdbfe;
--chart-4: #dbeafe;
--chart-5: #eff6ff;
--sidebar: #0f1f33;
--sidebar-foreground: #e3f2fd;
--sidebar-primary: #60a5fa;
--sidebar-primary-foreground: #0a1929;
--sidebar-accent: #1e3a8a;
--sidebar-accent-foreground: #dbeafe;
--sidebar-border: #1e3a8a;
--sidebar-ring: #60a5fa;
--header-bg: #0a1929;
--menu-bg: #1e293b;
```

---

### 2. Indigo / Violet

**印象**: モダン・先進的・クリエイティブ
**--radius**: `0.75rem`

#### Light Mode `:root`

```css
--background: #f8fafc;
--foreground: #0f172a;
--card: #ffffff;
--card-foreground: #0f172a;
--popover: #ffffff;
--popover-foreground: #0f172a;
--primary: #6366f1;
--primary-foreground: #ffffff;
--secondary: #eef2ff;
--secondary-foreground: #312e81;
--muted: #f1f5f9;
--muted-foreground: #64748b;
--accent: #8b5cf6;
--accent-foreground: #ffffff;
--accent-hover: #e0e7ff;
--destructive: #ef4444;
--border: #e2e8f0;
--input: #e2e8f0;
--ring: #6366f1;
--chart-1: #6366f1;
--chart-2: #8b5cf6;
--chart-3: #a78bfa;
--chart-4: #c4b5fd;
--chart-5: #ddd6fe;
--sidebar: #f8fafc;
--sidebar-foreground: #0f172a;
--sidebar-primary: #6366f1;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #e0e7ff;
--sidebar-accent-foreground: #312e81;
--sidebar-border: #e2e8f0;
--sidebar-ring: #6366f1;
--header-bg: #ffffff;
--menu-bg: #f8fafc;
```

#### Dark Mode `.dark`

```css
--background: #030712;
--foreground: #f1f5f9;
--card: #111827;
--card-foreground: #f1f5f9;
--popover: #111827;
--popover-foreground: #f1f5f9;
--primary: #818cf8;
--primary-foreground: #030712;
--secondary: #1e293b;
--secondary-foreground: #e2e8f0;
--muted: #1e293b;
--muted-foreground: #94a3b8;
--accent: #a78bfa;
--accent-foreground: #030712;
--accent-hover: #312e81;
--destructive: #f87171;
--border: #1e293b;
--input: #1e293b;
--ring: #818cf8;
--chart-1: #818cf8;
--chart-2: #a78bfa;
--chart-3: #c4b5fd;
--chart-4: #ddd6fe;
--chart-5: #ede9fe;
--sidebar: #0a0f1e;
--sidebar-foreground: #f1f5f9;
--sidebar-primary: #818cf8;
--sidebar-primary-foreground: #030712;
--sidebar-accent: #312e81;
--sidebar-accent-foreground: #e0e7ff;
--sidebar-border: #1e293b;
--sidebar-ring: #818cf8;
--header-bg: #030712;
--menu-bg: #111827;
```

---

### 3. Emerald / Teal

**印象**: ナチュラル・安心感・ヘルスケア
**--radius**: `0.75rem`

#### Light Mode `:root`

```css
--background: #f0fdf4;
--foreground: #052e16;
--card: #ffffff;
--card-foreground: #052e16;
--popover: #ffffff;
--popover-foreground: #052e16;
--primary: #059669;
--primary-foreground: #ffffff;
--secondary: #d1fae5;
--secondary-foreground: #064e3b;
--muted: #ecfdf5;
--muted-foreground: #4b5563;
--accent: #14b8a6;
--accent-foreground: #ffffff;
--accent-hover: #a7f3d0;
--destructive: #ef4444;
--border: #d1fae5;
--input: #d1fae5;
--ring: #059669;
--chart-1: #059669;
--chart-2: #10b981;
--chart-3: #34d399;
--chart-4: #6ee7b7;
--chart-5: #a7f3d0;
--sidebar: #ecfdf5;
--sidebar-foreground: #052e16;
--sidebar-primary: #059669;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #d1fae5;
--sidebar-accent-foreground: #064e3b;
--sidebar-border: #d1fae5;
--sidebar-ring: #059669;
--header-bg: #ffffff;
--menu-bg: #f0fdf4;
```

#### Dark Mode `.dark`

```css
--background: #022c22;
--foreground: #d1fae5;
--card: #064e3b;
--card-foreground: #d1fae5;
--popover: #064e3b;
--popover-foreground: #d1fae5;
--primary: #34d399;
--primary-foreground: #022c22;
--secondary: #065f46;
--secondary-foreground: #d1fae5;
--muted: #065f46;
--muted-foreground: #9ca3af;
--accent: #2dd4bf;
--accent-foreground: #022c22;
--accent-hover: #065f46;
--destructive: #f87171;
--border: #065f46;
--input: #065f46;
--ring: #34d399;
--chart-1: #34d399;
--chart-2: #6ee7b7;
--chart-3: #a7f3d0;
--chart-4: #d1fae5;
--chart-5: #ecfdf5;
--sidebar: #04231c;
--sidebar-foreground: #d1fae5;
--sidebar-primary: #34d399;
--sidebar-primary-foreground: #022c22;
--sidebar-accent: #065f46;
--sidebar-accent-foreground: #d1fae5;
--sidebar-border: #065f46;
--sidebar-ring: #34d399;
--header-bg: #022c22;
--menu-bg: #064e3b;
```

---

### 4. Amber / Orange

**印象**: エネルギッシュ・製造・建設
**--radius**: `0.5rem`

#### Light Mode `:root`

```css
--background: #fffbeb;
--foreground: #431407;
--card: #ffffff;
--card-foreground: #431407;
--popover: #ffffff;
--popover-foreground: #431407;
--primary: #ea580c;
--primary-foreground: #ffffff;
--secondary: #ffedd5;
--secondary-foreground: #7c2d12;
--muted: #fef3c7;
--muted-foreground: #78716c;
--accent: #f59e0b;
--accent-foreground: #ffffff;
--accent-hover: #fed7aa;
--destructive: #dc2626;
--border: #fde68a;
--input: #fde68a;
--ring: #ea580c;
--chart-1: #ea580c;
--chart-2: #f97316;
--chart-3: #fb923c;
--chart-4: #fdba74;
--chart-5: #fed7aa;
--sidebar: #fff7ed;
--sidebar-foreground: #431407;
--sidebar-primary: #ea580c;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #ffedd5;
--sidebar-accent-foreground: #7c2d12;
--sidebar-border: #fde68a;
--sidebar-ring: #ea580c;
--header-bg: #ffffff;
--menu-bg: #fffbeb;
```

#### Dark Mode `.dark`

```css
--background: #0c0a09;
--foreground: #fef3c7;
--card: #1c1917;
--card-foreground: #fef3c7;
--popover: #1c1917;
--popover-foreground: #fef3c7;
--primary: #fb923c;
--primary-foreground: #0c0a09;
--secondary: #292524;
--secondary-foreground: #fed7aa;
--muted: #292524;
--muted-foreground: #a8a29e;
--accent: #fbbf24;
--accent-foreground: #0c0a09;
--accent-hover: #7c2d12;
--destructive: #f87171;
--border: #292524;
--input: #292524;
--ring: #fb923c;
--chart-1: #fb923c;
--chart-2: #fdba74;
--chart-3: #fed7aa;
--chart-4: #fef3c7;
--chart-5: #fffbeb;
--sidebar: #171310;
--sidebar-foreground: #fef3c7;
--sidebar-primary: #fb923c;
--sidebar-primary-foreground: #0c0a09;
--sidebar-accent: #7c2d12;
--sidebar-accent-foreground: #fed7aa;
--sidebar-border: #292524;
--sidebar-ring: #fb923c;
--header-bg: #0c0a09;
--menu-bg: #1c1917;
```

---

### 5. Rose / Pink

**印象**: 親しみやすい・カジュアル・サービス業
**--radius**: `1rem`

> primary がローズ系のため、destructive は赤の彩度・明度を変えた `#b91c1c`（light）/ `#f87171`（dark）で区別する。

#### Light Mode `:root`

```css
--background: #fff1f2;
--foreground: #4c0519;
--card: #ffffff;
--card-foreground: #4c0519;
--popover: #ffffff;
--popover-foreground: #4c0519;
--primary: #e11d48;
--primary-foreground: #ffffff;
--secondary: #ffe4e6;
--secondary-foreground: #881337;
--muted: #fce7f3;
--muted-foreground: #6b7280;
--accent: #ec4899;
--accent-foreground: #ffffff;
--accent-hover: #fecdd3;
--destructive: #b91c1c;
--border: #fecdd3;
--input: #fecdd3;
--ring: #e11d48;
--chart-1: #e11d48;
--chart-2: #f43f5e;
--chart-3: #fb7185;
--chart-4: #fda4af;
--chart-5: #fecdd3;
--sidebar: #fff1f2;
--sidebar-foreground: #4c0519;
--sidebar-primary: #e11d48;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #ffe4e6;
--sidebar-accent-foreground: #881337;
--sidebar-border: #fecdd3;
--sidebar-ring: #e11d48;
--header-bg: #ffffff;
--menu-bg: #fff1f2;
```

#### Dark Mode `.dark`

```css
--background: #1a0a12;
--foreground: #ffe4e6;
--card: #2a141e;
--card-foreground: #ffe4e6;
--popover: #2a141e;
--popover-foreground: #ffe4e6;
--primary: #fb7185;
--primary-foreground: #1a0a12;
--secondary: #4c0519;
--secondary-foreground: #fecdd3;
--muted: #3f1322;
--muted-foreground: #b89aa5;
--accent: #f472b6;
--accent-foreground: #1a0a12;
--accent-hover: #4c0519;
--destructive: #f87171;
--border: #3f1322;
--input: #3f1322;
--ring: #fb7185;
--chart-1: #fb7185;
--chart-2: #fda4af;
--chart-3: #fecdd3;
--chart-4: #ffe4e6;
--chart-5: #fff1f2;
--sidebar: #200d16;
--sidebar-foreground: #ffe4e6;
--sidebar-primary: #fb7185;
--sidebar-primary-foreground: #1a0a12;
--sidebar-accent: #4c0519;
--sidebar-accent-foreground: #fecdd3;
--sidebar-border: #3f1322;
--sidebar-ring: #fb7185;
--header-bg: #1a0a12;
--menu-bg: #2a141e;
```

---

### 6. Slate Mono

**印象**: ミニマル・堅実・エンタープライズ
**--radius**: `0.375rem`

> 彩色をほぼ持たないモノトーン。チャートはスレートのグラデーションになるため、
> 系列数が多いダッシュボードでは系列の区別がつきにくい。チャート中心のアプリでは 1〜5 を推奨。

#### Light Mode `:root`

```css
--background: #f8fafc;
--foreground: #0f172a;
--card: #ffffff;
--card-foreground: #0f172a;
--popover: #ffffff;
--popover-foreground: #0f172a;
--primary: #334155;
--primary-foreground: #ffffff;
--secondary: #f1f5f9;
--secondary-foreground: #334155;
--muted: #f1f5f9;
--muted-foreground: #64748b;
--accent: #475569;
--accent-foreground: #ffffff;
--accent-hover: #e2e8f0;
--destructive: #dc2626;
--border: #e2e8f0;
--input: #e2e8f0;
--ring: #334155;
--chart-1: #334155;
--chart-2: #475569;
--chart-3: #64748b;
--chart-4: #94a3b8;
--chart-5: #cbd5e1;
--sidebar: #f1f5f9;
--sidebar-foreground: #0f172a;
--sidebar-primary: #334155;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #e2e8f0;
--sidebar-accent-foreground: #334155;
--sidebar-border: #e2e8f0;
--sidebar-ring: #334155;
--header-bg: #ffffff;
--menu-bg: #f8fafc;
```

#### Dark Mode `.dark`

```css
--background: #020617;
--foreground: #e2e8f0;
--card: #0f172a;
--card-foreground: #e2e8f0;
--popover: #0f172a;
--popover-foreground: #e2e8f0;
--primary: #94a3b8;
--primary-foreground: #020617;
--secondary: #1e293b;
--secondary-foreground: #e2e8f0;
--muted: #1e293b;
--muted-foreground: #94a3b8;
--accent: #cbd5e1;
--accent-foreground: #020617;
--accent-hover: #1e293b;
--destructive: #f87171;
--border: #1e293b;
--input: #1e293b;
--ring: #94a3b8;
--chart-1: #94a3b8;
--chart-2: #cbd5e1;
--chart-3: #e2e8f0;
--chart-4: #f1f5f9;
--chart-5: #f8fafc;
--sidebar: #0b1120;
--sidebar-foreground: #e2e8f0;
--sidebar-primary: #94a3b8;
--sidebar-primary-foreground: #020617;
--sidebar-accent: #1e293b;
--sidebar-accent-foreground: #e2e8f0;
--sidebar-border: #1e293b;
--sidebar-ring: #94a3b8;
--header-bg: #020617;
--menu-bg: #0f172a;
```

---

## 適用チェックリスト

テンプレート適用後、以下を確認する:

- [ ] `:root` / `.dark` の両方に全変数を適用した（片方だけ適用すると切替時に旧テーマが残る）
- [ ] `--radius` をテンプレート指定値に変更した
- [ ] バッジ変数（`--badge-*`）は変更していない
- [ ] `@theme inline` ブロックは変更していない
- [ ] `index.html` に Google Fonts の `<link>` を追加していない
- [ ] ライト/ダーク両モードで主要画面の文字コントラストを目視確認した
