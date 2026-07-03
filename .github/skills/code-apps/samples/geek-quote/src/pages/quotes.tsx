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
  useQuotes,
  useCreateQuote,
  useUpdateQuote,
  useDeleteQuote,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_COLOR,
  QUOTE_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_quoteid`,
  name:         `${P}_name`,
  quote_number: `${P}_quote_number`,
  client:       `${P}_client`,
  status:       `${P}_status`,
  issue_date:   `${P}_issue_date`,
  expiry_date:  `${P}_expiry_date`,
  total:        `${P}_total`,
  notes:        `${P}_notes`,
}

function StatusBadge({ status }: { status: number }) {
  const label = QUOTE_STATUS_LABEL[status as keyof typeof QUOTE_STATUS_LABEL] ?? String(status)
  const color = QUOTE_STATUS_COLOR[status as keyof typeof QUOTE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  quote_number: string
  client: string
  status: string
  issue_date: string
  expiry_date: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", quote_number: "", client: "",
  status: String(100000000), issue_date: "", expiry_date: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function QuotesPage() {
  const navigate = useNavigate()
  const { data: quotes = [], isLoading } = useQuotes()
  const createQuote = useCreateQuote()
  const updateQuote = useUpdateQuote()
  const deleteQuote = useDeleteQuote()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = quotes.filter(q => {
    const s = search.toLowerCase()
    const matchSearch = !s ||
      String(q[f.name] ?? "").toLowerCase().includes(s) ||
      String(q[f.quote_number] ?? "").toLowerCase().includes(s) ||
      String(q[f.client] ?? "").toLowerCase().includes(s)
    const matchStatus = filterStatus === "all" || String(q[f.status]) === filterStatus
    return matchSearch && matchStatus
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({
      ...EMPTY_FORM,
      issue_date: new Date().toISOString().slice(0, 10),
      quote_number: `Q-${Date.now().toString().slice(-8)}`,
    })
    setIsFormOpen(true)
  }

  const handleEdit = (quote: Record<string, unknown>) => {
    setEditingId(String(quote[f.id] ?? ""))
    setFormData({
      name:         String(quote[f.name] ?? ""),
      quote_number: String(quote[f.quote_number] ?? ""),
      client:       String(quote[f.client] ?? ""),
      status:       quote[f.status] != null ? String(quote[f.status]) : String(100000000),
      issue_date:   String(quote[f.issue_date] ?? ""),
      expiry_date:  String(quote[f.expiry_date] ?? ""),
      notes:        String(quote[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:         formData.name,
      [f.quote_number]: formData.quote_number,
      [f.client]:       formData.client,
      [f.notes]:        formData.notes,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.issue_date) data[f.issue_date] = formData.issue_date
    if (formData.expiry_date) data[f.expiry_date] = formData.expiry_date

    try {
      if (editingId) {
        await updateQuote.mutateAsync({ id: editingId, data })
        toast.success("見積を更新しました")
      } else {
        await createQuote.mutateAsync(data)
        toast.success("見積を作成しました。明細は詳細画面から追加してください")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteQuote.mutateAsync(deleteId)
      toast.success("見積を削除しました")
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
          <h1 className="text-2xl font-bold">見積</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">見積</h1>
          <p className="text-muted-foreground text-sm mt-1">見積書の作成・管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>見積一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・見積番号・取引先で検索..."
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
                {QUOTE_STATUS_OPTIONS.map(o => (
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
                  <TableHead>見積番号</TableHead>
                  <TableHead>件名</TableHead>
                  <TableHead>取引先</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">合計金額（税込）</TableHead>
                  <TableHead>発行日</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      見積がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((quote, i) => (
                    <TableRow
                      key={i}
                      className="cursor-pointer"
                      onClick={() => navigate(`/quotes/${String(quote[f.id] ?? "")}`)}
                    >
                      <TableCell className="font-mono text-xs">{String(quote[f.quote_number] ?? "")}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(quote[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(quote[f.client] ?? "")}</TableCell>
                      <TableCell>
                        {quote[f.status] != null && (
                          <StatusBadge status={quote[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {((quote[f.total] as number) ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" })}
                      </TableCell>
                      <TableCell>{String(quote[f.issue_date] ?? "")}</TableCell>
                      <TableCell>{String(quote[f.expiry_date] ?? "")}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => navigate(`/quotes/${String(quote[f.id] ?? "")}`)}
                            title="詳細"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(quote)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(quote[f.id] ?? ""))}
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
        title={editingId ? "見積編集" : "見積新規作成"}
        onSave={handleSave}
        isSaving={createQuote.isPending || updateQuote.isPending}
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
              placeholder="見積の件名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 見積番号 */}
            <div className="space-y-1.5">
              <Label htmlFor="quote_number">見積番号</Label>
              <Input
                id="quote_number"
                value={formData.quote_number}
                onChange={update("quote_number")}
                placeholder="Q-00000000"
              />
            </div>
            {/* 取引先 */}
            <div className="space-y-1.5">
              <Label htmlFor="client">取引先</Label>
              <Input
                id="client"
                value={formData.client}
                onChange={update("client")}
                placeholder="取引先名"
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
                  {QUOTE_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 発行日 */}
            <div className="space-y-1.5">
              <Label htmlFor="issue_date">発行日</Label>
              <Input
                id="issue_date"
                type="date"
                value={formData.issue_date}
                onChange={update("issue_date")}
              />
            </div>
            {/* 有効期限 */}
            <div className="space-y-1.5">
              <Label htmlFor="expiry_date">有効期限</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={update("expiry_date")}
              />
            </div>
          </FormColumns>

          {/* 備考（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="備考・メモ（見積書プレビューに表示されます）"
              rows={2}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            明細行と金額（小計・消費税・合計）は、保存後に詳細画面から追加・自動計算されます。
          </p>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="見積を削除しますか？"
        description="この操作は取り消せません。見積を完全に削除します（明細行は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
