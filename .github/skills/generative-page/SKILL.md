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

## 絶対遵守ルール

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
13. **Lookup 展開フィールドを `select` に含めない** — `em_equipmentname` 等の Lookup 先の名前フィールドは DataAPI の `select` に指定すると `Could not find a property` エラーになる。`_xxx_value`（FK ID）のみを select し、別テーブルから取得した名前を `useMemo` Map でクライアントサイド名前解決する
14. **`--add-to-sitemap` を使わない** — PAC CLI の `--add-to-sitemap` はタイトルなしの SubArea（「新しいサブエリア」と表示される）を追加してしまう。SiteMap は API で `Url` 属性 + `<Titles>` 付きの SubArea を自前で管理する（教訓 #30 参照）
15. **レコード編集は常にモーダル（初回デプロイ必須）** — 新しいタブやページ遷移ではなく、Fluent UI `Dialog` でモーダル編集フォームを表示。「詳細を開く」ボタンで同タブのレコードフォームへ遷移するオプションも提供。**モーダル・トースト・ボタン式 Choice は「段階的改善」ではなく初回デプロイのファイルに必ず含める**。実装詳細は code-patterns.md §15 参照
16. **Choice フィールドはボタン式トグル** — Dropdown ではなく、カラー付きトグルボタンで実装。選択中はボタンが塗りつぶされ、未選択はアウトラインのみ
17. **保存後にトースト通知** — 保存成功時は右上に緑色のトースト（3秒で自動消去）。`setSaving(false)` → `setSelectedItem(null)` → `setToast()` の順で state 更新。`finally { setSaving(false) }` は使わない（モーダル閉じと競合する）
18. **SiteMap 更新はデプロイの一部（省略禁止）** — `pac model genpage upload` を実行したら、同じ作業内で必ず SiteMap を API で更新する。ユーザーに「更新しますか？」と聞かず自動的に行う。既存 SiteMap を `PATCH sitemaps({id})` で更新し、`PublishXml` で公開する
19. **D3 チャートの SVG は明示的 width/height を設定** — `viewBox` 属性は使わない。`svg.attr("width", W).attr("height", H)` でピクセル指定する。`viewBox` + `height: "auto"` は Generative Pages ランタイムでチャートが表示されない原因になる。SVG を囲む `<div>` にも `height` を明示する
20. **KPI ダッシュボードは「チャート4枚 + データタブ」構成** — 初回表示はチャート4枚（2×2グリッド）+ KPI カード4枚。裏のデータ（DataGrid）は `TabList` で「データ」タブに切り替えて表示。チャートとデータを同一画面に詰め込まない
21. **D3 useEffect は `requestAnimationFrame` で描画を遅延する** — データ取得完了と同時に `loading=false` + データセットが行われる同一レンダーサイクルでは、SVG 要素が DOM に追加されてもブラウザのレイアウトが未完了。`requestAnimationFrame` でフレーム描画を次フレームに遅延し、クリーンアップで `cancelAnimationFrame` を返す。ref チェックは rAF コールバック内で行う
22. **ガントチャート等のギャラリー行は固定 height + border-box** — `minHeight` + padding の組み合わせは D3 側の行位置計算とズレる。ギャラリー側は `height: 36px` + `boxSizing: "border-box"` で固定し、D3 側は `scaleBand` ではなく `headerH + i * rowH` の手動ピクセル計算でアイテム位置を決定する
23. **DatePicker は使わず `<Input type="date">` を使う** — `@fluentui/react-datepicker-compat` の `DatePicker` は Generative Pages ランタイムでポップアップが透明になり背後のコンテンツと重なる。Portal 経由のレンダリングに背景色が適用されないため。Fluent UI `Input` に `type: "date"` を指定してブラウザネイティブの日付ピッカーを使う
24. **D3 チャートのツールチップは `position: absolute` + 親コンテナ基準** — `position: fixed` は Generative Pages ランタイムのコンテナ構造でマウスから大きく離れた位置に表示される。ルート div に `position: "relative"` を設定し、ツールチップ div は `position: "absolute"` + `pointerEvents: "none"` で配置。`getBoundingClientRect()` + `scrollLeft`/`scrollTop` でコンテナオフセットを計算し、マウスの右10px・上10pxに表示する。Fluent UI の `Tooltip` コンポーネントは D3 SVG 要素には使えないため、生の HTML div + `innerHTML` で実装する
25. **`pac model genpage upload` の新規ページ作成はタイムアウトしやすい** — 新規ページ（`--name` 指定）は既存ページ更新（`--page-id` 指定）より大幅に遅い。`--prompt` と `--agent-message` は **英語または最短の文字列** にすると成功率が上がる。日本語の長い文字列はサーバー側処理が重くなりタイムアウト（「タスクが取り消されました」）の原因になる。失敗したら英語の短い値でリトライする
26. **`PublishXml` API はタイムアウトすることがある** — 公開処理は環境やサーバー応答状況によって完了まで時間がかかり、`PublishXml` がタイムアウトする場合がある。タイムアウトしたら、フォールバックとして `pac solution publish` を使う。PAC CLI 側の公開処理のほうが成功率が高い場合がある
27. **SiteMap 更新処理の `PublishXml` がハングしたら `pac solution publish` で代替** — プロジェクト側で用意した SiteMap 更新スクリプト／手順で SiteMap XML PATCH が成功しても、最後の `PublishXml`（アプリ公開）でハングする場合がある。この場合、その処理を中断（Ctrl+C / kill）して `pac solution publish` を実行すれば公開される。SiteMap XML 更新自体は PATCH 時点で確定しているため、公開さえ通れば問題ない
28. **URL パラメータ渡しはハッシュフラグメント（`#`）を使う** — MDA（モデル駆動型アプリ）の URL にカスタムクエリパラメータ（`&date=2026-04-24` 等）を追加すると、MDA ルーティングが不明なパラメータとしてエラーを返しページが開けない。**ハッシュフラグメント（`#date=2026-04-24`）を使う**。ハッシュはサーバーに送信されないため MDA ルーティングに干渉しない。GenPage 側では `window.location.hash` で読み取る

```typescript
// ❌ NG: クエリパラメータ → MDA ルーティングエラー
// https://org.crm7.dynamics.com/main.aspx?appid=...&pagetype=genux&id=...&date=2026-04-24

// ✅ OK: ハッシュフラグメント → MDA ルーティングに干渉しない
// https://org.crm7.dynamics.com/main.aspx?appid=...&pagetype=genux&id=...#date=2026-04-24

function getInitialDate(): string {
  try {
    var hash = window.location.hash || "";
    var m = hash.match(/date=([\d]{4}-[\d]{2}-[\d]{2})/);
    if (m) {
      var parsed = new Date(m[1] + "T00:00:00");
      if (!isNaN(parsed.getTime())) return m[1];
    }
  } catch (e) { /* ignore */ }
  return todayStr();
}
```

> **メール通知等で URL を生成する場合**: `approvalUrl = baseUrl + "#date=" + dateIso` のようにハッシュで日付を渡す。Power Automate フローのメール本文にリンクボタンとして埋め込む

29. **MDA メニューの GenPage タイトル修正はアプリデザイナーで手動変更が確実** — `pac model genpage upload --add-to-sitemap` で追加された SubArea のタイトルは、内部名（`--name` パラメータの値）がそのまま表示される。SiteMap XML を API で `<Titles>` 付きに PATCH + `PublishXml` しても、MDA クライアントキャッシュやマネージドレイヤーの影響で古い名前が残り続けることがある。**最も確実な修正方法はアプリデザイナーでの手動変更**。ただし **新規追加時は教訓 #30 の `Url` 属性方式を使えばこの問題は発生しない**:

```
修正手順:
1. アプリデザイナーを直接 URL で開く（AI がユーザーに提示する）:
   https://make.powerapps.com/e/{environment-id}/s/00000001-0000-0000-0001-00000000009b/app/edit/{app-id}
   - {environment-id}: .env の ENVIRONMENT_ID
   - {app-id}: pac model list で取得したアプリ ID
2. 左側ナビゲーションツリーで問題の GenPage ページを選択
3. 右パネルで「タイトル」を正しい名前に変更
4. 「保存して公開」をクリック
```

> **AI からユーザーへの案内パターン**: タイトル修正が必要な場合、以下のように直接リンクを提示する:
> 「以下の URL でアプリデザイナーを開き、ナビゲーションの該当ページのタイトルを変更してください:
> `https://make.powerapps.com/e/{env-id}/s/00000001-0000-0000-0001-00000000009b/app/edit/{app-id}`」

> **補足**: `pac model genpage upload --page-id <id> --name "正しい名前"` で内部名を更新する方法も併用可能だが、MDA キャッシュが強いため即座に反映されないことがある。アプリデザイナーでの変更は unmanaged カスタマイズとして最優先で適用されるため確実。**新規ページ作成時は `--add-to-sitemap` を使わず、SiteMap API で `Url` 属性 + `<Titles>` 付き SubArea を追加する（教訓 #30）のが最善策**。

30. **SiteMap SubArea は `GenPageId` ではなく `Url` 属性を使う** — `GenPageId="{page-id}"` 属性で GenPage を SiteMap に追加すると、MDA メニューに「新しいサブエリア」と表示され `<Titles>` が反映されないことがある。**`Url="/main.aspx?pagetype=genux&amp;id={page-id}"` 属性を使うと `<Titles>` が正しく表示される**（2026-04-24 検証済み）。既存エンティティ SubArea の直後に挿入し、`PublishXml` でアプリを公開する

```xml
<!-- ❌ NG: GenPageId 属性 → 「新しいサブエリア」と表示されることがある -->
<SubArea Id="sub_page" GenPageId="54dc32ce-bfcf-4899-8c25-0ac0436e2340" AvailableOffline="true">
  <Titles><Title LCID="1041" Title="日報承認" /></Titles>
</SubArea>

<!-- ✅ OK: Url 属性 → <Titles> が正しく MDA メニューに反映される -->
<SubArea Id="sub_dailyreport_approval" GetStartedPanePath=""
  Url="/main.aspx?pagetype=genux&amp;id=54dc32ce-bfcf-4899-8c25-0ac0436e2340"
  IntroducedVersion="7.0.0.0">
  <Titles>
    <Title LCID="1041" Title="日報承認" />
    <Title LCID="1033" Title="Daily Report Approval" />
  </Titles>
</SubArea>
```

> **実装パターン**: Python スクリプトで SiteMap XML を取得 → 正規表現で挿入位置を特定 → 新 SubArea を文字列結合で挿入 → `PATCH sitemaps({id})` → `PublishXml`。`yaml.dump()` や XML パーサーは不要（文字列操作で十分）

31. **OData アノテーション名を `select` に含めない** — `msdyn_workordertypename`、`msdyn_organizationalunitname` 等の `xxxname` フィールドは OData の `@OData.Community.Display.V1.FormattedValue` アノテーションであり、Dataverse の実カラムではない。DataAPI の `select` に指定すると 400 エラーが発生するが、GenPage ランタイムは try/catch でサイレントに失敗しデータが空配列になる。**対策**: 関連テーブル（`msdyn_workordertype` 等）を別クエリで取得し、`Map<string, string>` で FK ID → 名前のマッピングを構築する

```typescript
// ❌ NG: アノテーション名を select に含める → サイレント 400 エラー
var wos = await loadAllRows(api, "msdyn_workorder", {
  select: ["msdyn_workorderid", "msdyn_workordertypename"],  // ← 存在しないカラム
});

// ✅ OK: FK ID のみ select し、関連テーブルから名前マップを構築
var wos = await loadAllRows(api, "msdyn_workorder", {
  select: ["msdyn_workorderid", "_msdyn_workordertype_value"],
});
var woTypes = await loadAllRows(api, "msdyn_workordertype", {
  select: ["msdyn_workordertypeid", "msdyn_name"],
});
var typeNameMap = new Map<string, string>();
woTypes.forEach(function (t: any) { typeNameMap.set(fkId(t.msdyn_workordertypeid), t.msdyn_name || ""); });
```

> **見分け方**: カラム名が `_xxx_value` の形式なら FK ID（select 可能）。`xxxname` の形式なら OData アノテーション（select 不可）。確実に確認するには `RuntimeTypes.ts` を参照する。

32. **関連テーブルの集計は親レコードの日付を使う** — 子テーブル（WO Product 等）の `createdon` はデータ投入日であり実作業日ではない。期間別集計には、`_msdyn_workorder_value` で親 WO を参照し、WO の `createdon` や `msdyn_datewindowstart` で期間キーを生成する

```typescript
// ❌ NG: WO Product の createdon は投入日であり、実作業の月と一致しない
var period = product.createdon.substring(0, 7);  // "2026-05" (投入日)

// ✅ OK: 親 WO の createdon から期間を取得
var woDateMap = new Map<string, string>();
workorders.forEach(function (wo: any) {
  woDateMap.set(fkId(wo.msdyn_workorderid), wo.createdon ? wo.createdon.substring(0, 7) : "");
});
var woId = fkId(product._msdyn_workorder_value);
var period = woDateMap.get(woId) || "";  // "2026-04" (実作業月)
```

33. **スタック横棒は `d3.stack()` を使わず手動配置** — `d3.stack()` は全行で同一カテゴリセットを前提とし、カテゴリの欠落があるとバグが出やすい。単一ファイル構成の GenPage では、メンバーごとに `forEach` + `x0 += segWidth` で手動積み上げするほうがデバッグが容易で安全

34. **チャート3カラムレイアウトは `1fr 1fr auto`** — 左2列をデータ量に応じた均等幅にし、右列（ドーナツ等の固定幅チャート）を `auto` + `minWidth` で配置する。`repeat(3, 1fr)` だとドーナツの余白が大きくなりすぎる。`1fr auto` の2カラムから始め、チャートが増えたら `1fr 1fr auto` に拡張する

35. **D3 ツールチップは全チャートで1つの div を共有** — チャートごとに別の tooltip div を作ると、あるチャートのツールチップが別チャート領域に被ったときに消えない問題が起きる。`tooltipRef` を 1 つだけ作り、`showTip(html, ev)` / `moveTip(ev)` / `hideTip()` の 3 関数で全チャートの `mouseover` / `mousemove` / `mouseout` から呼び出す

## 開発フロー

### Step 0.5: モデル駆動型アプリ作成（Dataverse テーブル作成後・Generative Page 作成前）

> **Generative Page はモデル駆動型アプリのページとして動作する。**
> Dataverse テーブル作成（Phase 1）完了後、Generative Page のコード開発に入る前に、
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

[コードパターンリファレンス](references/code-patterns.md) に従い `.tsx` ファイルを作成する。

**基本構造:**

```typescript
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type {
  ReadableTableRow,
  GeneratedComponentProps,
  entity_name,
} from "./RuntimeTypes";
import {
  makeStyles,
  tokens,
  Card,
  Text,
  Button,
  Spinner,
  Input,
  Badge,
  Dropdown,
  Option,
  TabList,
  Tab,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
} from "@fluentui/react-components";
import {
  DismissRegular,
  OpenRegular,
  SaveRegular,
  SearchRegular,
  /* その他必要なアイコン */
} from "@fluentui/react-icons";
import * as d3 from "d3";

/* カラーパレット（全ページ共通 — 詳細は genpage-design-system.md 参照） */
var P = {
  blue: "#2563eb", blueDark: "#1d4ed8", blueLight: "#dbeafe",
  teal: "#0d9488", tealLight: "#ccfbf1",
  coral: "#dc2626", coralLight: "#fee2e2",
  amber: "#d97706", amberLight: "#fef3c7",
  red: "#dc2626", green: "#16a34a", greenLight: "#dcfce7",
  gray50: "#f9fafb", gray100: "#f3f4f6", gray200: "#e5e7eb",
  gray300: "#d1d5db", gray400: "#9ca3af", gray500: "#6b7280",
  gray700: "#374151", gray800: "#1f2937", gray900: "#111827",
  white: "#ffffff",
};

// ユーティリティ関数（loadAllRows, fkId, num, parseDate 等）
// サブコンポーネント（トップレベル関数）

/* ---------- スタイル ---------- */
const useStyles = makeStyles({
  root: { /* ... */ },
  /* モーダル・トースト用スタイルは不要 — インラインスタイルで実装 */
});

/* ---------- メインコンポーネント ---------- */
const GeneratedComponent = (props: GeneratedComponentProps) => {
  const styles = useStyles();
  const { dataApi } = props;

  /* --- データ state --- */
  const [items, setItems] = useState<ReadableTableRow<entity_name>[]>([]);
  const [loading, setLoading] = useState(true);

  /* --- モーダル state（★初回デプロイに必ず含める） --- */
  const [selectedItem, setSelectedItem] = useState<ReadableTableRow<entity_name> | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* openModal, closeModal, handleSave → code-patterns.md §15 参照 */

  return (
    <div className={styles.root}>
      {/* メインコンテンツ */}

      {/* ★ モーダル編集フォーム（Dialog + ボタン式 Choice） → code-patterns.md §15.4 */}

      {/* ★ トースト通知 → code-patterns.md §15.5 */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          padding: "10px 16px", borderRadius: 8,
          backgroundColor: P.teal, color: "#fff",
          fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>✓ {toast}</div>
      )}
    </div>
  );
};

export default GeneratedComponent;
```

> **★ モーダル・トースト・ボタン式 Choice は Tier 1 — 初回デプロイに必ず含める。**
> 完全な実装コードは [code-patterns.md §15](references/code-patterns.md) を参照。

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

### Step 5.5: SiteMap 更新（デプロイ後に必ず実施 — 省略禁止）

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

### Step 6: デバッグ

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
  const uiLang =
    (typeof Xrm !== "undefined" &&
      Xrm.Utility?.getGlobalContext()?.userSettings?.languageId) ||
    1041;
  if (uiLang === 1033) return { code: "en-US", name: "English" };
  return { code: "ja-JP", name: "Japanese" };
}

const T: Record<string, Record<string, string>> = {
  "ja-JP": { title: "ダッシュボード", save: "保存" },
  "en-US": { title: "Dashboard", save: "Save" },
};

// コンポーネント内
const lang = useMemo(() => detectLanguage(), []);
const t = useCallback(
  (k: string): string => T[lang.code]?.[k] || T["en-US"]?.[k] || k,
  [lang.code],
);
```

## D3.js チャートパターン

詳細は [コードパターンリファレンス](references/code-patterns.md) を参照。

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
const [state, setState] = useState({
  data: _cache,
  loading: _cache === null,
  error: null,
});
```

## Generative Page 構築フロー

Generative Pages は **いきなり KPI ダッシュボードを作らない**。
ユーザーに質問し、適切な構築パターンを選んでから段階的に構築する。

デザインパターン・UI カタログ・チャート選定ガイドの詳細は [デザインテンプレート](references/design-template.md) を参照。

### Step 0: ユーザーに質問する（最重要 — 必ず最初に行う）

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

### Step 1: 構築パターンの提案

ユーザーの回答に基づき、6 つの構築パターンから最適なものを選ぶ:

| パターン | 向いている場面 | 代表的コンポーネント |
|---|---|---|
| **A) 入力ウィザード** | データ登録・申請フォーム・セットアップ手順 | ステッププログレス、フォームセクション、バリデーション、プレビュー |
| **B) KPI ダッシュボード** | 経営層・マネージャー向け、全体像の俯瞰 | KPIカード、トレンドライン、ドーナツ、ゲージ、混合チャート |
| **C) カンバンボード** | タスク管理、案件管理、承認フロー | 4列レーン、DnDカード、ステータスサマリー、WIPリミット |
| **D) スケジュール管理（ガントチャート）** | 工程管理、メンテナンス計画、リソース割当 | D3横棒タイムライン、ズームコントロール、今日マーカー、依存線 |
| **E) 日本地図ダッシュボード** | 地域別パフォーマンス分析、都道府県データ可視化 | SVG日本地図 or Google Maps iframe、都道府県クリック、地方フィルタ、バブルオーバーレイ |
| **F) オブジェクトフロー** | 特定レコード中心の関連エンティティフロー可視化 | レコードセレクター、3列フロー図(D3)、詳細サイドバー、レコードモーダル、関連ハイライト |

選んだパターンのレイアウト・使用コンポーネントを提案し、承認を得る。

### Step 2: 最小デプロイ（Tier 1）

初回デプロイに含める要素（安定稼働を優先）:

1. パターン別のメインコンポーネント:
   - A → ステッププログレス + フォームセクション + ナビゲーションボタン
   - B → KPIカード + DataGrid
   - C → カンバンレーン + カード一覧 + レーンヘッダー
   - D → タスク一覧 + D3タイムライングリッド + 期間バー
2. モバイル対応（`useIsMobile()` + レスポンシブ対応）
3. 多言語対応（`detectLanguage()` + `T` 辞書）
4. ウィンドウキャッシュ（ページ遷移時のデータ保持）

**パターン F 固有の Tier 1 要素:**
- レコードセレクター (Dropdown + URLハッシュ初期値)
- 詳細データロード (`cancelled` フラグで競合防止)
- 3列フロー図 (D3 SVG + `<pattern>` ドットグリッド + ベジェエッジ)
- 詳細サイドバー (`role="button"` + `tabIndex=0` アクセシビリティ)
- レコードモーダル (Fluent UI Dialog + MDA フォームへ `encodeURIComponent` URL)
- `onItemClick` を `useCallback` で安定化 (FlowDiagram の不要再描画防止)
- 完全な実装例: [objectflow-example.tsx](references/objectflow-example.tsx)

**初回デプロイ後、Tier 2 の改善を提案する。**

### Step 3: チャート・ビジュアル追加（Tier 2 — ユーザーに提案）

> デプロイが完了しました！ さらに強化するなら、以下がおすすめです:
>
> 📊 **ビジュアル強化**
>   - アニメーション（fadeIn/scaleIn）で体感品質を向上
>   - ツールチップの統一デザインを適用
>   - カードのホバーエフェクト
>
> 📈 **チャート追加**（パターンに合わせて提案）
>   [パターンA: 入力ウィザード] バリデーション強化 / プレビューステップ / 条件分岐ステップ
>   [パターンB: KPI] トレンドライン / ゲージメーター / ウォーターフォール
>   [パターンC: カンバン] ドラッグ＆ドロップ / WIPリミット / スイムレーン
>   [パターンD: ガントチャート] ズーム切替 / 依存関係線 / 進捗率オーバーレイ
>   [パターンF: オブジェクトフロー] エンティティ一覧タブ / 分析チャート / フィルター
>
> どれを追加しますか？

### Step 4: 高度な UI（Tier 3 — さらなる提案）

> 視覚的な改善を適用しました。さらに改善するなら:
>   - 日本地図表示（D3 geoMercator + バブルマーカー）
>   - ダークモード対応（themeToVars パターン）
>   - リフレッシュボタン（スピンアニメーション付き）
>   - 追加チャート（業務要件に応じてカタログから選定）
>
> どれを追加しますか？

### テンプレート参照

| ファイル | 内容 |
|---|---|
| [design-template.md](references/design-template.md) | 6構築パターン（入力ウィザード/KPI/カンバン/ガント/日本地図/オブジェクトフロー）、UIカタログ、チャート選定ガイド |
| [genpage-design-system.md](references/genpage-design-system.md) | モダンデザインシステム（カラーパレット・セクションカード・ピル型バッジ・グラデーションボタン・ガント D3 バー・ツールチップ・トースト・日付ナビゲーション） |
| [japan-map-pattern.md](references/japan-map-pattern.md) | 日本地図パターン（SVG 方式 / Google Maps iframe 方式・都道府県別データ可視化・色分け・地方フィルタ・Dataverse 連携） |
| [objectflow-example.tsx](references/objectflow-example.tsx) | Pattern F 完全実装例（オブジェクトフロー：3列フロー図・詳細サイドバー・レコードモーダル・関連ハイライト） |
| [objectflow-RuntimeTypes.ts](references/objectflow-RuntimeTypes.ts) | Pattern F 用 Dataverse 型定義（account・opportunity・quote・salesorder 等） |
| [code-patterns.md](references/code-patterns.md) | DataAPI・D3 チャート・DataGrid のコードパターン |
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

`pac model genpage upload` の `--add-to-sitemap` は使わない。タイトルなしの「新しいサブエリア」が作成される。

**正しいパターン:** `deploy_model_app.py` の SiteMap XML に `GenPageId` + `<Titles>` 付き SubArea を追加。
SiteMap VectorIcon で使える組み込みアイコンの一覧は `standard` スキルの [アイコン作成リファレンス](../standard/references/icon-creation.md) を参照。

```xml
<SubArea Id="sub_genpage" GenPageId="{page-id}" VectorIcon="/_imgs/TableIconsFluentV9/document_one_page_sparkle.svg" AvailableOffline="true">
  <Titles><Title LCID="1041" Title="ページ名" /><Title LCID="1033" Title="Page Name" /></Titles>
</SubArea>
```

`.env` に `GENPAGE_ID`, `GENPAGE_TITLE_JA`, `GENPAGE_TITLE_EN` を設定し、デプロイスクリプトから自動的に SiteMap に含める。
