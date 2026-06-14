import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useProjects, useTasks } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  type ProjectStatus,
  type TaskStatus,
  type Priority,
} from "@/types/dataverse"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { FolderKanban, CheckSquare, AlertTriangle, Clock } from "lucide-react"

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function Dashboard() {
  const P = PUBLISHER_PREFIX

  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: tasks = [],    isLoading: tasksLoading    } = useTasks()

  const fProject = {
    id:     `${P}_projectid`,
    name:   `${P}_name`,
    status: `${P}_status`,
  }
  const fTask = {
    id:         `${P}_taskid`,
    name:       `${P}_name`,
    project_id: `${P}_project_id`,
    project_fmt:`${P}_project_id_formatted`,
    status:     `${P}_status`,
    priority:   `${P}_priority`,
    due_date:   `${P}_due_date`,
  }

  const isLoading = projectsLoading || tasksLoading

  const today = new Date().toISOString().slice(0, 10)
  const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const stats = useMemo(() => {
    const activeProjects = projects.filter((p) => (p[fProject.status] as number) === 100000001).length

    const completedTasks = tasks.filter((t) => (t[fTask.status] as number) === 100000002).length

    const overdueTasks = tasks.filter((t) => {
      const status = t[fTask.status] as number
      const due = (t[fTask.due_date] as string)?.slice(0, 10) ?? ""
      return status !== 100000002 && status !== 100000003 && due && due < today
    }).length

    const weekTasks = tasks.filter((t) => {
      const status = t[fTask.status] as number
      const due = (t[fTask.due_date] as string)?.slice(0, 10) ?? ""
      return status !== 100000002 && status !== 100000003 && due && due >= today && due <= oneWeekLater
    }).length

    return { activeProjects, completedTasks, overdueTasks, weekTasks }
  }, [projects, tasks, fProject.status, fTask.status, fTask.due_date, today, oneWeekLater])

  const projectStatusChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    projects.forEach((p) => {
      const s = (p[fProject.status] as number) ?? 100000000
      counts[s] = (counts[s] ?? 0) + 1
    })
    return Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => ({
      name: label,
      件数: counts[Number(value)] ?? 0,
    })).filter((d) => d.件数 > 0)
  }, [projects, fProject.status])

  const taskPriorityChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    tasks.forEach((t) => {
      const pr = (t[fTask.priority] as number) ?? 100000000
      counts[pr] = (counts[pr] ?? 0) + 1
    })
    return Object.entries(PRIORITY_LABEL).map(([value, label]) => ({
      name: label,
      value: counts[Number(value)] ?? 0,
    })).filter((d) => d.value > 0)
  }, [tasks, fTask.priority])

  const recentTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => (t[fTask.due_date] as string))
      .sort((a, b) => {
        const da = (a[fTask.due_date] as string) ?? ""
        const db = (b[fTask.due_date] as string) ?? ""
        return da < db ? -1 : da > db ? 1 : 0
      })
      .slice(0, 5)
  }, [tasks, fTask.due_date])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* KPIカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              進行中プロジェクト数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.activeProjects}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              完了タスク数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.completedTasks}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              遅延タスク数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.overdueTasks}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              今週締切タスク数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{stats.weekTasks}</p>
          </CardContent>
        </Card>
      </div>

      {/* チャートエリア */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* プロジェクトのステータス別件数 BarChart */}
        <Card>
          <CardHeader>
            <CardTitle>プロジェクトのステータス別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={projectStatusChartData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip />
                <Bar dataKey="件数" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* タスクの優先度別件数 PieChart */}
        <Card>
          <CardHeader>
            <CardTitle>タスクの優先度別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={taskPriorityChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {taskPriorityChartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 最近のタスク */}
      <Card>
        <CardHeader>
          <CardTitle>最近のタスク（期限が近い順 上位5件）</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">タスクデータがありません</p>
          ) : (
            <div className="divide-y divide-border">
              {recentTasks.map((task, idx) => {
                const status   = (task[fTask.status] as TaskStatus) ?? 100000000
                const priority = (task[fTask.priority] as Priority) ?? 100000000
                const name     = (task[fTask.name] as string) ?? "（名称なし）"
                const project  = (task[fTask.project_fmt] as string) ?? "—"
                const due      = (task[fTask.due_date] as string)?.slice(0, 10) ?? "—"
                return (
                  <div key={idx} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${TASK_STATUS_COLOR[status]}`}>
                        {TASK_STATUS_LABEL[status]}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${PRIORITY_COLOR[priority]}`}>
                        {PRIORITY_LABEL[priority]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">{project}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{due}</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
