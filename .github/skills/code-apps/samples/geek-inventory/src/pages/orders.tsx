import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { FormModal } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  useProducts,
  useOrders,
  useCreateOrder,
  useUpdateOrder,
  useDeleteOrder,
} from "@/hooks/use-dataverse"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { PUBLISHER_PREFIX, FEATURE_ORDERS } from "@/config"
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  ORDER_STATUS_OPTIONS,
  type OrderStatus,
} from "@/types/dataverse"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search, ShoppingCart } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// Feature guard component
function DisabledFeatureCard({ title, envVar }: { title: string; envVar: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <ShoppingCart className="h-12 w-12 text-muted-foreground opacity-40" />
          </div>
          <div className="text-xl font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground mt-2">
            このページは機能フラグで無効になっています。<br />
            有効にするには <code className="bg-muted px-1 rounded">{envVar}=true</code> を .env に設定してください。
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}

const P = PUBLISHER_PREFIX
const f = {
  id:            `${P}_orderid`,
  name:          `${P}_name`,
  product_id:    `${P}_product_id`,
  supplier:      `${P}_supplier`,
  qty:           `${P}_quantity`,
  order_date:    `${P}_order_date`,
  expected_date: `${P}_expected_date`,
  status:        `${P}_status`,
  notes:         `${P}_notes`,
}
const fp = {
  id:   `${P}_productid`,
  name: `${P}_name`,
}

function StatusBadge({ status }: { status: number }) {
  const s = status as OrderStatus
  const label = ORDER_STATUS_LABEL[s] ?? String(status)
  const color = ORDER_STATUS_COLOR[s] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", color)}>
      {label}
    </span>
  )
}

type FormState = Record<string, string | number>

const emptyForm = (): FormState => ({
  [f.name]:          "",
  product_id:        "",
  [f.supplier]:      "",
  [f.qty]:           1,
  [f.order_date]:    new Date().toISOString().split("T")[0],
  [f.expected_date]: "",
  [f.status]:        "",
  [f.notes]:         "",
})

const ITEMS_PER_PAGE = 10

export default function Orders() {
  if (!FEATURE_ORDERS) {
    return <DisabledFeatureCard title="発注管理" envVar="VITE_FEATURE_ORDERS" />
  }

  return <OrdersContent />
}

function OrdersContent() {
  const { data: products } = useProducts()
  const { data: orders, isLoading } = useOrders()
  const createMutation = useCreateOrder()
  const updateMutation = useUpdateOrder()
  const deleteMutation = useDeleteOrder()

  const [search, setSearch]             = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage]   = useState(1)
  const [formOpen, setFormOpen]         = useState(false)
  const [editItem, setEditItem]         = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData]         = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null)

  const productList = products ?? []

  const filtered = (orders ?? []).filter((o) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !String(o[f.name] ?? "").toLowerCase().includes(q) &&
        !String(o[f.supplier] ?? "").toLowerCase().includes(q)
      ) return false
    }
    if (statusFilter !== "all" && String(o[f.status]) !== statusFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  function openCreate() {
    setEditItem(null)
    setFormData(emptyForm())
    setFormOpen(true)
  }

  function openEdit(item: Record<string, unknown>) {
    setEditItem(item)
    const pid = (item[`_${P}_product_id_value`] ?? item[f.product_id] ?? "") as string
    setFormData({
      [f.name]:          String(item[f.name] ?? ""),
      product_id:        pid,
      [f.supplier]:      String(item[f.supplier] ?? ""),
      [f.qty]:           Number(item[f.qty] ?? 1),
      [f.order_date]:    item[f.order_date] ? String(item[f.order_date]).split("T")[0] : "",
      [f.expected_date]: item[f.expected_date] ? String(item[f.expected_date]).split("T")[0] : "",
      [f.status]:        String(item[f.status] ?? ""),
      [f.notes]:         String(item[f.notes] ?? ""),
    })
    setFormOpen(true)
  }

  function handleSave() {
    if (!String(formData[f.name]).trim()) {
      toast.error("件名は必須です")
      return
    }
    if (!formData[f.qty] || Number(formData[f.qty]) < 1) {
      toast.error("発注数量は1以上を指定してください")
      return
    }

    const productId = String(formData.product_id || "")
    const data: Record<string, unknown> = {
      [f.name]:          String(formData[f.name]).trim(),
      [f.supplier]:      String(formData[f.supplier]).trim() || null,
      [f.qty]:           Number(formData[f.qty]),
      [f.order_date]:    formData[f.order_date] ? String(formData[f.order_date]) : null,
      [f.expected_date]: formData[f.expected_date] ? String(formData[f.expected_date]) : null,
      [f.status]:        formData[f.status] !== "" ? Number(formData[f.status]) : null,
      [f.notes]:         String(formData[f.notes]).trim() || null,
    }
    if (productId) {
      data[`${f.product_id}@odata.bind`] = `/${P}_products(${productId})`
    }

    if (editItem) {
      updateMutation.mutate(
        { id: editItem[f.id] as string, data },
        {
          onSuccess: () => { toast.success("発注を更新しました"); setFormOpen(false) },
          onError: () => toast.error("更新に失敗しました"),
        }
      )
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("発注を登録しました"); setFormOpen(false) },
        onError: () => toast.error("登録に失敗しました"),
      })
    }
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget[f.id] as string, {
      onSuccess: () => { toast.success("発注を削除しました"); setDeleteTarget(null) },
      onError: () => toast.error("削除に失敗しました"),
    })
  }

  function getProductName(o: Record<string, unknown>) {
    const pid = (o[`_${P}_product_id_value`] ?? o[f.product_id]) as string
    const p = productList.find((x) => (x[fp.id] as string) === pid)
    return p ? (p[fp.name] as string) : "—"
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">発注管理</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">発注管理</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> 発注登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・仕入先で検索..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {ORDER_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} 件</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>件名</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>仕入先</TableHead>
                  <TableHead className="text-right">発注数量</TableHead>
                  <TableHead>発注日</TableHead>
                  <TableHead>入荷予定日</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((o, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{o[f.name] as string}</TableCell>
                      <TableCell className="text-sm">{getProductName(o)}</TableCell>
                      <TableCell className="text-sm">{(o[f.supplier] as string) || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{o[f.qty] as number}</TableCell>
                      <TableCell className="text-sm">{o[f.order_date] ? String(o[f.order_date]).split("T")[0] : "—"}</TableCell>
                      <TableCell className="text-sm">{o[f.expected_date] ? String(o[f.expected_date]).split("T")[0] : "—"}</TableCell>
                      <TableCell>
                        {o[f.status] != null && <StatusBadge status={o[f.status] as number} />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(o)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(o)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                {filtered.length}件中 {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}件を表示
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1}>前へ</Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages}>次へ</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <FormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editItem ? "発注編集" : "発注登録"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="o_name">件名 <span className="text-red-500">*</span></Label>
            <Input
              id="o_name"
              value={String(formData[f.name])}
              onChange={(e) => setFormData((prev) => ({ ...prev, [f.name]: e.target.value }))}
              placeholder="例: 発注 2024-001"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>商品</Label>
              <Select
                value={String(formData.product_id || "none")}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, product_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="商品を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">（なし）</SelectItem>
                  {productList.map((p) => (
                    <SelectItem key={p[fp.id] as string} value={p[fp.id] as string}>
                      {p[fp.name] as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="o_supplier">仕入先</Label>
              <Input
                id="o_supplier"
                value={String(formData[f.supplier])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.supplier]: e.target.value }))}
                placeholder="例: 株式会社〇〇"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="o_qty">発注数量 <span className="text-red-500">*</span></Label>
              <Input
                id="o_qty"
                type="number"
                min={1}
                value={String(formData[f.qty])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.qty]: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select
                value={String(formData[f.status] || "none")}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, [f.status]: v === "none" ? "" : Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">（なし）</SelectItem>
                  {ORDER_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="o_order_date">発注日</Label>
              <Input
                id="o_order_date"
                type="date"
                value={String(formData[f.order_date])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.order_date]: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o_expected_date">入荷予定日</Label>
              <Input
                id="o_expected_date"
                type="date"
                value={String(formData[f.expected_date])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.expected_date]: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="o_notes">備考</Label>
            <Textarea
              id="o_notes"
              value={String(formData[f.notes])}
              onChange={(e) => setFormData((prev) => ({ ...prev, [f.notes]: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="発注の削除"
        description={`「${deleteTarget?.[f.name] as string ?? ""}」を削除しますか？この操作は元に戻せません。`}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel="削除"
      />
    </div>
  )
}

// cn is used in StatusBadge
void cn
