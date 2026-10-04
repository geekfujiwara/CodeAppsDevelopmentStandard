import { useEffect, useMemo } from "react"
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns"
import type { Project, Task } from "@/services/construction-service"
import {
  expectedProgress,
  sortTasks,
  taskState,
  TASK_STATE_COLOR,
  TASK_STATE_LABEL,
  type TaskState,
} from "@/lib/construction-schedule"

export type FlowSelection = {
  kind: string
  title: string
  subtitle: string
  detail: string
  progress?: number
  taskId?: string
}

type Props = {
  project: Project
  tasks: Task[]
  selectedTaskId?: string
  onSelect: (selection: FlowSelection) => void
}

type TaskNodeData = { task: Task; state: TaskState; expected: number; selected: boolean; days: number }
type MarkerNodeData = { label: string; kind: "month" | "today"; height: number }
type TaskNode = Node<TaskNodeData, "task">
type MarkerNode = Node<MarkerNodeData, "marker">

const ROW = 78
const TOP = 70

function toDate(value: string, fallback: Date) {
  if (!value) return fallback
  const parsed = parseISO(value.slice(0, 10))
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function TaskBar({ data }: NodeProps<TaskNode>) {
  const { task, state, expected, selected, days } = data
  const color = TASK_STATE_COLOR[state]
  return (
    <div
      className={`h-[58px] overflow-hidden rounded-xl border bg-white text-left shadow-md transition dark:bg-slate-900 ${selected ? "ring-4 ring-yellow-300" : ""}`}
      style={{ borderColor: color, borderLeftWidth: 6 }}
      title={task.issue ? `阻害要因: ${task.issue}` : task.name}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="relative h-full px-3 py-1.5">
        <div className="absolute inset-y-0 left-0 bg-slate-200/70 dark:bg-slate-700/50" style={{ width: `${expected}%` }} />
        <div className="absolute inset-y-0 left-0 opacity-25" style={{ width: `${task.progress}%`, background: color }} />
        <div className="relative flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-black text-slate-900 dark:text-white">{task.name}</span>
          <span className="shrink-0 rounded-full px-1.5 text-[10px] font-black text-slate-950" style={{ background: color }}>{TASK_STATE_LABEL[state]}</span>
        </div>
        <div className="relative mt-0.5 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <span>実績 {task.progress}% / 予定 {expected}%</span>
          <span>{days}日{task.issue ? " ⚠" : ""}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-400" />
    </div>
  )
}

function Marker({ data }: NodeProps<MarkerNode>) {
  if (data.kind === "today") {
    return (
      <div className="pointer-events-none flex flex-col items-center" style={{ height: data.height }}>
        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">今日</span>
        <span className="w-0.5 flex-1 bg-rose-500/70" />
      </div>
    )
  }
  return (
    <div className="pointer-events-none flex flex-col" style={{ height: data.height }}>
      <span className="text-[11px] font-black text-slate-500">{data.label}</span>
      <span className="ml-0.5 w-px flex-1 bg-slate-300/60 dark:bg-slate-700/60" />
    </div>
  )
}

const nodeTypes = { task: TaskBar, marker: Marker }

export function ProjectGanttFlow({ project, tasks, selectedTaskId, onSelect }: Props) {
  const graph = useMemo(() => {
    const today = new Date()
    const sorted = sortTasks(tasks)
    const projectStart = toDate(project.startDate, today)
    const firstStart = sorted.reduce((min, task) => {
      const start = toDate(task.plannedStart, projectStart)
      return start < min ? start : min
    }, projectStart)
    const lastEnd = sorted.reduce((max, task) => {
      const end = toDate(task.plannedEnd, projectStart)
      return end > max ? end : max
    }, toDate(project.endDate, projectStart))
    const span = Math.max(30, differenceInCalendarDays(lastEnd, firstStart))
    const dayScale = Math.min(10, Math.max(1.6, 2600 / span))
    const xOf = (date: Date) => differenceInCalendarDays(date, firstStart) * dayScale + 40
    const height = sorted.length * ROW + TOP

    const markers: MarkerNode[] = []
    for (let month = startOfMonth(addMonths(firstStart, 1)); month <= lastEnd; month = addMonths(month, span > 500 ? 3 : 1)) {
      markers.push({
        id: `month-${month.toISOString()}`, type: "marker", position: { x: xOf(month), y: 0 },
        data: { label: format(month, "yyyy/MM"), kind: "month", height }, selectable: false, draggable: false, zIndex: -1,
      })
    }
    if (today >= firstStart && today <= lastEnd) {
      markers.push({
        id: "today", type: "marker", position: { x: xOf(today) - 14, y: 8 },
        data: { label: "今日", kind: "today", height: height - 8 }, selectable: false, draggable: false, zIndex: 5,
      })
    }

    const states = new Map(sorted.map((task) => [task.id, taskState(task, today)]))
    const taskNodes: TaskNode[] = sorted.map((task, index) => {
      const start = toDate(task.plannedStart, projectStart)
      const end = toDate(task.plannedEnd, start)
      const days = Math.max(1, differenceInCalendarDays(end, start) + 1)
      return {
        id: task.id,
        type: "task",
        position: { x: xOf(start), y: TOP + index * ROW },
        style: { width: Math.max(200, days * dayScale) },
        data: { task, state: states.get(task.id) ?? "planned", expected: expectedProgress(task, today), selected: task.id === selectedTaskId, days },
        draggable: false,
        connectable: false,
      }
    })

    const ids = new Set(sorted.map((task) => task.id))
    const linked = sorted.some((task) => task.predecessorId && ids.has(task.predecessorId))
    const pairs = linked
      ? sorted.filter((task) => task.predecessorId && ids.has(task.predecessorId)).map((task) => [task.predecessorId, task.id] as const)
      : sorted.slice(1).map((task, index) => [sorted[index].id, task.id] as const)
    const edges: Edge[] = pairs.map(([source, target]) => {
      const sourceState = states.get(source)
      const impact = sourceState === "delayed"
      const color = impact ? "#f59e0b" : sourceState === "done" ? "#22c55e" : "#06b6d4"
      return {
        id: `dep-${source}-${target}`, source, target, type: "smoothstep",
        animated: sourceState !== "done",
        label: impact ? "遅延が波及" : undefined,
        labelStyle: { fill: "#92400e", fontWeight: 800, fontSize: 11 },
        labelBgStyle: { fill: "#fef3c7" },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: { stroke: color, strokeWidth: impact ? 3 : 2 },
      }
    })
    return { nodes: [...markers, ...taskNodes] as Node[], edges }
  }, [project, selectedTaskId, tasks])

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setEdges, setNodes])

  if (!tasks.length) {
    return <div className="grid h-full min-h-80 place-items-center rounded-2xl border border-dashed bg-card/60 text-muted-foreground">作業工程がありません。</div>
  }

  return (
    <div className="h-full min-h-80 overflow-hidden rounded-2xl border bg-card/70" data-tour="project-gantt">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (node.type !== "task") return
          const { task, state, expected } = node.data as TaskNodeData
          onSelect({
            kind: "作業", title: task.name, taskId: task.id, progress: task.progress,
            subtitle: `${task.plannedStart.slice(0, 10)} — ${task.plannedEnd.slice(0, 10)}`,
            detail: `${TASK_STATE_LABEL[state]} / 実績 ${task.progress}% / 予定 ${expected}%${task.issue ? ` / 阻害要因: ${task.issue}` : ""}`,
          })
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
      >
        <Background color="#334155" gap={24} size={1} />
        <MiniMap pannable zoomable nodeColor={(node) => node.type === "task" ? TASK_STATE_COLOR[(node.data as TaskNodeData).state] : "transparent"} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
