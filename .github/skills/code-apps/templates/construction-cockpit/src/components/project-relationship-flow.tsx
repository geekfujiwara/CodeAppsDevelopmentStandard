import { useEffect, useMemo } from "react"
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react"
import type {
  DailyReport,
  Equipment,
  EquipmentUsage,
  Incident,
  Knowledge,
  KyActivity,
  Project,
  Task,
} from "@/services/construction-service"
import type { FlowSelection } from "@/components/project-gantt-flow"

type Props = {
  project: Project
  tasks: Task[]
  reports: DailyReport[]
  incidents: Incident[]
  kyActivities: KyActivity[]
  knowledge: Knowledge[]
  equipment: Equipment[]
  equipmentUsage: EquipmentUsage[]
  onSelect: (selection: FlowSelection) => void
}

type GraphItem = {
  id: string
  parentId: string
  title: string
  subtitle: string
  detail: string
  color: string
  x: number
  y: number
}

const nodeStyle = (color: string, emphasized = false) => ({
  width: emphasized ? 250 : 210,
  border: `1px solid ${color}`,
  borderTop: `5px solid ${color}`,
  borderRadius: 16,
  background: "var(--card)",
  color: "var(--card-foreground)",
  boxShadow: emphasized ? "0 22px 60px rgba(6, 182, 212, 0.22)" : "0 12px 30px rgba(15, 23, 42, 0.12)",
  padding: emphasized ? "22px" : "14px 16px",
  fontWeight: 700,
})

export function ProjectRelationshipFlow({
  project,
  tasks,
  reports,
  incidents,
  kyActivities,
  knowledge,
  equipment,
  equipmentUsage,
  onSelect,
}: Props) {
  const graph = useMemo(() => {
    const projectNode: Node = {
      id: `project-${project.id}`,
      position: { x: 520, y: 360 },
      data: {
        label: project.name,
        selection: {
          kind: "工事",
          title: project.name,
          subtitle: project.projectNo,
          detail: `${project.client} / 進捗 ${project.progress}%`,
          progress: project.progress,
        } satisfies FlowSelection,
      },
      style: nodeStyle("#06b6d4", true),
    }

    const projectId = projectNode.id
    const orderedTasks = [...tasks].sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.plannedStart.localeCompare(b.plannedStart))
    const taskRow = new Map(orderedTasks.map((item, index) => [item.id, index]))
    const rowY = (index: number) => 40 + index * 120
    const cursors = new Map<number, number>()
    const place = (column: number, preferred: number) => {
      const y = Math.max(preferred, cursors.get(column) ?? -Infinity)
      cursors.set(column, y + 110)
      return y
    }
    const parentTask = (taskId: string) => (taskRow.has(taskId) ? `task-${taskId}` : projectId)
    const byTaskRow = <T extends { taskId: string }>(rows: T[]) =>
      [...rows].sort((a, b) => (taskRow.get(a.taskId) ?? 999) - (taskRow.get(b.taskId) ?? 999))

    const items: GraphItem[] = [
      ...orderedTasks.map((item, index) => ({
        id: `task-${item.id}`, parentId: projectId, title: item.name, subtitle: "作業",
        detail: `進捗 ${item.progress}%${item.issue ? ` / 阻害要因: ${item.issue}` : ""}`,
        color: item.issue ? "#f59e0b" : "#84cc16", x: 40, y: rowY(index),
      })),
      ...byTaskRow(kyActivities.slice(0, 10)).map((item) => ({
        id: `ky-${item.id}`, parentId: parentTask(item.taskId), title: `${item.date.slice(0, 10)} ${item.hazards || item.name}`, subtitle: "KY",
        detail: `危険度 ${item.riskLevel === 100000000 ? "高" : item.riskLevel === 100000001 ? "中" : "低"} / 対策: ${item.countermeasures}`,
        color: "#f59e0b", x: 340, y: place(1, rowY(taskRow.get(item.taskId) ?? 0)),
      })),
      ...byTaskRow(incidents).map((item) => ({
        id: `incident-${item.id}`, parentId: parentTask(item.taskId), title: item.name, subtitle: "ヒヤリハット",
        detail: item.description || "内容未登録", color: "#f43f5e", x: 640, y: place(2, rowY(taskRow.get(item.taskId) ?? 0)),
      })),
    ]

    const incidentIds = new Set(incidents.map((item) => item.id))
    knowledge
      .filter((item) => incidentIds.has(item.sourceIncidentId))
      .forEach((item) => {
        const source = items.find((entry) => entry.id === `incident-${item.sourceIncidentId}`)
        items.push({
          id: `knowledge-${item.id}`,
          parentId: `incident-${item.sourceIncidentId}`,
          title: item.name,
          subtitle: "ナレッジ",
          detail: item.lesson || item.event,
          color: "#38bdf8",
          x: 940,
          y: place(3, source?.y ?? 0),
        })
      })

    const recentReports = reports.slice(0, 8)
    recentReports.forEach((item) => {
      items.push({
        id: `report-${item.id}`, parentId: projectId, title: item.name, subtitle: "日報",
        detail: `${item.reportDate.slice(0, 10)} / ${item.workers}人`, color: "#a78bfa", x: 1260, y: place(4, 40),
      })
    })

    const projectReportIds = new Set(recentReports.map((item) => item.id))
    const usages = equipmentUsage.filter((item) => projectReportIds.has(item.reportId))
    usages.forEach((usage) => {
      const machine = equipment.find((item) => item.id === usage.equipmentId)
      const report = items.find((entry) => entry.id === `report-${usage.reportId}`)
      items.push({
        id: `usage-${usage.id}`,
        parentId: `report-${usage.reportId}`,
        title: machine?.name ?? usage.name,
        subtitle: "重機稼働",
        detail: `${usage.hours}時間`,
        color: "#14b8a6",
        x: 1560,
        y: place(5, report?.y ?? 0),
      })
    })
    projectNode.position = { x: -330, y: Math.max(40, rowY(Math.max(0, orderedTasks.length - 1)) / 2) }

    const nodes: Node[] = [
      projectNode,
      ...items.map((item) => ({
        id: item.id,
        position: { x: item.x, y: item.y },
        data: {
          label: item.title,
          selection: {
            kind: item.subtitle,
            title: item.title,
            subtitle: item.subtitle,
            detail: item.detail,
            taskId: item.id.startsWith("task-") ? item.id.slice(5) : undefined,
          } satisfies FlowSelection,
        },
        style: nodeStyle(item.color),
      })),
    ]
    const edges: Edge[] = items.map((item) => ({
      id: `edge-${item.parentId}-${item.id}`,
      source: item.parentId,
      target: item.id,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: item.color, strokeWidth: 2, opacity: 0.8 },
    }))
    for (const task of orderedTasks) {
      if (!task.predecessorId || !taskRow.has(task.predecessorId)) continue
      edges.push({
        id: `pred-${task.predecessorId}-${task.id}`,
        source: `task-${task.predecessorId}`,
        target: `task-${task.id}`,
        type: "smoothstep",
        label: "先行",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#64748b", strokeWidth: 1.5, strokeDasharray: "6 4" },
      })
    }

    return { nodes, edges }
  }, [equipment, equipmentUsage, incidents, knowledge, kyActivities, project, reports, tasks])

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setEdges, setNodes])

  return (
    <div className="h-full min-h-80 overflow-hidden rounded-2xl border bg-card/70">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelect((node.data as { selection: FlowSelection }).selection)}
        nodesDraggable
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
      >
        <Background color="#334155" gap={28} size={1} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
