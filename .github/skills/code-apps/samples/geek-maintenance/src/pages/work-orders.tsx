import { useState, useMemo } from "react"
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
  useWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder,
  useEquipment,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  WORK_ORDER_TYPE_LABEL,
  WORK_ORDER_TYPE_COLOR,
  WORK_ORDER_TYPE_OPTIONS,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_STATUS_COLOR,
  WORK_ORDER_STATUS_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const fw = {
  id:             `${P}_work_orderid`,
  name:           `${P}_name`,
  equipment_id:   `${P}_equipment_id`,
  work_type:      `${P}_work_type`,
  priority:       `${P}_priority`,
  status:         `${P}_status`,
  assignee:       `${P}_assignee`,
  planned_date:   `${P}_planned_date`,
  completed_date: `${P}_completed_date`,
  description:    `${P}_description`,
  notes:          `${P}_notes`,
}

const fe = {
  id:   `${P}_equipmentid`,
  name: `${P}_name`,
}

function WorkTypeBadge({ type }: { type: number }) {
  const label = WORK_ORDER_TYPE_LABEL[type as keyof typeof WORK_ORDER_TYPE_LABEL] ?? String(type)
  const color = WORK_ORDER_TYPE_COLOR[type as keyof typeof WORK_ORDER_TYPE_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function WorkStatusBadge({ status }: { status: number }) {
  const label = WORK_ORDER_STATUS_LABEL[status as keyof typeof WORK_ORDER_STATUS_LABEL] ?? String(status)
  const color = WORK_ORDER_STATUS_COLOR[status as keyof typeof WORK_ORDER_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: number }) {
  const label = PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? String(priority)
  const color = PRIORITY_COLOR[priority as keyof typeof PRIORITY_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  equipment_id: string
  work_type: string
  priority: string
  status: string
  assignee: string
  planned_date: string
  completed_date: string
  description: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", equipment_id: "", work_type: "", priority: "", status: "",
  assignee: "", planned_date: "", completed_date: "", description: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function WorkOrdersPage() {
  const { data: workOrders = [], isLoading: woLoading } = useWorkOrders()
  const { data: equipment = [], isLoading: eqLoading } = useEquipment()
  const isLoading = woLoading || eqLoading

  const createWorkOrder = useCreateWorkOrder()
  const updateWorkOrder = useUpdateWorkOrder()
  const deleteWorkOrder = useDeleteWorkOrder()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // Build equipment name map
  const equipmentMap = useMemo(() =>
    new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])),
    [equipment]
  )

  const filtered = workOrders.filter(w => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(w[fw.name] ?? "").toLowerCase().includes(q) ||
      String(w[fw.assignee] ?? "").toLowerCase().includes(q)
    const matchType = filterType === "all" || String(w[fw.work_type]) === filterType
    const matchStatus = filterStatus === "all" || String(w[fw.status]) === filterStatus
    const matchPriority = filterPriority === "all" || String(w[fw.priority]) === filterPriority
    return matchSearch && matchType && matchStatus && matchPriority
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
    setEditingId(String(item[fw.id] ?? ""))
    // Extract equipment ID from formatted value or lookup field
    const eqId = item[`_${P}_equipment_id_value`] as string | undefined
    setFormData({
      name:           String(item[fw.name] ?? ""),
      equipment_id:   eqId ?? "",
      work_type:      item[fw.work_type] != null ? String(item[fw.work_type]) : "",
      priority:       item[fw.priority] != null ? String(item[fw.priority]) : "",
      status:         item[fw.status] != null ? String(item[fw.status]) : "",
      assignee:       String(item[fw.assignee] ?? ""),
      planned_date:   String(item[fw.planned_date] ?? ""),
      completed_date: String(item[fw.completed_date] ?? ""),
      description:    String(item[fw.description] ?? ""),
      notes:          String(item[fw.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [fw.name]:      formData.name,
      [fw.assignee]:  formData.assignee,
      [fw.description]: formData.description,
      [fw.notes]:     formData.notes,
    }
    if (formData.work_type) data[fw.work_type] = Number(formData.work_type)
    if (formData.priority) data[fw.priority] = Number(formData.priority)
    if (formData.status) data[fw.status] = Number(formData.status)
    if (formData.planned_date) data[fw.planned_date] = formData.planned_date
    if (formData.completed_date) data[fw.completed_date] = formData.completed_date
    if (formData.equipment_id) {
      data[`${P}_equipment_id@odata.bind`] = `/${P}_equipment(${formData.equipment_id})`
    }

    try {
      if (editingId) {
        await updateWorkOrder.mutateAsync({ id: editingId, data })
        toast.success("作業指示を更新しました")
      } else {
        await createWorkOrder.mutateAsync(data)
        toast.success("作業指示を作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteWorkOrder.mutateAsync(deleteId)
      toast.success("作業指示を削除しました")
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
          <h1 className="text-2xl font-bold">作業指示</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">作業指示</h1>
          <p className="text-muted-foreground text-sm mt-1">作業指示の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>作業指示一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・担当者で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={v => { setFilterType(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="作業種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種別</SelectItem>
                {WORK_ORDER_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {WORK_ORDER_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[130px]">
                <SelectValue placeholder="優先度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての優先度</SelectItem>
                {PRIORITY_OPTIONS.map(o => (
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
                  <TableHead>設備名</TableHead>
                  <TableHead>作業種別</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>予定日</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      作業指示がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {String(item[fw.name] ?? "")}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-muted-foreground">
                        {getEquipmentName(item)}
                      </TableCell>
                      <TableCell>
                        {item[fw.work_type] != null && (
                          <WorkTypeBadge type={item[fw.work_type] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {item[fw.priority] != null && (
                          <PriorityBadge priority={item[fw.priority] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {item[fw.status] != null && (
                          <WorkStatusBadge status={item[fw.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(item[fw.assignee] ?? "")}</TableCell>
                      <TableCell>{String(item[fw.planned_date] ?? "")}</TableCell>
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
                            onClick={() => setDeleteId(String(item[fw.id] ?? ""))}
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
        title={editingId ? "作業指示編集" : "作業指示新規作成"}
        onSave={handleSave}
        isSaving={createWorkOrder.isPending || updateWorkOrder.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 件名（必須） */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-name">件名 <span className="text-destructive">*</span></Label>
            <Input
              id="wo-name"
              value={formData.name}
              onChange={update("name")}
              placeholder="作業指示の件名を入力"
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
            {/* 作業種別 */}
            <div className="space-y-1.5">
              <Label>作業種別</Label>
              <Select value={formData.work_type} onValueChange={v => setFormData(p => ({ ...p, work_type: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="作業種別を選択" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 優先度 */}
            <div className="space-y-1.5">
              <Label>優先度</Label>
              <Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="優先度を選択" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* ステータス */}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 担当者 */}
            <div className="space-y-1.5">
              <Label htmlFor="assignee">担当者</Label>
              <Input
                id="assignee"
                value={formData.assignee}
                onChange={update("assignee")}
                placeholder="担当者名"
              />
            </div>
            {/* 予定日 */}
            <div className="space-y-1.5">
              <Label htmlFor="planned_date">予定日</Label>
              <Input
                id="planned_date"
                type="date"
                value={formData.planned_date}
                onChange={update("planned_date")}
              />
            </div>
            {/* 完了日 */}
            <div className="space-y-1.5">
              <Label htmlFor="completed_date">完了日</Label>
              <Input
                id="completed_date"
                type="date"
                value={formData.completed_date}
                onChange={update("completed_date")}
              />
            </div>
          </FormColumns>

          {/* 作業内容 */}
          <div className="space-y-1.5">
            <Label htmlFor="description">作業内容</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={update("description")}
              placeholder="作業内容の詳細"
              rows={3}
            />
          </div>

          {/* 備考 */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-notes">備考</Label>
            <Textarea
              id="wo-notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="備考・メモ"
              rows={2}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="作業指示を削除しますか？"
        description="この操作は取り消せません。作業指示を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
