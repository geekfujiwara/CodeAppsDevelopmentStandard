import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useIncidents,
  useActions,
  useUpdateAction,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_ACTIONS } from "@/config"
import {
  ACTION_STATUS_LABEL,
  ACTION_STATUS_COLOR,
  ACTION_STATUS_OPTIONS,
  ACTION_STATUS_COMPLETED,
} from "@/types/dataverse"
import { Search, AlertTriangle, CheckCircle2, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const a = {
  id:           `${P}_corrective_actionid`,
  name:         `${P}_name`,
  incident_ref: `${P}_incident_ref`,
  assignee:     `${P}_assignee`,
  status:       `${P}_status`,
  due_date:     `${P}_due_date`,
}

const inc = {
  id:   `${P}_incidentid`,
  name: `${P}_name`,
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            是正措置は現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_ACTIONS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function ActionsPage() {
  if (!FEATURE_ACTIONS) return <DisabledFeatureCard />
  return <ActionsContent />
}

function ActionsContent() {
  const navigate = useNavigate()
  const { data: actions = [], isLoading } = useActions()
  const { data: incidents = [] } = useIncidents()
  const updateAction = useUpdateAction()

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const incidentNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of incidents) {
      map.set(String(r[inc.id] ?? ""), String(r[inc.name] ?? ""))
    }
    return map
  }, [incidents])

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = (action: Record<string, unknown>) =>
    (action[a.status] as number) !== ACTION_STATUS_COMPLETED &&
    !!action[a.due_date] && String(action[a.due_date]) < today

  const filtered = actions
    .filter(ac => {
      const q = search.toLowerCase()
      const incidentName = incidentNameMap.get(String(ac[a.incident_ref] ?? "")) ?? ""
      const matchSearch = !q ||
        String(ac[a.name] ?? "").toLowerCase().includes(q) ||
        String(ac[a.assignee] ?? "").toLowerCase().includes(q) ||
        incidentName.toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(ac[a.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((x, y) => {
      const xDone = (x[a.status] as number) === ACTION_STATUS_COMPLETED ? 1 : 0
      const yDone = (y[a.status] as number) === ACTION_STATUS_COMPLETED ? 1 : 0
      if (xDone !== yDone) return xDone - yDone
      return String(x[a.due_date] ?? "").localeCompare(String(y[a.due_date] ?? ""))
    })

  const handleComplete = async (actionId: string) => {
    try {
      await updateAction.mutateAsync({ id: actionId, data: { [a.status]: ACTION_STATUS_COMPLETED } })
      toast.success("是正措置を完了にしました")
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">是正措置</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">是正措置</h1>
        <p className="text-muted-foreground text-sm mt-1">全報告の是正措置を横断管理します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>是正措置一覧</CardTitle>
          <CardDescription>{filtered.length} 件（未完了優先・期限の近い順）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="措置内容・担当者・報告件名で検索..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {ACTION_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>措置内容</TableHead>
                  <TableHead>対象の報告</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>期限</TableHead>
                  <TableHead className="w-[130px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      是正措置がありません（報告詳細画面から追加します）
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((action, idx) => {
                    const status = action[a.status] as number | undefined
                    const incidentId = String(action[a.incident_ref] ?? "")
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[260px] truncate">{String(action[a.name] ?? "")}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {incidentNameMap.get(incidentId) || "—"}
                        </TableCell>
                        <TableCell>{String(action[a.assignee] ?? "")}</TableCell>
                        <TableCell>
                          {status != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STATUS_COLOR[status as keyof typeof ACTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {ACTION_STATUS_LABEL[status as keyof typeof ACTION_STATUS_LABEL] ?? String(status)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            {String(action[a.due_date] ?? "")}
                            {isOverdue(action) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                <AlertTriangle className="h-3 w-3" />期限超過
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => navigate(`/incidents/${incidentId}`)}
                              title="報告を開く"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {status !== ACTION_STATUS_COMPLETED && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => handleComplete(String(action[a.id] ?? ""))}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />完了
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
