import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule,
  useEquipment,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_SCHEDULE } from "@/config"
import {
  SCHEDULE_PERIOD_LABEL,
  SCHEDULE_PERIOD_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { useMemo } from "react"

const P = PUBLISHER_PREFIX

const fs = {
  id:              `${P}_scheduleid`,
  name:            `${P}_name`,
  equipment_id:    `${P}_equipment_id`,
  inspection_type: `${P}_inspection_type`,
  period:          `${P}_period`,
  next_date:       `${P}_next_date`,
  notes:           `${P}_notes`,
}

const fe = {
  id:   `${P}_equipmentid`,
  name: `${P}_name`,
}

function PeriodBadge({ period }: { period: number }) {
  const label = SCHEDULE_PERIOD_LABEL[period as keyof typeof SCHEDULE_PERIOD_LABEL] ?? String(period)
  const colors: Record<number, string> = {
    100000000: "bg-purple-100 text-purple-800",
    100000001: "bg-blue-100 text-blue-800",
    100000002: "bg-cyan-100 text-cyan-800",
    100000003: "bg-teal-100 text-teal-800",
    100000004: "bg-indigo-100 text-indigo-800",
  }
  const color = colors[period] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            点検スケジュールは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_SCHEDULE=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  equipment_id: string
  inspection_type: string
  period: string
  next_date: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", equipment_id: "", inspection_type: "", period: "", next_date: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function SchedulesPage() {
  if (!FEATURE_SCHEDULE) return <DisabledFeatureCard />
  return <SchedulesContent />
}

function SchedulesContent() {
  const { data: schedules = [], isLoading: schLoading } = useSchedules()
  const { data: equipment = [], isLoading: eqLoading } = useEquipment()
  const isLoading = schLoading || eqLoading

  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const deleteSchedule = useDeleteSchedule()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterPeriod, setFilterPeriod] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const equipmentMap = useMemo(() =>
    new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])),
    [equipment]
  )

  const filtered = schedules.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(s[fs.name] ?? "").toLowerCase().includes(q) ||
      String(s[fs.inspection_type] ?? "").toLowerCase().includes(q)
    const matchPeriod = filterPeriod === "all" || String(s[fs.period]) === filterPeriod
    return matchSearch && matchPeriod
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setEditingId(String(item[fs.id] ?? ""))
    const eqId = item[`_${P}_equipment_id_value`] as string | undefined
    setFormData({
      name:            String(item[fs.name] ?? ""),
      equipment_id:    eqId ?? "",
      inspection_type: String(item[fs.inspection_type] ?? ""),
      period:          item[fs.period] != null ? String(item[fs.period]) : "",
      next_date:       String(item[fs.next_date] ?? ""),
      notes:           String(item[fs.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [fs.name]:            formData.name,
      [fs.inspection_type]: formData.inspection_type,
      [fs.notes]:           formData.notes,
    }
    if (formData.period) data[fs.period] = Number(formData.period)
    if (formData.next_date) data[fs.next_date] = formData.next_date
    if (formData.equipment_id) {
      data[`${P}_equipment_id@odata.bind`] = `/${P}_equipment(${formData.equipment_id})`
    }

    try {
      if (editingId) {
        await updateSchedule.mutateAsync({ id: editingId, data })
        toast.success("スケジュールを更新しました")
      } else {
        await createSchedule.mutateAsync(data)
        toast.success("スケジュールを作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSchedule.mutateAsync(deleteId)
      toast.success("スケジュールを削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const update = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData(prev => ({ ...prev, [key]: e.target.value }))

  const getEquipmentName = (item: Record<string, unknown>) => {
    const eqId = item[`_${P}_equipment_id_value`] as string | undefined
    if (eqId) return equipmentMap.get(eqId) ?? ""
    return ""
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">点検スケジュール</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">点検スケジュール</h1>
          <p className="text-muted-foreground text-sm mt-1">定期点検スケジュールの管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>スケジュール一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・点検種別で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterPeriod} onValueChange={v => { setFilterPeriod(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="周期" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての周期</SelectItem>
                {SCHEDULE_PERIOD_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* テーブル */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>件名</TableHead>
                  <TableHead>設備</TableHead>
                  <TableHead>点検種別</TableHead>
                  <TableHead>周期</TableHead>
                  <TableHead>次回点検日</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      スケジュールがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {String(item[fs.name] ?? "")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getEquipmentName(item)}
                      </TableCell>
                      <TableCell>{String(item[fs.inspection_type] ?? "")}</TableCell>
                      <TableCell>
                        {item[fs.period] != null && (
                          <PeriodBadge period={item[fs.period] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(item[fs.next_date] ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(item)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(item[fs.id] ?? ""))}
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {filtered.length} 件中 {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} 件を表示
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />前へ
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                ))}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                >
                  次へ<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* フォームモーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "スケジュール編集" : "スケジュール新規作成"}
        onSave={handleSave}
        isSaving={createSchedule.isPending || updateSchedule.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 件名（必須） */}
          <div className="space-y-1.5">
            <Label htmlFor="sch-name">件名 <span className="text-destructive">*</span></Label>
            <Input
              id="sch-name"
              value={formData.name}
              onChange={update("name")}
              placeholder="スケジュールの件名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 設備 */}
            <div className="space-y-1.5">
              <Label>設備</Label>
              <Select value={formData.equipment_id} onValueChange={v => setFormData(p => ({ ...p, equipment_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="設備を選択" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map(e => (
                    <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 点検種別 */}
            <div className="space-y-1.5">
              <Label htmlFor="inspection_type">点検種別</Label>
              <Input
                id="inspection_type"
                value={formData.inspection_type}
                onChange={update("inspection_type")}
                placeholder="例: 月次点検, 年次点検"
              />
            </div>
            {/* 周期 */}
            <div className="space-y-1.5">
              <Label>周期</Label>
              <Select value={formData.period} onValueChange={v => setFormData(p => ({ ...p, period: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="周期を選択" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PERIOD_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 次回点検日 */}
            <div className="space-y-1.5">
              <Label htmlFor="next_date">次回点検日</Label>
              <Input
                id="next_date"
                type="date"
                value={formData.next_date}
                onChange={update("next_date")}
              />
            </div>
          </FormColumns>

          {/* 備考 */}
          <div className="space-y-1.5">
            <Label htmlFor="sch-notes">備考</Label>
            <Textarea
              id="sch-notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="備考・メモ"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="スケジュールを削除しますか？"
        description="この操作は取り消せません。スケジュールを完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
