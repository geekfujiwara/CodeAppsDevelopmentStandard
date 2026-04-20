# Generative Pages トラブルシューティング

## 1. PAC CLI 関連

### 1.1 `pac model genpage upload` が失敗する

**症状**: `Error: The term 'pac' is not recognized` またはバージョンエラー

**対処**:

```powershell
# PAC CLI のバージョン確認（>= 2.3.1 必須）
pac help

# 最新版に更新
dotnet tool update --global Microsoft.PowerApps.CLI.Tool
```

### 1.2 認証エラー

**症状**: `Error: No active auth profile found`

**対処**:

```powershell
# 認証プロファイル確認
pac auth list

# 新規作成（対話式ブラウザ認証）
pac auth create --environment https://your-env.crm7.dynamics.com

# 既存プロファイルに切り替え
pac auth select --index <n>
```

### 1.3 `generate-types` でテーブルが見つからない

**症状**: `Table 'xxx' not found`

**対処**:

- テーブルの論理名（例: `cr123_store`）を使用しているか確認。表示名（例: `店舗`）は不可
- 認証先の環境にそのテーブルが存在するか確認
- カンマ区切りにスペースを入れない: `"entity1,entity2"` ✅ / `"entity1, entity2"` ❌

### 1.4 デプロイ後にページが更新されない

**対処**:

1. ブラウザのハードリロード（Ctrl+Shift+R）
2. ブラウザキャッシュクリア
3. Power Apps のプレビューキャッシュ: URL に `&clearcache=1` パラメータ追加
4. InPrivate / シークレットウィンドウで確認

## 2. ランタイムエラー

### 2.1 `TypeError: xxx is not a function` (Map/Set イテレーション)

**原因**: Power Apps ランタイムは ES6 イテレータプロトコルを完全サポートしていない。`for...of` を `Map` / `Set` に使うとイテレータエラーが発生する。

**NG**:

```typescript
for (const [key, value] of myMap) {
  /* エラー！ */
}
for (const item of mySet) {
  /* エラー！ */
}
```

**OK**:

```typescript
myMap.forEach((value, key) => {
  /* OK */
});
mySet.forEach((item) => {
  /* OK */
});

// 配列化してからイテレーション
const entries = [...myMap.entries()];
entries.forEach(([key, value]) => {
  /* OK */
});
```

> **注意**: 配列に対する `for...of` は問題ない。制限は `Map` と `Set` のみ。

### 2.2 `.rows` が配列メソッドを持たない

**原因**: `dataApi.queryTable()` の返却値 `res.rows` は配列風オブジェクトだが、純粋な配列ではない場合がある。

**対処**: 必ずスプレッドで配列化する:

```typescript
let rows = [...res.rows]; // ✅
// let rows = res.rows;     // ❌ 配列メソッドが動かない場合あり
```

### 2.3 `FluentProvider` を追加すると描画が壊れる

**原因**: Power Apps ランタイムはルートで `FluentProvider` を既に提供している。再度ラップすると React 17 でダブルレンダーが発生し、テーマやスタイルが壊れる。

**対処**: `FluentProvider` は絶対に追加しない。ダークモードは `themeToVars` パターンを使用（[コードパターン](./code-patterns.md) セクション 5 参照）。

### 2.4 `100vh` / `100vw` でレイアウトが壊れる

**原因**: Generative Page はモデル駆動型アプリのフレーム内に表示される。`100vh` はフレーム全体の高さではなくビューポート全体を取るため、スクロールやオーバーフローが発生する。

**対処**:

```typescript
// ❌
const useStyles = makeStyles({ root: { height: "100vh", width: "100vw" } });

// ✅
const useStyles = makeStyles({
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
  },
});
```

### 2.5 コンポーネントが真っ白（何も表示されない）

**チェックリスト**:

1. `export default GeneratedComponent` が存在するか？
2. コンポーネント名が `GeneratedComponent` か？
3. `props: GeneratedComponentProps` の型が正しいか？
4. `useEffect` 内で未処理の例外が発生していないか？
5. ブラウザの DevTools console でエラーを確認

### 2.6 データが空（ロードされない）

**チェックリスト**:

1. `generate-types` でスキーマ生成済みか？
2. `upload` 時に `--data-sources` で対象テーブルを指定したか？
3. カラム名（`select` 配列）は `RuntimeTypes.ts` のものと一致しているか？
4. `filter` 文字列の構文は正しいか？（OData フィルター構文）
5. テーブルにデータが存在するか？（Power Apps の Advanced Find で確認）

### 2.7 `renderCell is not a function`（DataGrid ランタイムエラー）

**原因**: DataGridBody → DataGridRow の JSX で `>` と `{({ renderCell })` の間に余分な空白・改行があると、React がテキストノードを子要素として扱い、DataGridRow が render prop の代わりにテキストを関数として呼び出す。

**NG（空白がテキストノードになる）**:

```tsx
<DataGridRow<MyEntity> key={rowId}>
  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
</DataGridRow>
```

**OK（同一行に記述）**:

```tsx
<DataGridRow<MyEntity> key={rowId}>
  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
</DataGridRow>
```

**OK（改行するなら `>` の直後に `{`）**:

```tsx
<DataGridRow<MyEntity> key={rowId}>
  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
</DataGridRow>
```

> **教訓**: DataGridBody と DataGridRow は render prop パターン（子要素として関数を受け取る）。
> JSX の子要素位置に余計なテキストが入ると render prop が壊れる。
> 安全策として **DataGridRow 全体を1行に書く**。

## 3. TypeScript / ビルドエラー

### 3.1 `Cannot find module './RuntimeTypes'`

**対処**: `generate-types` を実行して `RuntimeTypes.ts` を生成する。このファイルは IDE 上の型チェック用で、アップロード時には自動解決される。

### 3.2 型エラー: DataAPI の `select` / `filter`

**対処**: `as any` でキャストして回避:

```typescript
const res = await dataApi.queryTable("entity_name" as any, {
  select: ["field1", "field2"] as any,
  filter: "field1 ne null",
});
```

### 3.3 `@fluentui/react-icons` のサイズ付きバリアントエラー

**症状**: `Module '"@fluentui/react-icons"' has no exported member 'Add24Regular'`

**対処**: サイズなしバリアントを使用:

```typescript
// ❌
import { Add24Regular } from "@fluentui/react-icons";

// ✅
import { AddRegular } from "@fluentui/react-icons";
```

## 4. レイアウト・スタイル問題

### 4.1 横スクロールが発生する

**原因**: 固定幅の要素がコンテナ幅を超えている。

**対処**:

```typescript
const useStyles = makeStyles({
  root: {
    maxWidth: "100%",
    overflow: "hidden", // または "auto"
    boxSizing: "border-box",
  },
  chart: {
    width: "100%", // 固定幅ではなく相対幅
    minWidth: 0, // flex child の shrink 有効化
  },
});
```

### 4.2 D3 チャートがレスポンシブにならない

**対処**: **`viewBox` は使わない**（ルール 19 参照）。コンテナの `clientWidth` から動的にサイズを取得する:

```typescript
// ❌ NG: viewBox + height: "auto"（Generative Pages で高さ 0px になる）
svg.attr("viewBox", `0 0 ${width} ${height}`);
// JSX: <svg ref={ref} style={{ width: "100%", height: "auto" }} />

// ✅ OK: 明示的 width/height（requestAnimationFrame 内で取得）
var container = svgRef.current.parentElement;
var W = container ? container.clientWidth : 400;
if (W < 200) W = 400;
var H = 200;
svg.attr("width", W).attr("height", H);
// JSX: <div style={{ height: 200, overflow: "hidden" }}><svg ref={ref} style={{ display: "block" }} /></div>
```

### 4.3 地図表示で特定ブラウザのみ問題

**対処**:

- SVG パスに `transform` を使用する場合は `transform-origin` も指定
- `pointer-events="all"` を SVG 要素に追加してクリックイベントを確実に受ける
- Edge / Chrome でのテストを推奨

## 5. パフォーマンス

### 5.1 大量データでページが遅い

**対処**:

1. `pageSize: 250` でページネーション（デフォルト 250）
2. 必要なカラムのみ `select` で指定（不要なカラムを含めない）
3. 集計はフロントで一度だけ実行し `useMemo` でキャッシュ
4. ウィンドウキャッシュパターン（[コードパターン](./code-patterns.md) セクション 10）でページ遷移を高速化
5. DataGrid は仮想スクロールが組み込まれているので大量行に向いている

### 5.2 D3 チャートの再描画が重い

**対処**:

- `useEffect` の依存配列を適切に設定（不要な再描画を防止）
- `svg.selectAll("*").remove()` でクリーンアップ後に描画
- `useMemo` でチャートデータの変換を一度だけ実行

## 6. デプロイのベストプラクティス

```
1. ローカルで TypeScript エラーがないことを確認
2. 最小構成で初回デプロイ → 動作確認
3. 機能を段階的に追加し、各段階でデプロイ・確認
4. エラー発生時はブラウザ DevTools の Console を確認
5. ハードリロード（Ctrl+Shift+R）でキャッシュを無効化
6. 新規ページは --prompt と --agent-message を英語短縮文字列にする（§7.8 参照）
7. 成功したら Page ID を .env に保存し、以降は --page-id で更新する
8. PublishXml がタイムアウトしたら pac solution publish でフォールバック（§7.9 参照）
```

## 7. DataAPI の書き込み制限

### 7.1 `dataApi.updateRecord is not a function`

**原因**: Generative Pages の `dataApi`（`props.dataApi`）は **読み取り専用 API**。`queryTable()` と `getChoices()` のみ提供される。`updateRecord()`, `createRecord()`, `deleteRecord()` は存在しない。

**対処**: 書き込み操作は `Xrm.WebApi.online` を使用する:

```typescript
// ❌ dataApi には書き込みメソッドがない
await dataApi.updateRecord("my_entity", id, { field: value });
await dataApi.createRecord("my_entity", { field: value });

// ✅ Xrm.WebApi.online を使用（モデル駆動型アプリで利用可能）
await (window as any).Xrm.WebApi.online.updateRecord("my_entity", id, { field: value });
await (window as any).Xrm.WebApi.online.createRecord("my_entity", { field: value });
await (window as any).Xrm.WebApi.online.deleteRecord("my_entity", id);
```

> **教訓**: `dataApi` はデータ読み取り（queryTable, getChoices）のみ。書き込みは必ず `Xrm.WebApi.online` を経由する。

### 7.2 モーダル保存後にダイアログが閉じない

**原因**: `try { ... closeModal(); } finally { setSaving(false); }` の順序で、`finally` の `setSaving(false)` がステート競合を引き起こす場合がある。

**対処**: `setSaving(false)` を `closeModal()` の前に明示的に呼び、`finally` は使わない:

```typescript
async function handleSave() {
  if (!selectedItem) return;
  setSaving(true);
  try {
    await (window as any).Xrm.WebApi.online.updateRecord(...);
    // ローカルステート更新
    setItems(function (prev) { return prev.map(...); });
    setSaving(false);        // ← finally ではなくここ
    setSelectedItem(null);   // ← モーダルを閉じる
    setToast("更新しました");
    setTimeout(function () { setToast(null); }, 3000);
  } catch (e) {
    console.error("save error", e);
    setSaving(false);
  }
}
```

### 7.3 D3 チャートが表示されない（SVG が 0px）

**原因**: `svg.attr("viewBox", "0 0 W H")` + JSX の `style={{ height: "auto" }}` を使うと、Generative Pages ランタイムでは SVG の高さが 0px に解決される。viewBox に依存したレスポンシブ SVG は動作しない。

**対処**: `viewBox` を使わず、明示的にピクセルで `width`/`height` を設定する:

```typescript
// ❌ NG: viewBox + height: "auto"
svg.attr("viewBox", "0 0 500 200");
// JSX: <svg ref={ref} style={{ width: "100%", height: "auto" }} />

// ✅ OK: 明示的 width/height
var container = svgRef.current.parentElement;
var W = container ? container.clientWidth : 400;
var H = 200;
svg.attr("width", W).attr("height", H);
// JSX: <div style={{ height: 200, overflow: "hidden" }}><svg ref={ref} style={{ display: "block" }} /></div>
```

**重要**: SVG のラッパー `<div>` にも明示的な `height` を設定すること。`height: "auto"` は禁止。

### 7.4 チャートがタブ切替後に表示されない

**原因**: `useEffect` のチャート描画が最初のレンダー時にのみ実行され、タブ切替後の再表示時に実行されない。

**対処**: `activeTab` を useEffect の依存配列に含め、タブがアクティブなときのみ描画する:

```typescript
useEffect(function () {
  if (!svgRef.current || data.length === 0 || activeTab !== "charts") return;
  // D3 描画ロジック
}, [data, activeTab]);  // ← activeTab を依存に含める
```

### 7.5 チャートが初回ロード時に表示されない（タブ切替で表示される）

**原因**: データ取得完了時に `loading=false` + データセットが同一レンダーサイクルで実行される。このとき:
1. Spinner が非表示になり SVG 要素が DOM に追加される（条件レンダリング）
2. 同レンダーサイクルで `statusData` が `[]` → `[{...}]` に変わり useEffect が発火
3. `ref.current` は存在するが、ブラウザのレイアウトパスが未完了で `clientWidth` が 0 になる場合がある
4. タブ切替で復帰するのは、再マウント後のフレームでは DOM が安定しているため

**対処**: `requestAnimationFrame` で D3 描画を次のペイントフレームに遅延する:

```typescript
useEffect(function () {
  if (data.length === 0 || activeTab !== "charts") return;
  var raf = requestAnimationFrame(function () {
    if (!svgRef.current) return;  // ★ ref チェックは rAF 内で行う
    var svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    var container = svgRef.current.parentElement;
    var W = container ? container.clientWidth : 400;
    if (W < 200) W = 400;
    var H = 200;
    svg.attr("width", W).attr("height", H);
    // ... D3 描画ロジック ...
  });
  return function () { cancelAnimationFrame(raf); };  // ★ クリーンアップ必須
}, [data, activeTab]);
```

**重要ポイント**:
- `if (!ref.current)` チェックは useEffect の先頭ではなく **rAF コールバック内** に移動する（タブ切替中に ref が null になる可能性あり）
- `cancelAnimationFrame` をクリーンアップで返す（高速タブ切替時のゴースト描画を防止）
- `data.length === 0` と `activeTab !== "charts"` のガードは rAF **外** に置く（不要な rAF 登録を防止）

### 7.6 ガントチャート等のギャラリー行が D3 の行位置とズレる

**原因**: HTML ギャラリー側で `minHeight` + padding を使うと実際のレンダリング高さが予測不能になり、D3 の `scaleBand().padding()` で計算した位置と合わなくなる。

**対処**: 両方を固定ピクセルで統一する:

```typescript
// HTML ギャラリー側
var rowH = 36;
var headerH = 28;
// 各行のスタイル:
{ height: rowH, boxSizing: "border-box", overflow: "hidden" }

// D3 SVG 側（scaleBand を使わず手動計算）
var yPos = headerH + i * rowH;  // i = 行インデックス
rect.attr("y", yPos + 4)        // 上下 4px マージン
    .attr("height", rowH - 8);  // 行高 - マージン*2
```

**禁止パターン**:
- `minHeight: "36px"` — 内容により可変になる
- `scaleBand().padding(0.2)` — padding 計算が HTML 側の実際のレンダリングと一致しない
- `transform: translateY()` で位置を調整する — 根本解決にならない

### 7.7 DatePicker のポップアップが透明で背後のコンテンツと重なる

**原因**: `@fluentui/react-datepicker-compat` の `DatePicker` は Portal 経由でカレンダーポップアップをレンダリングする。Generative Pages ランタイムでは Portal コンテナに背景色が適用されず、ポップアップが透明になる。`popupSurface` プロップでスタイルを指定しても反映されない。

**対処**: DatePicker を使わず、Fluent UI `Input` に `type: "date"` を指定してブラウザネイティブの日付ピッカーを使う:

```typescript
// ❌ NG: DatePicker（透明ポップアップ問題）
import { DatePicker } from "@fluentui/react-datepicker-compat";
React.createElement(DatePicker, {
  value: date,
  onSelectDate: function (d) { setDate(d || null); },
});

// ✅ OK: Input type="date"（ブラウザネイティブ）
React.createElement(Input, {
  type: "date",
  value: date
    ? date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0")
    : "",
  onChange: function (_, d) {
    if (d.value) {
      var parts = d.value.split("-");
      setDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    } else {
      setDate(null);
    }
  },
  style: { maxWidth: 300 },
});
```

**注意**: `popupSurface` プロップや CSS 注入（`<style>` タグ挿入）でも解決できなかった（2026-04-21 検証済み）。

### 7.8 新規ページの `pac model genpage upload` が「タスクが取り消されました」で失敗する

**症状**: TypeScript トランスパイル成功後、`Pushing generated page...` のまま長時間待機し、最終的に以下のエラーで失敗する:

```
Error: Error updating project in batch: タスクが取り消されました。
    タスクが取り消されました。
```

**原因**: 新規ページ作成（`--name` 指定）はサーバー側の処理が重い。`--prompt` や `--agent-message` に日本語の長い文字列を指定すると、サーバー側のタイムアウトを超過する。

**対処**:

1. **`--prompt` と `--agent-message` を英語の短い文字列にする**:

```powershell
# ❌ NG: 日本語の長い説明文（タイムアウトしやすい）
pac model genpage upload --app-id <id> --code-file Page.tsx --name "Page" `
  --data-sources "table1,table2" `
  --prompt "4レーンカンバンボード: ドラッグ＆ドロップでステータス変更" `
  --agent-message "未着手/作業中/完了/保留の4レーンカンバンボード"

# ✅ OK: 英語の短い文字列（成功率が高い）
pac model genpage upload --app-id <id> --code-file Page.tsx --name "Page" `
  --data-sources "table1,table2" `
  --prompt "kanban" `
  --agent-message "kanban board"
```

2. **失敗したらリトライ**（サーバー側の一時的な問題の場合もある）
3. **既存ページ更新（`--page-id`）ではこの問題は発生しにくい** — 新規作成時のみの制限

**検証結果** (2026-04-21):
- 日本語 `--prompt` + `--agent-message`: 3回連続タイムアウト
- 英語短縮 `--prompt "kanban" --agent-message "kanban board"`: 1回目で成功

### 7.9 `PublishXml` API がタイムアウトする（SiteMap 更新後の公開）

**症状**: `update_sitemap.py` で SiteMap XML の PATCH は成功するが、最後の `PublishXml` API 呼び出しで 120 秒以上応答がなくタイムアウトする:

```
requests.exceptions.ReadTimeout: HTTPSConnectionPool(host='xxx.crm7.dynamics.com', port=443): Read timed out. (read timeout=120)
```

**原因**: `PublishXml` はサーバー側で全カスタマイズを公開する重い処理。環境の負荷状況やカスタマイズの量によっては 120 秒では完了しない。

**対処**: `pac solution publish` をフォールバックとして使う:

```powershell
# Python スクリプトの PublishXml がタイムアウトした場合:
# 1. スクリプトを中断（Ctrl+C / kill）
# 2. PAC CLI で公開（独自のタイムアウト管理で成功率が高い）
pac solution publish
```

**重要**: SiteMap XML の PATCH は `PublishXml` の前に完了しているため、`pac solution publish` で公開さえ通れば SiteMap の変更は反映される。

### 7.10 新規ページ作成が既存ページ更新より大幅に遅い

**症状**: `--page-id` 指定の既存ページ更新は数秒〜数十秒で完了するが、`--name` 指定の新規ページ作成は数分かかる、またはタイムアウトする。

**原因**: 新規ページ作成はサーバー側で以下の追加処理が発生する:
- ページレコードの作成
- Generative Page プロジェクトの初期化
- AI モデルとの関連付け

**対処**:
1. 新規作成は余裕を持ったタイムアウトを想定する
2. `--prompt` と `--agent-message` を英語の短い文字列にする（§7.8 参照）
3. 一度作成に成功したら Page ID を `.env` に保存し、以降は `--page-id` で更新する
4. 作成成功後の初回確認はブラウザのハードリロード（Ctrl+Shift+R）を行う
