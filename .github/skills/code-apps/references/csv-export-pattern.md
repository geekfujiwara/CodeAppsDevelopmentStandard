# CSV エクスポートパターン

一覧画面の**表示中（フィルター適用後）のレコードを CSV でダウンロード**させる汎用ユーティリティ。
外部ライブラリ不要・ブラウザ内で完結する（CSP 安全・サーバー不要）。

- Excel（日本語環境）で文字化けしないよう **UTF-8 BOM 付き**で出力する
- 値に `,` `"` 改行が含まれるケースを RFC 4180 準拠でクォートする
- OptionSet は数値ではなく**ラベルに変換してから**出力する（利用者は 100000001 を読めない）
- ファイル名は `{画面名}_{YYYYMMDD}.csv` 形式

---

## ユーティリティ本体

`src/lib/csv-export.ts`:

```typescript
export interface CsvColumn<T> {
  header: string
  /** 行オブジェクトから出力文字列を取り出す（OptionSet はここでラベル変換する） */
  value: (row: T) => string | number | null | undefined
}

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  // カンマ・ダブルクォート・改行を含む場合はクォートで包む（RFC 4180）
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** rows を CSV 文字列にして即ダウンロードさせる（UTF-8 BOM 付き・Excel 日本語対応） */
export function exportCsv<T>(filenameBase: string, columns: CsvColumn<T>[], rows: T[]) {
  const lines = [
    columns.map(c => escapeCell(c.header)).join(","),
    ...rows.map(row => columns.map(c => escapeCell(c.value(row))).join(",")),
  ]
  // BOM(﻿) がないと Excel(日本語環境) が Shift_JIS と誤判定して文字化けする
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  a.href = url
  a.download = `${filenameBase}_${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```

---

## 使い方（一覧ページに「CSV 出力」ボタン）

**フィルター適用後の配列（`filtered`）を渡す**のがポイント。画面で見えているものがそのまま出る。

```tsx
import { exportCsv, type CsvColumn } from "@/lib/csv-export"
import { Download } from "lucide-react"

type Row = Record<string, unknown>

const CSV_COLUMNS: CsvColumn<Row>[] = [
  { header: "件名",       value: r => String(r[f.name] ?? "") },
  { header: "種別",       value: r => String(r[f.category] ?? "") },
  // OptionSet はラベルへ変換して出力する
  { header: "ステータス", value: r => STATUS_LABEL[r[f.status] as keyof typeof STATUS_LABEL] ?? "" },
  { header: "金額",       value: r => (r[f.amount] as number) ?? 0 },
  { header: "申請日",     value: r => String(r[f.request_date] ?? "") },
]

<Button
  variant="outline"
  className="gap-2"
  onClick={() => {
    exportCsv("申請一覧", CSV_COLUMNS, filtered)
    toast.success(`${filtered.length} 件を CSV 出力しました`)
  }}
>
  <Download className="h-4 w-4" />CSV 出力
</Button>
```

---

## 設計上の注意

- **エクスポート対象は「フィルター後・ページネーション前」**: `paginated`（表示中の 10 件）ではなく `filtered` を渡す。利用者の期待は「検索結果全部」。
- **改行コードは `\r\n`**: Excel の互換性が最も高い。
- **金額はプレーン数値で出す**: `toLocaleString` の `¥1,234` はセルが文字列になり Excel で集計できない。書式は Excel 側に任せる。
- **日付は `YYYY-MM-DD` のまま**: Dataverse DateOnly の文字列をそのまま出せば Excel が日付と認識する。
- **大量件数**: クライアント集計なので数千件までが目安。それ以上は Dataverse の高度な検索・Power BI 側に誘導する。
- **インポート（CSV→Dataverse）は別物**: 取り込みは列マッピング・検証・重複判定が必要になるため、本パターンの範囲外。Power Automate または Dataverse 標準のインポート機能を使う。
