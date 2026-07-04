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
  // BOM がないと Excel(日本語環境) が Shift_JIS と誤判定して文字化けする
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  a.href = url
  a.download = `${filenameBase}_${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
