import { useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, type Node, type Edge, Position, Handle, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useCalls, useWorkOrders, useDailyReports } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { CALL_STATUS_LABEL, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, WORK_ORDER_TYPE_LABEL } from "@/types/dataverse"
import type { CallStatus, WorkOrderStatus, WorkOrderType } from "@/types/dataverse"
import { cn } from "@/lib/utils"
import { isDemoCall, isDemoWorkOrder } from "@/lib/demo-data"
import { DataLoadError } from "@/components/data-load-error"

const P = PUBLISHER_PREFIX

/* ─── カスタムノード ─── */

function SourceNode({ data }: NodeProps) {
  const d = data as { label: string; count: number; total: number; detail: string; color: string }
  return (
    <div className="min-w-[188px] rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <div className="mb-2 flex items-center gap-2">
        <div className={cn("h-2.5 w-2.5 rounded-full", d.color)} />
        <span className="text-sm font-semibold">{d.label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums">{d.count}</span>
        <span className="text-xs text-muted-foreground">/ {d.total} 件</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{d.detail}</p>
    </div>
  )
}

function CenterNode({ data }: NodeProps) {
  const d = data as { label: string; total: number; items: { label: string; count: number; color: string }[] }
  return (
    <div className="min-w-[232px] rounded-xl border-2 border-primary/40 bg-card p-4 shadow-md transition-all hover:border-primary/70">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <div className="mb-3 text-center">
        <div className="text-3xl font-bold tabular-nums text-foreground">{d.total}</div>
        <div className="text-sm font-semibold text-muted-foreground">{d.label}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {d.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-1.5">
            <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${it.color}`}>{it.label}</span>
            <span className="text-sm font-semibold tabular-nums">{it.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EndNode({ data }: NodeProps) {
  const d = data as { label: string; total: number; approved: number; pending: number; returned: number }
  return (
    <div className="min-w-[210px] rounded-xl border-2 border-emerald-300 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-emerald-500" />
      <div className="mb-3 text-center">
        <div className="text-3xl font-bold tabular-nums">{d.total}</div>
        <div className="text-sm font-semibold text-muted-foreground">{d.label}</div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><span className="text-sm">承認済</span><span className="ml-auto text-sm font-semibold tabular-nums">{d.approved}</span></div>
        <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-amber-500" /><span className="text-sm">確認中</span><span className="ml-auto text-sm font-semibold tabular-nums">{d.pending}</span></div>
        <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-rose-500" /><span className="text-sm">差戻し</span><span className="ml-auto text-sm font-semibold tabular-nums">{d.returned}</span></div>
      </div>
    </div>
  )
}

function CategoryNode({ data }: NodeProps) {
  const d = data as { title: string; description: string; color: string }
  return (
    <div className={cn("h-full rounded-2xl border p-4 pt-3", d.color)}>
      <div className="border-b border-current/10 pb-3">
        <div className="text-sm font-bold tracking-wide">{d.title}</div>
        <div className="mt-1 text-xs opacity-70">{d.description}</div>
      </div>
    </div>
  )
}

const nodeTypes = { source: SourceNode, center: CenterNode, end: EndNode, category: CategoryNode }

/* ─── メインコンポーネント ─── */

const NODE_ROUTES: Record<string, string> = {
  call: "/calls",
  maint: "/work-orders",
  install: "/work-orders",
  wo: "/work-orders",
  daily: "/daily-reports",
}

export default function ServiceFlowPage() {
  const navigate = useNavigate()
  const callsQuery = useCalls()
  const workOrdersQuery = useWorkOrders()
  const dailyReportsQuery = useDailyReports()
  const queries = [callsQuery, workOrdersQuery, dailyReportsQuery]
  const isLoading = queries.some(query => query.isLoading)
  const hasError = queries.some(query => query.isError)
  const allCalls = callsQuery.data ?? []
  const allWorkOrders = workOrdersQuery.data ?? []
  const calls = allCalls.filter(call => !isDemoCall(call))
  const workOrders = allWorkOrders.filter(order => !isDemoWorkOrder(order))
  const dailyReports = useMemo(() => dailyReportsQuery.data ?? [], [dailyReportsQuery.data])
  const excludedDemoCount = allCalls.length - calls.length
    + allWorkOrders.length - workOrders.length

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const route = NODE_ROUTES[node.id]
    if (route) navigate(route)
  }, [navigate])

  const { nodes, edges, stats } = useMemo(() => {
    const callByStatus = new Map<number, number>()
    calls.forEach(c => { const s = Number(c[`${P}_status`] ?? 0); callByStatus.set(s, (callByStatus.get(s) ?? 0) + 1) })

    const woByStatus = new Map<number, number>()
    const woByType = new Map<number, number>()
    const workOrdersFromCalls = workOrders.filter(w => w[`_${P}_callid_value`]).length
    const workOrdersFromMaintenance = workOrders.filter(w => Number(w[`${P}_worktype`]) === 100000001).length
    const workOrdersFromInstallations = workOrders.filter(w => Number(w[`${P}_worktype`]) === 100000002).length
    const callIdsWithOrders = new Set(
      workOrders.map(w => String(w[`_${P}_callid_value`] ?? "")).filter(Boolean),
    )
    const callsConverted = calls.filter(c => callIdsWithOrders.has(String(c[`${P}_callid`] ?? ""))).length
    workOrders.forEach(w => {
      const s = Number(w[`${P}_status`] ?? 0); woByStatus.set(s, (woByStatus.get(s) ?? 0) + 1)
      const t = Number(w[`${P}_worktype`] ?? 0); woByType.set(t, (woByType.get(t) ?? 0) + 1)
    })

    const dailyTotal = dailyReports.length
    const dailyApproved = dailyReports.filter(d => Number(d[`${P}_approvalstatus`]) === 100000002).length
    const dailyPending = dailyReports.filter(d => [100000000, 100000001].includes(Number(d[`${P}_approvalstatus`]))).length
    const dailyReturned = dailyReports.filter(d => Number(d[`${P}_approvalstatus`]) === 100000003).length
    const ordersWithDailyReport = workOrders.filter(w => w[`_${P}_dailyreportid_value`]).length

    const ns: Node[] = [
      { id: "group-intake", type: "category", position: { x: 0, y: 0 }, style: { width: 250, height: 440 }, zIndex: -1, data: { title: "01 受付", description: "問い合わせの受付と起票", color: "bg-sky-50/70 border-sky-200 text-sky-950 dark:bg-sky-950/20 dark:border-sky-800 dark:text-sky-100" }, draggable: false, selectable: false },
      { id: "group-response", type: "category", position: { x: 280, y: 0 }, style: { width: 250, height: 440 }, zIndex: -1, data: { title: "02 現場対応", description: "保守・機器設置の作業", color: "bg-violet-50/70 border-violet-200 text-violet-950 dark:bg-violet-950/20 dark:border-violet-800 dark:text-violet-100" }, draggable: false, selectable: false },
      { id: "group-completion", type: "category", position: { x: 560, y: 0 }, style: { width: 270, height: 440 }, zIndex: -1, data: { title: "03 完了・報告", description: "作業完了から日報承認まで", color: "bg-emerald-50/70 border-emerald-200 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-100" }, draggable: false, selectable: false },
      { id: "call", type: "source", parentId: "group-intake", extent: "parent", position: { x: 22, y: 94 }, data: { label: "コール", count: callsConverted, total: calls.length, detail: "作業オーダー化済 / 総受付", color: "bg-sky-500" } },
      { id: "maint", type: "source", parentId: "group-response", extent: "parent", position: { x: 22, y: 78 }, data: { label: "定期保守", count: workOrdersFromMaintenance, total: workOrders.length, detail: "作業オーダー全体の内数", color: "bg-violet-500" } },
      { id: "install", type: "source", parentId: "group-response", extent: "parent", position: { x: 22, y: 244 }, data: { label: "機器設置", count: workOrdersFromInstallations, total: workOrders.length, detail: "作業オーダー全体の内数", color: "bg-indigo-500" } },
      { id: "wo", type: "center", parentId: "group-completion", extent: "parent", position: { x: 18, y: 76 }, data: {
        label: "作業オーダー", total: workOrders.length,
        items: [100000000, 100000001, 100000002, 100000003].map(s => ({
          label: WORK_ORDER_STATUS_LABEL[s as WorkOrderStatus],
          count: woByStatus.get(s) ?? 0,
          color: WORK_ORDER_STATUS_COLOR[s as WorkOrderStatus],
        })),
      }},
      { id: "daily", type: "end", parentId: "group-completion", extent: "parent", position: { x: 30, y: 282 }, data: { label: "日報", total: dailyTotal, approved: dailyApproved, pending: dailyPending, returned: dailyReturned } },
    ]

    const es: Edge[] = [
      { id: "call-wo", source: "call", target: "wo", type: "smoothstep", label: String(workOrdersFromCalls), labelStyle: { fontSize: 12, fontWeight: 600 }, style: { strokeWidth: 2, stroke: "#0284c7" } },
      { id: "maint-wo", source: "maint", target: "wo", type: "smoothstep", label: String(workOrdersFromMaintenance), labelStyle: { fontSize: 12, fontWeight: 600 }, style: { strokeWidth: 2, stroke: "#8b5cf6" } },
      { id: "install-wo", source: "install", target: "wo", type: "smoothstep", label: String(workOrdersFromInstallations), labelStyle: { fontSize: 12, fontWeight: 600 }, style: { strokeWidth: 2, stroke: "#6366f1" } },
      { id: "wo-daily", source: "wo", target: "daily", type: "smoothstep", label: String(ordersWithDailyReport), labelStyle: { fontSize: 12, fontWeight: 600 }, style: { strokeWidth: 2, stroke: "#059669" } },
    ]

    return {
      nodes: ns, edges: es,
      stats: {
        calls: { total: calls.length, byStatus: callByStatus },
        workOrders: { total: workOrders.length, byStatus: woByStatus, byType: woByType, fromCall: workOrdersFromCalls, fromMaint: workOrdersFromMaintenance, fromInstall: workOrdersFromInstallations },
        dailyReports: { total: dailyTotal, approved: dailyApproved, pending: dailyPending, returned: dailyReturned },
      },
    }
  }, [calls, workOrders, dailyReports])

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">サービスフロー</h1><LoadingSkeletonList count={3} /></div>
  if (hasError) {
    return (
      <DataLoadError
        onRetry={() => { void Promise.all(queries.map(query => query.refetch())) }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">サービスフロー</h1>
        <p className="mt-1 text-sm text-muted-foreground">受付・現場対応・完了報告の件数をカテゴリ別に可視化します。</p>
        {excludedDemoCount > 0 && <p className="mt-1 text-xs text-muted-foreground">デモデータ {excludedDemoCount} 件は集計から除外しています。</p>}
      </div>

      {/* フローダイアグラム */}
      <Card data-tour="service-flow-map">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-lg">業務フローマップ</CardTitle>
            <CardDescription className="mt-1">カテゴリ内のカードをクリックすると関連画面を開きます。ドラッグで移動、ホイールまたは操作ボタンで拡大・縮小できます。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-5 sm:pt-0">
          <div className="h-[520px] w-full overflow-hidden rounded-xl border border-border bg-background">
            <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.18, minZoom: 0.45, maxZoom: 0.9 }}
              panOnDrag
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              preventScrolling={false}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "smoothstep", interactionWidth: 24 }}
            >
              <Background gap={24} size={1.2} color="hsl(var(--border))" />
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                nodeColor={node => node.type === "category" ? "#cbd5e1" : "#3b82f6"}
                maskColor="rgb(15 23 42 / 0.08)"
              />
            </ReactFlow>
            </ReactFlowProvider>
          </div>
        </CardContent>
      </Card>

      {/* 詳細カード群 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* コール */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">コール (受付経路)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-3">{stats.calls.total} <span className="text-sm font-normal text-muted-foreground">件</span></div>
            <div className="space-y-2">
              {([100000000, 100000001, 100000002, 100000003, 100000004] as const).map(s => {
                const count = stats.calls.byStatus.get(s) ?? 0
                const pct = stats.calls.total > 0 ? (count / stats.calls.total) * 100 : 0
                return (
                  <div key={s} className="space-y-1">
                    <div className="flex justify-between text-xs"><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBarColor(s)}`}>{CALL_STATUS_LABEL[s as CallStatus]}</span><span className="font-medium">{count}</span></div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full", barBgColor(s))} style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* 作業オーダー */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">作業オーダー (種別内訳)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-3">{stats.workOrders.total} <span className="text-sm font-normal text-muted-foreground">件</span></div>
            <div className="space-y-2">
              {([100000000, 100000001, 100000002] as const).map(t => {
                const count = stats.workOrders.byType.get(t) ?? 0
                const pct = stats.workOrders.total > 0 ? (count / stats.workOrders.total) * 100 : 0
                return (
                  <div key={t} className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="font-medium">{WORK_ORDER_TYPE_LABEL[t as WorkOrderType]}</span><span className="font-medium">{count}</span></div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full", t === 100000000 ? "bg-orange-500" : t === 100000001 ? "bg-blue-500" : "bg-teal-500")} style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground"><span>コール起因</span><span className="font-medium text-foreground">{stats.workOrders.fromCall}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>定期メンテナンス</span><span className="font-medium text-foreground">{stats.workOrders.fromMaint}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>機器設置</span><span className="font-medium text-foreground">{stats.workOrders.fromInstall}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* 日報 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">日報 (承認状況)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-3">{stats.dailyReports.total} <span className="text-sm font-normal text-muted-foreground">件</span></div>
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-green-700 font-medium">承認済</span><span className="font-medium">{stats.dailyReports.approved}</span></div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{ width: `${stats.dailyReports.total > 0 ? (stats.dailyReports.approved / stats.dailyReports.total) * 100 : 0}%` }} /></div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-amber-700 font-medium">確認中</span><span className="font-medium">{stats.dailyReports.pending}</span></div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-yellow-500" style={{ width: `${stats.dailyReports.total > 0 ? (stats.dailyReports.pending / stats.dailyReports.total) * 100 : 0}%` }} /></div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-rose-700 font-medium">差戻し</span><span className="font-medium">{stats.dailyReports.returned}</span></div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-rose-500" style={{ width: `${stats.dailyReports.total > 0 ? (stats.dailyReports.returned / stats.dailyReports.total) * 100 : 0}%` }} /></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ─── ユーティリティ ─── */
function statusBarColor(s: number) {
  switch (s) {
    case 100000000: return "bg-blue-100 text-blue-800"
    case 100000001: return "bg-yellow-100 text-yellow-800"
    case 100000002: return "bg-indigo-100 text-indigo-800"
    case 100000003: return "bg-green-100 text-green-800"
    case 100000004: return "bg-gray-100 text-gray-600"
    default: return "bg-gray-100 text-gray-600"
  }
}

function barBgColor(s: number) {
  switch (s) {
    case 100000000: return "bg-blue-500"
    case 100000001: return "bg-yellow-500"
    case 100000002: return "bg-indigo-500"
    case 100000003: return "bg-green-500"
    case 100000004: return "bg-gray-400"
    default: return "bg-gray-400"
  }
}
