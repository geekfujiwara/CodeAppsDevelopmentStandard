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
import { Progress } from "@/components/ui/progress"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { StagePath } from "@/components/stage-path"
import { exportCsv, type CsvColumn } from "@/lib/csv-export"
import {
  useEvents,
  useUpdateEvent,
  useRegistrations,
  useCreateRegistration,
  useUpdateRegistration,
  useDeleteRegistration,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_CSV_EXPORT } from "@/config"
import {
  EVENT_STAGE_PATH_ITEMS,
  EVENT_STATUS_LABEL,
  EVENT_STATUS_CANCELLED,
  REGISTRATION_STATUS_LABEL,
  REGISTRATION_STATUS_COLOR,
  REGISTRATION_STATUS_OPTIONS,
  REGISTRATION_ATTENDED,
  REGISTRATION_ACTIVE_STATUSES,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Pencil, Trash2, MapPin, CalendarDays, Users, CheckCircle2, Download, Tag,
} from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:          `${P}_eventid`,
  name:        `${P}_name`,
  category:    `${P}_category`,
  venue:       `${P}_venue`,
  organizer:   `${P}_organizer`,
  status:      `${P}_status`,
  start_date:  `${P}_start_date`,
  capacity:    `${P}_capacity`,
  description: `${P}_description`,
}

const r = {
  id:              `${P}_registrationid`,
  name:            `${P}_name`,
  event_ref:       `${P}_event_ref`,
  department:      `${P}_department`,
  status:          `${P}_status`,
  registered_date: `${P}_registered_date`,
}

type RegForm = { name: string; department: string; status: string; registered_date: string }
const EMPTY_REG: RegForm = { name: "", department: "", status: String(100000000), registered_date: "" }

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: events = [], isLoading } = useEvents()
  const { data: allRegistrations = [] } = useRegistrations()
  const updateEvent = useUpdateEvent()
  const createRegistration = useCreateRegistration()
  const updateRegistration = useUpdateRegistration()
  const deleteRegistration = useDeleteRegistration()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RegForm>(EMPTY_REG)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const event = useMemo(
    () => events.find(ev => String(ev[f.id] ?? "") === id),
    [events, id]
  )

  const registrations = useMemo(
    () => allRegistrations
      .filter(reg => String(reg[r.event_ref] ?? "") === id)
      .sort((a, b) => String(a[r.registered_date] ?? "").localeCompare(String(b[r.registered_date] ?? ""))),
    [allRegistrations, id]
  )

  const activeCount = useMemo(
    () => registrations.filter(reg => REGISTRATION_ACTIVE_STATUSES.includes(reg[r.status] as number)).length,
    [registrations]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">イベント詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!event || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/events")}>
          <ArrowLeft className="h-4 w-4" />イベント一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>イベントが見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = event[f.status] as number | undefined
  const capacity = (event[f.capacity] as number) ?? 0
  const fillRate = capacity > 0 ? Math.min(100, Math.round((activeCount / capacity) * 100)) : 0

  const handleStageSelect = async (value: number) => {
    try {
      await updateEvent.mutateAsync({ id, data: { [f.status]: value } })
      toast.success(`ステータスを「${(EVENT_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleNew = () => {
    setEditingId(null)
    setForm({ ...EMPTY_REG, registered_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (registration: Record<string, unknown>) => {
    setEditingId(String(registration[r.id] ?? ""))
    setForm({
      name:            String(registration[r.name] ?? ""),
      department:      String(registration[r.department] ?? ""),
      status:          registration[r.status] != null ? String(registration[r.status]) : String(100000000),
      registered_date: String(registration[r.registered_date] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("参加者名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [r.name]:       form.name,
      [r.event_ref]:  id,
      [r.department]: form.department,
    }
    if (form.status) data[r.status] = Number(form.status)
    if (form.registered_date) data[r.registered_date] = form.registered_date
    try {
      if (editingId) {
        await updateRegistration.mutateAsync({ id: editingId, data })
        toast.success("参加登録を更新しました")
      } else {
        await createRegistration.mutateAsync(data)
        toast.success("参加者を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleAttend = async (registrationId: string) => {
    try {
      await updateRegistration.mutateAsync({
        id: registrationId,
        data: { [r.status]: REGISTRATION_ATTENDED },
      })
      toast.success("出席にしました")
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteRegistration.mutateAsync(deleteId)
      toast.success("参加登録を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  // CSV 出力（csv-export-pattern.md）: OptionSet はラベル変換して出力する
  const CSV_COLUMNS: CsvColumn<Record<string, unknown>>[] = [
    { header: "参加者名", value: reg => String(reg[r.name] ?? "") },
    { header: "部門",     value: reg => String(reg[r.department] ?? "") },
    { header: "ステータス", value: reg => REGISTRATION_STATUS_LABEL[reg[r.status] as keyof typeof REGISTRATION_STATUS_LABEL] ?? "" },
    { header: "登録日",   value: reg => String(reg[r.registered_date] ?? "") },
  ]

  const handleExport = () => {
    exportCsv(`参加者一覧_${String(event[f.name] ?? "")}`, CSV_COLUMNS, registrations)
    toast.success(`${registrations.length} 件を CSV 出力しました`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/events")}>
            <ArrowLeft className="h-4 w-4" />イベント一覧へ戻る
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{String(event[f.name] ?? "")}</h1>
        </div>
        {FEATURE_CSV_EXPORT && (
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />参加者 CSV 出力
          </Button>
        )}
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">分野 / 主催者</div>
                <div className="truncate text-sm font-medium">
                  {String(event[f.category] ?? "—")}
                  {event[f.organizer] ? ` / ${String(event[f.organizer])}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">会場</div>
                <div className="truncate text-sm font-medium">{String(event[f.venue] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">開催日</div>
                <div className="truncate text-sm font-medium">{String(event[f.start_date] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">申込状況</div>
                <div className="text-sm font-medium">
                  {activeCount} / {capacity > 0 ? capacity : "—"} 名
                </div>
                {capacity > 0 && <Progress value={fillRate} className="mt-1 h-2" />}
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={EVENT_STAGE_PATH_ITEMS}
              current={status}
              negativeValue={EVENT_STATUS_CANCELLED}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 概要 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">概要</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(event[f.description] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 参加者 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">参加者</CardTitle>
              <CardDescription>{registrations.length} 件（登録日順）</CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5" />参加者を登録
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>参加者名</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>登録日</TableHead>
                  <TableHead className="w-[150px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      参加者がいません。「参加者を登録」から追加してください
                    </TableCell>
                  </TableRow>
                ) : (
                  registrations.map((registration, idx) => {
                    const regStatus = registration[r.status] as number | undefined
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{String(registration[r.name] ?? "")}</TableCell>
                        <TableCell>{String(registration[r.department] ?? "")}</TableCell>
                        <TableCell>
                          {regStatus != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${REGISTRATION_STATUS_COLOR[regStatus as keyof typeof REGISTRATION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {REGISTRATION_STATUS_LABEL[regStatus as keyof typeof REGISTRATION_STATUS_LABEL] ?? String(regStatus)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{String(registration[r.registered_date] ?? "")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {regStatus !== REGISTRATION_ATTENDED && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => handleAttend(String(registration[r.id] ?? ""))}
                                title="出席にする"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />出席
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(registration)}
                              title="編集"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteId(String(registration[r.id] ?? ""))}
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

      {/* 参加者フォーム */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "参加登録編集" : "参加者登録"}
        onSave={handleSave}
        isSaving={createRegistration.isPending || updateRegistration.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reg_name">参加者名 <span className="text-destructive">*</span></Label>
            <Input
              id="reg_name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="参加者の氏名"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="reg_department">部門</Label>
              <Input
                id="reg_department"
                value={form.department}
                onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                placeholder="部門名"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg_date">登録日</Label>
              <Input
                id="reg_date"
                type="date"
                value={form.registered_date}
                onChange={e => setForm(p => ({ ...p, registered_date: e.target.value }))}
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>ステータス</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="ステータスを選択" />
              </SelectTrigger>
              <SelectContent>
                {REGISTRATION_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>

      {/* 参加登録削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="参加登録を削除しますか？"
        description="この操作は取り消せません。参加登録を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
