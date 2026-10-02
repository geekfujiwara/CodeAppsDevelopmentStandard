import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { BookOpenText, FileText, Search, Sparkles } from "lucide-react"
import type { Generation } from "@/hooks/use-generations"
import { ANSWER_WIDTH, answerLines, layoutColumns, sourceLinks, type AnswerLine } from "@/lib/agm/source-graph"
import type { IrDoc, QaDoc } from "@/lib/agm/types"
import { qColor, qTint } from "./colors"
import { GeneratedView } from "./generated-view"

export interface FlowRun {
  key: string
  mode: "search" | "qa"
  question: string
  searchMs?: number
  qa: { doc: QaDoc; score: number }[]
  ir: IrDoc[]
}

type Hover = { setHover: (id: string | null) => void }
type QueryData = { run: FlowRun }
type QaData = Hover & { doc: QaDoc; score: number; rank: number; color: string; cites: number; dim: boolean; selected: boolean; done: boolean; onSelect: (id: string) => void }
type IrData = Hover & { doc: IrDoc; color: string; cites: number; dim: boolean; done: boolean; referencedBy: string[] }
type AnswerData = { gen?: Generation; lines: AnswerLine[]; lit: Set<string>; litColor?: string }
type FlowNode = Node<QueryData, "query"> | Node<QaData, "qa"> | Node<IrData, "ir"> | Node<AnswerData, "answer">

const hidden = { opacity: 0, width: 6, height: 6, minWidth: 0, minHeight: 0, border: 0 }

const QueryNode = memo(({ data }: NodeProps<Node<QueryData, "query">>) => (
  <div className="w-60 rounded-lg border border-agm-line bg-agm-panel p-3 text-agm-ink shadow-lg" data-testid="flow-query">
    <p className="flex items-center gap-1.5 text-[11px] text-agm-muted">
      {data.run.mode === "search" ? <Search className="size-3.5" aria-hidden /> : <BookOpenText className="size-3.5" aria-hidden />}
      {data.run.mode === "search" ? "検索語" : "選んだ想定問答"}
      {data.run.searchMs !== undefined && <span className="ml-auto tabular-nums">{data.run.searchMs.toFixed(1)} ms</span>}
    </p>
    <p className="mt-1 line-clamp-4 text-sm font-semibold leading-6">{data.run.question}</p>
    <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
  </div>
))

const Uses = ({ cites, done, color }: { cites: number; done: boolean; color: string }) =>
  cites > 0 ? (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-agm-bg" style={{ background: color }}>
      回答の {cites} か所で引用
    </span>
  ) : (
    <span className="rounded border border-dashed border-agm-line px-1.5 py-0.5 text-[10px] text-agm-muted">{done ? "渡したが引用なし" : "生成に渡した"}</span>
  )

const QaNode = memo(({ data }: NodeProps<Node<QaData, "qa">>) => (
  <button
    type="button"
    onClick={() => data.onSelect(data.doc.id)}
    onMouseEnter={() => data.setHover(data.doc.id)}
    onMouseLeave={() => data.setHover(null)}
    className={`nodrag w-[300px] rounded-lg border bg-agm-panel p-2.5 text-left text-agm-ink shadow-lg transition-opacity ${data.dim ? "opacity-35" : ""}`}
    style={{ borderColor: data.selected ? data.color : "var(--agm-line)", boxShadow: `inset 4px 0 0 ${data.color}${data.selected ? `, 0 0 0 1px ${data.color}` : ""}` }}
    data-testid="flow-qa"
    data-id={data.doc.id}
  >
    <Handle type="target" position={Position.Left} style={hidden} isConnectable={false} />
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-agm-muted">
      <span className="rounded px-1 font-bold text-agm-bg" style={{ background: data.color }}>
        {data.rank}
      </span>
      <span className="shrink-0 font-mono">{data.doc.id}</span>
      <span className="truncate">{data.doc.category}</span>
      {data.score > 0 && <span className="ml-auto shrink-0 tabular-nums">一致 {data.score.toFixed(1)}</span>}
    </p>
    <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5">{data.doc.question}</p>
    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-agm-muted">{data.doc.answer}</p>
    <div className="mt-1.5">
      <Uses cites={data.cites} done={data.done} color={data.color} />
    </div>
    <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
  </button>
))

const IrNode = memo(({ data }: NodeProps<Node<IrData, "ir">>) => (
  <div
    onMouseEnter={() => data.setHover(data.doc.id)}
    onMouseLeave={() => data.setHover(null)}
    className={`w-[300px] rounded-lg border border-agm-line bg-agm-panel p-2.5 text-agm-ink shadow-lg transition-opacity ${data.dim ? "opacity-35" : ""}`}
    style={{ boxShadow: `inset -4px 0 0 ${data.color}` }}
    data-testid="flow-ir"
    data-id={data.doc.id}
  >
    <Handle type="source" position={Position.Left} style={hidden} isConnectable={false} />
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-agm-muted">
      <FileText className="size-3.5 shrink-0" aria-hidden style={{ color: data.color }} />
      <span className="shrink-0 font-mono">{data.doc.id}</span>
      <span className="truncate">
        {data.doc.docTitle}｜{data.doc.section} p.{data.doc.page}
      </span>
    </p>
    <p className="mt-1 line-clamp-3 text-[12px] leading-5">{data.doc.text}</p>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Uses cites={data.cites} done={data.done} color={data.color} />
      <span className="text-[10px] text-agm-muted">{data.referencedBy.length ? `${data.referencedBy.join("・")} の根拠` : "質問文で追加検索"}</span>
    </div>
  </div>
))

/** 回答案。各行の高さに接続点を置き、根拠からの線をその行に結ぶ（左: 想定問答 / 右: IR 抜粋） */
const AnswerNode = memo(({ id, data }: NodeProps<Node<AnswerData, "answer">>) => {
  const ref = useRef<HTMLDivElement>(null)
  const zoom = useStore((s) => s.transform[2])
  const updateInternals = useUpdateNodeInternals()
  const [tops, setTops] = useState<Record<string, number>>({})
  const text = data.gen?.text ?? ""
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const next: Record<string, number> = {}
    root.querySelectorAll<HTMLElement>("[data-line]").forEach((el) => {
      const b = el.getBoundingClientRect()
      next[el.dataset.line!] = Math.round((b.top - base.top) / zoom + Math.min(b.height / zoom, 24) / 2)
    })
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [text, zoom, data.gen?.status])
  useEffect(() => updateInternals(id), [tops, id, updateInternals])
  return (
    <div ref={ref} className="relative rounded-xl border-2 border-agm-accent/60 bg-agm-panel p-3 text-agm-ink shadow-2xl" style={{ width: ANSWER_WIDTH }} data-testid="flow-answer">
      <Handle type="target" id="in-l" position={Position.Left} style={hidden} isConnectable={false} />
      <Handle type="target" id="in-r" position={Position.Right} style={hidden} isConnectable={false} />
      {data.lines.map((l) => (
        <span key={l.key}>
          <Handle type="target" id={`L:${l.key}`} position={Position.Left} style={{ ...hidden, top: tops[l.key] ?? 40 }} isConnectable={false} />
          <Handle type="target" id={`R:${l.key}`} position={Position.Right} style={{ ...hidden, top: tops[l.key] ?? 40 }} isConnectable={false} />
        </span>
      ))}
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-agm-accent">
        <Sparkles className="size-4" aria-hidden />
        AI 要約・回答案（線の先が引用した根拠）
      </p>
      <div className="nodrag nowheel cursor-text select-text">
        <GeneratedView
          gen={data.gen}
          emptyText="検索語を入れるか、想定問答を選んで「説明を作成」を押すと、根拠から要約と回答案をストリームで作ります"
          decor={(key) => (data.lit.has(key) ? { className: "rounded outline outline-2 outline-offset-2", style: { outlineColor: data.litColor } } : {})}
        />
      </div>
    </div>
  )
})

const nodeTypes = { query: QueryNode, qa: QaNode, ir: IrNode, answer: AnswerNode }

function Canvas({ run, gen, selectedQaId, onSelectQa }: { run: FlowRun | null; gen?: Generation; selectedQaId?: string; onSelectQa: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const lines = useMemo(() => answerLines(gen?.text ?? ""), [gen?.text])
  const ids = useMemo(() => (run ? [...run.qa.map((q) => q.doc.id), ...run.ir.map((d) => d.id)] : []), [run])
  const links = useMemo(() => sourceLinks(ids, lines), [ids, lines])
  const color = useMemo(() => new Map(ids.map((id, i) => [id, qColor(i)])), [ids])
  const done = gen?.status === "done"
  const streaming = gen?.status === "streaming"

  const computed = useMemo<FlowNode[]>(() => {
    if (!run) return []
    const pos = layoutColumns({ qa: run.qa.map((q) => ({ id: q.doc.id, sourceIds: q.doc.sourceIds })), ir: run.ir })
    const related = (id: string) => !hover || hover === id
    const lit = new Set(hover ? links.uses.get(hover)?.lines ?? [] : [])
    return [
      { id: "query", type: "query", position: { x: pos.query.x, y: pos.query.y }, data: { run }, draggable: false },
      ...pos.qa.map((p, i): FlowNode => {
        const q = run.qa.find((x) => x.doc.id === p.id)!
        return {
          id: `qa:${p.id}`,
          type: "qa",
          position: { x: p.x, y: p.y },
          data: { doc: q.doc, score: q.score, rank: i + 1, color: color.get(p.id)!, cites: links.uses.get(p.id)?.count ?? 0, dim: !related(p.id), selected: selectedQaId === p.id, done, onSelect: onSelectQa, setHover },
        }
      }),
      ...pos.ir.map((p): FlowNode => {
        const d = run.ir.find((x) => x.id === p.id)!
        return {
          id: `ir:${p.id}`,
          type: "ir",
          position: { x: p.x, y: p.y },
          data: { doc: d, color: color.get(p.id)!, cites: links.uses.get(p.id)?.count ?? 0, dim: !related(p.id), done, referencedBy: run.qa.filter((q) => q.doc.sourceIds.includes(p.id)).map((q) => q.doc.id), setHover },
        }
      }),
      { id: "answer", type: "answer", position: { x: pos.answer.x, y: pos.answer.y }, data: { gen, lines, lit, litColor: hover ? color.get(hover) : undefined } },
    ]
  }, [run, gen, lines, links, color, hover, selectedQaId, onSelectQa, done])

  const edges = useMemo<Edge[]>(() => {
    if (!run) return []
    const nodeOf = (id: string) => (id.startsWith("IR-") || run.ir.some((d) => d.id === id) ? `ir:${id}` : `qa:${id}`)
    const side = (id: string) => (nodeOf(id).startsWith("ir:") ? "R" : "L")
    const faded = (id: string) => (hover && hover !== id ? 0.12 : 1)
    const out: Edge[] = run.qa.map((q) => ({
      id: `query-${q.doc.id}`,
      source: "query",
      target: `qa:${q.doc.id}`,
      style: { stroke: "var(--agm-muted)", strokeWidth: 1.25, opacity: faded(q.doc.id) * 0.7 },
    }))
    for (const l of links.links) {
      out.push({
        id: `cite-${l.from}-${l.to}`,
        source: nodeOf(l.from),
        target: "answer",
        targetHandle: `${side(l.from)}:${l.to}`,
        animated: streaming,
        style: { stroke: color.get(l.from), strokeWidth: hover === l.from ? 3.5 : 2.25, opacity: faded(l.from) },
        zIndex: hover === l.from ? 10 : 1,
      })
    }
    for (const id of links.uncited) {
      out.push({
        id: `pass-${id}`,
        source: nodeOf(id),
        target: "answer",
        targetHandle: side(id) === "R" ? "in-r" : "in-l",
        style: { stroke: "var(--agm-line)", strokeWidth: 1.25, strokeDasharray: "4 4", opacity: faded(id) },
      })
    }
    return out
  }, [run, links, color, hover, streaming])

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  useEffect(() => {
    setNodes((prev) => computed.map((n) => ({ ...n, measured: prev.find((p) => p.id === n.id)?.measured })))
  }, [computed, setNodes])

  // 根拠の組み合わせが変わったら全体が見えるように合わせる
  const flow = useReactFlow()
  const sourceKey = ids.join(",")
  useEffect(() => {
    if (!sourceKey) return
    const t = window.setTimeout(() => void flow.fitView({ padding: 0.08, duration: 300 }), 120)
    return () => window.clearTimeout(t)
  }, [sourceKey, flow])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode="dark"
      fitView
      fitViewOptions={{ padding: 0.08 }}
      minZoom={0.3}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      className="agm-flow"
    >
      <Background color="var(--agm-line)" gap={22} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  )
}

/** 検索結果（想定問答・IR 抜粋）と AI 回答案の各行を、引用の関係で線で結ぶ */
export function SourceFlow(props: { run: FlowRun | null; gen?: Generation; selectedQaId?: string; onSelectQa: (id: string) => void }) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

/** 一覧などで、その根拠が今の生成に使われたかを示す小さな印 */
export function SourceBadge({ rank, cites, done }: { rank: number; cites: number; done: boolean }) {
  const color = qColor(rank - 1)
  return (
    <span className="shrink-0 rounded px-1 text-[10px] font-semibold" style={{ background: qTint(rank - 1, 30), color }} title={cites ? `回答の ${cites} か所で引用` : done ? "生成に渡したが引用なし" : "生成に渡した"}>
      AI #{rank}
      {cites ? `・引用 ${cites}` : ""}
    </span>
  )
}
