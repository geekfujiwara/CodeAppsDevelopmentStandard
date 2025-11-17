# テーマカスタマイズガイド

> **📘 CodeAppsStarterテンプレート専用ガイド**  
> このドキュメントでは、CodeAppsStarterテンプレートのテーマシステムを参照・活用したカスタマイズ方法を説明します。

**最終更新**: 2025年11月17日  
**対象**: Phase 2: デザインシステム統合・カスタマイズ

---

## 🎨 テンプレートテーマシステム参照ガイド

CodeAppsStarterテンプレートでは以下のテーマシステムが実装されています。

### 📖 テンプレート参照リンク

**テーマ設定ファイル:**
- 🔗 **[Tailwind Config](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/tailwind.config.js)** - テーマ設定
- 🔗 **[CSS Variables](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/index.css)** - CSS変数定義
- 🔗 **[Utils Functions](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/lib/utils.ts)** - ユーティリティ関数

**テーマコンポーネント:**
- 🔗 **[ThemeProvider](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/theme-provider.tsx)** - テーマプロバイダー
- 🔗 **[ThemeToggle](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/theme-toggle.tsx)** - テーマ切り替えボタン

### カスタマイズ手順

#### Step 1: テンプレート設定を参照してプロジェクトに適用

```bash
# テンプレートのテーマ設定をプロジェクトにコピー
cp CodeAppsStarter/tailwind.config.js ./
cp CodeAppsStarter/src/index.css ./src/
cp CodeAppsStarter/src/lib/utils.ts ./src/lib/
```

#### Step 2: ブランドカラーのカスタマイズ

テンプレートのCSS変数をプロジェクト固有の色に変更:

```css
/* src/index.css */
:root {
  /* プライマリカラー（ブランドカラー）をカスタマイズ */
  --primary: 203 89% 53%;           /* ブランドブルーに変更 */
  --primary-foreground: 0 0% 100%;  /* 白文字 */
  
  /* アクセントカラーをカスタマイズ */
  --accent: 25 95% 53%;             /* ブランドオレンジに変更 */
  --accent-foreground: 0 0% 100%;   /* 白文字 */
}
```

#### Step 3: テーマ切り替え機能の実装

テンプレートのThemeToggleコンポーネントを参照して実装:

```typescript
// テンプレートの実装を参照
// https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/theme-toggle.tsx
```

---

## 🚨 カスタマイズ時の注意事項

- **テンプレート品質の維持**: 既存のデザインシステムを損なわないようにカスタマイズ
- **CSS変数の一貫使用**: ハードコードされた値は避け、テンプレートのパターンを踏襲
- **ダークモード対応必須**: すべてのカスタマイズでダークモードを考慮
- **レスポンシブデザイン維持**: テンプレートのレスポンシブパターンを継承

---

## 📚 関連ドキュメント

- **[Phase 2: デザインシステム統合](../PHASE2_UI_DESIGN_SYSTEM.md)** - メインガイド
- **[CodeAppsStarterテンプレート](https://github.com/geekfujiwara/CodeAppsStarter)** - 参照元テンプレート
- **[shadcn/ui公式ドキュメント](https://ui.shadcn.com/)** - コンポーネントリファレンス