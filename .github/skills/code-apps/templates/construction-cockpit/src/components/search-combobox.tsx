import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Loader2, Search, X } from "lucide-react"
import type { Ranked } from "@/lib/record-search"

type Props<T> = {
  label: string
  placeholder: string
  /** 選択中の表示名（未選択なら空） */
  selectedLabel?: string
  search: (term: string) => Promise<{ items: Ranked<T>[]; searchError?: string }>
  idOf: (item: T) => string
  labelOf: (item: T) => string
  renderItem: (item: T) => ReactNode
  onSelect: (item: T | undefined) => void
  /** Enter で候補を選ばずに確定したとき（キーワードでの絞り込みなど）。省略時は先頭の候補を選ぶ */
  onSubmitText?: (term: string) => void
  minChars?: number
  className?: string
  tourId?: string
}

/**
 * Dataverse 検索のドロップダウン。入力を 300ms 待ってから検索し、上下キーで選択、Enter で確定、Esc で閉じる。
 * 古い検索の応答は捨てる（後から返っても表示を上書きしない）。
 */
export function SearchCombobox<T>({
  label, placeholder, selectedLabel, search, idOf, labelOf, renderItem, onSelect, onSubmitText, minChars = 1, className = "", tourId,
}: Props<T>) {
  const listId = useId()
  const [term, setTerm] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [state, setState] = useState<{ loading: boolean; items: Ranked<T>[]; error?: string; note?: string }>({ loading: false, items: [] })
  const request = useRef(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const keyword = term.trim()
    if (keyword.length < minChars) { setState({ loading: false, items: [] }); return }
    const id = ++request.current
    setState((value) => ({ ...value, loading: true, error: undefined }))
    const timer = window.setTimeout(() => {
      search(keyword)
        .then((result) => { if (id === request.current) { setState({ loading: false, items: result.items, note: result.searchError ? "Dataverse 検索を使えないため、部分一致で表示しています。" : undefined }); setActive(0) } })
        .catch((error: unknown) => { if (id === request.current) setState({ loading: false, items: [], error: error instanceof Error ? error.message : "検索できませんでした。" }) })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [term, minChars, search])

  useEffect(() => {
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const choose = (item: T) => { onSelect(item); setTerm(""); setOpen(false) }
  const items = state.items
  const showList = open && term.trim().length >= minChars

  return (
    <div ref={box} className={`relative min-w-0 ${className}`} data-tour={tourId}>
      <label className="sr-only" htmlFor={`${listId}-input`}>{label}</label>
      <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        {selectedLabel && !term ? (
          <span className="min-w-0 flex-1 truncate text-sm font-bold" title={selectedLabel}>{selectedLabel}</span>
        ) : null}
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
          value={term}
          onChange={(event) => { setTerm(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((value) => Math.min(items.length - 1, value + 1)) }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
            else if (event.key === "Escape") setOpen(false)
            else if (event.key === "Enter") {
              event.preventDefault()
              if (showList && items[active]) choose(items[active].item)
              else if (onSubmitText) { onSubmitText(term.trim()); setOpen(false) }
            }
          }}
          placeholder={selectedLabel ? "" : placeholder}
          className={`h-full min-w-0 bg-transparent text-sm outline-none ${selectedLabel && !term ? "w-16" : "flex-1"}`}
          data-search-combobox={label}
        />
        {state.loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-label="検索中" />}
        {(selectedLabel || term) && (
          <button type="button" onClick={() => { setTerm(""); onSelect(undefined) }} aria-label={`${label}をクリア`} className="rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        )}
      </div>
      {showList && (
        <ul id={`${listId}-list`} role="listbox" aria-label={`${label}の候補`} className="absolute z-30 mt-1 max-h-80 w-full min-w-[18rem] overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-950">
          {state.error ? <li className="px-3 py-2 text-sm text-rose-700" role="alert">{state.error}</li>
            : state.loading && !items.length ? <li className="px-3 py-2 text-sm text-slate-500">検索しています…</li>
              : !items.length ? <li className="px-3 py-2 text-sm text-slate-500">「{term.trim()}」に一致する候補はありません。</li>
                : items.map(({ item, source }, index) => (
                  <li
                    key={idOf(item)}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => { event.preventDefault(); choose(item) }}
                    onMouseEnter={() => setActive(index)}
                    className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-cyan-50 dark:bg-cyan-950/40" : ""}`}
                    title={labelOf(item)}
                    data-search-source={source}
                  >
                    {renderItem(item)}
                  </li>
                ))}
          {state.note && <li className="border-t border-slate-100 px-3 py-1.5 text-xs text-amber-700 dark:border-slate-800">{state.note}</li>}
        </ul>
      )}
    </div>
  )
}
