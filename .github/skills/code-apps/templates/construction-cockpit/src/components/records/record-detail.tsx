import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"

export const detailPanel = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"

type Props = {
  backTo: string
  backLabel: string
  eyebrow: string
  title: string
  badges?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  aside?: ReactNode
  children: ReactNode
  isLoading: boolean
  error: unknown
  notFound: boolean
  tourId: string
}

/** 記録の詳細画面の共通枠。読み込み中・エラー・見つからない場合も同じ枠で表示する */
export function RecordDetail({ backTo, backLabel, eyebrow, title, badges, meta, actions, aside, children, isLoading, error, notFound, tourId }: Props) {
  const back = <Link to={backTo} className="inline-flex items-center text-sm font-bold text-cyan-700 dark:text-cyan-300"><ChevronLeft className="mr-1 h-4 w-4" />{backLabel}</Link>
  if (isLoading) return <div className="mx-auto max-w-6xl space-y-4">{back}<LoadingSkeletonGrid count={4} columns={2} /></div>
  if (error) return <div className="mx-auto max-w-6xl space-y-4">{back}<p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800" role="alert">記録を読み込めませんでした。時間をおいて再度お試しください。</p></div>
  if (notFound) return <div className="mx-auto max-w-6xl space-y-4">{back}<p className={detailPanel}>指定された記録が見つかりません。削除されたか、URL が誤っている可能性があります。</p></div>
  return (
    <div className="mx-auto max-w-6xl space-y-5" data-tour={tourId}>
      {back}
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
        <p className="text-sm font-bold text-cyan-300">{eyebrow}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>
        <h1 className="mt-2 text-2xl font-black [overflow-wrap:anywhere] sm:text-3xl">{title}</h1>
        {meta && <div className="mt-2 text-sm text-slate-300">{meta}</div>}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">{children}</div>
        {aside && <aside className="min-w-0 space-y-5">{aside}</aside>}
      </div>
    </div>
  )
}

export function Badge({ color, children, className = "" }: { color: string; children: ReactNode; className?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black text-slate-950 ${className}`} style={{ background: color }}>{children}</span>
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
}

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-black text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{children || <span className="text-slate-400">未入力</span>}</dd>
    </div>
  )
}

export function Section({ title, description, children, tour }: { title: string; description?: string; children: ReactNode; tour?: string }) {
  return (
    <section className={detailPanel} data-tour={tour}>
      <h2 className="text-lg font-black">{title}</h2>
      {description && <p className="mb-3 text-sm text-slate-500">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  )
}

export function RelatedList({ items, empty }: { items: Array<{ id: string; href: string; title: string; subtitle?: string }>; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((item) => (
        <li key={item.id} className="py-2">
          <Link to={item.href} className="block rounded-lg p-1 hover:bg-cyan-50 dark:hover:bg-cyan-950/30">
            <span className="font-bold [overflow-wrap:anywhere]">{item.title}</span>
            {item.subtitle && <span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">{item.subtitle}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
