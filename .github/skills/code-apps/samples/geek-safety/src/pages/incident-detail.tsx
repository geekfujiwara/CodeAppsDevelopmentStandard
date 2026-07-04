import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { StagePath } from "@/components/stage-path"
import {
  useIncidents,
  useUpdateIncident,
  useActions,
  useCreateAction,
  useUpdateAction,
  useDeleteAction,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_ACTIONS } from "@/config"
import {
  INCIDENT_STAGE_PATH_ITEMS,
  INCIDENT_STATUS_LABEL,
  SEVERITY_LABEL,
  SEVERITY_COLOR,
  ACTION_STATUS_LABEL,
  ACTION_STATUS_COLOR,
  ACTION_STATUS_OPTIONS,
  ACTION_STATUS_COMPLETED,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Pencil, Trash2, MapPin, User, CalendarDays, Tag, AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:            `${P}_incidentid`,
  name:          `${P}_name`,
  site:          `${P}_site`,
  category:      `${P}_category`,
  severity:      `${P}_severity`,
  status:        `${P}_status`,
  reporter:      `${P}_reporter`,
  occurred_date: `${P}_occurred_date`,
  description:   `${P}_description`,
  cause:         `${P}_cause`,
  notes:         `${P}_notes`,
}

const a = {
  id:           `${P}_corrective_actionid`,
  name:         `${P}_name`,
  incident_ref: `${P}_incident_ref`,
  assignee:     `${P}_assignee`,
  status:       `${P}_status`,
  due_date:     `${P}_due_date`,
}

type ActionForm = { name: string; assignee: string; status: string; due_date: string }
const EMPTY_ACTION: ActionForm = { name: "", assignee: "", status: String(100000000), due_date: "" }

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: incidents = [], isLoading } = useIncidents()
  const { data: allActions = [] } = useActions()
  const updateIncident = useUpdateIncident()
  const createAction = useCreateAction()
  const updateAction = useUpdateAction()
  const deleteAction = useDeleteAction()

  const [isActionFormOpen, setIsActionFormOpen] = useState(false)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [actionForm, setActionForm] = useState<ActionForm>(EMPTY_ACTION)
  const [deleteActionId, setDeleteActionId] = useState<string | null>(null)

  const incident = useMemo(
    () => incidents.find(r => String(r[f.id] ?? "") === id),
    [incidents, id]
  )

  const actions = useMemo(
    () => allActions
      .filter(ac => String(ac[a.incident_ref] ?? "") === id)
      .sort((x, y) => String(x[a.due_date] ?? "").localeCompare(String(y[a.due_date] ?? ""))),
    [allActions, id]
  )

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = (action: Record<string, unknown>) =>
    (action[a.status] as number) !== ACTION_STATUS_COMPLETED &&
    !!action[a.due_date] && String(action[a.due_date]) < today

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">報告詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!incident || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/incidents")}>
          <ArrowLeft className="h-4 w-4" />報告一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>報告が見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = incident[f.status] as number | undefined
  const severity = incident[f.severity] as number | undefined

  const handleStageSelect = async (value: number) => {
    try {
      await updateIncident.mutateAsync({ id, data: { [f.status]: value } })
      toast.success(`ステータスを「${(INCIDENT_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleNewAction = () => {
    setEditingActionId(null)
    setActionForm(EMPTY_ACTION)
    setIsActionFormOpen(true)
  }

  const handleEditAction = (action: Record<string, unknown>) => {
    setEditingActionId(String(action[a.id] ?? ""))
    setActionForm({
      name:     String(action[a.name] ?? ""),
      assignee: String(action[a.assignee] ?? ""),
      status:   action[a.status] != null ? String(action[a.status]) : String(100000000),
      due_date: String(action[a.due_date] ?? ""),
    })
    setIsActionFormOpen(true)
  }

  const handleSaveAction = async () => {
    if (!actionForm.name.trim()) {
      toast.error("措置内容は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [a.name]:         actionForm.name,
      [a.incident_ref]: id,
      [a.assignee]:     actionForm.assignee,
    }
    if (actionForm.status) data[a.status] = Number(actionForm.status)
    if (actionForm.due_date) data[a.due_date] = actionForm.due_date
    try {
      if (editingActionId) {
        await updateAction.mutateAsync({ id: editingActionId, data })
        toast.success("是正措置を更新しました")
      } else {
        await createAction.mutateAsync(data)
        toast.success("是正措置を追加しました")
      }
      setIsActionFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDeleteAction = async () => {
    if (!deleteActionId) return
    try {
      await deleteAction.mutateAsync(deleteActionId)
      toast.success("是正措置を削除しました")
      setDeleteActionId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/incidents")}>
          <ArrowLeft className="h-4 w-4" />報告一覧へ戻る
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{String(incident[f.name] ?? "")}</h1>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">拠点・場所</div>
                <div className="truncate text-sm font-medium">{String(incident[f.site] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">種別 / 重大度</div>
                <div className="truncate text-sm font-medium">
                  {String(incident[f.category] ?? "—")}
                  {severity != null && (
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLOR[severity as keyof typeof SEVERITY_COLOR] ?? ""}`}>
                      {SEVERITY_LABEL[severity as keyof typeof SEVERITY_LABEL] ?? ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">報告者</div>
                <div className="truncate text-sm font-medium">{String(incident[f.reporter] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">発生日</div>
                <div className="truncate text-sm font-medium">{String(incident[f.occurred_date] ?? "—")}</div>
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={INCIDENT_STAGE_PATH_ITEMS}
              current={status}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 状況詳細・原因 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">状況詳細</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {String(incident[f.description] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">原因</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {String(incident[f.cause] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 是正措置 */}
      {FEATURE_ACTIONS ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">是正措置</CardTitle>
                <CardDescription>{actions.length} 件（期限の近い順）</CardDescription>
              </div>
              <Button size="sm" className="gap-1" onClick={handleNewAction}>
                <Plus className="h-3.5 w-3.5" />措置を追加
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>措置内容</TableHead>
                    <TableHead>担当者</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>期限</TableHead>
                    <TableHead className="w-[80px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        是正措置がありません。「措置を追加」から登録してください
                      </TableCell>
                    </TableRow>
                  ) : (
                    actions.map((action, idx) => {
                      const actionStatus = action[a.status] as number | undefined
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium max-w-[280px] truncate">{String(action[a.name] ?? "")}</TableCell>
                          <TableCell>{String(action[a.assignee] ?? "")}</TableCell>
                          <TableCell>
                            {actionStatus != null && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STATUS_COLOR[actionStatus as keyof typeof ACTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                                {ACTION_STATUS_LABEL[actionStatus as keyof typeof ACTION_STATUS_LABEL] ?? String(actionStatus)}
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
                                onClick={() => handleEditAction(action)}
                                title="編集"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeleteActionId(String(action[a.id] ?? ""))}
                                title="削除"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">是正措置</CardTitle>
            <CardDescription>
              是正措置の管理は現在無効になっています。有効にするには .env の{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_ACTIONS=true</code>{" "}
              を設定してください。
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* 備考 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">備考</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(incident[f.notes] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 是正措置フォーム */}
      <FormModal
        open={isActionFormOpen}
        onOpenChange={setIsActionFormOpen}
        title={editingActionId ? "是正措置編集" : "是正措置追加"}
        onSave={handleSaveAction}
        isSaving={createAction.isPending || updateAction.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="action_name">措置内容 <span className="text-destructive">*</span></Label>
            <Input
              id="action_name"
              value={actionForm.name}
              onChange={e => setActionForm(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 通路の滑り止めマット設置"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="action_assignee">担当者</Label>
              <Input
                id="action_assignee"
                value={actionForm.assignee}
                onChange={e => setActionForm(p => ({ ...p, assignee: e.target.value }))}
                placeholder="担当者名"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="action_due">期限</Label>
              <Input
                id="action_due"
                type="date"
                value={actionForm.due_date}
                onChange={e => setActionForm(p => ({ ...p, due_date: e.target.value }))}
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>ステータス</Label>
            <Select value={actionForm.status} onValueChange={v => setActionForm(p => ({ ...p, status: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="ステータスを選択" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>

      {/* 是正措置削除確認 */}
      <ConfirmDialog
        open={!!deleteActionId}
        onOpenChange={open => { if (!open) setDeleteActionId(null) }}
        title="是正措置を削除しますか？"
        description="この操作は取り消せません。是正措置を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDeleteAction}
      />
    </div>
  )
}
