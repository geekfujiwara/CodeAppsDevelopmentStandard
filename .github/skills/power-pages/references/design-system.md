# Power Pages デザインシステム

> **方針**: Power Pages のすべてのビジネスシナリオで統一されたデザイン言語を使用する。
> テンプレートを改変する際も、このデザインシステムのトークン・ユーティリティ・コンポーネントパターンを維持すること。

## デザイン原則

| 原則 | 説明 |
|------|------|
| **Indigo/Violet グラデーション** | Primary = Indigo (#6366f1)、Accent = Violet (#8b5cf6) のグラデーションを一貫使用 |
| **プレミアムシャドウ** | 多層 box-shadow で奥行きを表現（`.shadow-premium`） |
| **ダークモード完全対応** | CSS 変数ベースで light/dark を切替。`.dark` クラスで全要素が対応 |
| **Inter フォント** | 本文 Inter、system-ui フォールバック。letter-spacing: -0.01em |
| **カード中心のレイアウト** | 情報をカードで区切り、hover で浮き上がるインタラクション |
| **レスポンシブ最優先** | モバイル → タブレット → デスクトップの順で設計 |

## カラートークン

### Light Mode

| トークン | 値 | 用途 |
|---------|-----|------|
| `--background` | `#f8fafc` | ページ背景 |
| `--foreground` | `#0f172a` | テキスト |
| `--card` | `#ffffff` | カード背景 |
| `--primary` | `#6366f1` | ボタン・リンク・アクセント |
| `--accent` | `#8b5cf6` | グラデーション終点・装飾 |
| `--secondary` | `#f1f5f9` | セカンダリ背景 |
| `--muted` | `#f1f5f9` | 控えめ背景 |
| `--muted-foreground` | `#64748b` | 補助テキスト |
| `--destructive` | `#ef4444` | エラー・警告 |
| `--border` | `#e2e8f0` | ボーダー |
| `--ring` | `#6366f1` | フォーカスリング |
| `--header-bg` | `#ffffff` | ヘッダー背景 |
| `--gradient-start` | `#6366f1` | グラデーション開始 |
| `--gradient-mid` | `#8b5cf6` | グラデーション中間 |
| `--gradient-end` | `#a855f7` | グラデーション終了 |

### Dark Mode

| トークン | 値 | 用途 |
|---------|-----|------|
| `--background` | `#030712` | ページ背景 |
| `--foreground` | `#f1f5f9` | テキスト |
| `--card` | `#111827` | カード背景 |
| `--primary` | `#818cf8` | ボタン・リンク |
| `--accent` | `#a78bfa` | グラデーション終点 |
| `--border` | `#1e293b` | ボーダー |
| `--header-bg` | `#030712` | ヘッダー背景 |

## ユーティリティクラス

### `.gradient-text`
テキストに Indigo → Violet → Purple グラデーションを適用。
```css
background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end));
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### `.shadow-premium`
多層シャドウでカード・ヘッダーに高級感を付与。
```css
box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.04),
            0 8px 16px rgba(0,0,0,0.04), 0 16px 32px rgba(0,0,0,0.02);
```

### `.header-gradient-line`
ヘッダー上部に 2px のグラデーションラインを描画。ブランドカラーの視認性向上。

### `.card-hover`
カードの hover 時に `translateY(-2px)` + primary 系シャドウで浮き上がり。

### `.animate-fade-in`
ドロップダウンやモーダルの出現アニメーション (0.3s ease-out, translateY 8px→0)。

## コンポーネントパターン

### Button（グラデーションボタン）

default バリアントは `bg-gradient-to-r from-primary to-accent` で視覚的にリッチ。
ホバー時に `brightness-110` + `shadow-lg`。クリック時に `scale-[0.98]`。

| バリアント | 用途 |
|-----------|------|
| `default` | 主要アクション（グラデーション） |
| `outline` | セカンダリアクション |
| `ghost` | ナビゲーション内ボタン |
| `destructive` | 削除・危険アクション |
| `secondary` | 補助ボタン |

### ヘッダー

- `sticky top-0` + `backdrop-blur-xl` + `bg-(--header-bg)/80`
- 上部に `.header-gradient-line` (2px)
- グループ化ホバーメニュー（デスクトップ）/ ハンバーガー（モバイル）

### カード

- `rounded-xl border border-border/60 bg-card shadow-premium`
- `.card-hover` で浮き上がりインタラクション
- アイコンは `h-10 w-10 rounded-lg bg-primary/10` or グラデーション背景

### ドロップダウン

- `rounded-xl border border-border/60 bg-card shadow-premium p-1.5`
- `.animate-fade-in` で出現
- 各項目は `rounded-lg px-3 py-2` + hover で `bg-muted`

## 業務シナリオへの適用ガイド

> **重要**: テンプレートの「ナビゲーション項目」「LP コンテンツ」はプレースホルダー。
> 以下の手順で任意の業務シナリオに適用できる。

### 1. ナビゲーション変更

`src/components/site-layout.tsx` の `navGroups` 配列を業務に合わせて編集:

```typescript
// 例: ヘルプデスクシナリオ
const navGroups: NavGroup[] = [
  {
    label: "チケット",
    items: [
      { icon: Ticket, label: "新規チケット", path: "/tickets/new" },
      { icon: List, label: "チケット一覧", path: "/tickets" },
    ],
  },
  {
    label: "ナレッジ",
    items: [
      { icon: Book, label: "FAQ", path: "/faq" },
      { icon: Search, label: "検索", path: "/search" },
    ],
  },
];
```

### 2. LP（ホームページ）変更

`src/pages/home.tsx` の `features` / `highlights` を業務に合わせて編集:
- **ヒーロー**: タイトル + サブタイトル + CTA ボタン
- **ハイライト**: 3列カードで主要価値を提示
- **機能セクション**: グループ別の詳細カード

### 3. カラーカスタマイズ（任意）

`src/index.css` の `:root` を変更すれば、ブランドカラーに合わせられる。
**ただし Indigo/Violet のデフォルトを推奨**（統一感のため）。

### 4. ページ追加

```typescript
// src/App.tsx に Route 追加
<Route path="/tickets" element={<TicketsPage />} />

// src/pages/tickets.tsx を作成
// デザインシステムのカード・テーブル・ボタンパターンを使用
```

## テンプレートからの出発を必須とする理由

1. **一貫性**: どの業務シナリオでも同じ視覚言語
2. **速度**: ゼロから CSS を書く必要がない
3. **品質**: ダークモード・レスポンシブ・アクセシビリティが最初から担保
4. **保守性**: CSS 変数ベースのため、ブランド変更が容易
