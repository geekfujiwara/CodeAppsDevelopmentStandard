# ロゴ・アイコン実装マスターガイド

> **📘 CodeAppsStarterテンプレート専用ガイド**  
> このドキュメントでは、CodeAppsStarterテンプレートでのロゴ・アイコン実装方法と、カスタムSVGアイコン作成手順を説明します。

**最終更新**: 2025年11月17日  
**対象**: Phase 2: デザインシステム統合・カスタマイズ

---

## 🎨 テンプレートロゴ実装参照ガイド

### 📖 テンプレート参照リンク

**ロゴ・アイコン実装例:**
- 🔗 **[App Logo Component](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/app-logo.tsx)** - ロゴコンポーネント実装
- 🔗 **[Header Logo Usage](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/header.tsx)** - ヘッダーでのロゴ使用例  
- 🔗 **[Sidebar Logo Usage](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/sidebar.tsx)** - サイドバーでのロゴ使用例
- 🔗 **[Logo Assets](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/public)** - ロゴファイル配置例

**アイコンシステム:**
- 🔗 **[Icons Directory](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components/icons)** - カスタムアイコン実装例
- 🔗 **[Lucide React Integration](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/icons.tsx)** - アイコンライブラリ統合

### ロゴカスタマイズ手順

#### Step 1: テンプレートのロゴ実装を参照

```bash
# テンプレートのロゴコンポーネントをコピー
cp CodeAppsStarter/src/components/app-logo.tsx ./src/components/
cp CodeAppsStarter/public/logo.svg ./public/assets/

# プロジェクト専用ロゴに置換
# ./public/assets/logo.svg を独自ロゴで置換
```

#### Step 2: Power Apps ロゴ登録

```bash
# ロゴファイルをPower Appsに登録
npx @microsoft/power-apps-cli update --logo "./public/assets/logo.svg"
```

#### Step 3: テンプレート内ロゴ参照の更新

テンプレートのロゴコンポーネント使用箇所を確認・更新:
```bash
# テンプレート内のロゴ使用箇所を確認
grep -r "logo" CodeAppsStarter/src/components/
grep -r "AppLogo" CodeAppsStarter/src/
```

---

## 🎨 カスタムSVGアイコン作成ガイド（開発標準実装）

### アイコンSVGコンポーネント作成

#### 基本SVGアイコンテンプレート

```typescript
// src/components/icons/CustomIcon.tsx
import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const CustomIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "", 
  color = "currentColor" 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      className={className}
      viewBox="0 0 24 24" 
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* カスタムSVGパスをここに追加 */}
      <path 
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
```

#### プロジェクト固有アイコンシステム

```typescript
// src/components/icons/index.ts
export { CustomIcon } from './CustomIcon';
export { ProjectIcon } from './ProjectIcon';
export { StatusIcon } from './StatusIcon';

// テンプレートのLucide Reactアイコンも活用
export { 
  Home, 
  Users, 
  Settings, 
  FileText,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  ChevronDown
} from 'lucide-react';
```

#### アイコン使用例

```typescript
// コンポーネント内でのアイコン使用
import { CustomIcon, Home, Users } from '@/components/icons';

export function NavigationMenu() {
  return (
    <nav className="space-y-2">
      <button className="flex items-center space-x-2 p-2 rounded hover:bg-accent">
        <Home className="h-4 w-4" />
        <span>ホーム</span>
      </button>
      <button className="flex items-center space-x-2 p-2 rounded hover:bg-accent">
        <CustomIcon size={16} className="text-muted-foreground" />
        <span>カスタム機能</span>
      </button>
    </nav>
  );
}
```

### SVGアイコン最適化

#### パフォーマンス最適化

```typescript
// アイコンのメモ化
import { memo } from 'react';

export const OptimizedIcon = memo(({ size, color, className }: IconProps) => {
  return (
    <svg 
      width={size} 
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path 
        d="..." 
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
});
```

#### ダークモード対応SVG

```typescript
// CSS変数を活用したダークモード対応
export const ThemedIcon: React.FC<IconProps> = ({ size = 24, className }) => {
  return (
    <svg 
      width={size} 
      height={size}
      className={className}
      viewBox="0 0 24 24"
    >
      <path 
        d="..."
        fill="currentColor"
        className="text-foreground dark:text-foreground"
      />
    </svg>
  );
};
```

---

## 🚨 トラブルシューティング

### ロゴ表示の問題

**問題1: テンプレートでロゴが表示されない**
```bash
# ファイルパス確認
ls -la public/assets/logo.svg

# 開発サーバー再起動
npm run dev
```

**問題2: Power Apps でロゴが更新されない**
```bash
# 強制更新
npx @microsoft/power-apps-cli push --force
```

**問題3: SVGアイコンが正しく表示されない**
```typescript
// viewBox設定の確認
<svg viewBox="0 0 24 24">  // 正しい設定

// fill/stroke属性の確認  
<path fill="currentColor" />  // カラー継承
```

---

## 📚 関連ドキュメント

- **[Phase 2: デザインシステム統合](../PHASE2_UI_DESIGN_SYSTEM.md)** - メインガイド
- **[CodeAppsStarterテンプレート](https://github.com/geekfujiwara/CodeAppsStarter)** - 参照元テンプレート
- **[Lucide React](https://lucide.dev/)** - アイコンライブラリ公式ドキュメント

---

## 📝 注意事項

- **テンプレート実装の参照**: ロゴ・アイコン実装時は必ずテンプレートの実装を確認
- **SVGアイコンの最適化**: パフォーマンスとアクセシビリティを考慮した実装
- **ダークモード対応**: すべてのアイコンでテーマ対応を実装
- **一貫したアイコンサイズ**: テンプレートのサイズガイドラインを踏襲

**一般的な参照方法:**
```typescript
// ヘッダーコンポーネント等で使用されている例
<img src="/vite.svg" alt="App Logo" className="h-8 w-8" />
```

---

## プロジェクト固有ロゴへの変更

### Step 1: ロゴファイルの準備

**推奨ファイル構成:**
```
public/
└── assets/
    ├── logo.svg          # メインロゴ（推奨）
    ├── logo.png          # フォールバック用
    ├── logo-text.svg     # テキスト付きロゴ
    └── favicon.ico       # 新しいファビコン
```
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

## 技術的トラブルシューティング

### 問題1: テンプレートでロゴが表示されない

**症状**: 新しいロゴに変更したが、テンプレート内で表示されない

**原因と解決策:**
```bash
# 1. ファイルパスの確認
ls -la public/assets/logo.svg

# 2. ブラウザキャッシュのクリア
# Ctrl+Shift+R (ハードリロード)

# 3. Vite開発サーバーの再起動
npm run dev
```

### 問題2: Power Appsでロゴが反映されない

**症状**: `npx @microsoft/power-apps-cli update --logo` 実行後も古いロゴが表示される

**解決策:**
```bash
# 1. ロゴファイルの存在確認
ls -la ./public/assets/logo.svg

# 2. Power Apps認証の確認
npx @microsoft/power-apps-cli logout

# 3. 強制アップデート
npx @microsoft/power-apps-cli push --force

# 4. Power Appsアプリ一覧での確認
# https://make.powerapps.com でアプリアイコンを確認
```

### 問題3: ダークモードでロゴが見えない

**症状**: ダークモードで暗い背景に暗いロゴが表示される

**解決策:**
```css
/* 1. CSSでダークモード対応 */
.dark img[src*="logo"] {
  filter: invert(1) brightness(1.2);
}

/* 2. または専用のダークモードロゴを使用 */
.dark .logo-light { display: none; }
.dark .logo-dark { display: block; }
```

```typescript
// 3. Reactでの動的切り替え
import { useTheme } from '@/hooks/use-theme';

export const AppLogo = () => {
  const { theme } = useTheme();
  
  return (
    <img 
      src={theme === 'dark' ? '/assets/logo-dark.svg' : '/assets/logo.svg'}
      alt="App Logo"
      className="h-8 w-8"
    />
  );
};
```

### 問題4: モバイルでロゴが小さすぎる

**解決策:**
```typescript
// レスポンシブサイズ調整
export const AppLogo = () => {
  return (
    <img 
      src="/assets/logo.svg"
      alt="App Logo" 
      className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10"
    />
  );
};
```

### 問題5: SVGロゴのカラーカスタマイズ

**インラインSVGでの色変更:**
```typescript
// SVGを直接ReactComponentとして使用
import Logo from '/assets/logo.svg?react';

export const CustomizableLogo = ({ color = 'currentColor' }) => {
  return (
    <Logo 
      className="h-8 w-8" 
      style={{ color }}
    />
  );
};
```

---

## ベストプラクティス

### 1. パフォーマンス最適化

```typescript
// 1. 遅延読み込み
const LazyLogo = lazy(() => import('@/components/AppLogo'));

// 2. メモ化
const AppLogo = memo(({ size, showText }: LogoProps) => {
  return (
    <img 
      src="/assets/logo.svg"
      alt="App Logo"
      width={size}
      height={size}
      loading="lazy"
    />
  );
});
```

### 2. アクセシビリティ

```typescript
// 適切なalt属性とaria-label
export const AppLogo = ({ size = 32, showText = false }) => {
  return (
    <div role="img" aria-label="アプリケーションロゴ">
      <img 
        src="/assets/logo.svg"
        alt={showText ? "" : "アプリケーションロゴ"}
        width={size}
        height={size}
        aria-hidden={showText ? "true" : "false"}
      />
      {showText && (
        <span className="sr-only">アプリケーション名</span>
      )}
    </div>
  );
};
```

### 3. SEO対応

```html
<!-- index.html -->
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg" />
<link rel="apple-touch-icon" href="/assets/logo.png" />
<meta property="og:image" content="/assets/logo.png" />
```

---

## 関連ドキュメント

- **[Phase 2: UI基盤・デザインシステム](../PHASE2_UI_DESIGN_SYSTEM.md)** - デザインシステム統合
- **[ロゴ表示の修正方法](./LOGO_DISPLAY_FIX.md)** - トラブルシューティング詳細

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
