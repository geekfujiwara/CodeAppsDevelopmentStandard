import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  useInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_INVOICES } from "@/config"
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_COLOR,
  INVOICE_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:             `${P}_invoiceid`,
  name:           `${P}_name`,
  invoice_number: `${P}_invoice_number`,
  client:         `${P}_client`,
  status:         `${P}_status`,
  issue_date:     `${P}_issue_date`,
  due_date:       `${P}_due_date`,
  total:          `${P}_total`,
}

function StatusBadge({ status }: { status: number }) {
  const label = INVOICE_STATUS_LABEL[status as keyof typeof INVOICE_STATUS_LABEL] ?? String(status)
  const color = INVOICE_STATUS_COLOR[status as keyof typeof INVOICE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
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
            請求管理は現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_INVOICES=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  invoice_number: string
  client: string
  status: string
  issue_date: string
  due_date: string
  total: string
}

const EMPTY_FORM: FormData = {
  name: "", invoice_number: "", client: "",
  status: String(100000000), issue_date: "", due_date: "", total: "",
}

export default function InvoicesPage() {
  if (!FEATURE_INVOICES) return <DisabledFeatureCard />
  return <InvoicesContent />
}

function InvoicesContent() {
  const { data: invoices = [], isLoading } = useInvoices()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()
  const deleteInvoice = useDeleteInvoice()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = (inv: Record<string, unknown>) =>
    (inv[f.status] as number) === 100000001 &&
    !!inv[f.due_date] && String(inv[f.due_date]) < today

  const filtered = invoices
    .filter(inv => {
      const s = search.toLowerCase()
      const matchSearch = !s ||
        String(inv[f.name] ?? "").toLowerCase().includes(s) ||
        String(inv[f.invoice_number] ?? "").toLowerCase().includes(s) ||
        String(inv[f.client] ?? "").toLowerCase().includes(s)
      const matchStatus = filterStatus === "all" || String(inv[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(a[f.due_date] ?? "").localeCompare(String(b[f.due_date] ?? "")))

  const handleNew = () => {
    setEditingId(null)
    setFormData({
      ...EMPTY_FORM,
      issue_date: today,
      invoice_number: `INV-${Date.now().toString().slice(-8)}`,
    })
    setIsFormOpen(true)
  }

  const handleEdit = (invoice: Record<string, unknown>) => {
    setEditingId(String(invoice[f.id] ?? ""))
    setFormData({
      name:           String(invoice[f.name] ?? ""),
      invoice_number: String(invoice[f.invoice_number] ?? ""),
      client:         String(invoice[f.client] ?? ""),
      status:         invoice[f.status] != null ? String(invoice[f.status]) : String(100000000),
      issue_date:     String(invoice[f.issue_date] ?? ""),
      due_date:       String(invoice[f.due_date] ?? ""),
      total:          invoice[f.total] != null ? String(invoice[f.total]) : "",
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:           formData.name,
      [f.invoice_number]: formData.invoice_number,
      [f.client]:         formData.client,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.issue_date) data[f.issue_date] = formData.issue_date
    if (formData.due_date) data[f.due_date] = formData.due_date
    if (formData.total) data[f.total] = parseFloat(formData.total)

    try {
      if (editingId) {
        await updateInvoice.mutateAsync({ id: editingId, data })
        toast.success("請求を更新しました")
      } else {
        await createInvoice.mutateAsync(data)
        toast.success("請求を作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteInvoice.mutateAsync(deleteId)
      toast.success("請求を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const update = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData(prev => ({ ...prev, [key]: e.target.value }))

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">請求</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">請求</h1>
          <p className="text-muted-foreground text-sm mt-1">請求書の管理・入金追跡</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>請求一覧</CardTitle>
          <CardDescription>{filtered.length} 件（支払期限の近い順）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・請求番号・取引先で検索..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {INVOICE_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>請求番号</TableHead>
                  <TableHead>件名</TableHead>
                  <TableHead>取引先</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">請求金額（税込）</TableHead>
                  <TableHead>発行日</TableHead>
                  <TableHead>支払期限</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      請求がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((invoice, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{String(invoice[f.invoice_number] ?? "")}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(invoice[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(invoice[f.client] ?? "")}</TableCell>
                      <TableCell>
                        {invoice[f.status] != null && (
                          <StatusBadge status={invoice[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {((invoice[f.total] as number) ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" })}
                      </TableCell>
                      <TableCell>{String(invoice[f.issue_date] ?? "")}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          {String(invoice[f.due_date] ?? "")}
                          {isOverdue(invoice) && (
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
                            onClick={() => handleEdit(invoice)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(invoice[f.id] ?? ""))}
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
        </CardContent>
      </Card>

      {/* フォームモーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "請求編集" : "請求新規作成"}
        onSave={handleSave}
        isSaving={createInvoice.isPending || updateInvoice.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">件名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="請求の件名を入力"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="invoice_number">請求番号</Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number}
                onChange={update("invoice_number")}
                placeholder="INV-00000000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client">取引先</Label>
              <Input
                id="client"
                value={formData.client}
                onChange={update("client")}
                placeholder="取引先名"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="total">請求金額（税込）</Label>
              <Input
                id="total"
                type="number"
                min={0}
                step="1"
                value={formData.total}
                onChange={update("total")}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue_date">発行日</Label>
              <Input
                id="issue_date"
                type="date"
                value={formData.issue_date}
                onChange={update("issue_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_date">支払期限</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={update("due_date")}
              />
            </div>
          </FormColumns>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="請求を削除しますか？"
        description="この操作は取り消せません。請求を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
