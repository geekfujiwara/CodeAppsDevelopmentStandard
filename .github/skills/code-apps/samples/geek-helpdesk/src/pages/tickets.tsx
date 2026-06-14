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
import { useTickets, useCreateTicket, useUpdateTicket, useDeleteTicket } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_COLOR,
  TICKET_STATUS_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:            `${P}_ticketid`,
  name:          `${P}_name`,
  description:   `${P}_description`,
  requester:     `${P}_requester`,
  assignee:      `${P}_assignee`,
  category:      `${P}_category`,
  priority:      `${P}_priority`,
  status:        `${P}_status`,
  due_date:      `${P}_due_date`,
  resolved_date: `${P}_resolved_date`,
  notes:         `${P}_notes`,
}

function StatusBadge({ status }: { status: number }) {
  const label = TICKET_STATUS_LABEL[status as keyof typeof TICKET_STATUS_LABEL] ?? String(status)
  const color = TICKET_STATUS_COLOR[status as keyof typeof TICKET_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
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
  description: string
  requester: string
  assignee: string
  category: string
  priority: string
  status: string
  due_date: string
  resolved_date: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", description: "", requester: "", assignee: "",
  category: "", priority: "", status: "", due_date: "",
  resolved_date: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function TicketsPage() {
  const { data: tickets = [], isLoading } = useTickets()
  const createTicket = useCreateTicket()
  const updateTicket = useUpdateTicket()
  const deleteTicket = useDeleteTicket()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = tickets.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(t[f.name] ?? "").toLowerCase().includes(q) ||
      String(t[f.requester] ?? "").toLowerCase().includes(q) ||
      String(t[f.assignee] ?? "").toLowerCase().includes(q)
    const matchStatus = filterStatus === "all" || String(t[f.status]) === filterStatus
    const matchPriority = filterPriority === "all" || String(t[f.priority]) === filterPriority
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

  const handleEdit = (ticket: Record<string, unknown>) => {
    setEditingId(String(ticket[f.id] ?? ""))
    setFormData({
      name:          String(ticket[f.name] ?? ""),
      description:   String(ticket[f.description] ?? ""),
      requester:     String(ticket[f.requester] ?? ""),
      assignee:      String(ticket[f.assignee] ?? ""),
      category:      String(ticket[f.category] ?? ""),
      priority:      ticket[f.priority] != null ? String(ticket[f.priority]) : "",
      status:        ticket[f.status] != null ? String(ticket[f.status]) : "",
      due_date:      String(ticket[f.due_date] ?? ""),
      resolved_date: String(ticket[f.resolved_date] ?? ""),
      notes:         String(ticket[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:          formData.name,
      [f.description]:   formData.description,
      [f.requester]:     formData.requester,
      [f.assignee]:      formData.assignee,
      [f.category]:      formData.category,
      [f.notes]:         formData.notes,
    }
    if (formData.priority) data[f.priority] = Number(formData.priority)
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.due_date) data[f.due_date] = formData.due_date
    if (formData.resolved_date) data[f.resolved_date] = formData.resolved_date

    try {
      if (editingId) {
        await updateTicket.mutateAsync({ id: editingId, data })
        toast.success("チケットを更新しました")
      } else {
        await createTicket.mutateAsync(data)
        toast.success("チケットを作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteTicket.mutateAsync(deleteId)
      toast.success("チケットを削除しました")
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
          <h1 className="text-2xl font-bold">チケット</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">チケット</h1>
          <p className="text-muted-foreground text-sm mt-1">サポートチケットの管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>チケット一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・申請者・担当者で検索..."
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
                {TICKET_STATUS_OPTIONS.map(o => (
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
                  <TableHead>申請者</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead>期限</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      チケットがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((ticket, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(ticket[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(ticket[f.requester] ?? "")}</TableCell>
                      <TableCell>{String(ticket[f.assignee] ?? "")}</TableCell>
                      <TableCell>{String(ticket[f.category] ?? "")}</TableCell>
                      <TableCell>
                        {ticket[f.status] != null && (
                          <StatusBadge status={ticket[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {ticket[f.priority] != null && (
                          <PriorityBadge priority={ticket[f.priority] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(ticket[f.due_date] ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(ticket)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(ticket[f.id] ?? ""))}
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
        title={editingId ? "チケット編集" : "チケット新規作成"}
        onSave={handleSave}
        isSaving={createTicket.isPending || updateTicket.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 件名（必須） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">件名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="チケットの件名を入力"
            />
          </div>

          {/* 説明 */}
          <div className="space-y-1.5">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={update("description")}
              placeholder="問題の詳細を入力"
              rows={3}
            />
          </div>

          <FormColumns columns={2}>
            {/* 申請者 */}
            <div className="space-y-1.5">
              <Label htmlFor="requester">申請者</Label>
              <Input
                id="requester"
                value={formData.requester}
                onChange={update("requester")}
                placeholder="申請者名"
              />
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
            {/* カテゴリ */}
            <div className="space-y-1.5">
              <Label htmlFor="category">カテゴリ</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: ネットワーク, PC, ソフトウェア"
              />
            </div>
            {/* ステータス */}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_STATUS_OPTIONS.map(o => (
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
            {/* 期限 */}
            <div className="space-y-1.5">
              <Label htmlFor="due_date">期限</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={update("due_date")}
              />
            </div>
            {/* 解決日 */}
            <div className="space-y-1.5">
              <Label htmlFor="resolved_date">解決日</Label>
              <Input
                id="resolved_date"
                type="date"
                value={formData.resolved_date}
                onChange={update("resolved_date")}
              />
            </div>
          </FormColumns>

          {/* 備考 */}
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
        title="チケットを削除しますか？"
        description="この操作は取り消せません。チケットを完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
