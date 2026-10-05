import { useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowDown, ArrowUp, ChevronRight, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"

export type RecordColumn<T> = {
  key: string
  header: string
  render: (item: T) => ReactNode
  sortValue?: (item: T) => string | number
  className?: string
}

export type RecordFilter<T> = {
  key: string
  label: string
  options: Array<{ value: string; label: string }>
  match: (item: T, value: string) => boolean
  /** 未選択時の値（期間フィルターの既定値など）。指定すると「すべて」の選択肢を出さない */
  defaultValue?: string
}

export type RecordSummary = { label: string; value: string; tone?: "default" | "warn" | "danger" | "good" }

type Props<T> = {
  eyebrow: string
  title: string
  description: string
  items: T[] | undefined
  isLoading: boolean
  error: unknown
  rowKey: (item: T) => string
  rowHref: (item: T) => string
  rowLabel: (item: T) => string
  searchText: (item: T) => string
  searchPlaceholder: string
  filters: Array<RecordFilter<T>>
  columns: Array<RecordColumn<T>>
  charts: (items: T[]) => ReactNode
  summary?: (items: T[]) => RecordSummary[]
  newHref?: string
  newLabel?: string
  emptyText: string
  tourId: string
}

const PAGE = 50
const TONE: Record<NonNullable<RecordSummary["tone"]>, string> = {
  default: "text-slate-900 dark:text-white",
  warn: "text-amber-600",
  danger: "text-rose-600",
  good: "text-emerald-600",
}

/**
 * 記録の一覧画面の共通枠: 集計 → グラフ → 検索・絞り込み → 一覧（クリックで詳細へ）。
 * 検索語・絞り込みは URL に保持するため、詳細から戻っても条件が残る。グラフと集計は絞り込み後の記録で描く。
 */
export function RecordExplorer<T>({
  eyebrow, title, description, items, isLoading, error, rowKey, rowHref, rowLabel, searchText, searchPlaceholder,
  filters, columns, charts, summary, newHref, newLabel, emptyText, tourId,
}: Props<T>) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [limit, setLimit] = useState(PAGE)
  const query = params.get("q") ?? ""
  const sortKey = params.get("sort") ?? ""
  const sortDir = params.get("dir") === "asc" ? "asc" : "desc"
  const values: Record<string, string> = Object.fromEntries(filters.map((filter) => [filter.key, params.get(filter.key) ?? filter.defaultValue ?? ""]))
  const valuesKey = JSON.stringify(values)
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ja")
    const result = (items ?? []).filter((item) =>
      (!term || searchText(item).toLocaleLowerCase("ja").includes(term))
      && filters.every((filter) => !values[filter.key] || filter.match(item, values[filter.key])))
    const column = columns.find((item) => item.key === sortKey)
    if (column?.sortValue) {
      const value = column.sortValue
      result.sort((a, b) => {
        const left = value(a)
        const right = value(b)
        const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ja")
        return sortDir === "asc" ? order : -order
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, sortKey, sortDir, valuesKey])
  const active = Boolean(query) || filters.some((filter) => values[filter.key] !== (filter.defaultValue ?? ""))

  if (isLoading) return <LoadingSkeletonGrid count={6} columns={3} />
  if (error) return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800" role="alert">{title}を読み込めませんでした。時間をおいて再度お試しください。</p>

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setLimit(PAGE)
  }
  const toggleSort = (key: string) => {
    const next = new URLSearchParams(params)
    next.set("sort", key)
    next.set("dir", sortKey === key && sortDir === "desc" ? "asc" : "desc")
    setParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-[110rem] space-y-5" data-tour={tourId}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{eyebrow}</p>
          <h1 className="text-3xl font-black">{title}</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {newHref && <Button asChild><Link to={newHref}><Plus className="mr-1 h-4 w-4" />{newLabel}</Link></Button>}
      </header>

      {summary && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="集計">
          {summary(filtered).map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className={`text-2xl font-black ${TONE[item.tone ?? "default"]}`}>{item.value}</p>
              <p className="text-sm text-slate-500">{item.label}</p>
            </article>
          ))}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2" aria-label="グラフ" data-record-charts>{charts(filtered)}</section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="検索と絞り込み">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[16rem] flex-[2_1_20rem]">
            <span className="sr-only">キーワード検索</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input value={query} onChange={(event) => update("q", event.target.value)} placeholder={searchPlaceholder} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 dark:border-slate-700 dark:bg-slate-950" data-record-search />
          </label>
          {filters.map((filter) => (
            <label key={filter.key} className="min-w-[10rem] flex-[1_1_11rem]">
              <span className="sr-only">{filter.label}</span>
              <select value={values[filter.key]} onChange={(event) => update(filter.key, event.target.value === (filter.defaultValue ?? "") ? "" : event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" aria-label={filter.label} data-record-filter={filter.key}>
                {filter.defaultValue === undefined && <option value="">{filter.label}: すべて</option>}
                {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold" data-record-count={filtered.length}>{filtered.length.toLocaleString()} 件</span>
          {active && <button type="button" className="inline-flex items-center gap-1 font-bold text-cyan-700 dark:text-cyan-300" onClick={() => setParams(new URLSearchParams(), { replace: true })}><X className="h-4 w-4" />条件をクリア</button>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={`${title}の一覧`}>
        {!filtered.length ? (
          <p className="p-8 text-center text-slate-500">{items?.length ? "条件に一致する記録はありません。" : emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className={`px-4 py-3 font-bold ${column.className ?? ""}`} aria-sort={sortKey === column.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                      {column.sortValue ? (
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(column.key)}>
                          {column.header}{sortKey === column.key && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      ) : column.header}
                    </th>
                  ))}
                  <th className="w-8"><span className="sr-only">詳細</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((item) => (
                  <tr
                    key={rowKey(item)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-cyan-50/60 focus-within:bg-cyan-50/60 dark:border-slate-800 dark:hover:bg-cyan-950/30"
                    onClick={() => navigate(rowHref(item))}
                    data-record-row
                  >
                    {columns.map((column, index) => (
                      <td key={column.key} className={`px-4 py-3 align-top ${column.className ?? ""}`}>
                        {index === 0 ? <Link to={rowHref(item)} className="font-bold text-slate-900 hover:underline dark:text-white" aria-label={`${rowLabel(item)} の詳細`} onClick={(event) => event.stopPropagation()}>{column.render(item)}</Link> : column.render(item)}
                      </td>
                    ))}
                    <td className="px-2 py-3 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
                <Button variant="outline" onClick={() => setLimit((value) => value + PAGE)}>さらに表示（残り {filtered.length - limit} 件）</Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
