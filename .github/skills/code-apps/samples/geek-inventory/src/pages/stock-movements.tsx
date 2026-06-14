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
  useStockMovements,
  useCreateStockMovement,
  useUpdateStockMovement,
  useDeleteStockMovement,
  useUpdateProduct,
} from "@/hooks/use-dataverse"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { PUBLISHER_PREFIX } from "@/config"
import {
  MOVEMENT_TYPE_LABEL,
  MOVEMENT_TYPE_COLOR,
  MOVEMENT_TYPE_OPTIONS,
  type MovementType,
} from "@/types/dataverse"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = {
  id:         `${P}_stock_movementid`,
  name:       `${P}_name`,
  product_id: `${P}_product_id`,
  type:       `${P}_movement_type`,
  qty:        `${P}_quantity`,
  date:       `${P}_movement_date`,
  reason:     `${P}_reason`,
  notes:      `${P}_notes`,
}
const fp = {
  id:            `${P}_productid`,
  name:          `${P}_name`,
  current_stock: `${P}_current_stock`,
}

function MovementTypeBadge({ type }: { type: number }) {
  const t = type as MovementType
  const label = MOVEMENT_TYPE_LABEL[t] ?? String(type)
  const color = MOVEMENT_TYPE_COLOR[t] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", color)}>
      {label}
    </span>
  )
}

type FormState = Record<string, string | number>

const emptyForm = (): FormState => ({
  [f.name]:   "",
  product_id: "",
  [f.type]:   "",
  [f.qty]:    1,
  [f.date]:   new Date().toISOString().split("T")[0],
  [f.reason]: "",
  [f.notes]:  "",
})

const ITEMS_PER_PAGE = 10

export default function StockMovements() {
  const { data: products } = useProducts()
  const { data: movements, isLoading } = useStockMovements()
  const createMutation = useCreateStockMovement()
  const updateMutation = useUpdateStockMovement()
  const deleteMutation = useDeleteStockMovement()
  const updateProductMutation = useUpdateProduct()

  const [search, setSearch]             = useState("")
  const [typeFilter, setTypeFilter]     = useState("all")
  const [productFilter, setProductFilter] = useState("all")
  const [currentPage, setCurrentPage]   = useState(1)
  const [formOpen, setFormOpen]         = useState(false)
  const [editItem, setEditItem]         = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData]         = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null)

  const productList = products ?? []

  const filtered = (movements ?? []).filter((m) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !String(m[f.name] ?? "").toLowerCase().includes(q) &&
        !String(m[f.reason] ?? "").toLowerCase().includes(q)
      ) return false
    }
    if (typeFilter !== "all" && String(m[f.type]) !== typeFilter) return false
    if (productFilter !== "all") {
      const pid = m[`_${P}_product_id_value`] ?? m[f.product_id]
      if (String(pid) !== productFilter) return false
    }
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
      [f.name]:   String(item[f.name] ?? ""),
      product_id: pid,
      [f.type]:   String(item[f.type] ?? ""),
      [f.qty]:    Number(item[f.qty] ?? 1),
      [f.date]:   item[f.date] ? String(item[f.date]).split("T")[0] : "",
      [f.reason]: String(item[f.reason] ?? ""),
      [f.notes]:  String(item[f.notes] ?? ""),
    })
    setFormOpen(true)
  }

  async function handleSave() {
    if (!String(formData[f.name]).trim()) {
      toast.error("件名は必須です")
      return
    }
    if (!formData[f.qty] || Number(formData[f.qty]) < 1) {
      toast.error("数量は1以上を指定してください")
      return
    }

    const productId = String(formData.product_id || "")
    const movementType = Number(formData[f.type]) as MovementType
    const qty = Number(formData[f.qty])

    const data: Record<string, unknown> = {
      [f.name]:   String(formData[f.name]).trim(),
      [f.type]:   movementType || null,
      [f.qty]:    qty,
      [f.date]:   formData[f.date] ? String(formData[f.date]) : null,
      [f.reason]: String(formData[f.reason]).trim() || null,
      [f.notes]:  String(formData[f.notes]).trim() || null,
    }

    if (productId) {
      data[`${f.product_id}@odata.bind`] = `/${P}_products(${productId})`
    }

    if (editItem) {
      updateMutation.mutate(
        { id: editItem[f.id] as string, data },
        {
          onSuccess: () => {
            toast.success("入出庫記録を更新しました")
            toast.info("在庫数は手動で更新してください", { duration: 5000 })
            setFormOpen(false)
          },
          onError: () => toast.error("更新に失敗しました"),
        }
      )
    } else {
      // On create, update product stock if product is selected
      createMutation.mutate(data, {
        onSuccess: async () => {
          toast.success("入出庫記録を登録しました")

          if (productId && formData[f.type] !== "") {
            const product = productList.find((p) => (p[fp.id] as string) === productId)
            if (product) {
              const curStock = Number(product[fp.current_stock] ?? 0)
              let newStock = curStock
              if (movementType === 100000000) {
                newStock = curStock + qty
              } else if (movementType === 100000001) {
                newStock = Math.max(0, curStock - qty)
              } else if (movementType === 100000002) {
                newStock = qty
              }
              try {
                await updateProductMutation.mutateAsync({
                  id: productId,
                  data: { [fp.current_stock]: newStock },
                })
                toast.success(`在庫数を ${curStock} → ${newStock} に更新しました`)
              } catch {
                toast.error("在庫数の自動更新に失敗しました。手動で更新してください。")
              }
            }
          }
          setFormOpen(false)
        },
        onError: () => toast.error("登録に失敗しました"),
      })
    }
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget[f.id] as string, {
      onSuccess: () => {
        toast.success("入出庫記録を削除しました")
        toast.info("在庫数は手動で更新してください", { duration: 5000 })
        setDeleteTarget(null)
      },
      onError: () => toast.error("削除に失敗しました"),
    })
  }

  function getProductName(m: Record<string, unknown>) {
    const pid = (m[`_${P}_product_id_value`] ?? m[f.product_id]) as string
    const p = productList.find((x) => (x[fp.id] as string) === pid)
    return p ? (p[fp.name] as string) : pid ? "—" : "—"
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">入出庫管理</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">入出庫管理</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> 入出庫登録
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 新規登録時のみ商品の現在庫数を自動更新します。編集・削除の場合は手動で現在庫数を更新してください。
      </p>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・理由で検索..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="区分" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての区分</SelectItem>
                {MOVEMENT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="商品" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての商品</SelectItem>
                {productList.map((p) => (
                  <SelectItem key={p[fp.id] as string} value={p[fp.id] as string}>
                    {p[fp.name] as string}
                  </SelectItem>
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
                  <TableHead>区分</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead>日付</TableHead>
                  <TableHead>理由</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m[f.name] as string}</TableCell>
                      <TableCell className="text-sm">{getProductName(m)}</TableCell>
                      <TableCell>
                        {m[f.type] != null && <MovementTypeBadge type={m[f.type] as number} />}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{m[f.qty] as number}</TableCell>
                      <TableCell className="text-sm">{m[f.date] ? String(m[f.date]).split("T")[0] : "—"}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{(m[f.reason] as string) || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(m)}
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
        title={editItem ? "入出庫記録編集" : "入出庫登録"}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sm_name">件名 <span className="text-red-500">*</span></Label>
            <Input
              id="sm_name"
              value={String(formData[f.name])}
              onChange={(e) => setFormData((prev) => ({ ...prev, [f.name]: e.target.value }))}
              placeholder="例: 入庫 2024-01"
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
              <Label>区分</Label>
              <Select
                value={String(formData[f.type] || "none")}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, [f.type]: v === "none" ? "" : Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="区分を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">（なし）</SelectItem>
                  {MOVEMENT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sm_qty">数量 <span className="text-red-500">*</span></Label>
              <Input
                id="sm_qty"
                type="number"
                min={1}
                value={String(formData[f.qty])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.qty]: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sm_date">日付</Label>
              <Input
                id="sm_date"
                type="date"
                value={String(formData[f.date])}
                onChange={(e) => setFormData((prev) => ({ ...prev, [f.date]: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sm_reason">理由</Label>
            <Input
              id="sm_reason"
              value={String(formData[f.reason])}
              onChange={(e) => setFormData((prev) => ({ ...prev, [f.reason]: e.target.value }))}
              placeholder="入出庫の理由や参照番号"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sm_notes">備考</Label>
            <Textarea
              id="sm_notes"
              value={String(formData[f.notes])}
              onChange={(e) => setFormData((prev) => ({ ...prev, [f.notes]: e.target.value }))}
              rows={3}
            />
          </div>
          {!editItem && formData.product_id && formData[f.type] !== "" && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              ※ 登録時に商品の現在庫数を自動更新します（
              {formData[f.type] === 100000000 ? "入庫: +" + String(formData[f.qty]) :
               formData[f.type] === 100000001 ? "出庫: -" + String(formData[f.qty]) :
               "棚卸調整: " + String(formData[f.qty]) + " に設定"}
              ）
            </p>
          )}
        </div>
      </FormModal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="入出庫記録の削除"
        description={`「${deleteTarget?.[f.name] as string ?? ""}」を削除しますか？在庫数は手動で更新してください。`}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel="削除"
      />
    </div>
  )
}

// cn is used in MovementTypeBadge
void cn
