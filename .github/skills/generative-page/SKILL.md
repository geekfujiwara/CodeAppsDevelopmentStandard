---
name: generative-page
description: "Power Apps Generative Pages (genux) の開発・デバッグ・デプロイ。React 17 + TypeScript + Fluent UI V9 + D3.js の単一ファイル構成。デザインテンプレートによる段階的 UI 改善。"
category: ui
argument-hint: "[ページの説明 or 'deploy' or 'debug' or 'improve design']"
user-invocable: true
triggers:
  - "generative page"
  - "genpage"
  - "genux"
  - "pac model genpage"
  - "DataAPI"
  - "Fluent UI V9"
  - "D3 chart"
  - "model-driven app page"
  - "generative page deploy"
  - "generative page debug"
  - "デザイン改善"
  - "ダッシュボード"
  - "KPI"
  - "チャート"
  - "アニメーション"
  - "日本地図"
  - "地図"
  - "マップ"
  - "都道府県"
  - "地域別"
  - "JapanMap"
---

# Generative Pages 開発スキル

Power Apps モデル駆動型アプリの **Generative Pages (genux)** を開発・デバッグ・デプロイするスキル。

> **Code Apps スキル (`code-apps`) との違い**: Code Apps は React 18 + Tailwind + shadcn + Vite + `npx power-apps push` のフルスタック開発。Generative Pages は React 17 + Fluent UI V9 + D3.js の **単一 `.tsx` ファイル構成** で `pac model genpage upload` でデプロイする軽量ページ。

## 技術スタック

| レイヤー       | 技術                                                |
| -------------- | --------------------------------------------------- |
| UI             | React 17 + TypeScript                               |
| コンポーネント | `@fluentui/react-components` (Fluent UI V9)         |
| アイコン       | `@fluentui/react-icons`（サイズなしバリアントのみ） |
| チャート       | D3.js v7                                            |
| データ         | `props.dataApi` (DataAPI)                           |
| デプロイ       | PAC CLI (`pac model genpage upload`)                |

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

## 必須要件

1. **React 17 構文のみ** — React 18 の `useId`, `useTransition` 等は使用不可
2. **FluentProvider 追加禁止** — ルートで提供済み。追加すると React 17 でダブルレンダーが発生
3. **`100vh` / `100vw` 禁止** — flexbox と相対単位を使用
4. **単一ファイル構成** — 全コンポーネント・ユーティリティを 1 つの `.tsx` ファイルに記述
5. **`export default GeneratedComponent`** — エントリポイントの関数名と export 形式は固定
6. **`makeStyles` + `tokens`** でスタイリング。インラインスタイルは動的値のみ
7. **DataAPI は読み取り専用** — `props.dataApi.queryTable()` と `getChoices()` のみ使用可能。`updateRecord`, `createRecord`, `deleteRecord` は存在しない
8. **書き込みは `Xrm.WebApi.online`** — `(window as any).Xrm.WebApi.online.updateRecord()` / `.createRecord()` / `.deleteRecord()` を使用。`dataApi` には書き込みメソッドがない
9. **カラム名は RuntimeTypes.ts を確認** — 推測禁止
10. **`@fluentui/react-icons` はサイズなしバリアントのみ** — `AddRegular` ✅ / `Add24Regular` ❌
11. **`Map` / `Set` に `for...of` 禁止** — `.forEach()` または `[...map]` でイテレーション
12. **ダークモードはデフォルトで実装しない** — ユーザーが明示的にダークモード対応を要求した場合のみ `themeToVars` パターンを実装する。デフォルトは Fluent UI のシステムテーマに従う（追加実装なし）
> 13 以降の詳細ルール・教訓（Lookup 解決・SiteMap の Url 属性方式・D3 チャート・OData アノテーション回避・`genpage upload`/`PublishXml` のタイムアウト対策等、コード例つき）は [必須要件 詳細](references/requirements-and-lessons.md) を参照。

## 開発フロー

### Step 0: モデル駆動型アプリ作成（Dataverse テーブル作成後・Generative Page 作成前）

> **Generative Page はモデル駆動型アプリのページとして動作する。**
> Dataverse テーブル作成（Phase 2）完了後、Generative Page のコード開発に入る前に、
> **`model-driven-app` スキル（`.github/skills/model-driven-app/SKILL.md`）を読み込み、
> モデル駆動型アプリを作成する。**

手順:
1. `model-driven-app` スキルを読み込む
2. モデル駆動型アプリの設計をユーザーに提示（アプリ名・SiteMap 構成・含めるテーブル）
3. ユーザー承認後、アプリを Dataverse Web API で作成・公開
4. 作成されたアプリの `app-id` を取得（`pac model list` で確認）
5. その `app-id` を使って Generative Page をデプロイする

### Step 1: 前提確認

```powershell
pac help          # バージョン >= 2.3.1 確認
pac auth list     # 認証プロファイル確認（* がアクティブ）
```

認証がなければ:

```powershell
pac auth create --environment https://{org}.crm.dynamics.com
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

[コードパターンリファレンス](references/code-patterns.md) に従い `.tsx` ファイルを作成する。

基本構造の雛形（import・共通カラーパレット `P`・`GeneratedComponent` の モーダル/トースト state・`export default`）は [code-patterns.md の基本構造](references/code-patterns.md#generatedcomponent-基本構造雛形) を参照。

> **★ モーダル・トースト・ボタン式 Choice は Tier 1 — 初回デプロイに必ず含める。**完全な実装は [code-patterns.md §15](references/code-patterns.md) を参照。

### Step 5: デプロイ

**新規ページ:**

> **❗ 新規ページ作成はタイムアウトしやすい**。`--prompt` と `--agent-message` は **英語の短い文字列** を使う。
> 日本語の長い文字列は「タスクが取り消されました」エラーの原因になる（2026-04-21 検証済み）。

```powershell
pac model genpage upload `
  --app-id <app-id> `
  --code-file MyPage.tsx `
  --name "PageName" `
  --data-sources "entity1,entity2" `
  --prompt "short english description" `
  --agent-message "short english summary"
```

> **`--name` は新規ページ作成時に必須**。省略すると `The --name parameter is required when creating a new page.` エラー。既存ページ更新時（`--page-id` 指定時）は不要。
> **`--add-to-sitemap` は使わない**（ルール14参照）。SiteMap は Step 5.5 で自前管理する。

**既存ページ更新:**

```powershell
pac model genpage upload `
  --app-id <app-id> `
  --code-file MyPage.tsx `
  --page-id <page-id> `
  --data-sources "entity1,entity2" `
  --prompt "ページの説明" `
  --agent-message "変更内容の要約"
```

> **PAC CLI v2.6.4 以降**: `--prompt` と `--agent-message` フラグが必須。省略するとエラーになる。
> **デプロイのタイムアウト対策**: 新規ページ作成時は `--prompt` と `--agent-message` を **英語の短い文字列**（例: `--prompt "kanban" --agent-message "kanban board"`）にする。日本語の長い説明文はサーバー側でタイムアウト（「タスクが取り消されました」）を引き起こしやすい（2026-04-21 検証済み: 日本語で3回失敗 → 英語短縮で成功）。既存ページ更新時（`--page-id`）はこの問題は発生しにくい。

### Step 6: SiteMap 更新（デプロイ後に必ず実施 — 省略禁止）

> **絶対ルール**: `pac model genpage upload` を実行したら、**同じ作業内で必ず SiteMap を更新する**。
> ユーザーに「SiteMap も更新しますか？」と聞かない。デプロイの一部として自動的に行う。

1. 既存 SiteMap を取得: `sitemaps({sitemap-id})?$select=sitemapxml` で取得
2. SiteMap XML に新しいページの `<SubArea Url="/main.aspx?pagetype=genux&amp;id={page-id}" ...>` を追加（**`GenPageId` ではなく `Url` 属性を使う — 教訓 #30**）
3. `PATCH sitemaps({id})` で XML を更新
4. `PublishXml` でアプリを公開。**タイムアウトしたら `pac solution publish` で代替**

**PublishXml タイムアウト時のフォールバック:**

```powershell
# Python スクリプトの PublishXml がタイムアウトした場合:
# SiteMap XML の PATCH は完了済みなので、公開だけ行えばよい
pac solution publish
```

> **注意**: `PublishXml` API は 120 秒でタイムアウトすることがある（環境の負荷に依存）。`pac solution publish` は PAC CLI 独自のタイムアウト管理で成功率が高い。

**SubArea フォーマット（`Url` 属性方式 — 推奨）:**

```xml
<SubArea Id="sub_page_name" GetStartedPanePath=""
  Url="/main.aspx?pagetype=genux&amp;id={page-id-guid}"
  IntroducedVersion="7.0.0.0">
  <Titles>
    <Title LCID="1041" Title="日本語タイトル" />
    <Title LCID="1033" Title="English Title" />
  </Titles>
</SubArea>
```

> **`GenPageId` 属性は使わない**（教訓 #30）。`Url` 属性で `/main.aspx?pagetype=genux&amp;id={page-id}` を指定すると `<Titles>` が MDA メニューに正しく反映される。

**注意**: 新しい SiteMap を作成して `AddAppComponents` で追加してはいけない（`0x80050111` エラー）。必ず既存 SiteMap を PATCH で更新する。

### Step 7: デバッグ

問題が発生した場合は [トラブルシューティング](references/troubleshooting.md) を参照。

## DataAPI パターン（読み取り専用）

> **重要**: `dataApi` は `queryTable()` と `getChoices()` のみ。書き込みは `Xrm.WebApi.online` を使用。

### クエリ（ページネーション対応）

```typescript
async function loadAllRows<T>(
  api: GeneratedComponentProps["dataApi"],
  table: string,
  options: {
    select: string[];
    filter?: string;
    orderBy?: string;
    pageSize?: number;
  },
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
const areaChoices = (await dataApi.getChoices("entity_name-field_name")).map(
  (c) => ({ label: c.label, value: c.value as number }),
);
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

## 補助パターン（ダークモード / 多言語 / D3 / キャッシュ）

ダークモード（themeToVars）・多言語対応（detectLanguage + T 辞書）・D3.js チャート・ウィンドウキャッシュの実装パターンは [code-patterns.md](references/code-patterns.md) を参照。

## Generative Page 構築フロー

Generative Pages は **いきなり KPI ダッシュボードを作らない**。
ユーザーに質問し、適切な構築パターンを選んでから段階的に構築する。

デザインパターン・UI カタログ・チャート選定ガイドの詳細は [デザインテンプレート](references/design-template.md) を参照。
美しいページ全体のデザイン設計図（Executive Summary・CRM Dashboard・Team Activity Feed・Resource Planner・Approval Center）は [ページデザインギャラリー](references/page-design-gallery.md) を参照。

### 段階 0: ユーザーに質問する【必須】— 必ず最初に行う）

ページ作成を依頼されたら、以下を質問する:

> Generative Page を作成します。最適なページを構築するため、以下を教えてください:
>
> 1. **何を管理・可視化したいですか？**
>    例: 設備の稼働状況、営業パイプライン、プロジェクト進捗、人員配置...
>
> 2. **主な利用者は誰ですか？**
>    例: 現場担当者、マネージャー、経営層...
>
> 3. **以下のどのパターンに近いですか？**
>    A) **入力ウィザード** — ステップ形式でデータ入力・登録をガイド
>    B) **KPI ダッシュボード** — 数値指標・チャートで全体像を俯瞰
>    C) **カンバンボード** — ドラッグ＆ドロップでステータス管理
>    D) **スケジュール管理（ガントチャート）** — タスクの期間・依存関係を可視化
>    E) **日本地図ダッシュボード** — 都道府県別データの地図可視化・地域分析（SVG 方式 / Google Maps 方式）
>    G) **分析レポート** — 多軸データの期間別集計・メンバー別比較・予実対比チャート
>    F) **オブジェクトフロー** — 特定レコード中心に関連エンティティのフロー・因果関係を可視化
>
> 4. **特に見たいチャートや UI はありますか？**（任意）
>    例: トレンドライン、ドーナツ、ガントチャート、地図、ヒートマップ...

### 段階 1: 構築パターンの提案

ユーザーの回答に基づき、6 つの構築パターン（**A 入力ウィザード / B KPI ダッシュボード / C カンバンボード / D スケジュール管理（ガント）/ E 日本地図ダッシュボード / F オブジェクトフロー**）から最適なものを選ぶ。各パターンの向いている場面・代表コンポーネントは [design-template.md](references/design-template.md) を参照。

選んだパターンのレイアウト・使用コンポーネントを提案し、承認を得る。

### 段階 2: 最小デプロイ（Tier 1）

初回デプロイに含める要素（安定稼働を優先）:

1. パターン別のメインコンポーネント:
   - A → ステッププログレス + フォームセクション + ナビゲーションボタン
   - B → KPIカード + DataGrid
   - C → カンバンレーン + カード一覧 + レーンヘッダー
   - D → タスク一覧 + D3タイムライングリッド + 期間バー
2. モバイル対応（`useIsMobile()` + レスポンシブ対応）
3. 多言語対応（`detectLanguage()` + `T` 辞書）
4. ウィンドウキャッシュ（ページ遷移時のデータ保持）

**パターン F（オブジェクトフロー）固有の Tier 1 要素**（レコードセレクター・3列フロー図・詳細サイドバー・レコードモーダル等）の実装は、完全な実装例 [objectflow-example.tsx](references/objectflow-example.tsx) を参照。

**初回デプロイ後、Tier 2 の改善を提案する。**

### 段階 3: チャート・ビジュアル追加（Tier 2 — ユーザーに提案）

初回デプロイ後、ビジュアル強化（アニメーション・統一ツールチップ・ホバーエフェクト）と、
パターン別チャート追加を提案する（A: バリデーション/プレビュー、B: トレンドライン/ゲージ/ウォーターフォール、
C: DnD/WIPリミット/スイムレーン、D: ズーム/依存関係線/進捗率、F: エンティティ一覧タブ/分析チャート/フィルター）。

### 段階 4: 高度な UI（Tier 3 — さらなる提案）

さらに日本地図表示（D3 geoMercator + バブル）・ダークモード（themeToVars）・リフレッシュボタン・
追加チャート（カタログから選定）を提案する。

### テンプレート参照

| ファイル | 内容 |
|---|---|
| [design-template.md](references/design-template.md) | 6構築パターン（入力ウィザード/KPI/カンバン/ガント/日本地図/オブジェクトフロー）、UIカタログ、チャート選定ガイド |
| [genpage-design-system.md](references/genpage-design-system.md) | モダンデザインシステム（カラーパレット・セクションカード・ピル型バッジ・グラデーションボタン・ガント D3 バー・ツールチップ・トースト・日付ナビゲーション） |
| [japan-map-pattern.md](references/japan-map-pattern.md) | 日本地図パターン（SVG 方式 / Google Maps iframe 方式・都道府県別データ可視化・色分け・地方フィルタ・Dataverse 連携） |
| [objectflow-example.tsx](references/objectflow-example.tsx) | Pattern F 完全実装例（オブジェクトフロー：3列フロー図・詳細サイドバー・レコードモーダル・関連ハイライト） |
| [objectflow-RuntimeTypes.ts](references/objectflow-RuntimeTypes.ts) | Pattern F 用 Dataverse 型定義（account・opportunity・quote・salesorder 等） |
| [code-patterns.md](references/code-patterns.md) | DataAPI・D3 チャート・DataGrid のコードパターン |
| [page-design-gallery.md](references/page-design-gallery.md) | ページデザインギャラリー（Executive Summary・CRM Dashboard・Team Activity Feed・Resource Planner・Approval Center の完全テンプレート + 共通デザイン基盤） |
| [troubleshooting.md](references/troubleshooting.md) | ランタイムエラー・デプロイ問題の対処法 |

## 反復開発のベストプラクティス

1. **最小構成（Tier 1）で初回デプロイ** → 動作確認 → Tier 2/3 を段階的に追加
2. **`generate-types` は最初に 1 回** — カラム名を確定してからコーディング
3. **`.rows` は必ずスプレッド** — `[...res.rows]` で配列化
4. **Map/Set のイテレーション** — `.forEach()` のみ。`for...of` は Power Apps ランタイムでエラー
5. **スタイル変更はインクリメンタル** — 大規模なリファクタリングより小さな変更を頻繁にデプロイ
6. **デプロイごとにブラウザキャッシュクリア** — Power Apps は積極的にキャッシュする
7. **`renderCell` JSX 空白バグに注意** — DataGridBody/DataGridRow 内の `>` と `{` の間に余分な空白・改行を入れない

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

`--add-to-sitemap` は使わず、SiteMap XML に `<Titles>` 付き SubArea を自前で追加する（教訓 #30 の `Url` 属性方式が最善）。具体的な XML・`.env`（GENPAGE_ID/TITLE）・アイコン指定は [必須要件 詳細](references/requirements-and-lessons.md#sitemap-への-generative-page-追加) を参照。
