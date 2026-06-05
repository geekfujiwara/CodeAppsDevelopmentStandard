# Power Pages デザインテンプレート集

> **用途**: Power Pages Code Site の設計フェーズでユーザーにテンプレートを提案し、選択されたテンプレートの CSS 変数一式を `src/index.css` に適用する。
> **ランタイム切替ではない**: デプロイされるサイトは常に 1 テンプレート。設計時に選択する。

---

## テンプレート選択ワークフロー

```
1. ユーザーが Power Pages サイト構築を依頼
2. エージェントがこのファイルを読み込み、テンプレート一覧を提示
3. ユーザーが 1 つ選択
4. 選択されたテンプレートの CSS Variables を portal/src/index.css の :root / .dark に適用
5. index.html のフォント <link> をテンプレート指定のものに差し替え
6. card-hover シャドウをテンプレートの primary カラーに合わせて調整
```

### 提案フォーマット（ユーザーに見せる形式）

テンプレート一覧を以下の形式で提示すること:

```
## デザインテンプレートを選んでください

| # | テンプレート名 | 配色 | 印象 |
|---|--------------|------|------|
| 1 | Indigo / Violet | 🟣 インディゴ + バイオレット | モダン・先進的・クリエイティブ |
| 2 | Blue / Navy | 🔵 ブルー + ネイビー | 信頼感・堅実・エンタープライズ |
| 3 | Emerald / Teal | 🟢 エメラルド + ティール | ナチュラル・安心感・ヘルスケア |
| 4 | Amber / Orange | 🟠 アンバー + オレンジ | エネルギッシュ・注意喚起・建設 |
| 5 | Rose / Pink | 🌸 ローズ + ピンク | 親しみやすい・カジュアル・サービス業 |

番号で選んでください（デフォルト: 1）
```

---

## テンプレート定義

### 1. Indigo / Violet（デフォルト）

**印象**: モダン・先進的・クリエイティブ
**フォント**: Inter
**Google Fonts**: `Inter:wght@300;400;500;600;700;800`
**font-family**: `"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
**letter-spacing**: `-0.01em`
**border-radius**: `0.75rem`

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
--secondary: #f1f5f9;
--secondary-foreground: #334155;
--muted: #f1f5f9;
--muted-foreground: #64748b;
--accent: #8b5cf6;
--accent-foreground: #ffffff;
--destructive: #ef4444;
--border: #e2e8f0;
--input: #e2e8f0;
--ring: #6366f1;
--header-bg: #ffffff;
--gradient-start: #6366f1;
--gradient-mid: #8b5cf6;
--gradient-end: #a855f7;
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
--destructive: #f87171;
--border: #1e293b;
--input: #1e293b;
--ring: #818cf8;
--header-bg: #030712;
--gradient-start: #818cf8;
--gradient-mid: #a78bfa;
--gradient-end: #c084fc;
```

#### card-hover シャドウ

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08), 0 8px 24px rgba(99, 102, 241, 0.06);
}
.dark .card-hover:hover {
  box-shadow: 0 4px 12px rgba(129, 140, 248, 0.1), 0 8px 24px rgba(129, 140, 248, 0.06);
}
```

---

### 2. Blue / Navy

**印象**: 信頼感・堅実・エンタープライズ
**フォント**: IBM Plex Sans
**Google Fonts**: `IBM+Plex+Sans:wght@300;400;500;600;700`
**font-family**: `"IBM Plex Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
**letter-spacing**: `0`
**border-radius**: `0.625rem`
**出典**: site-14s3s (Power Pages テンプレート)

#### Light Mode `:root`

```css
--background: #F8F9FB;
--foreground: #1A1D23;
--card: #ffffff;
--card-foreground: #1A1D23;
--popover: #ffffff;
--popover-foreground: #1A1D23;
--primary: #0052CC;
--primary-foreground: #ffffff;
--secondary: #1B2A4A;
--secondary-foreground: #ffffff;
--muted: #F1F3F8;
--muted-foreground: #6B7280;
--accent: #2684FF;
--accent-foreground: #ffffff;
--destructive: #DC2626;
--border: #E5E7EB;
--input: #E5E7EB;
--ring: #0052CC;
--header-bg: #ffffff;
--gradient-start: #0052CC;
--gradient-mid: #2684FF;
--gradient-end: #0065FF;
```

#### Dark Mode `.dark`

```css
--background: #0B1222;
--foreground: #E8ECF1;
--card: #111827;
--card-foreground: #E8ECF1;
--popover: #111827;
--popover-foreground: #E8ECF1;
--primary: #2684FF;
--primary-foreground: #ffffff;
--secondary: #1E293B;
--secondary-foreground: #e2e8f0;
--muted: #1E293B;
--muted-foreground: #94A3B8;
--accent: #4C9AFF;
--accent-foreground: #ffffff;
--destructive: #f87171;
--border: #1E293B;
--input: #1E293B;
--ring: #2684FF;
--header-bg: #0B1222;
--gradient-start: #2684FF;
--gradient-mid: #4C9AFF;
--gradient-end: #0065FF;
```

#### card-hover シャドウ

```css
.card-hover:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 82, 204, 0.08), 0 8px 24px rgba(0, 82, 204, 0.06);
}
.dark .card-hover:hover {
  box-shadow: 0 4px 12px rgba(38, 132, 255, 0.1), 0 8px 24px rgba(38, 132, 255, 0.06);
}
```

---

### 3. Emerald / Teal

**印象**: ナチュラル・安心感・ヘルスケア
**フォント**: Inter
**Google Fonts**: `Inter:wght@300;400;500;600;700;800`
**font-family**: `"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
**letter-spacing**: `-0.01em`
**border-radius**: `0.75rem`

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
--secondary: #ecfdf5;
--secondary-foreground: #064e3b;
--muted: #ecfdf5;
--muted-foreground: #6b7280;
--accent: #14b8a6;
--accent-foreground: #ffffff;
--destructive: #ef4444;
--border: #d1fae5;
--input: #d1fae5;
--ring: #059669;
--header-bg: #ffffff;
--gradient-start: #059669;
--gradient-mid: #14b8a6;
--gradient-end: #2dd4bf;
```

#### Dark Mode `.dark`

```css
--background: #022c22;
--foreground: #ecfdf5;
--card: #064e3b;
--card-foreground: #ecfdf5;
--popover: #064e3b;
--popover-foreground: #ecfdf5;
--primary: #34d399;
--primary-foreground: #022c22;
--secondary: #065f46;
--secondary-foreground: #d1fae5;
--muted: #065f46;
--muted-foreground: #a7f3d0;
--accent: #5eead4;
--accent-foreground: #022c22;
--destructive: #f87171;
--border: #065f46;
--input: #065f46;
--ring: #34d399;
--header-bg: #022c22;
--gradient-start: #34d399;
--gradient-mid: #5eead4;
--gradient-end: #99f6e4;
```

#### card-hover シャドウ

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.08), 0 8px 24px rgba(5, 150, 105, 0.06);
}
.dark .card-hover:hover {
  box-shadow: 0 4px 12px rgba(52, 211, 153, 0.1), 0 8px 24px rgba(52, 211, 153, 0.06);
}
```

---

### 4. Amber / Orange

**印象**: エネルギッシュ・注意喚起・建設
**フォント**: DM Sans
**Google Fonts**: `DM+Sans:wght@300;400;500;600;700`
**font-family**: `"DM Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
**letter-spacing**: `0`
**border-radius**: `0.625rem`

#### Light Mode `:root`

```css
--background: #fffbeb;
--foreground: #451a03;
--card: #ffffff;
--card-foreground: #451a03;
--popover: #ffffff;
--popover-foreground: #451a03;
--primary: #d97706;
--primary-foreground: #ffffff;
--secondary: #fef3c7;
--secondary-foreground: #92400e;
--muted: #fef3c7;
--muted-foreground: #6b7280;
--accent: #f97316;
--accent-foreground: #ffffff;
--destructive: #ef4444;
--border: #fde68a;
--input: #fde68a;
--ring: #d97706;
--header-bg: #ffffff;
--gradient-start: #d97706;
--gradient-mid: #f97316;
--gradient-end: #fb923c;
```

#### Dark Mode `.dark`

```css
--background: #1c1105;
--foreground: #fef3c7;
--card: #451a03;
--card-foreground: #fef3c7;
--popover: #451a03;
--popover-foreground: #fef3c7;
--primary: #fbbf24;
--primary-foreground: #1c1105;
--secondary: #78350f;
--secondary-foreground: #fde68a;
--muted: #78350f;
--muted-foreground: #fcd34d;
--accent: #fb923c;
--accent-foreground: #1c1105;
--destructive: #f87171;
--border: #78350f;
--input: #78350f;
--ring: #fbbf24;
--header-bg: #1c1105;
--gradient-start: #fbbf24;
--gradient-mid: #fb923c;
--gradient-end: #f97316;
```

#### card-hover シャドウ

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.08), 0 8px 24px rgba(217, 119, 6, 0.06);
}
.dark .card-hover:hover {
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.1), 0 8px 24px rgba(251, 191, 36, 0.06);
}
```

---

### 5. Rose / Pink

**印象**: 親しみやすい・カジュアル・サービス業
**フォント**: Inter
**Google Fonts**: `Inter:wght@300;400;500;600;700;800`
**font-family**: `"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
**letter-spacing**: `-0.01em`
**border-radius**: `0.875rem`

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
--secondary-foreground: #9f1239;
--muted: #ffe4e6;
--muted-foreground: #6b7280;
--accent: #ec4899;
--accent-foreground: #ffffff;
--destructive: #ef4444;
--border: #fecdd3;
--input: #fecdd3;
--ring: #e11d48;
--header-bg: #ffffff;
--gradient-start: #e11d48;
--gradient-mid: #ec4899;
--gradient-end: #f472b6;
```

#### Dark Mode `.dark`

```css
--background: #1a0510;
--foreground: #ffe4e6;
--card: #4c0519;
--card-foreground: #ffe4e6;
--popover: #4c0519;
--popover-foreground: #ffe4e6;
--primary: #fb7185;
--primary-foreground: #1a0510;
--secondary: #881337;
--secondary-foreground: #fecdd3;
--muted: #881337;
--muted-foreground: #fda4af;
--accent: #f472b6;
--accent-foreground: #1a0510;
--destructive: #f87171;
--border: #881337;
--input: #881337;
--ring: #fb7185;
--header-bg: #1a0510;
--gradient-start: #fb7185;
--gradient-mid: #f472b6;
--gradient-end: #ec4899;
```

#### card-hover シャドウ

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(225, 29, 72, 0.08), 0 8px 24px rgba(225, 29, 72, 0.06);
}
.dark .card-hover:hover {
  box-shadow: 0 4px 12px rgba(251, 113, 133, 0.1), 0 8px 24px rgba(251, 113, 133, 0.06);
}
```

---

## テンプレート適用手順（エージェント向け）

テンプレートが選択されたら、以下の 4 ファイルを編集する:

### 1. `portal/index.html`

Google Fonts の `<link>` を選択テンプレートのフォントに差し替え:

```html
<link
  href="https://fonts.googleapis.com/css2?family={テンプレートのGoogle Fonts}&family=JetBrains+Mono:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

### 2. `portal/src/index.css`

`:root` ブロックの以下を差し替え:
- `font-family`
- `letter-spacing`
- `--radius`
- すべての `--color-*` CSS Variables（Light Mode）

`.dark` ブロックの:
- すべての `--color-*` CSS Variables（Dark Mode）

`.card-hover:hover` / `.dark .card-hover:hover` のシャドウカラーを差し替え

### 3. `portal/src/index.css` の `theme-color` メタタグ

`portal/index.html` の `<meta name="theme-color">` を `--primary` の Light Mode 値に合わせる。

### 4. ビルド確認

```bash
cd portal && npx vite build
```

---

## ブランディングテキスト（サイト名・ロゴ）の変更

配色テンプレートとは別に、**サイト名・ロゴマークなどデプロイ固有の文言**は
コードに直書きせず `.env` の `VITE_*` 変数で差し替える（詳細は `SKILL.md` の
「サイト名・ロゴのブランディング設定」を参照）。

```bash
cp .env.example .env
# VITE_SITE_NAME / VITE_SITE_LOGO_MARK を編集 → npm run build
```

| 変数 | 用途 | 既定値 |
|------|------|--------|
| `VITE_SITE_NAME` | ヘッダーロゴ・フッター・タブタイトルの表示名 | `Power Pages` |
| `VITE_SITE_LOGO_MARK` | ヘッダーロゴのマーク（1〜2 文字） | `P` |

値は `src/config.ts` に集約され、`home.tsx` / `site-layout.tsx` / `main.tsx` が参照する。
