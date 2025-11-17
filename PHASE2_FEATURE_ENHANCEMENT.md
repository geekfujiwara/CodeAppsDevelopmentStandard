# Phase 2: 機能拡張ガイドライン

## 📋 概要

このPhaseでは、**CodeAppsStarterテンプレート**を基盤として、プロジェクト要件に合わせた機能拡張を実施します。テンプレートが提供する高品質なデザインシステムと実装パターンを最大限活用し、効率的かつ一貫性のある開発を実現します。

---

## 🎯 基本方針

### ✅ テンプレート参照型開発

**CodeAppsStarterテンプレートは完全な開発基盤を提供しています:**

- **shadcn/ui + Tailwind CSS** - モダンなデザインシステム
- **Next.js App Router** - 最新のReact開発パターン
- **Power Apps統合** - 認証・データソース接続済み
- **レスポンシブ対応** - モバイル・タブレット・デスクトップ対応済み

**このPhaseでは以下の開発アプローチを取ります:**

1. ✅ **テンプレートコードを参照** - GitHub上の実装を確認して理解
2. ✅ **既存パターンを活用** - テンプレートの実装方法を踏襲
3. ✅ **コンポーネントを再利用** - UIコンポーネントライブラリを活用
4. ✅ **段階的に拡張** - テンプレート品質を維持しながら機能追加

⚠️ **重要な制約:**
- **PowerProvider.tsx は変更しない** - Power Apps統合の核心部分
- **認証フローは変更しない** - テンプレートの認証実装を維持
- **ビルド設定は変更しない** - テンプレートの設定を維持

---

## 📖 開発フロー

### **Step 1: テンプレート理解**

機能拡張を始める前に、テンプレートの構造と実装パターンを理解します。

#### **1.1 プロジェクト構造の確認**

```
CodeAppsStarter/
├── src/
│   ├── app/              # Next.js App Router ページ
│   │   ├── layout.tsx    # ルートレイアウト
│   │   ├── page.tsx      # ホームページ
│   │   └── globals.css   # グローバルスタイル
│   ├── components/       # Reactコンポーネント
│   │   ├── ui/           # shadcn/ui コンポーネント
│   │   ├── layout/       # レイアウトコンポーネント
│   │   └── PowerProvider.tsx  # Power Apps統合 (変更禁止)
│   └── lib/              # ユーティリティ関数
├── public/               # 静的ファイル
├── tailwind.config.js    # Tailwind CSS設定
└── package.json          # 依存関係
```

**参照先:**
- 📖 **[CodeAppsStarter Repository](https://github.com/geekfujiwara/CodeAppsStarter)** - プロジェクト全体
- 📖 **[README.md](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/README.md)** - テンプレート概要

#### **1.2 デザインシステムの理解**

テンプレートは **shadcn/ui + Tailwind CSS** をベースにしています。

**デザインシステムの構成要素:**

1. **カラーシステム** - CSS変数で定義された統一カラーパレット
2. **タイポグラフィ** - 一貫したフォントシステム
3. **スペーシング** - Tailwindの標準スペーシングスケール
4. **コンポーネント** - shadcn/uiのUIコンポーネントライブラリ

**参照先:**
- 📖 **[globals.css](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/app/globals.css)** - CSS変数・ベーススタイル
- 📖 **[tailwind.config.js](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/tailwind.config.js)** - Tailwind設定
- 📖 **[shadcn/ui公式ドキュメント](https://ui.shadcn.com/)** - コンポーネント詳細

#### **1.3 実装パターンの確認**

テンプレートの実装例を確認して、開発パターンを理解します。

**確認すべき実装例:**

- **ページ構成** - `src/app/page.tsx` でのレイアウト構造
- **コンポーネント使用** - UIコンポーネントの活用方法
- **スタイリング** - Tailwind CSSクラスの使用パターン
- **レスポンシブ対応** - ブレイクポイント使用方法

**参照先:**
- 📖 **[src/app/page.tsx](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/app/page.tsx)** - ホームページ実装
- 📖 **[src/components/](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components)** - コンポーネント実装例

---

### **Step 2: 要件分析と設計**

プロジェクト要件を分析し、テンプレートの機能をどのように拡張するか設計します。

#### **2.1 要件のマッピング**

プロジェクト要件をテンプレートの機能にマッピングします。

**質問リスト:**
1. **新しいページが必要か？** → Next.js App Routerで追加
2. **既存UIコンポーネントで実現可能か？** → shadcn/uiを活用
3. **新しいコンポーネントが必要か？** → テンプレートパターンを踏襲して作成
4. **カスタムスタイルが必要か？** → Tailwind CSSで実装
5. **データ統合が必要か？** → Phase 3へ

#### **2.2 設計の原則**

**DO（推奨）:**
- ✅ テンプレートの既存コンポーネントを最大限活用
- ✅ Tailwind CSSのユーティリティクラスを使用
- ✅ レスポンシブデザインを維持
- ✅ アクセシビリティを考慮（テンプレート品質を維持）
- ✅ コンポーネントの再利用性を重視

**DON'T（非推奨）:**
- ❌ PowerProvider.tsxを変更
- ❌ 認証フローを変更
- ❌ インラインスタイルを多用
- ❌ グローバルCSSに直接スタイル追加
- ❌ テンプレートのデザインシステムを無視

---

### **Step 3: 機能実装**

設計に基づいて機能を実装します。

#### **3.1 新しいページの追加**

Next.js App Routerを使用してページを追加します。

**実装手順:**

```bash
# 例: /about ページを追加
src/app/about/page.tsx
```

**実装例（テンプレートパターンを踏襲）:**

```tsx
// src/app/about/page.tsx
export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-4">About Us</h1>
      <p className="text-lg text-muted-foreground">
        会社情報をここに記載します。
      </p>
    </div>
  );
}
```

**参照先:**
- 📖 **[Next.js App Router](https://nextjs.org/docs/app)** - ルーティングの詳細
- 📖 **[テンプレートページ実装](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/app/page.tsx)** - 実装パターン

#### **3.2 UIコンポーネントの活用**

shadcn/uiコンポーネントを活用して機能を実装します。

**利用可能なコンポーネント例:**
- **Button** - ボタン
- **Card** - カード
- **Input** - 入力フィールド
- **Table** - テーブル
- **Dialog** - モーダル
- **Select** - ドロップダウン
- **Form** - フォーム

**実装例:**

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p>ダッシュボードコンテンツ</p>
          <Button className="mt-4">アクション実行</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

**参照先:**
- 📖 **[shadcn/ui Components](https://ui.shadcn.com/docs/components)** - コンポーネント一覧
- 📖 **[テンプレートUI実装](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components/ui)** - 実装例

#### **3.3 カスタムコンポーネントの作成**

既存コンポーネントで実現できない場合は、テンプレートパターンを踏襲してカスタムコンポーネントを作成します。

**作成場所:**
```
src/components/
├── ui/           # shadcn/ui コンポーネント（変更しない）
└── custom/       # プロジェクト固有のカスタムコンポーネント
```

**実装例:**

```tsx
// src/components/custom/StatusBadge.tsx
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`px-2 py-1 rounded-md text-sm font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
```

**設計原則:**
- ✅ Tailwind CSSでスタイリング
- ✅ TypeScriptで型定義
- ✅ 再利用可能な設計
- ✅ アクセシビリティを考慮

#### **3.4 レスポンシブ対応**

Tailwindのブレイクポイントを使用してレスポンシブ対応を実装します。

**ブレイクポイント:**
- `sm:` - 640px以上
- `md:` - 768px以上
- `lg:` - 1024px以上
- `xl:` - 1280px以上
- `2xl:` - 1536px以上

**実装例:**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* モバイル: 1列、タブレット: 2列、デスクトップ: 3列 */}
</div>
```

**参照先:**
- 📖 **[Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)** - レスポンシブの詳細

---

### **Step 4: ブランドカスタマイズ**

プロジェクト固有のブランド要素を適用します。

#### **4.1 ロゴとアイコンのカスタマイズ**

プロジェクトのロゴやアイコンを変更します。

**参照先:**
- 📖 **[ロゴ実装マスターガイド](./docs/LOGO_MASTER_GUIDE.md)** - ロゴ変更・SVGアイコン作成の詳細手順

**実装手順:**
1. SVGロゴを作成またはダウンロード
2. `public/` ディレクトリに配置
3. 必要な箇所でロゴを参照

#### **4.2 カラーテーマのカスタマイズ**

プロジェクトのブランドカラーに合わせてテーマをカスタマイズします。

**参照先:**
- 📖 **[テーマカスタマイズガイド](./docs/THEME_CUSTOMIZATION_GUIDE.md)** - 色・フォント・テーマ変更の詳細手順

**カスタマイズ対象:**
- `src/app/globals.css` のCSS変数
- `tailwind.config.js` のカラー設定

---

### **Step 5: ローカル確認**

実装した機能をローカル環境で確認します。

#### **5.1 開発サーバー起動**

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いて動作確認します。

#### **5.2 確認項目**

**機能確認:**
- ✅ 新機能が正常に動作する
- ✅ 既存機能に影響がない
- ✅ エラーが発生しない

**デザイン確認:**
- ✅ テンプレートのデザイン品質を維持している
- ✅ レスポンシブ対応が正常に動作する
- ✅ ブランドカラーが正しく適用されている

**パフォーマンス確認:**
- ✅ ページ読み込みが高速
- ✅ UIが滑らか

#### **5.3 Power Appsローカル実行での確認**

Power Apps環境でのローカル実行で統合確認を行います。

```bash
pac code init --environment [environmentid] --displayName "[アプリ表示名]"
npm run dev
```

**確認項目:**
- ✅ Power Apps認証が正常に動作する
- ✅ Power Apps環境で正しく表示される

---

### **Step 6: デプロイと本番確認**

実装した機能をPower Apps環境にデプロイします。

#### **6.1 ビルドとデプロイ**

```bash
npm run build
pac code push
```

#### **6.2 本番環境での確認**

Power Appsポータルで公開されたアプリを確認します。

**確認項目:**
- ✅ 本番環境で正常に動作する
- ✅ 認証が正常に機能する
- ✅ すべての機能が利用可能

---

## 🎓 ベストプラクティス

### **1. コンポーネント設計**

**再利用性を重視:**
```tsx
// ❌ 悪い例: ハードコードされた値
function UserCard() {
  return <div>John Doe</div>;
}

// ✅ 良い例: 再利用可能なコンポーネント
interface UserCardProps {
  name: string;
  role: string;
}

function UserCard({ name, role }: UserCardProps) {
  return (
    <div>
      <p>{name}</p>
      <p className="text-muted-foreground">{role}</p>
    </div>
  );
}
```

### **2. スタイリング**

**Tailwind CSSユーティリティを活用:**
```tsx
// ❌ 悪い例: インラインスタイル
<div style={{ padding: '16px', backgroundColor: '#f0f0f0' }}>

// ✅ 良い例: Tailwindクラス
<div className="p-4 bg-gray-100">
```

### **3. 型安全性**

**TypeScriptで型を定義:**
```tsx
// ✅ 良い例: 型定義
interface Task {
  id: string;
  title: string;
  completed: boolean;
}

function TaskList({ tasks }: { tasks: Task[] }) {
  // 型安全な実装
}
```

### **4. アクセシビリティ**

**セマンティックHTML・ARIA属性を使用:**
```tsx
// ✅ 良い例
<button 
  aria-label="メニューを開く"
  className="p-2"
>
  <MenuIcon />
</button>
```

---

## 🚨 トラブルシューティング

### **問題1: スタイルが反映されない**

**原因:** Tailwind CSSの設定またはビルド問題

**解決策:**
```bash
# 開発サーバーを再起動
npm run dev
```

### **問題2: コンポーネントが見つからない**

**原因:** インポートパスの誤り

**解決策:**
```tsx
// ✅ 正しいインポート
import { Button } from "@/components/ui/button";
```

### **問題3: Power Apps認証エラー**

**原因:** PowerProvider.tsxの変更または環境設定の問題

**解決策:**
- PowerProvider.tsxを変更していないか確認
- `pac code init` が正しく実行されているか確認

---

## ✅ Phase 2完了条件

Phase 2が完了するには、以下の条件を満たす必要があります:

- ✅ **テンプレート理解完了** - デザインシステムと実装パターンを理解した
- ✅ **機能実装完了** - プロジェクト要件に合わせた機能拡張が完了した
- ✅ **ブランドカスタマイズ完了** - ロゴ・カラーテーマが適用された
- ✅ **ローカル確認完了** - すべての機能が正常に動作することを確認した
- ✅ **デプロイ完了** - Power Apps環境にデプロイし本番確認を完了した
- ✅ **テンプレート品質維持** - デザインシステムの一貫性を保っている
- ✅ **レスポンシブ対応** - すべてのデバイスで正常に表示される

**次へ**: Phase 2 → Phase 3（データソース統合）

---

## 📚 参考リソース

### **テンプレートリソース**
- 📖 **[CodeAppsStarter Repository](https://github.com/geekfujiwara/CodeAppsStarter)** - テンプレート全体
- 📖 **[CodeAppsStarter README](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/README.md)** - テンプレート概要

### **デザインシステムリソース**
- 📖 **[shadcn/ui公式ドキュメント](https://ui.shadcn.com/)** - コンポーネントライブラリ
- 📖 **[Tailwind CSS公式ドキュメント](https://tailwindcss.com/)** - ユーティリティCSS

### **フレームワークリソース**
- 📖 **[Next.js公式ドキュメント](https://nextjs.org/docs)** - Next.js App Router
- 📖 **[React公式ドキュメント](https://react.dev/)** - React基礎

### **開発標準内リソース**
- 📖 **[ロゴ実装マスターガイド](./docs/LOGO_MASTER_GUIDE.md)** - ロゴ・アイコンカスタマイズ
- 📖 **[テーマカスタマイズガイド](./docs/THEME_CUSTOMIZATION_GUIDE.md)** - カラー・テーマ変更
- 📖 **[shadcn/ui拡張ガイド](./docs/SHADCN_UI_EXTENSION_GUIDE.md)** - UIコンポーネント活用

---

## 💡 まとめ

Phase 2では、**CodeAppsStarterテンプレート**を基盤として、プロジェクト要件に合わせた機能拡張を実施しました。

**重要なポイント:**

1. **テンプレート参照型開発** - GitHubの実装を参照して理解
2. **既存パターンの活用** - shadcn/ui + Tailwind CSSを最大活用
3. **段階的な拡張** - テンプレート品質を維持しながら機能追加
4. **ブランドカスタマイズ** - プロジェクト固有の要素を適用

**次のステップ:**

Phase 3では、データソース統合を実施し、本格的なビジネスロジックを実装します。

**📘 [Phase 3: データソース統合へ進む](./PHASE3_DATA_INTEGRATION.md)**
