# Dataverse 検索のドロップダウン（工事・ユーザーなどの候補検索）

検索ボックスに入力すると候補を出すドロップダウンを、Dataverse 検索（関連性検索）で作る。
完成した実装は [construction-cockpit テンプレート](../templates/construction-cockpit/README.md) の
`src/components/search-combobox.tsx`・`src/components/entity-search.tsx`・`src/lib/record-search.ts`。

## 構成

| 層 | 実装 |
|---|---|
| 検索の対象 | dataverse スキルの `setup_dataverse_search.py --table <prefix>_xxx --table systemuser`（インデックス登録。反映に数分） |
| 呼び出し | 生成サービスの `GetRelevantRows`（[templates/dataverse-client.ts](../templates/dataverse-client.ts) の `Search`）。fetch で検索 API を直接呼ばない |
| 補完 | カスタム テーブルの検索対象は主列（名前）だけ。番号・住所・メールなどは `ListRecords` の `contains` で並行して探す |
| 統合 | 関連性検索の順位 → 部分一致の順に並べ、ID（大文字小文字を無視）で重複を除く |
| 表示 | `role="combobox"` / `listbox` / `option`、300ms 待って検索、上下キー・Enter・Esc、古い応答は捨てる |

## 守ること

- **簡易検索ビューを API で変えて検索列を増やそうとしない**。`fetchxml` の PATCH は 400（0x80040216）になる（dataverse troubleshooting #29）。
- **ID で読み直すときは GUID だけを条件にする**（`/^[0-9a-f-]{36}$/i`）。検索結果の文字列をそのまま OData に入れない。
- **部分一致の語は引用符をエスケープし、語数を制限する**（`'` → `''`、5 語まで）。
- **Dataverse 検索が使えない**（インデックス未反映・環境で無効）ときは部分一致だけで表示し、その旨を候補の下に出す。画面は止めない。
- **ユーザー（systemuser）は有効な利用者に絞る**: `isdisabled eq false and accessmode ne 4`（無効化・アプリケーション ユーザーを除く）。
- 入力から選択までの状態（検索中・0 件・エラー）を候補欄に必ず表示する。

## 検索の統合（純粋関数）

```ts
export function mergeRanked<T>(searchIds: string[], searchRows: T[], containsRows: T[], idOf: (item: T) => string, limit = 20) {
  const byId = new Map(searchRows.map((row) => [idOf(row).toLowerCase(), row]))
  const seen = new Set<string>()
  const result: Array<{ item: T; source: "dataverse-search" | "contains" }> = []
  for (const id of searchIds) {
    const row = byId.get(id.toLowerCase())
    if (row && !seen.has(id.toLowerCase())) { seen.add(id.toLowerCase()); result.push({ item: row, source: "dataverse-search" }) }
  }
  for (const row of containsRows) {
    const id = idOf(row).toLowerCase()
    if (!seen.has(id)) { seen.add(id); result.push({ item: row, source: "contains" }) }
  }
  return result.slice(0, limit)
}
```

関連性検索と部分一致は `Promise.allSettled` で並行に呼び、両方失敗したときだけエラーにする。
Node でのテスト例はテンプレートの `scripts/test-approvals.mjs`（条件のエスケープ、GUID 以外の除外、順位と重複除去）。
