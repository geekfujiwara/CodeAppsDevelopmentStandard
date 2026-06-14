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
  usePurchaseRequests,
  useCreatePurchaseRequest,
  useUpdatePurchaseRequest,
  useDeletePurchaseRequest,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_COLOR,
  REQUEST_STATUS_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_requestid`,
  name:         `${P}_name`,
  category:     `${P}_category`,
  requester:    `${P}_requester`,
  department:   `${P}_department`,
  item_name:    `${P}_item_name`,
  quantity:     `${P}_quantity`,
  unit_price:   `${P}_unit_price`,
  total:        `${P}_total_amount`,
  vendor:       `${P}_vendor`,
  priority:     `${P}_priority`,
  status:       `${P}_status`,
  desired_date: `${P}_desired_date`,
  reason:       `${P}_reason`,
  notes:        `${P}_notes`,
}

function StatusBadge({ status }: { status: number }) {
  const label = REQUEST_STATUS_LABEL[status as keyof typeof REQUEST_STATUS_LABEL] ?? String(status)
  const color = REQUEST_STATUS_COLOR[status as keyof typeof REQUEST_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
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
  category: string
  requester: string
  department: string
  item_name: string
  quantity: string
  unit_price: string
  vendor: string
  priority: string
  status: string
  desired_date: string
  reason: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", requester: "", department: "",
  item_name: "", quantity: "1", unit_price: "", vendor: "",
  priority: "", status: String(100000000), desired_date: "",
  reason: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function RequestsPage() {
  const { data: requests = [], isLoading } = usePurchaseRequests()
  const createRequest = useCreatePurchaseRequest()
  const updateRequest = useUpdatePurchaseRequest()
  const deleteRequest = useDeletePurchaseRequest()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const computedTotal = parseFloat(formData.quantity || "0") * parseFloat(formData.unit_price || "0")

  // フィルター
  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(r[f.name] ?? "").toLowerCase().includes(q) ||
      String(r[f.requester] ?? "").toLowerCase().includes(q) ||
      String(r[f.item_name] ?? "").toLowerCase().includes(q) ||
      String(r[f.vendor] ?? "").toLowerCase().includes(q)
    const matchStatus = filterStatus === "all" || String(r[f.status]) === filterStatus
    const matchPriority = filterPriority === "all" || String(r[f.priority]) === filterPriority
    return matchSearch && matchStatus && matchPriority
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (request: Record<string, unknown>) => {
    setEditingId(String(request[f.id] ?? ""))
    setFormData({
      name:         String(request[f.name] ?? ""),
      category:     String(request[f.category] ?? ""),
      requester:    String(request[f.requester] ?? ""),
      department:   String(request[f.department] ?? ""),
      item_name:    String(request[f.item_name] ?? ""),
      quantity:     request[f.quantity] != null ? String(request[f.quantity]) : "1",
      unit_price:   request[f.unit_price] != null ? String(request[f.unit_price]) : "",
      vendor:       String(request[f.vendor] ?? ""),
      priority:     request[f.priority] != null ? String(request[f.priority]) : "",
      status:       request[f.status] != null ? String(request[f.status]) : String(100000000),
      desired_date: String(request[f.desired_date] ?? ""),
      reason:       String(request[f.reason] ?? ""),
      notes:        String(request[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const total = parseFloat(formData.quantity || "0") * parseFloat(formData.unit_price || "0")
    const data: Record<string, unknown> = {
      [f.name]:       formData.name,
      [f.category]:   formData.category,
      [f.requester]:  formData.requester,
      [f.department]: formData.department,
      [f.item_name]:  formData.item_name,
      [f.vendor]:     formData.vendor,
      [f.reason]:     formData.reason,
      [f.notes]:      formData.notes,
      [f.total]:      total,
    }
    if (formData.quantity) data[f.quantity] = parseInt(formData.quantity, 10)
    if (formData.unit_price) data[f.unit_price] = parseFloat(formData.unit_price)
    if (formData.priority) data[f.priority] = Number(formData.priority)
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.desired_date) data[f.desired_date] = formData.desired_date

    try {
      if (editingId) {
        await updateRequest.mutateAsync({ id: editingId, data })
        toast.success("購買依頼を更新しました")
      } else {
        await createRequest.mutateAsync(data)
        toast.success("購買依頼を作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteRequest.mutateAsync(deleteId)
      toast.success("購買依頼を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const update = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData(prev => ({ ...prev, [key]: e.target.value }))

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">購買依頼</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">購買依頼</h1>
          <p className="text-muted-foreground text-sm mt-1">購買依頼の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>購買依頼一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・依頼者・品目名・仕入先で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {REQUEST_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px]">
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
                  <TableHead>依頼者</TableHead>
                  <TableHead>品目名</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead className="text-right">合計金額</TableHead>
                  <TableHead>希望納期</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      購買依頼がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((request, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(request[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(request[f.requester] ?? "")}</TableCell>
                      <TableCell>{String(request[f.item_name] ?? "")}</TableCell>
                      <TableCell>
                        {request[f.status] != null && (
                          <StatusBadge status={request[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {request[f.priority] != null && (
                          <PriorityBadge priority={request[f.priority] as number} />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(request[f.total] as number ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" })}
                      </TableCell>
                      <TableCell>{String(request[f.desired_date] ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(request)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(request[f.id] ?? ""))}
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
        title={editingId ? "購買依頼編集" : "購買依頼新規作成"}
        onSave={handleSave}
        isSaving={createRequest.isPending || updateRequest.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 件名（必須、全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">件名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="購買依頼の件名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 依頼者 */}
            <div className="space-y-1.5">
              <Label htmlFor="requester">依頼者</Label>
              <Input
                id="requester"
                value={formData.requester}
                onChange={update("requester")}
                placeholder="依頼者名"
              />
            </div>
            {/* 部門 */}
            <div className="space-y-1.5">
              <Label htmlFor="department">部門</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={update("department")}
                placeholder="部門名"
              />
            </div>
            {/* 品目名 */}
            <div className="space-y-1.5">
              <Label htmlFor="item_name">品目名</Label>
              <Input
                id="item_name"
                value={formData.item_name}
                onChange={update("item_name")}
                placeholder="購買する品目名"
              />
            </div>
            {/* カテゴリ */}
            <div className="space-y-1.5">
              <Label htmlFor="category">カテゴリ</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: IT機器, 消耗品, サービス"
              />
            </div>
            {/* 数量 */}
            <div className="space-y-1.5">
              <Label htmlFor="quantity">数量</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                value={formData.quantity}
                onChange={update("quantity")}
                placeholder="1"
              />
            </div>
            {/* 単価 */}
            <div className="space-y-1.5">
              <Label htmlFor="unit_price">単価</Label>
              <Input
                id="unit_price"
                type="number"
                min={0}
                step="0.01"
                value={formData.unit_price}
                onChange={update("unit_price")}
                placeholder="0"
              />
            </div>
            {/* 合計金額（読み取り専用） */}
            <div className="space-y-1.5">
              <Label>合計金額 <span className="text-muted-foreground text-xs">(自動計算)</span></Label>
              <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/50 text-sm">
                ¥{computedTotal.toLocaleString()}
              </div>
            </div>
            {/* 仕入先 */}
            <div className="space-y-1.5">
              <Label htmlFor="vendor">仕入先</Label>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={update("vendor")}
                placeholder="仕入先名"
              />
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
                  {REQUEST_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 希望納期 */}
            <div className="space-y-1.5">
              <Label htmlFor="desired_date">希望納期</Label>
              <Input
                id="desired_date"
                type="date"
                value={formData.desired_date}
                onChange={update("desired_date")}
              />
            </div>
          </FormColumns>

          {/* 購買理由（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="reason">購買理由</Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={update("reason")}
              placeholder="購買が必要な理由を入力"
              rows={3}
            />
          </div>

          {/* 備考（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
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
        title="購買依頼を削除しますか？"
        description="この操作は取り消せません。購買依頼を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
