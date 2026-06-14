import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useProjects, useTasks } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { TASK_STATUS_LABEL, type TaskStatus } from "@/types/dataverse"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Info } from "lucide-react"

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Info className="h-5 w-5" />
          </div>
          <CardTitle>レポートは無効です</CardTitle>
          <CardDescription>
            この機能を有効にするには、<code className="bg-muted px-1 rounded text-xs">VITE_FEATURE_REPORTS=true</code> を
            <code className="bg-muted px-1 rounded text-xs">.env</code> に設定して再起動してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto">
            {`# .env\nVITE_FEATURE_REPORTS=true`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Reports() {
  if (!FEATURE_REPORTS) return <DisabledFeatureCard />

  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: tasks = [],    isLoading: tasksLoading    } = useTasks()

  const P = PUBLISHER_PREFIX

  const fProject = {
    id:   `${P}_projectid`,
    name: `${P}_name`,
  }
  const fTask = {
    project_id: `${P}_project_id`,
    assignee:   `${P}_assignee`,
    status:     `${P}_status`,
  }

  const isLoading = projectsLoading || tasksLoading

  // 1. プロジェクト完了率
  const projectCompletionData = useMemo(() => {
    return projects.map((p) => {
      const pid   = p[fProject.id] as string
      const pname = (p[fProject.name] as string) ?? "—"
      const projectTasks = tasks.filter((t) => t[fTask.project_id] === pid)
      const total     = projectTasks.length
      const completed = projectTasks.filter((t) => (t[fTask.status] as number) === 100000002).length
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0
      return { name: pname, 完了率: rate, total, completed }
    })
  }, [projects, tasks, fProject.id, fProject.name, fTask.project_id, fTask.status])

  // 2. ステータス別タスク数
  const taskStatusData = useMemo(() => {
    const counts: Record<number, number> = {}
    tasks.forEach((t) => {
      const s = (t[fTask.status] as number) ?? 100000000
      counts[s] = (counts[s] ?? 0) + 1
    })
    return Object.entries(TASK_STATUS_LABEL).map(([value, label]) => ({
      status: label,
      count:  counts[Number(value)] ?? 0,
    }))
  }, [tasks, fTask.status])

  // 3. 担当者別タスク一覧
  const assigneeData = useMemo(() => {
    const map: Record<string, { total: number; inProgress: number; completed: number }> = {}
    tasks.forEach((t) => {
      const assignee = (t[fTask.assignee] as string) || "（未割り当て）"
      const status   = (t[fTask.status] as TaskStatus) ?? 100000000
      if (!map[assignee]) map[assignee] = { total: 0, inProgress: 0, completed: 0 }
      map[assignee].total++
      if (status === 100000001) map[assignee].inProgress++
      if (status === 100000002) map[assignee].completed++
    })
    return Object.entries(map)
      .map(([assignee, data]) => ({ assignee, ...data }))
      .sort((a, b) => b.total - a.total)
  }, [tasks, fTask.assignee, fTask.status])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">レポート</h1>
        <LoadingSkeletonGrid columns={2} count={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">レポート</h1>

      {/* 1. プロジェクト完了率 */}
      <Card>
        <CardHeader>
          <CardTitle>プロジェクト完了率</CardTitle>
          <CardDescription>各プロジェクトのタスク完了率（完了タスク / 総タスク）</CardDescription>
        </CardHeader>
        <CardContent>
          {projectCompletionData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">プロジェクトデータがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, projectCompletionData.length * 40)}>
              <BarChart
                data={projectCompletionData}
                layout="vertical"
                margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${value}%`, "完了率"]} />
                <Bar dataKey="完了率" fill="var(--color-primary)" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: number) => `${v}%`, fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 2. ステータス別タスク数 */}
      <Card>
        <CardHeader>
          <CardTitle>ステータス別タスク数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskStatusData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className="text-right font-medium">{row.count}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold border-t-2">
                  <TableCell>合計</TableCell>
                  <TableCell className="text-right">{tasks.length}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 3. 担当者別タスク一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>担当者別タスク一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {assigneeData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">タスクデータがありません</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>担当者</TableHead>
                    <TableHead className="text-right">タスク数</TableHead>
                    <TableHead className="text-right">進行中</TableHead>
                    <TableHead className="text-right">完了</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assigneeData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.assignee}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right text-blue-600">{row.inProgress}</TableCell>
                      <TableCell className="text-right text-green-600">{row.completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
