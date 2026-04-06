# Fluent UI デザインシステムガイド

Power Apps Code Apps では、Microsoft の [Fluent UI React v9](https://react.fluentui.dev/) を使用して一貫した UI を構築します。

---

## 目次

- [セットアップ](#セットアップ)
- [テーマ設定](#テーマ設定)
- [基本コンポーネント](#基本コンポーネント)
- [レイアウトパターン](#レイアウトパターン)
- [レスポンシブデザイン](#レスポンシブデザイン)
- [アクセシビリティ](#アクセシビリティ)
- [アイコン](#アイコン)

---

## セットアップ

Fluent UI React v9 は `package.json` にプリインストールされています:

```json
{
  "dependencies": {
    "@fluentui/react-components": "^9.56.0",
    "@fluentui/react-icons": "^2.0.266"
  }
}
```

### FluentProvider の設定

アプリケーションルートで `FluentProvider` をラップします:

```tsx
import { FluentProvider, webLightTheme } from "@fluentui/react-components";

<FluentProvider theme={webLightTheme}>
  <App />
</FluentProvider>
```

---

## テーマ設定

### ビルトインテーマ

```tsx
import {
  webLightTheme,
  webDarkTheme,
  teamsLightTheme,
  teamsDarkTheme,
} from "@fluentui/react-components";
```

### ダークモード切り替え

```tsx
import { useState } from "react";
import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
  Switch,
} from "@fluentui/react-components";

const App = () => {
  const [isDark, setIsDark] = useState(false);

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      <Switch
        label="ダークモード"
        checked={isDark}
        onChange={(_, data) => setIsDark(data.checked)}
      />
      {/* アプリケーションコンテンツ */}
    </FluentProvider>
  );
};
```

### カスタムテーマ

```tsx
import { createLightTheme, createDarkTheme } from "@fluentui/react-components";
import type { BrandVariants } from "@fluentui/react-components";

const brandColors: BrandVariants = {
  10: "#020305",
  20: "#111723",
  30: "#16263D",
  40: "#193253",
  50: "#1B3F6A",
  60: "#1B4C82",
  70: "#18599B",
  80: "#1267B4",
  90: "#3174C2",
  100: "#4F82C8",
  110: "#6790CF",
  120: "#7D9ED5",
  130: "#92ACDC",
  140: "#A6BAE2",
  150: "#BAC9E9",
  160: "#CDD8EF",
};

const customLightTheme = createLightTheme(brandColors);
const customDarkTheme = createDarkTheme(brandColors);
```

---

## 基本コンポーネント

### テキスト

```tsx
import { Title1, Title2, Title3, Subtitle1, Body1, Caption1 } from "@fluentui/react-components";

<Title1>見出し 1</Title1>
<Title2>見出し 2</Title2>
<Subtitle1>サブタイトル</Subtitle1>
<Body1>本文テキスト</Body1>
<Caption1>キャプション</Caption1>
```

### カード

```tsx
import { Card, CardHeader, CardPreview, Text } from "@fluentui/react-components";

<Card>
  <CardPreview>
    {/* プレビューコンテンツ */}
  </CardPreview>
  <CardHeader
    header={<Text weight="semibold">カードタイトル</Text>}
    description={<Text>説明文</Text>}
  />
</Card>
```

### ボタン

```tsx
import { Button } from "@fluentui/react-components";
import { Add24Regular } from "@fluentui/react-icons";

<Button appearance="primary">プライマリ</Button>
<Button appearance="secondary">セカンダリ</Button>
<Button appearance="outline">アウトライン</Button>
<Button icon={<Add24Regular />}>アイコン付き</Button>
```

### メッセージバー

```tsx
import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";

<MessageBar intent="success">
  <MessageBarBody>
    <MessageBarTitle>成功</MessageBarTitle>
    操作が正常に完了しました。
  </MessageBarBody>
</MessageBar>

<MessageBar intent="error">
  <MessageBarBody>
    <MessageBarTitle>エラー</MessageBarTitle>
    操作中にエラーが発生しました。
  </MessageBarBody>
</MessageBar>
```

### テーブル

```tsx
import {
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
} from "@fluentui/react-components";

<Table>
  <TableHeader>
    <TableRow>
      <TableHeaderCell>名前</TableHeaderCell>
      <TableHeaderCell>部署</TableHeaderCell>
      <TableHeaderCell>メール</TableHeaderCell>
    </TableRow>
  </TableHeader>
  <TableBody>
    {users.map((user) => (
      <TableRow key={user.id}>
        <TableCell>{user.displayName}</TableCell>
        <TableCell>{user.department}</TableCell>
        <TableCell>{user.mail}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## レイアウトパターン

### makeStyles を使用したスタイリング

Fluent UI v9 では `makeStyles` を使用して CSS-in-JS スタイルを定義します:

```tsx
import { makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

const MyComponent = () => {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {/* ヘッダーコンテンツ */}
      </div>
    </div>
  );
};
```

### デザイントークン

Fluent UI のデザイントークンを使用して一貫したスタイリングを実現します:

```tsx
import { tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  container: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow4,
    padding: tokens.spacingVerticalM,
  },
});
```

---

## レスポンシブデザイン

### メディアクエリ

```tsx
const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "16px",
    "@media (min-width: 640px)": {
      gridTemplateColumns: "repeat(2, 1fr)",
    },
    "@media (min-width: 1024px)": {
      gridTemplateColumns: "repeat(3, 1fr)",
    },
  },
});
```

---

## アクセシビリティ

Fluent UI コンポーネントはアクセシビリティ機能を内蔵していますが、追加の配慮が必要な場合があります:

```tsx
// ARIA ラベルの追加
<Button aria-label="新規アイテムを追加">
  <Add24Regular />
</Button>

// ライブリージョン（動的コンテンツの読み上げ）
<div role="status" aria-live="polite">
  {statusMessage}
</div>

// キーボードナビゲーション
<div role="list" onKeyDown={handleKeyNavigation}>
  {items.map(item => (
    <div role="listitem" tabIndex={0} key={item.id}>
      {item.name}
    </div>
  ))}
</div>
```

---

## アイコン

`@fluentui/react-icons` から豊富なアイコンを使用できます:

```tsx
import {
  Home24Regular,
  Home24Filled,
  Settings24Regular,
  Person24Regular,
  Search24Regular,
  Add24Regular,
  Delete24Regular,
  Edit24Regular,
  ArrowClockwise24Regular,
} from "@fluentui/react-icons";

// アイコンの使用
<Home24Regular />
<Button icon={<Settings24Regular />}>設定</Button>
```

サイズバリエーション: `16`, `20`, `24`, `28`, `32`, `48`

スタイルバリエーション: `Regular`（線画）, `Filled`（塗りつぶし）

アイコン一覧: [Fluent UI Icons](https://react.fluentui.dev/?path=/docs/icons-catalog--page)
