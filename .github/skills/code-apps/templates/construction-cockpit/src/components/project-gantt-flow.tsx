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
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import type { Project, Task } from "@/services/construction-service"

export type FlowSelection = {
  kind: string
  title: string
  subtitle: string
  detail: string
  progress?: number
}

type Props = {
  project: Project
  tasks: Task[]
  onSelect: (selection: FlowSelection) => void
}

const statusColors: Record<number, string> = {
  100000000: "#64748b",
  100000001: "#06b6d4",
  100000002: "#84cc16",
}

function toDate(value: string, fallback: string) {
  const candidate = value || fallback
  const parsed = parseISO(candidate)
  return Number.isNaN(parsed.getTime()) ? parseISO(fallback) : parsed
}

export function ProjectGanttFlow({ project, tasks, onSelect }: Props) {
  const graph = useMemo(() => {
    const projectStart = toDate(project.startDate, new Date().toISOString())
    const sorted = [...tasks].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))
    const dayScale = 8

    const nodes: Node[] = sorted.map((task, index) => {
      const start = toDate(task.plannedStart, project.startDate)
      const end = toDate(task.plannedEnd, task.plannedStart || project.endDate)
      const offset = Math.max(0, differenceInCalendarDays(start, projectStart))
      const duration = Math.max(1, differenceInCalendarDays(end, start) + 1)
      const width = Math.max(190, duration * dayScale)
      const color = statusColors[task.status] ?? statusColors[100000000]
      const selection: FlowSelection = {
        kind: "作業",
        title: task.name,
        subtitle: `${format(start, "yyyy/MM/dd")} — ${format(end, "yyyy/MM/dd")}`,
        detail: `予定 ${duration}日 / 進捗 ${task.progress}%`,
        progress: task.progress,
      }

      return {
        id: task.id,
        position: { x: offset * dayScale + 80, y: index * 104 + 70 },
        data: { label: task.name, selection },
        style: {
          width,
          border: `1px solid ${color}`,
          borderLeft: `6px solid ${color}`,
          borderRadius: 14,
          background: "var(--card)",
          color: "var(--card-foreground)",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
          padding: "14px 16px",
          fontWeight: 700,
        },
      }
    })

    const edges: Edge[] = sorted.slice(1).map((task, index) => ({
      id: `dependency-${sorted[index].id}-${task.id}`,
      source: sorted[index].id,
      target: task.id,
      type: "smoothstep",
      animated: sorted[index].status !== 100000002,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#06b6d4", strokeWidth: 2 },
    }))

    return { nodes, edges }
  }, [project, tasks])

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setEdges, setNodes])

  if (!tasks.length) {
    return <div className="grid h-[34rem] place-items-center rounded-2xl border border-dashed bg-card/60 text-muted-foreground">作業工程がありません。</div>
  }

  return (
    <div className="h-[34rem] overflow-hidden rounded-2xl border bg-card/70">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelect((node.data as { selection: FlowSelection }).selection)}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
      >
        <Background color="#334155" gap={24} size={1} />
        <MiniMap pannable zoomable nodeColor={(node) => String(node.style?.borderLeftColor ?? "#06b6d4")} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
