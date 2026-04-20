---
name: generative-page-dev
description: "Power Apps Generative Pages (genux) の開発・デバッグ・デプロイ。React 17 + TypeScript + Fluent UI V9 + D3.js の単一ファイル構成。Use when: generative page, genpage, genux, pac model genpage, DataAPI, Fluent UI V9, D3 chart, model-driven app page, generative page deploy, generative page debug"
argument-hint: "[ページの説明 or 'deploy' or 'debug']"
user-invocable: true
---

# Generative Pages 開発スキル

Power Apps モデル駆動型アプリの **Generative Pages (genux)** を開発・デバッグ・デプロイするスキル。

> **Code Apps スキル (`code-apps-dev`) との違い**: Code Apps は React 18 + Tailwind + shadcn + Vite + `npx power-apps push` のフルスタック開発。Generative Pages は React 17 + Fluent UI V9 + D3.js の **単一 `.tsx` ファイル構成** で `pac model genpage upload` でデプロイする軽量ページ。

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| UI | React 17 + TypeScript |
| コンポーネント | `@fluentui/react-components` (Fluent UI V9) |
| アイコン | `@fluentui/react-icons`（サイズなしバリアントのみ） |
| チャート | D3.js v7 |
| データ | `props.dataApi` (DataAPI) |
| デプロイ | PAC CLI (`pac model genpage upload`) |

**利用可能ライブラリ（これ以外は使用禁止）:**

```
react: ^17.0.2
@fluentui/react-components: ^9.46.4
@fluentui/react-icons: ^2.0.292
@fluentui/react-datepicker-compat: ^0.5.0
@fluentui/react-timepicker-compat: ^0.3.0
d3: ^7.9.0
uuid: ^9.0.1
```

## 絶対遵守ルール

1. **React 17 構文のみ** — React 18 の `useId`, `useTransition` 等は使用不可
2. **FluentProvider 追加禁止** — ルートで提供済み。追加すると React 17 でダブルレンダーが発生
3. **`100vh` / `100vw` 禁止** — flexbox と相対単位を使用
4. **単一ファイル構成** — 全コンポーネント・ユーティリティを 1 つの `.tsx` ファイルに記述
5. **`export default GeneratedComponent`** — エントリポイントの関数名と export 形式は固定
6. **`makeStyles` + `tokens`** でスタイリング。インラインスタイルは動的値のみ
7. **DataAPI は TableRegistrations がある場合のみ使用** — `props.dataApi.queryTable()` で CRUD
8. **カラム名は RuntimeTypes.ts を確認** — 推測禁止
9. **`@fluentui/react-icons` はサイズなしバリアントのみ** — `AddRegular` ✅ / `Add24Regular` ❌
10. **`Map` / `Set` に `for...of` 禁止** — `.forEach()` または `[...map]` でイテレーション
11. **ダークモードはデフォルトで実装しない** — ユーザーが明示的にダークモード対応を要求した場合のみ `themeToVars` パターンを実装する。デフォルトは Fluent UI のシステムテーマに従う（追加実装なし）
12. **Lookup 展開フィールドを `select` に含めない** — `em_equipmentname` 等の Lookup 先の名前フィールドは DataAPI の `select` に指定すると `Could not find a property` エラーになる。`_xxx_value`（FK ID）のみを select し、別テーブルから取得した名前を `useMemo` Map でクライアントサイド名前解決する
13. **`--add-to-sitemap` を使わない** — PAC CLI の `--add-to-sitemap` はタイトルなしの SubArea を追加してしまう。SiteMap は `deploy_model_app.py` 等で `GenPageId` 属性 + `<Titles>` 付きの SubArea を自前で管理する

## 開発フロー

### Step 1: 前提確認

```powershell
pac help          # バージョン >= 2.3.1 確認
pac auth list     # 認証プロファイル確認（* がアクティブ）
```

認証がなければ:
```powershell
pac auth create --environment https://your-env.crm7.dynamics.com
```

### Step 2: アプリ・ページ確認

```powershell
pac model list                                           # アプリ一覧 → app-id 取得
pac model genpage list --app-id <app-id>                 # 既存ページ一覧 → page-id 取得
```

### Step 3: スキーマ生成（Dataverse 使用時・必須）

**コードを書く前に必ず実行する。カラム名の推測は禁止。**

```powershell
pac model genpage generate-types --data-sources "entity1,entity2,entity3" --output-file RuntimeTypes.ts
```

生成された `RuntimeTypes.ts` を読み、利用可能なカラム名・型・Choice 値を確認する。

### Step 4: コード作成

[コードパターンリファレンス](code-patterns.md) に従い `.tsx` ファイルを作成する。

**基本構造:**

```typescript
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ReadableTableRow, GeneratedComponentProps, entity_name } from "./RuntimeTypes";
import { makeStyles, tokens, Card, Text, /* ... */ } from "@fluentui/react-components";
import { IconRegular } from "@fluentui/react-icons";
import * as d3 from "d3";

// ユーティリティ関数（トップレベル）
// サブコンポーネント（トップレベル関数）

const GeneratedComponent = (props: GeneratedComponentProps) => {
  const { dataApi } = props;
  // 実装
};

export default GeneratedComponent;
```

### Step 5: デプロイ

**新規ページ:**
```powershell
pac model genpage upload `
  --app-id <app-id> `
  --code-file MyPage.tsx `
  --name "ページ名" `
  --data-sources "entity1,entity2" `
  --add-to-sitemap
```

**既存ページ更新:**
```powershell
pac model genpage upload `
  --app-id <app-id> `
  --code-file MyPage.tsx `
  --page-id <page-id> `
  --data-sources "entity1,entity2"
```

### Step 6: デバッグ

問題が発生した場合は [トラブルシューティング](troubleshooting.md) を参照。

## DataAPI パターン

### クエリ（ページネーション対応）

```typescript
async function loadAllRows<T>(
  api: GeneratedComponentProps["dataApi"],
  table: string,
  options: { select: string[]; filter?: string; orderBy?: string; pageSize?: number }
): Promise<ReadableTableRow<T>[]> {
  let res = await api.queryTable(table as any, {
    select: options.select as any,
    filter: options.filter,
    orderBy: options.orderBy,
    pageSize: options.pageSize || 250,
  });
  let rows = [...res.rows];
  while (res.hasMoreRows && res.loadMoreRows) {
    res = await res.loadMoreRows();
    rows = rows.concat(res.rows);
  }
  return rows as any;
}
```

### Choice 値の取得

```typescript
const areaChoices = (await dataApi.getChoices("entity_name-field_name"))
  .map((c) => ({ label: c.label, value: c.value as number }));
```

### FK（Lookup）の ID 抽出

Lookup フィールドの値は `EntityReference(guid)` 形式で返る場合がある:

```typescript
function fkId(fk: any): string {
  if (!fk) return "";
  const s = String(fk);
  const m = s.match(/\(([^)]+)\)/);
  return m ? m[1] : s;
}
```

## ダークモード（themeToVars パターン）

> **⚠️ デフォルトでは実装しない。ユーザーが明示的に要求した場合のみ使用する。**

FluentProvider を追加せず、CSS 変数でテーマを切り替える:

```typescript
import { webDarkTheme, webLightTheme } from "@fluentui/react-components";

function themeToVars(theme: Record<string, string>): React.CSSProperties {
  const v: Record<string, string> = {};
  Object.entries(theme).forEach(([k, val]) => { v["--" + k] = val; });
  return v as React.CSSProperties;
}

// JSX
<div style={{ ...themeToVars((isDark ? webDarkTheme : webLightTheme) as unknown as Record<string, string>), height: "100%", overflow: "auto" }}>
  <div className={styles.root}>
    {/* コンテンツ */}
  </div>
</div>
```

## 多言語対応パターン

```typescript
function detectLanguage(): { code: string; name: string } {
  const uiLang = (typeof Xrm !== "undefined" &&
    Xrm.Utility?.getGlobalContext()?.userSettings?.languageId) || 1041;
  if (uiLang === 1033) return { code: "en-US", name: "English" };
  return { code: "ja-JP", name: "Japanese" };
}

const T: Record<string, Record<string, string>> = {
  "ja-JP": { title: "ダッシュボード", save: "保存" },
  "en-US": { title: "Dashboard", save: "Save" },
};

// コンポーネント内
const lang = useMemo(() => detectLanguage(), []);
const t = useCallback((k: string): string => T[lang.code]?.[k] || T["en-US"]?.[k] || k, [lang.code]);
```

## D3.js チャートパターン

詳細は [コードパターンリファレンス](code-patterns.md) を参照。

- **棒グラフ**: `useRef<SVGSVGElement>` + `useEffect` 内で D3 描画
- **ドーナツ**: `d3.pie()` + `d3.arc()` でセグメント描画
- **地図**: SVG パスデータ + バブルオーバーレイ

全チャートで共通ポイント:
- `svg.selectAll("*").remove()` でクリーンアップしてから描画
- ツールチップは `position: absolute` の `div` を `ref` で管理
- レスポンシブ: `viewBox` を設定し `width: "100%"` + `height: "auto"`

## ウィンドウキャッシュパターン

ページ間遷移でデータを保持する:

```typescript
let _cache: MyData | null = (window as any).__ppMyPageData ?? null;

// loadData 完了後
_cache = result;
(window as any).__ppMyPageData = result;

// 初回レンダリング
const [state, setState] = useState({ data: _cache, loading: _cache === null, error: null });
```

## 反復開発のベストプラクティス

1. **最小構成で初回デプロイ** → 動作確認 → 段階的に機能追加
2. **`generate-types` は最初に 1 回** — カラム名を確定してからコーディング
3. **`.rows` は必ずスプレッド** — `[...res.rows]` で配列化
4. **Map/Set のイテレーション** — `.forEach()` のみ。`for...of` は Power Apps ランタイムでエラー
5. **スタイル変更はインクリメンタル** — 大規模なリファクタリングより小さな変更を頻繁にデプロイ
6. **デプロイごとにブラウザキャッシュクリア** — Power Apps は積極的にキャッシュする

## Lookup 名前解決パターン（必須）

DataAPI の `select` に Lookup 展開フィールド（`em_xxxname` 等）を指定すると `Could not find a property` エラーになる。

**正しいパターン:**

```typescript
// 1. FK テーブルと参照元テーブルをそれぞれクエリ
const equipment = await loadAllRows(dataApi, "em_equipment", {
  select: ["em_equipmentid", "em_equipmentname", "_em_location_value"], // ❌ em_locationname は含めない
});
const locations = await loadAllRows(dataApi, "em_location", {
  select: ["em_locationid", "em_locationname"],
});

// 2. useMemo で名前解決 Map を構築
const locMap = useMemo(() => {
  const m = new Map<string, string>();
  locations.forEach((l) => m.set(l.em_locationid, l.em_locationname));
  return m;
}, [locations]);

// 3. fkId() で FK 値から ID を抽出し、Map で名前解決
<Text>{locMap.get(fkId(item._em_location_value)) || "-"}</Text>
```

## SiteMap への Generative Page 追加

`pac model genpage upload` の `--add-to-sitemap` は使わない。タイトルなしの「新しいサブエリア」が作成される。

**正しいパターン:** `deploy_model_app.py` の SiteMap XML に `GenPageId` + `<Titles>` 付き SubArea を追加。
SiteMap VectorIcon で使える組み込みアイコンの一覧は `icon-creation` スキル（`.github/skills/icon-creation/SKILL.md`）を参照。

```xml
<SubArea Id="sub_genpage" GenPageId="{page-id}" VectorIcon="/_imgs/TableIconsFluentV9/document_one_page_sparkle.svg" AvailableOffline="true">
  <Titles><Title LCID="1041" Title="ページ名" /><Title LCID="1033" Title="Page Name" /></Titles>
</SubArea>
```

`.env` に `GENPAGE_ID`, `GENPAGE_TITLE_JA`, `GENPAGE_TITLE_EN` を設定し、デプロイスクリプトから自動的に SiteMap に含める。
