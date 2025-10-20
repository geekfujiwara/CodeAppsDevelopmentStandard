# アプリケーションロゴ - マスターガイド

**Gantt Chart Project Manager**の公式ロゴドキュメント  
**最終更新**: 2025年10月21日

---

## 📋 目次

1. [概要](#概要)
2. [デザイン仕様](#デザイン仕様)
3. [使用方法](#使用方法)
4. [実装例](#実装例)
5. [ブランドガイドライン](#ブランドガイドライン)
6. [アセット一覧](#アセット一覧)
7. [技術的トラブルシューティング](#技術的トラブルシューティング)

---

## 概要

Gantt Chart Project Managerのブランドアイデンティティを表現するロゴです。Microsoft Fluent Design Systemに準拠しつつ、ガントチャートの視覚的要素を取り入れています。

### デザインコンセプト

1. **ガントチャートの視覚化** - 水平バーでタスクの期間を表現
2. **Microsoft Design Language準拠** - Fluent Design配色とモダンな外観
3. **プロジェクト管理の象徴** - カレンダーアイコンとタイムライングリッド

---

## デザイン仕様

### ロゴファイル

| ファイル | サイズ | 用途 |
|---------|--------|------|
| `public/logo.svg` | 120×120px | アプリアイコン、スプラッシュスクリーン |
| `public/favicon.svg` | 32×32px | ブラウザタブ、ファビコン |

### カラーパレット

#### プライマリーカラー
- **Microsoft Blue**: `#0078D4` - メインブランドカラー
- **Deep Blue**: `#106EBE` - グラデーション用

#### アクセントカラー（ガントチャートバー）
| 色 | HEX | 用途 |
|---|-----|------|
| Cyan | `#50E6FF` | タスク1（高優先度） |
| Green | `#96D726` | タスク2（進行中） |
| Orange | `#FFB900` | タスク3（計画中） |
| Teal | `#00B294` | 完了状態 |
| Red-Orange | `#F7630C` | 警告・遅延 |

### デザイン要素

#### ガントチャートバー（3本）
- **バー1（Cyan→Blue）**: 高優先度タスク
- **バー2（Green→Teal）**: 進行中タスク
- **バー3（Orange→Red）**: 計画中タスク

#### 背景
- 白い丸形背景（`opacity: 0.95`）
- Microsoft Blueのグラデーション
- 適度なシャドウと深度

#### グリッド線
- タイムライン構造を示唆
- プロジェクト管理の象徴

---

## 使用方法

### HTML（ファビコン）

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/logo.svg" />
```

### Reactコンポーネント

```tsx
import { AppLogo } from '@/components/AppLogo';

// 基本使用
<AppLogo />

// カスタマイズ
<AppLogo size={60} showText={true} className="my-custom-class" />

// アイコンのみ
<AppLogo size={32} showText={false} />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `number` | `40` | ロゴのサイズ（px） |
| `showText` | `boolean` | `true` | テキストラベルの表示/非表示 |
| `className` | `string` | `''` | 追加のCSSクラス |

### サイズバリエーション

```tsx
// 大（120px）- デフォルト
<AppLogo size={120} />

// 中（80px）- ダッシュボードヘッダー
<AppLogo size={80} />

// 小（48px）- リスト項目、メニュー
<AppLogo size={48} />

// ファビコン（32px）- ブラウザタブ
<AppLogo size={32} showText={false} />
```

---

## 実装例

### 1. アプリヘッダー

```tsx
import { AppLogo } from '@/components/AppLogo';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center space-x-4">
          <AppLogo size={36} showText={false} />
          <h1 className="text-xl font-semibold">Gantt Chart Manager</h1>
        </div>
      </div>
    </header>
  );
}
```

### 2. サイドバー/ナビゲーション

```tsx
// フルサイズ（テキスト付き）
<AppLogo size={48} showText={true} className="mb-6" />

// コンパクト（アイコンのみ）
<AppLogo size={32} showText={false} />
```

### 3. ローディングスクリーン

```tsx
function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <AppLogo size={80} showText={true} />
      <p className="mt-4 text-muted-foreground">読み込み中...</p>
    </div>
  );
}
```

### 4. エラーページ

```tsx
function ErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <AppLogo size={60} showText={true} className="opacity-50" />
      <h2 className="mt-6 text-2xl font-bold">エラーが発生しました</h2>
      <p className="mt-2 text-muted-foreground">ページを再読み込みしてください</p>
    </div>
  );
}
```

### 5. レスポンシブ対応

```tsx
function ResponsiveLogo() {
  return (
    <>
      {/* モバイル: アイコンのみ */}
      <div className="md:hidden">
        <AppLogo size={32} showText={false} />
      </div>
      
      {/* デスクトップ: テキスト付き */}
      <div className="hidden md:block">
        <AppLogo size={40} showText={true} />
      </div>
    </>
  );
}
```

---

## ブランドガイドライン

### ✅ 推奨される使用方法

- Power Appsアプリヘッダー
- ドキュメントの表紙
- プレゼンテーション資料
- メール署名
- 社内ポータルサイト
- README.mdのトップ

### ❌ 避けるべき使用方法

1. **色の変更** - ブランド一貫性維持のため
2. **過度な圧縮や引き伸ばし** - アスペクト比を保つ
3. **他のロゴとの組み合わせ** - 単独使用を原則とする
4. **低解像度での使用** - 最小32px推奨
5. **背景との低コントラスト** - 視認性を確保

### アクセシビリティ

- ✅ SVGに `aria-label` 属性を設定
- ✅ スクリーンリーダー対応
- ✅ 高コントラスト表示でも視認可能
- ✅ ダークモード自動対応

### ダークモード対応

ロゴはSVGで作成されているため、自動的にダークモードに対応します。

```tsx
<AppLogo 
  size={48} 
  showText={true} 
  className="dark:opacity-90" 
/>
```

---

## アセット一覧

### ファイル構成

```
public/
├── logo.svg          # メインロゴ（120×120px）
└── favicon.svg       # ファビコン（32×32px）

src/components/
└── AppLogo.tsx       # Reactコンポーネント
```

### エクスポート形式

#### SVG（推奨）
- ベクター形式で拡大縮小に強い
- ファイルサイズが小さい
- Webブラウザで直接表示可能
- CSS/JSで色やサイズを動的変更可能

#### PNG変換（必要に応じて）

```bash
# ImageMagickやInkscapeで変換可能
inkscape logo.svg --export-png=logo.png --export-width=512
```

---

## 技術的トラブルシューティング

### 問題: ロゴが表示されない

**原因**: SVG内の固定IDが複数インスタンスで衝突

複数のロゴインスタンスが同じページに存在する場合、SVG内の`id`属性が重複し、ブラウザが正しくレンダリングできません。

**解決方法**: `React.useId()`でユニークIDを生成

```tsx
// ✅ 正しい実装（AppLogo.tsx）
export const AppLogo = ({ size = 40 }: AppLogoProps) => {
  const uniqueId = React.useId();
  const bgGradientId = `bgGradient-${uniqueId}`;
  const bar1GradientId = `bar1Gradient-${uniqueId}`;
  // ... 他のID定義

  return (
    <svg>
      <defs>
        <linearGradient id={bgGradientId}>  {/* ユニークID */}
          {/* ... */}
        </linearGradient>
      </defs>
      <rect fill={`url(#${bgGradientId})`} />
    </svg>
  );
};
```

**詳細**: [LOGO_DISPLAY_FIX.md](./LOGO_DISPLAY_FIX.md) を参照

### 問題: ロゴの色が正しく表示されない

**確認事項**:
1. SVGの`fill`属性が正しく設定されているか
2. グラデーションIDが正しく参照されているか
3. CSSで意図しない色が上書きされていないか

---

## 開発標準準拠

このロゴは [CodeAppsDevelopmentStandard](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard) に準拠しています。

### SVGコンポーネント実装のベストプラクティス

#### ✅ 必須要件
1. **ユニークID生成**: `React.useId()`を使用
2. **動的ID参照**: すべての`<defs>`要素に適用
3. **アクセシビリティ**: `aria-label`を設定
4. **レスポンシブ**: サイズをpropsで制御可能

#### 詳細
開発標準への提案内容は以下を参照:
- [DEVELOPMENT_STANDARD_UPDATES.md](./DEVELOPMENT_STANDARD_UPDATES.md) - 詳細版
- [STANDARD_UPDATE_SUMMARY.md](./STANDARD_UPDATE_SUMMARY.md) - 要約版

---

## バージョン履歴

### v1.0.0 (2025-10-17)
- 初回リリース
- Microsoft Fluent Designベースのデザイン
- ガントチャート3バー構成
- グラデーション&シャドウ効果

### v1.0.8 (2025-10-17)
- SVG ID衝突問題を修正
- `React.useId()`を使用したユニークID生成
- 複数インスタンス対応

---

## 関連ドキュメント

- **[LOGO_DISPLAY_FIX.md](./LOGO_DISPLAY_FIX.md)** - SVG ID衝突問題の詳細と解決方法
- **[DESIGN_REFRESH_v1.0.8.md](./DESIGN_REFRESH_v1.0.8.md)** - デザインリフレッシュの記録
- **[DEVELOPMENT_STANDARD_UPDATES.md](./DEVELOPMENT_STANDARD_UPDATES.md)** - 開発標準への提案

---

## ライセンス

このロゴは **Gantt Chart Project Manager** アプリケーション専用です。

---

**作成者**: GitHub Copilot  
**最終更新**: 2025年10月21日
