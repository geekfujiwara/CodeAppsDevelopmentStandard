# プレデプロイレビュー（ビルド前自動チェック）

「デプロイして」「プッシュして」が実行されるたびに、ビルド前に自動で以下のレビューを行う。

## チェック項目

### 1. dataSourcesInfo 整合性チェック

コード内で使用されている全データソース（Dataverse テーブル・Power Automate フロー・Copilot Studio コネクタ）が
`src/generated/appschemas/dataSourcesInfo.ts` または `.power/schemas/appschemas/dataSourcesInfo.ts` に登録されているか確認する。

**チェック方法:**

```bash
# 1. コード内で使用されているテーブル名を抽出
#    retrieveMultipleRecordsAsync / retrieveRecordAsync の第一引数
Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx | \
  Select-String -Pattern 'Record(?:s)?Async\("([^"]+)"' -AllMatches | \
  ForEach-Object { $_.Matches | ForEach-Object { $_.Groups[1].Value } } | \
  Sort-Object -Unique

# 2. dataSourcesInfo に登録済みのテーブルを抽出
Select-String -Path "src/generated/appschemas/dataSourcesInfo.ts" \
  -Pattern '^\s+"([a-z_]+)":\s*\{' | \
  ForEach-Object { $_.Matches[0].Groups[1].Value }

# 3. 差分を確認（使用されているが未登録のテーブル）
```

**未登録テーブルが見つかった場合の対処:**

```bash
# pac code add-data-source で追加する（手動追記禁止）
# 日本語表示名エラーが出る場合は toggle_table_lang.py を使う
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t {table_logical_name}
python scripts/toggle_table_lang.py jp
```

> **手動で `dataSourcesInfo.ts` にカスタムテーブル定義を追記してはならない。**
> SDK が `.power/schemas/appschemas/dataSourcesInfo.ts` を自動生成する。
> `src/lib/dataSourcesInfo.ts` には、SDK で追加できないシステムテーブル
> （`systemuser`, `bot`, `conversationtranscript` 等）とコネクタのみ手動追記する。

### 2. 統合 dataSourcesInfo インポートチェック【必須】

全サービス・コンポーネントが **統合版 `@/lib/dataSourcesInfo`** をインポートしているか確認する。
`@/generated/appschemas/dataSourcesInfo` を直接インポートしているファイルがあればエラー。

> **実際に発生した障害（2026-05-01）:**
> `src/services/booking-service.ts` が `@/generated/appschemas/dataSourcesInfo`（Dataverse のみ）を直接使用していた。
> `getClient()` はシングルトンのため、booking-service が先に初期化されると `dataSourcesInfo` に
> Copilot Studio コネクタ（`microsoftcopilotstudio`）やフローコネクタ（`logicflows`）が含まれず、
> `MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2` が `{"success":false,"error":{}}` を返した。
> 統合版 `@/lib/dataSourcesInfo` に修正することで解決。

**チェック方法:**

```bash
# アプリコード（src/services, src/components, src/pages 等）で
# generated 版を直接参照しているファイルを検出
# ※ src/lib/dataSourcesInfo.ts 自身と src/generated/ 内は除外
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" -File |
  Where-Object { $_.FullName -notlike "*\lib\dataSourcesInfo*" -and $_.FullName -notlike "*\generated\*" } |
  Select-String -Pattern 'from\s+[''"]@/generated/appschemas/dataSourcesInfo[''"]'
```

**違反が見つかった場合:**

```typescript
// ❌ 直接インポート（getClient シングルトン問題でフロー・Copilot Studio が使えなくなる）
import { dataSourcesInfo } from "@/generated/appschemas/dataSourcesInfo";

// ✅ 統合版インポート（Dataverse + フロー + Copilot Studio 全て含む）
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
```

**なぜ統合版が必要か:**

| ファイル | 含むもの |
|---|---|
| `src/generated/appschemas/dataSourcesInfo.ts` | Dataverse テーブルのみ |
| `.power/schemas/appschemas/dataSourcesInfo.ts` | フロー・Copilot Studio コネクタのみ |
| `src/lib/dataSourcesInfo.ts`（統合版） | 上記両方をマージ（`{...generated, ...power}`） |

### 3. SDK 生成サービスのインポート元チェック

`src/generated/services/` のサービスファイルが `../../lib/dataSourcesInfo` をインポートしていることを確認。
**`npx power-apps add-data-source` でテーブル追加すると、SDK がサービスファイルを再生成し、
インポート先が `../appschemas/dataSourcesInfo` に戻ることがある。**

**チェック方法:**

```bash
# generated サービスが appschemas 版を直接参照していないか確認
Select-String -Path "src/generated/services/*.ts" `
  -Pattern 'from\s+[''"]\.\.\/appschemas\/dataSourcesInfo[''"]'
```

**違反が見つかった場合:**

```typescript
// ❌ SDK 再生成でリセットされた状態
import { dataSourcesInfo } from '../appschemas/dataSourcesInfo';

// ✅ 統合版を参照
import { dataSourcesInfo } from '../../lib/dataSourcesInfo';
```

### 4. カスタム getClient() の dataSourcesInfo 引数チェック

`getClient(dataSourcesInfo)` を呼ぶカスタムサービスが、統合版の `dataSourcesInfo` を使っていることを確認する。

**チェック方法:**

```bash
# getClient を呼んでいるファイルを列挙し、それぞれの dataSourcesInfo の import 元を確認
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" -File |
  Where-Object { $_.FullName -notlike "*\generated\*" } |
  Select-String -Pattern 'getClient\(dataSourcesInfo\)' |
  ForEach-Object {
    $file = $_.Path
    $importLine = Select-String -Path $file -Pattern 'import.*dataSourcesInfo.*from' | Select-Object -First 1
    [PSCustomObject]@{ File = $file; Import = $importLine.Line.Trim() }
  } | Format-Table -Wrap
```

### 5. ルーター種別チェック（createHashRouter 必須）

Code Apps は Power Apps iframe 内でホストされるため、`createBrowserRouter`（History API）は初期ロードで 404 になる。
必ず `createHashRouter` を使用すること。

**チェック方法:**

```bash
# createBrowserRouter の使用を検出
Select-String -Path "src/**/*.ts","src/**/*.tsx" -Pattern 'createBrowserRouter' -Recurse
```

**違反が見つかった場合:**

```typescript
// ❌ Power Apps iframe 内で初期ロード 404
import { createBrowserRouter, Navigate } from "react-router-dom";
export const router = createBrowserRouter([...]);

// ✅ Hash ルーティングで確実に動作
import { createHashRouter, Navigate } from "react-router-dom";
export const router = createHashRouter([...]);
```

#### 5-1. createHashRouter に basename を渡してはならない

> **実際に発生した障害（2026-06-11）:**
> `createBrowserRouter` → `createHashRouter` に変更した際、`basename` オプションをそのまま残したところ、
> 全ルートがマッチしなくなり白紙画面になった。

`createHashRouter` はルーティングを `#` 以降で行うため、`basename`（パス名ベース）は不要。
`basename` を渡すとハッシュ部分に余計なパスプレフィックスが追加され、ルートが一切マッチしなくなる。

```typescript
// ❌ basename を渡す → 白紙画面（全ルート不一致）
export const router = createHashRouter([...], {
  basename: BASENAME,
});

// ✅ basename なし
export const router = createHashRouter([...]);
```

**チェック方法:**

```bash
# createHashRouter に basename が渡されていないか確認
Select-String -Path "src/router.tsx" -Pattern 'basename'
```

### 5b. scrollIntoView 使用チェック

Radix UI `ScrollArea` 内で `scrollIntoView()` を使ってはならない。
`scrollIntoView` は ScrollArea の内部コンテナだけでなくページ全体の祖先要素もスクロールさせるため、
画面が意図せずジャンプする。

> **実際に発生した障害（2026-06-11）:**
> 会話チャットパネルで `bottomRef.current?.scrollIntoView({ behavior: "smooth" })` を使ったところ、
> 会話を選択するたびにページ全体が上下に飛び回った。

**チェック方法:**

```bash
# ScrollArea を使っているファイルで scrollIntoView の使用を検出
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" -File |
  Select-String -Pattern 'scrollIntoView' |
  ForEach-Object { $_.Path + ":" + $_.LineNumber + " → " + $_.Line.Trim() }
```

**代替案:**
- `key` prop でコンポーネントを再マウントする（ScrollArea がリセットされ先頭から表示）
- ScrollArea の Viewport ref を取得して `viewport.scrollTop = viewport.scrollHeight` で制御する

### 5a. React フック規則チェック

React のフック規則違反（条件付きフック呼び出し）は本番でのみクラッシュすることがある（React error #310）。
**早期 return の前にすべてのフック（useState, useMemo, useQuery 等）を配置すること。**

```typescript
// ❌ 早期 return の後に useMemo → ロード完了時にフック数が変わりクラッシュ
export default function Page() {
  const { data, isLoading } = useQuery(...);
  if (isLoading) return <Loading />;
  const computed = useMemo(() => ..., [data]); // ← ここでクラッシュ
}

// ✅ すべてのフックを早期 return の前に配置
export default function Page() {
  const { data, isLoading } = useQuery(...);
  const computed = useMemo(() => data ? ... : fallback, [data]);
  if (isLoading) return <Loading />;
  // computed を安全に使用
}
```

### 6. サイドバー fixed レイアウトチェック

サイドバーが flex レイアウト内に固定幅なしで配置されていると、ページ遷移時に幅が崩れる。
`fixed` ポジション + 固定幅（`w-64`）が必須。

**チェック方法:**

```bash
# Sidebar コンポーネントが fixed であることを確認
Select-String -Path "src/components/sidebar.tsx" -Pattern 'fixed'

# メインコンテンツに ml-64 オフセットがあることを確認
Select-String -Path "src/pages/_layout.tsx" -Pattern 'ml-64|ml-16'
```

**違反パターン:**

```tsx
// ❌ flex 内に幅指定なし → ページ遷移で崩れる
<div className="flex flex-1">
  <Sidebar />
  <div className="flex-1"><Outlet /></div>
</div>

// ✅ fixed + 固定幅 + margin オフセット
<aside className="fixed top-16 bottom-0 w-64 ...">...</aside>
<div className="flex-1 md:ml-64"><Outlet /></div>
```

## 実行フロー

```
「デプロイして」/「プッシュして」
  │
  ├─ ① dataSourcesInfo 整合性チェック
  │     → 未登録テーブルがあれば追記
  │
  ├─ ② 統合 dataSourcesInfo インポートチェック（アプリコード）
  │     → @/generated 直接参照を @/lib に修正
  │
  ├─ ③ SDK 生成サービスのインポート元チェック
  │     → ../appschemas/ を ../../lib/ に修正
  │
  ├─ ④ カスタム getClient() の引数チェック
  │     → 全て統合版 dataSourcesInfo を使用していることを確認
  │
  ├─ ⑤ ルーター種別チェック（createHashRouter 必須）
  │     → createBrowserRouter を使っていたら createHashRouter に修正
  │     → createHashRouter に basename が渡されていないことを確認
  │
  ├─ ⑤a scrollIntoView 使用チェック
  │     → ScrollArea 内で scrollIntoView を使っていないことを確認
  │     → 使用箇所があれば削除（ページ全体がジャンプする原因）
  │
  ├─ ⑥ サイドバー fixed レイアウトチェック
  │     → Sidebar が fixed + 固定幅（w-64）であることを確認
  │     → メインコンテンツに md:ml-64 のオフセットがあることを確認
  │
  ├─ ⑦ ナビ ↔ ルーター整合性チェック（自動: npm run predeploy）
  │     → config.ts に template: true が残っていないか → エラー
  │     → config.ts のナビにルーターが無いパスが無いか → エラー
  │     → ルーターにナビが無いパスが無いか → 警告
  │
  ├─ ⑧ npm run build
  │     → TypeScript エラーがあれば修正
  │
  └─ ⑨ npx power-apps push / pac code push
        → デプロイ完了
```

## 理由

- `getClient()` はシングルトンのため、最初に渡される `dataSourcesInfo` に全データソースが含まれていないと、
  後から初期化し直すことができない
- フロー・Copilot Studio コネクタは `.power/schemas/appschemas/dataSourcesInfo.ts` にのみ存在するため、
  `src/generated` 版だけを使うとコネクタが見つからない
- テーブルが `dataSourcesInfo` に未登録だと、ランタイムで「Data source not found」エラーになる
- `{"success":false,"error":{}}` が返る場合、CSP 問題ではなくデータソース未登録が原因であることが多い

## トラブルシューティング

### `{"success":false,"error":{}}` が `executeAsync` / Copilot Studio で返る

1. **最初にチェック**: `dataSourcesInfo` のインポート元（チェック②③④）
2. コネクタが `dataSourcesInfo` 統合版に含まれているか確認
3. `.power/schemas/appschemas/dataSourcesInfo.ts` にコネクタ定義があるか確認
4. なければ `npx power-apps add-data-source --api-id microsoftcopilotstudio ...` で再追加
