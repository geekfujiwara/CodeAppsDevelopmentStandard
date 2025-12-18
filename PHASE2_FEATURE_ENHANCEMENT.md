# Phase 2: 機能拡張ガイドライン

## 📋 概要

このPhaseでは、**Phase 1でデプロイ済みのMicrosoft標準テンプレート**を基盤として、**CodeAppsStarterテンプレートを参照**しながら、プロジェクト要件に合わせた機能拡張を実施します。

> **⚠️ 重要: SDK更新に伴う開発プロセスの変更**
>
> **aka.ms/CodeApps リポジトリでSDKが更新されたため、開発プロセスが変更されました:**
> - **Phase 1**: Microsoft標準テンプレート（Vite + React + TypeScript）をデプロイ
> - **Phase 2**: CodeAppsStarterを**参照**して必要な機能のみ追加（全体クローンはしない）
> - **Phase 3**: Dataverseやコネクター接続（最後のステップ）
>
> この変更により、SDK初期化エラーを回避し、最新SDKとの互換性を保証します。

> **🚨 Phase 2開始の前提条件**
>
> **このPhaseを開始する前に、必ずPhase 1（Microsoft標準テンプレートデプロイ）が完了していることを確認してください。**
>
> **Phase 1完了の確認項目:**
> - ✅ Microsoft標準テンプレート（Vite + React + TypeScript）がデプロイされている
> - ✅ Power Apps SDKが正常にインストールされている（`@microsoft/power-apps`）
> - ✅ テンプレートが本番環境で正常に動作している
> - ✅ SDK初期化エラーが発生していない
> - ✅ テンプレートに機能追加していない（純粋なテンプレート状態）
> - ✅ ビルド・デプロイプロセスが確立している
>
> **なぜMicrosoft標準テンプレートから開始するのか:**
> 1. 最新SDKとの互換性が保証されている
> 2. SDK初期化エラーを回避できる
> 3. 動作確認済みの基盤から開発を開始できる
> 4. カスタム機能追加時の問題切り分けが容易
> 5. ロールバック先（純粋なテンプレート状態）が明確

---

## 🔍 Phase 2開始前の必須調査

> **⚠️ 重要: 機能実装を開始する前に、必ずこの調査を実施してください**

### **CodeAppsStarterテンプレートの参照方法**

**新機能を実装する前に、CodeAppsStarterテンプレートで類似機能や再利用可能なパターンを必ず調査してください。**

> **📌 重要: CodeAppsStarterは参照用です**
>
> CodeAppsStarterを全体クローンするのではなく、GitHubで内容を確認し、必要な機能のみを自分のプロジェクトに追加してください。
> これにより、SDK互換性を維持しながら、高品質なデザインパターンを活用できます。

**調査手順:**

#### **Step 1: テンプレートリポジトリへアクセス**

1. **[CodeAppsStarter Repository](https://github.com/geekfujiwara/CodeAppsStarter)** を開く
2. リポジトリの構造を確認（クローンはしない）
3. 必要な機能を探す

#### **Step 2: 実装例の確認**

**確認すべきディレクトリ:**

| ディレクトリ | 確認内容 | URL |
|------------|---------|-----|
| **src/app/** | ページ実装パターン | [src/app/](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/app) |
| **src/components/ui/** | UIコンポーネント | [src/components/ui/](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components/ui) |
| **src/components/layout/** | レイアウトパターン | [src/components/layout/](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components/layout) |
| **src/lib/** | ユーティリティ関数 | [src/lib/](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/lib) |

#### **Step 3: 類似機能の検索**

**実装したい機能に対して確認:**

✅ **ページレイアウト** - 類似した画面構成があるか?
- 参照: `src/app/page.tsx`, `src/app/layout.tsx`

✅ **データ表示** - テーブル・カード・リスト表示の実装例は?
- 参照: `src/components/ui/table.tsx`, `src/components/ui/card.tsx`

✅ **フォーム入力** - 入力フォーム・バリデーションの実装例は?
- 参照: `src/components/ui/input.tsx`, `src/components/ui/form.tsx`

✅ **モーダル・ダイアログ** - ポップアップ表示の実装例は?
- 参照: `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`

✅ **ナビゲーション** - メニュー・タブの実装例は?
- 参照: `src/components/layout/`, `src/components/ui/tabs.tsx`

#### **Step 4: コードの理解**

**見つけた実装例について:**

1. **コードを読む** - GitHubで実装方法を理解
2. **使用されているコンポーネントを確認** - shadcn/uiコンポーネントの使い方
3. **スタイリングパターンを確認** - Tailwind CSSクラスの使用方法
4. **状態管理を確認** - React hooksの使用パターン

#### **Step 5: 必要な機能のみを自分のプロジェクトに追加**

**追加方法:**

| 状況 | アクション |
|------|----------|
| ✅ **shadcn/uiコンポーネント** | `npx shadcn-ui@latest add [component]` でインストール |
| ✅ **ページ実装パターン** | GitHubでコードを参照し、必要な部分だけをコピー |
| ✅ **カスタムコンポーネント** | 実装方法を参考に自分のプロジェクトで新規作成 |
| ⚠️ **該当なし** | Tailwind CSSとshadcn/uiを使って新規作成 |

> **📌 重要: 全体クローンは避ける**
>
> ```bash
> # ❌ 避けるべき方法
> git clone https://github.com/geekfujiwara/CodeAppsStarter .
> # → SDK互換性の問題が発生する可能性
>
> # ✅ 推奨される方法
> # 1. GitHubでCodeAppsStarterを参照
> # 2. 必要なコンポーネントをshadcn/uiでインストール
> npx shadcn-ui@latest add button
> npx shadcn-ui@latest add card
> 
> # 3. ページ実装パターンをコピー（必要な部分のみ）
> # 例1: レイアウト構造をコピー
> # CodeAppsStarter の src/app/page.tsx から以下をコピー:
> # - ページの基本構造（divコンテナとクラス）
> # - レスポンシブグリッドの設定
> # - Tailwind CSSクラスの使用パターン
> 
> # 例2: 特定機能のコンポーネントをコピー
> # CodeAppsStarter の src/components/ から:
> # - 該当コンポーネントファイルを自分のプロジェクトにコピー
> # - 依存する型定義やインポートも一緒にコピー
> # - プロジェクトに合わせて調整
> ```

### **調査完了チェックリスト**

機能実装を開始する前に、以下を確認してください:

- [ ] Phase 1でMicrosoft標準テンプレートがデプロイされている
- [ ] CodeAppsStarterリポジトリをGitHubで確認した（クローンはしていない）
- [ ] `src/app/` のページ実装例を確認した
- [ ] `src/components/ui/` のUIコンポーネントを確認した
- [ ] 実装したい機能に類似するパターンを探した
- [ ] 必要なshadcn/uiコンポーネントをリストアップした
- [ ] テンプレートの実装方法を理解した

**この調査により:**
- ✅ SDK互換性を維持しながら開発できる
- ✅ 開発時間が大幅に短縮される
- ✅ 高品質なUIパターンを活用できる
- ✅ ベストプラクティスに沿った実装が可能
- ✅ メンテナンス性の高いコードベースが構築される

---

## 🎯 基本方針

### ✅ CodeAppsStarter参照型開発

**Phase 1でデプロイしたMicrosoft標準テンプレート基盤の上に、CodeAppsStarterを参照して機能を追加します:**

**基盤（Phase 1）:**
- **Vite + React + TypeScript** - Microsoft標準テンプレート
- **@microsoft/power-apps SDK** - 最新SDKとの互換性保証
- **Power Apps統合** - 認証基盤

**参照元（Phase 2で活用）:**
- **shadcn/ui + Tailwind CSS** - モダンなデザインシステム
- **実装パターン** - ページ・コンポーネント実装例
- **レスポンシブ対応** - モバイル・タブレット・デスクトップ対応パターン

**このPhaseでは以下の開発アプローチを取ります:**

1. ✅ **Microsoft標準テンプレート基盤を維持** - SDK互換性を保証
2. ✅ **CodeAppsStarterを参照** - GitHub上の実装を確認して理解
3. ✅ **必要な機能のみ追加** - 全体クローンではなく段階的に追加
4. ✅ **shadcn/uiコンポーネント活用** - UIコンポーネントライブラリを利用
5. ✅ **段階的に拡張** - 一度に全てではなく、機能ごとに追加

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
