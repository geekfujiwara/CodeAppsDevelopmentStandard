import { useState } from "react"
import { useNavigate } from "react-router-dom"
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
  useApprovalRequests,
  useCreateApprovalRequest,
  useUpdateApprovalRequest,
  useDeleteApprovalRequest,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  REQUEST_STAGE_LABEL,
  REQUEST_STAGE_COLOR,
  REQUEST_STAGE_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_approval_requestid`,
  name:         `${P}_name`,
  category:     `${P}_category`,
  applicant:    `${P}_applicant`,
  department:   `${P}_department`,
  amount:       `${P}_amount`,
  stage:        `${P}_stage`,
  priority:     `${P}_priority`,
  request_date: `${P}_request_date`,
  description:  `${P}_description`,
  notes:        `${P}_notes`,
}

function StageBadge({ stage }: { stage: number }) {
  const label = REQUEST_STAGE_LABEL[stage as keyof typeof REQUEST_STAGE_LABEL] ?? String(stage)
  const color = REQUEST_STAGE_COLOR[stage as keyof typeof REQUEST_STAGE_COLOR] ?? "bg-gray-100 text-gray-600"
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
  applicant: string
  department: string
  amount: string
  stage: string
  priority: string
  request_date: string
  description: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", applicant: "", department: "",
  amount: "", stage: String(100000000), priority: "",
  request_date: "", description: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function RequestsPage() {
  const navigate = useNavigate()
  const { data: requests = [], isLoading } = useApprovalRequests()
  const createRequest = useCreateApprovalRequest()
  const updateRequest = useUpdateApprovalRequest()
  const deleteRequest = useDeleteApprovalRequest()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStage, setFilterStage] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(r[f.name] ?? "").toLowerCase().includes(q) ||
      String(r[f.applicant] ?? "").toLowerCase().includes(q) ||
      String(r[f.department] ?? "").toLowerCase().includes(q) ||
      String(r[f.category] ?? "").toLowerCase().includes(q)
    const matchStage = filterStage === "all" || String(r[f.stage]) === filterStage
    const matchPriority = filterPriority === "all" || String(r[f.priority]) === filterPriority
    return matchSearch && matchStage && matchPriority
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, request_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (request: Record<string, unknown>) => {
    setEditingId(String(request[f.id] ?? ""))
    setFormData({
      name:         String(request[f.name] ?? ""),
      category:     String(request[f.category] ?? ""),
      applicant:    String(request[f.applicant] ?? ""),
      department:   String(request[f.department] ?? ""),
      amount:       request[f.amount] != null ? String(request[f.amount]) : "",
      stage:        request[f.stage] != null ? String(request[f.stage]) : String(100000000),
      priority:     request[f.priority] != null ? String(request[f.priority]) : "",
      request_date: String(request[f.request_date] ?? ""),
      description:  String(request[f.description] ?? ""),
      notes:        String(request[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:        formData.name,
      [f.category]:    formData.category,
      [f.applicant]:   formData.applicant,
      [f.department]:  formData.department,
      [f.description]: formData.description,
      [f.notes]:       formData.notes,
    }
    if (formData.amount) data[f.amount] = parseFloat(formData.amount)
    if (formData.stage) data[f.stage] = Number(formData.stage)
    if (formData.priority) data[f.priority] = Number(formData.priority)
    if (formData.request_date) data[f.request_date] = formData.request_date

    try {
      if (editingId) {
        await updateRequest.mutateAsync({ id: editingId, data })
        toast.success("申請を更新しました")
      } else {
        await createRequest.mutateAsync(data)
        toast.success("申請を作成しました")
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
      toast.success("申請を削除しました")
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
          <h1 className="text-2xl font-bold">申請一覧</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">申請一覧</h1>
          <p className="text-muted-foreground text-sm mt-1">稟議・申請の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>申請一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・申請者・部門・種別で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterStage} onValueChange={v => { setFilterStage(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="承認ステージ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステージ</SelectItem>
                {REQUEST_STAGE_OPTIONS.map(o => (
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
                  <TableHead>種別</TableHead>
                  <TableHead>申請者</TableHead>
                  <TableHead>承認ステージ</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>申請日</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      申請がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((request, i) => (
                    <TableRow
                      key={i}
                      className="cursor-pointer"
                      onClick={() => navigate(`/requests/${String(request[f.id] ?? "")}`)}
                    >
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(request[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(request[f.category] ?? "")}</TableCell>
                      <TableCell>{String(request[f.applicant] ?? "")}</TableCell>
                      <TableCell>
                        {request[f.stage] != null && (
                          <StageBadge stage={request[f.stage] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {request[f.priority] != null && (
                          <PriorityBadge priority={request[f.priority] as number} />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(request[f.amount] as number ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" })}
                      </TableCell>
                      <TableCell>{String(request[f.request_date] ?? "")}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => navigate(`/requests/${String(request[f.id] ?? "")}`)}
                            title="詳細"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
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
        title={editingId ? "申請編集" : "申請新規作成"}
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
              placeholder="申請の件名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 種別 */}
            <div className="space-y-1.5">
              <Label htmlFor="category">種別</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: 購買, 出張, 契約, 経費"
              />
            </div>
            {/* 申請者 */}
            <div className="space-y-1.5">
              <Label htmlFor="applicant">申請者</Label>
              <Input
                id="applicant"
                value={formData.applicant}
                onChange={update("applicant")}
                placeholder="申請者名"
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
            {/* 金額 */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">金額</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step="1"
                value={formData.amount}
                onChange={update("amount")}
                placeholder="0"
              />
            </div>
            {/* 承認ステージ */}
            <div className="space-y-1.5">
              <Label>承認ステージ</Label>
              <Select value={formData.stage} onValueChange={v => setFormData(p => ({ ...p, stage: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステージを選択" />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_STAGE_OPTIONS.map(o => (
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
            {/* 申請日 */}
            <div className="space-y-1.5">
              <Label htmlFor="request_date">申請日</Label>
              <Input
                id="request_date"
                type="date"
                value={formData.request_date}
                onChange={update("request_date")}
              />
            </div>
          </FormColumns>

          {/* 申請内容（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="description">申請内容</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={update("description")}
              placeholder="申請の内容・理由を入力"
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
        title="申請を削除しますか？"
        description="この操作は取り消せません。申請を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
