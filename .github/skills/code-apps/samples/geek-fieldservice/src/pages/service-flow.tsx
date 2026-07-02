import { useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ReactFlow, ReactFlowProvider, Background, type Node, type Edge, Position, Handle, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useCalls, useWorkOrders, useDailyReports } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { CALL_STATUS_LABEL, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, WORK_ORDER_TYPE_LABEL } from "@/types/dataverse"
import type { CallStatus, WorkOrderStatus, WorkOrderType } from "@/types/dataverse"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX

/* ─── カスタムノード ─── */

function SourceNode({ data }: NodeProps) {
  const d = data as { label: string; count: number; total: number; color: string }
  return (
    <div className="border rounded-lg p-3 bg-background shadow-sm min-w-[160px] cursor-pointer hover:border-primary/50 hover:shadow-md transition-all">
      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1"><div className={cn("w-2.5 h-2.5 rounded-full", d.color)} /><span className="text-xs font-medium">{d.label}</span></div>
      <div className="flex items-baseline gap-1"><span className="text-xl font-bold">{d.count}</span><span className="text-xs text-muted-foreground">/ {d.total} 件</span></div>
    </div>
  )
}

function CenterNode({ data }: NodeProps) {
  const d = data as { label: string; total: number; items: { label: string; count: number; color: string }[] }
  return (
    <div className="border-2 border-primary/30 rounded-xl p-4 bg-muted/30 shadow-md min-w-[220px] cursor-pointer hover:border-primary/60 hover:shadow-lg transition-all">
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
      <div className="text-center mb-3"><div className="text-2xl font-bold text-foreground">{d.total}</div><div className="text-xs text-muted-foreground">{d.label}</div></div>
      <div className="grid grid-cols-2 gap-1.5">
        {d.items.map((it, i) => (
          <div key={i} className="flex items-center gap-1"><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${it.color}`}>{it.label}</span><span className="text-xs font-semibold">{it.count}</span></div>
        ))}
      </div>
    </div>
  )
}

function EndNode({ data }: NodeProps) {
  const d = data as { label: string; total: number; approved: number; pending: number }
  return (
    <div className="border-2 border-green-200 rounded-xl p-4 bg-green-50/30 dark:bg-green-950/20 shadow-md min-w-[180px] cursor-pointer hover:border-green-400 hover:shadow-lg transition-all">
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />
      <div className="text-center mb-3"><div className="text-2xl font-bold text-foreground">{d.total}</div><div className="text-xs text-muted-foreground">{d.label}</div></div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-xs">承認済</span><span className="ml-auto text-sm font-semibold">{d.approved}</span></div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-xs">未承認</span><span className="ml-auto text-sm font-semibold">{d.pending}</span></div>
      </div>
    </div>
  )
}

const nodeTypes = { source: SourceNode, center: CenterNode, end: EndNode }

/* ─── メインコンポーネント ─── */

const NODE_ROUTES: Record<string, string> = {
  call: "/calls",
  maint: "/work-orders",
  iot: "/work-orders",
  wo: "/work-orders",
  daily: "/daily-reports",
}

export default function ServiceFlowPage() {
  const navigate = useNavigate()
  const { data: calls = [], isLoading: l1 } = useCalls()
  const { data: workOrders = [], isLoading: l2 } = useWorkOrders()
  const { data: dailyReports = [], isLoading: l3 } = useDailyReports()
  const isLoading = l1 || l2 || l3

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const route = NODE_ROUTES[node.id]
    if (route) navigate(route)
  }, [navigate])

  const { nodes, edges, stats } = useMemo(() => {
    // コール集計
    const callByStatus = new Map<number, number>()
    calls.forEach(c => { const s = Number(c[`${P}_status`] ?? 0); callByStatus.set(s, (callByStatus.get(s) ?? 0) + 1) })

    // WO集計
    const woByStatus = new Map<number, number>()
    const woByType = new Map<number, number>()
    const woFromCall = workOrders.filter(w => w[`_${P}_callid_value`]).length
    const woFromMaint = workOrders.filter(w => Number(w[`${P}_worktype`]) === 100000001).length
    const woFromIoT = workOrders.filter(w => Number(w[`${P}_worktype`]) === 100000002).length
    workOrders.forEach(w => {
      const s = Number(w[`${P}_status`] ?? 0); woByStatus.set(s, (woByStatus.get(s) ?? 0) + 1)
      const t = Number(w[`${P}_worktype`] ?? 0); woByType.set(t, (woByType.get(t) ?? 0) + 1)
    })

    // 日報集計
    const dailyTotal = dailyReports.length
    const dailyApproved = dailyReports.filter(d => Number(d[`${P}_approvalstatus`]) === 100000002).length
    const dailyPending = dailyTotal - dailyApproved

    // ノード定義
    const ns: Node[] = [
      { id: "call", type: "source", position: { x: 0, y: 60 }, data: { label: "コール", count: woFromCall, total: calls.length, color: "bg-blue-500" } },
      { id: "maint", type: "source", position: { x: 0, y: 180 }, data: { label: "定期メンテナンス", count: woFromMaint, total: woFromMaint, color: "bg-teal-500" } },
      { id: "iot", type: "source", position: { x: 0, y: 300 }, data: { label: "IoTリモートサービス", count: woFromIoT, total: woFromIoT, color: "bg-purple-500" } },
      { id: "wo", type: "center", position: { x: 320, y: 100 }, data: {
        label: "作業オーダー", total: workOrders.length,
        items: [100000000, 100000001, 100000002, 100000003].map(s => ({
          label: WORK_ORDER_STATUS_LABEL[s as WorkOrderStatus],
          count: woByStatus.get(s) ?? 0,
          color: WORK_ORDER_STATUS_COLOR[s as WorkOrderStatus],
        })),
      }},
      { id: "daily", type: "end", position: { x: 640, y: 130 }, data: { label: "日報", total: dailyTotal, approved: dailyApproved, pending: dailyPending } },
    ]

    // エッジ定義
    const es: Edge[] = [
      { id: "call-wo", source: "call", target: "wo", type: "smoothstep", animated: true, style: { strokeWidth: 2 }, label: String(woFromCall) },
      { id: "maint-wo", source: "maint", target: "wo", type: "smoothstep", animated: true, style: { strokeWidth: 2 }, label: String(woFromMaint) },
      { id: "iot-wo", source: "iot", target: "wo", type: "smoothstep", animated: true, style: { strokeWidth: 2 }, label: String(woFromIoT) },
      { id: "wo-daily", source: "wo", target: "daily", type: "smoothstep", animated: true, style: { strokeWidth: 2 }, label: String(workOrders.filter(w => w[`_${P}_dailyreportid_value`]).length) },
    ]

    return {
      nodes: ns, edges: es,
      stats: {
        calls: { total: calls.length, byStatus: callByStatus },
        workOrders: { total: workOrders.length, byStatus: woByStatus, byType: woByType, fromCall: woFromCall, fromMaint: woFromMaint, fromIoT: woFromIoT },
        dailyReports: { total: dailyTotal, approved: dailyApproved, pending: dailyPending },
      },
    }
  }, [calls, workOrders, dailyReports])

  const onInit = useCallback((instance: { fitView: () => void }) => { instance.fitView() }, [])

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">サービスフロー</h1><LoadingSkeletonList count={3} /></div>

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">サービスフロー</h1><p className="text-muted-foreground text-sm mt-1">コール → 作業オーダー → 日報の業務フロー件数・ステータス可視化</p></div>

      {/* フローダイアグラム */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">業務フローマップ</CardTitle><CardDescription>各ステージの流入経路と件数</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="h-[380px] w-full">
            <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onInit={onInit}
              onNodeClick={onNodeClick}
              fitView
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "smoothstep", animated: true }}
            >
              <Background gap={20} size={1} color="hsl(var(--border))" />
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
              <div className="flex justify-between text-xs text-muted-foreground"><span>IoTリモートサービス</span><span className="font-medium text-foreground">{stats.workOrders.fromIoT}</span></div>
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
                <div className="flex justify-between text-xs"><span className="text-yellow-700 font-medium">未承認</span><span className="font-medium">{stats.dailyReports.pending}</span></div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-yellow-500" style={{ width: `${stats.dailyReports.total > 0 ? (stats.dailyReports.pending / stats.dailyReports.total) * 100 : 0}%` }} /></div>
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
