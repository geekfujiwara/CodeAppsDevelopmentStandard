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
for (const [key, value] of myMap) { /* エラー！ */ }
for (const item of mySet) { /* エラー！ */ }
```

**OK**:
```typescript
myMap.forEach((value, key) => { /* OK */ });
mySet.forEach((item) => { /* OK */ });

// 配列化してからイテレーション
const entries = [...myMap.entries()];
entries.forEach(([key, value]) => { /* OK */ });
```

> **注意**: 配列に対する `for...of` は問題ない。制限は `Map` と `Set` のみ。

### 2.2 `.rows` が配列メソッドを持たない

**原因**: `dataApi.queryTable()` の返却値 `res.rows` は配列風オブジェクトだが、純粋な配列ではない場合がある。

**対処**: 必ずスプレッドで配列化する:
```typescript
let rows = [...res.rows];  // ✅
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
    width: "100%",     // 固定幅ではなく相対幅
    minWidth: 0,       // flex child の shrink 有効化
  },
});
```

### 4.2 D3 チャートがレスポンシブにならない

**対処**: `viewBox` + `width: "100%"` パターンを使用:
```typescript
svg
  .attr("viewBox", `0 0 ${width} ${height}`)

// JSX
<svg ref={svgRef} style={{ width: "100%", height: "auto" }} />
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
```
