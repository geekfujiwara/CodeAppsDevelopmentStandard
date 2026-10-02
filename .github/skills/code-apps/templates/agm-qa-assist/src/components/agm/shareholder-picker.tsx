import { useEffect, useMemo, useState } from "react"
import { Search, Users } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/lib/agm/corpus"
import { loadRegister, matchShareholders, type Shareholder } from "@/lib/agm/shareholders"

/** 株主名簿を全画面で一覧し、選ぶ（番号を言わない株主・聞き違いの修正に使う） */
export function ShareholderPicker({
  open,
  onOpenChange,
  initialQuery,
  onSelect,
  title = "株主名簿から選ぶ",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuery?: string
  onSelect: (s: Shareholder) => void
  title?: string
}) {
  const [all, setAll] = useState<Shareholder[]>([])
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState(initialQuery ?? "")
  useEffect(() => {
    if (!open) return
    setQuery(initialQuery ?? "")
    loadRegister()
      .then(setAll)
      .catch((e) => setError(errorText(e)))
  }, [open, initialQuery])
  const shown = useMemo(() => matchShareholders(all, query, 500), [all, query])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="agm flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-3 border-agm-line sm:max-w-[96vw]" data-testid="shareholder-picker">
        <DialogTitle className="flex items-center gap-2 text-agm-ink">
          <Users className="size-5 text-agm-accent" aria-hidden />
          {title}
        </DialogTitle>
        <DialogDescription className="text-agm-muted">名前・フリガナ（ひらがな可）・株主番号で絞り込み、行を押すと選びます</DialogDescription>
        <label className="flex items-center gap-2 rounded-md border border-agm-line bg-agm-bg px-3 focus-within:border-agm-accent">
          <Search className="size-4 text-agm-muted" aria-hidden />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例: 古賀 / こが / 1024" className="h-11 min-w-0 flex-1 bg-transparent text-lg outline-none" data-testid="picker-search" />
          <span className="shrink-0 text-xs text-agm-muted">
            {shown.length} / {all.length} 人
          </span>
        </label>
        {error && <p className="text-sm text-agm-danger">名簿を読み込めません: {error}</p>}
        <div className="agm-scroll min-h-0 flex-1 overflow-y-auto rounded-md border border-agm-line">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 bg-agm-panel text-left text-xs text-agm-muted">
              <tr>
                <th className="w-28 px-4 py-2 font-medium">株主番号</th>
                <th className="w-40 px-2 py-2 font-medium">氏名</th>
                <th className="w-44 px-2 py-2 font-medium">フリガナ</th>
                <th className="w-28 px-2 py-2 text-right font-medium">保有株式数</th>
                <th className="w-20 px-2 py-2 font-medium">区分</th>
                <th className="px-2 py-2 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr
                  key={s.number}
                  onClick={() => {
                    onSelect(s)
                    onOpenChange(false)
                  }}
                  className="cursor-pointer border-t border-agm-line/60 hover:bg-agm-raised"
                  data-testid="picker-row"
                >
                  <td className="px-4 py-2 font-mono text-base">{s.number}</td>
                  <td className="truncate px-2 py-2 text-base font-semibold">{s.name}</td>
                  <td className="truncate px-2 py-2 text-agm-muted">{s.kana}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.shares.toLocaleString("ja-JP")}</td>
                  <td className="px-2 py-2 text-agm-muted">{s.type}</td>
                  <td className="truncate px-2 py-2 text-agm-muted" title={s.note}>
                    {s.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
