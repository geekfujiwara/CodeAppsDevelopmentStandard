import { createContext, useContext, useMemo, type ReactNode } from "react"
import { BookOpenText, FileText } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { IrDoc, QaDoc } from "@/lib/agm/types"

type Sources = { qa: Map<string, QaDoc>; ir: Map<string, IrDoc> }
const SourceContext = createContext<Sources>({ qa: new Map(), ir: new Map() })

export function SourceProvider({ qa, ir, children }: { qa: QaDoc[]; ir: IrDoc[]; children: ReactNode }) {
  const value = useMemo(() => ({ qa: new Map(qa.map((q) => [q.id, q])), ir: new Map(ir.map((d) => [d.id, d])) }), [qa, ir])
  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>
}

/** 引用番号（QA-032 / IR-011）。押すとその想定問答・IR 抜粋の中身を吹き出しで見せる */
export function CiteChip({ id, className }: { id: string; className?: string }) {
  const { qa, ir } = useContext(SourceContext)
  const q = qa.get(id)
  const d = ir.get(id)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`mx-0.5 rounded bg-agm-bg px-1 py-px align-middle font-mono text-[10px] text-agm-accent underline-offset-2 hover:underline ${className ?? ""}`}
          title="押すと根拠の中身を表示"
          data-testid="cite-chip"
        >
          {id}
        </button>
      </PopoverTrigger>
      <PopoverContent className="agm z-[500] w-[28rem] max-w-[90vw] border-agm-line p-0 text-agm-ink" onClick={(e) => e.stopPropagation()}>
        {q && (
          <div className="space-y-2 p-3 text-sm" data-testid="cite-popover">
            <p className="flex items-center gap-1.5 text-[11px] text-agm-muted">
              <BookOpenText className="size-3.5" aria-hidden />
              想定問答 {q.id}・{q.category}・{q.responder}
            </p>
            <p className="font-semibold">{q.question}</p>
            <p className="rounded bg-agm-raised p-2 leading-6">{q.answer}</p>
            {q.cautions.length > 0 && <p className="text-xs text-agm-warn">注意: {q.cautions.join(" / ")}</p>}
            {q.sourceIds.length > 0 && <p className="text-[11px] text-agm-muted">根拠: {q.sourceIds.join("、")}</p>}
          </div>
        )}
        {d && (
          <div className="space-y-2 p-3 text-sm" data-testid="cite-popover">
            <p className="flex items-center gap-1.5 text-[11px] text-agm-muted">
              <FileText className="size-3.5" aria-hidden />
              IR 抜粋 {d.id}・{d.docType}
            </p>
            <p className="font-semibold">
              {d.docTitle}｜{d.section} <span className="font-normal text-agm-muted">p.{d.page}</span>
            </p>
            <p className="rounded bg-agm-raised p-2 leading-6">{d.text}</p>
          </div>
        )}
        {!q && !d && <p className="p-3 text-sm text-agm-muted">{id} は読み込んだ資料にありません</p>}
      </PopoverContent>
    </Popover>
  )
}
