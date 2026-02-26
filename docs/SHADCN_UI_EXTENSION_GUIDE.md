# shadcn/ui拡張ガイド

> **📘 CodeAppsStarterテンプレート専用ガイド**  
> このドキュメントでは、CodeAppsStarterテンプレートのshadcn/uiコンポーネントを参照・活用した拡張・カスタマイズ方法を説明します。

**最終更新**: 2025年11月17日  
**対象**: Phase 2: デザインシステム統合・カスタマイズ

---

## 🧩 テンプレート shadcn/ui システム参照ガイド

### 📖 テンプレート参照リンク

**基盤UIコンポーネント:**
- 🔗 **[Button](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/button.tsx)** - ボタンコンポーネント
- 🔗 **[Card](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/card.tsx)** - カードコンポーネント
- 🔗 **[Input](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/input.tsx)** - 入力フィールド
- 🔗 **[Dialog](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/dialog.tsx)** - モーダルダイアログ
- 🔗 **[Table](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/table.tsx)** - データテーブル
- 🔗 **[Form](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/form.tsx)** - フォーム管理

**実装例コンポーネント:**
- 🔗 **[Dashboard Components](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components)** - ダッシュボード実装例
- 🔗 **[Page Components](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/pages)** - ページコンポーネント実装例

**設定ファイル:**
- 🔗 **[Utils Functions](https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/lib/utils.ts)** - ユーティリティ関数
- 🔗 **[Component Index](https://github.com/geekfujiwara/CodeAppsStarter/tree/main/src/components/ui)** - UIコンポーネント一覧

---

## 🚀 テンプレート参照による拡張手順

### Step 1: テンプレートコンポーネントの確認・コピー

```bash
# テンプレートのUIコンポーネントをプロジェクトにコピー
cp -r CodeAppsStarter/src/components/ui/ ./src/components/
cp CodeAppsStarter/src/lib/utils.ts ./src/lib/
```

### Step 2: 新しいコンポーネントの追加

#### 方法1: テンプレートパターンを参考にした新規作成

```typescript
// テンプレートのButtonコンポーネントを参照して新しいコンポーネント作成
// 参照: https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/button.tsx

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface CustomButtonProps {
  variant?: "success" | "warning" | "error" | "info"
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function CustomButton({ 
  variant = "info", 
  children, 
  className,
  ...props 
}: CustomButtonProps) {
  return (
    <Button
      className={cn(
        {
          "bg-green-500 hover:bg-green-600": variant === "success",
          "bg-yellow-500 hover:bg-yellow-600": variant === "warning",
          "bg-red-500 hover:bg-red-600": variant === "error",
          "bg-blue-500 hover:bg-blue-600": variant === "info",
        },
        className
      )}
      {...props}
    >
      {children}
    </Button>
  )
}
```

#### 方法2: shadcn/ui CLIによる追加

```bash
# 新しいコンポーネント追加（テンプレートで未使用のもの）
npx shadcn-ui@latest add calendar
npx shadcn-ui@latest add date-picker
npx shadcn-ui@latest add data-table
```

### Step 3: コンポーネント合成例（テンプレート参照）

```typescript
// テンプレートの複数コンポーネント組み合わせパターンを参照
// 参照: CodeAppsStarter の Dashboard や Gallery 実装

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface FeatureCardProps {
  title: string
  description: string
  status: "active" | "pending" | "completed"
  onEdit?: () => void
}

export function FeatureCard({ title, description, status, onEdit }: FeatureCardProps) {
  const statusColors = {
    active: "default",
    pending: "secondary", 
    completed: "destructive",
  } as const

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant={statusColors[status]}>{status}</Badge>
      </CardHeader>
      <CardContent>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

---

## 🎯 ベストプラクティス

### 1. テンプレートパターンの踏襲

```typescript
// ✅ 良い例: テンプレートのforwardRefパターンを使用
// テンプレート参照: https://github.com/geekfujiwara/CodeAppsStarter/blob/main/src/components/ui/button.tsx

const CustomButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    return (
      <button
        className={cn("custom-styles", className)}
        ref={ref}
        {...props}
      />
    )
  }
)
CustomButton.displayName = "CustomButton"

// ❌ 避ける例: テンプレートパターンを無視
const CustomButton = ({ className, ...props }) => {
  return <button className={`custom-styles ${className}`} {...props} />
}
```

### 2. TypeScriptの型安全性（テンプレート準拠）

```typescript
// ✅ 良い例: テンプレートの厳密な型定義パターン
interface StrictComponentProps {
  variant: "primary" | "secondary" | "destructive"
  size: "sm" | "md" | "lg"
  children: React.ReactNode
}

// ❌ 避ける例: 緩い型定義
interface LooseComponentProps {
  variant?: string
  size?: string
  children?: any
}
```

### 3. コンポーネントの組み合わせ

```typescript
// ✅ テンプレートの組み合わせパターンを参照
// 参照: CodeAppsStarter の実装例

<Card className="w-full">
  <CardHeader>
    <CardTitle>タスク</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      {/* コンテンツ */}
    </div>
  </CardContent>
</Card>
```

---

## 🚨 カスタマイズ時の注意事項

- **テンプレート品質の維持**: 既存のshadcn/ui品質を損なわないようにカスタマイズ
- **テンプレート実装の参照**: 新機能追加時は必ずテンプレートの実装パターンを確認
- **型安全性の確保**: TypeScriptの厳密な型チェックを活用
- **一貫性の保持**: テンプレートのデザインシステムとの一貫性を保つ

---

## 📚 関連ドキュメント

- **[Phase 2: 機能拡張](../PHASE2_FEATURE_ENHANCEMENT.md)** - メインガイド
- **[テーマカスタマイズガイド](./THEME_CUSTOMIZATION_GUIDE.md)** - テーマ設定
- **[CodeAppsStarterテンプレート](https://github.com/geekfujiwara/CodeAppsStarter)** - 参照元テンプレート
- **[shadcn/ui公式ドキュメント](https://ui.shadcn.com/)** - コンポーネントリファレンス