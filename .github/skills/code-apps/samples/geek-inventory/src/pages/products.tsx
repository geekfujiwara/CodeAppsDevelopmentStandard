import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormModal } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@/hooks/use-dataverse"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { PUBLISHER_PREFIX } from "@/config"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search, AlertCircle, AlertTriangle } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const P = PUBLISHER_PREFIX
const f = {
  id:            `${P}_productid`,
  name:          `${P}_name`,
  code:          `${P}_product_code`,
  category:      `${P}_category`,
  unit:          `${P}_unit`,
  unit_price:    `${P}_unit_price`,
  current_stock: `${P}_current_stock`,
  min_stock:     `${P}_min_stock`,
  notes:         `${P}_notes`,
}

type FormState = {
  [key: string]: string | number
}

const emptyForm = (): FormState => ({
  [f.name]:          "",
  [f.code]:          "",
  [f.category]:      "",
  [f.unit]:          "",
  [f.unit_price]:    0,
  [f.current_stock]: 0,
  [f.min_stock]:     0,
  [f.notes]:         "",
})

const ITEMS_PER_PAGE = 10

export default function Products() {
  const { data: products, isLoading } = useProducts()
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const deleteMutation = useDeleteProduct()

  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null)

  const filtered = (products ?? []).filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      String(p[f.name] ?? "").toLowerCase().includes(q) ||
      String(p[f.code] ?? "").toLowerCase().includes(q) ||
      String(p[f.category] ?? "").toLowerCase().includes(q)
    )
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  function openCreate() {
    setEditItem(null)
    setFormData(emptyForm())
    setFormOpen(true)
  }

  function openEdit(item: Record<string, unknown>) {
    setEditItem(item)
    setFormData({
      [f.name]:          String(item[f.name] ?? ""),
      [f.code]:          String(item[f.code] ?? ""),
      [f.category]:      String(item[f.category] ?? ""),
      [f.unit]:          String(item[f.unit] ?? ""),
      [f.unit_price]:    Number(item[f.unit_price] ?? 0),
      [f.current_stock]: Number(item[f.current_stock] ?? 0),
      [f.min_stock]:     Number(item[f.min_stock] ?? 0),
      [f.notes]:         String(item[f.notes] ?? ""),
    })
    setFormOpen(true)
  }

  function handleSave() {
    if (!String(formData[f.name]).trim()) {
      toast.error("商品名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:          String(formData[f.name]).trim(),
      [f.code]:          String(formData[f.code]).trim() || null,
      [f.category]:      String(formData[f.category]).trim() || null,
      [f.unit]:          String(formData[f.unit]).trim() || null,
      [f.unit_price]:    Number(formData[f.unit_price]) || null,
      [f.current_stock]: Number(formData[f.current_stock]),
      [f.min_stock]:     Number(formData[f.min_stock]),
      [f.notes]:         String(formData[f.notes]).trim() || null,
    }

    if (editItem) {
      updateMutation.mutate(
        { id: editItem[f.id] as string, data },
        {
          onSuccess: () => { toast.success("商品を更新しました"); setFormOpen(false) },
          onError: () => toast.error("更新に失敗しました"),
        }
      )
    } else {
      createMutation.mutate(data, {
        onSuccess: () => { toast.success("商品を登録しました"); setFormOpen(false) },
        onError: () => toast.error("登録に失敗しました"),
      })
    }
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget[f.id] as string, {
      onSuccess: () => { toast.success("商品を削除しました"); setDeleteTarget(null) },
      onError: () => toast.error("削除に失敗しました"),
    })
  }

  function stockBadge(p: Record<string, unknown>) {
    const cur = Number(p[f.current_stock] ?? 0)
    const min = Number(p[f.min_stock] ?? 0)
    if (cur === 0) return <span className="font-bold text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{cur}</span>
    if (min > 0 && cur <= min) return <span className="font-bold text-orange-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{cur}</span>
    return <span className="font-semibold">{cur}</span>
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">商品マスタ</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">商品マスタ</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> 商品登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="商品名・商品コード・カテゴリで検索..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} 件</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名</TableHead>
                  <TableHead>商品コード</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>単位</TableHead>
                  <TableHead className="text-right">単価</TableHead>
                  <TableHead className="text-right">現在庫数</TableHead>
                  <TableHead className="text-right">最低在庫数</TableHead>
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
                  paginated.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p[f.name] as string}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{(p[f.code] as string) || "—"}</TableCell>
                      <TableCell>{(p[f.category] as string) || "—"}</TableCell>
                      <TableCell>{(p[f.unit] as string) || "—"}</TableCell>
                      <TableCell className="text-right">
                        {p[f.unit_price] != null ? `¥${Number(p[f.unit_price]).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">{stockBadge(p)}</TableCell>
                      <TableCell className="text-right">{Number(p[f.min_stock] ?? 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(p)}
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
        title={editItem ? "商品編集" : "商品登録"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">商品名 <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                value={String(formData[f.name])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.name]: e.target.value }))}
                placeholder="例: ボールペン（黒）"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">商品コード</Label>
              <Input
                id="code"
                value={String(formData[f.code])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.code]: e.target.value }))}
                placeholder="例: BP-001"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">カテゴリ</Label>
              <Input
                id="category"
                value={String(formData[f.category])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.category]: e.target.value }))}
                placeholder="例: 文具"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">単位</Label>
              <Input
                id="unit"
                value={String(formData[f.unit])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.unit]: e.target.value }))}
                placeholder="例: 個, 箱, kg"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="unit_price">単価</Label>
              <Input
                id="unit_price"
                type="number"
                min={0}
                value={String(formData[f.unit_price])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.unit_price]: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_stock">現在庫数</Label>
              <Input
                id="current_stock"
                type="number"
                min={0}
                value={String(formData[f.current_stock])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.current_stock]: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_stock">最低在庫数</Label>
              <Input
                id="min_stock"
                type="number"
                min={0}
                value={String(formData[f.min_stock])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.min_stock]: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
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
        title="商品の削除"
        description={`「${deleteTarget?.[f.name] as string ?? ""}」を削除しますか？この操作は元に戻せません。`}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel="削除"
      />
    </div>
  )
}

