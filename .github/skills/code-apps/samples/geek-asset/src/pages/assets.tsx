import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormModal, FormColumns, FormSection } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import {
  useAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ASSET_STATUS_LABEL,
  ASSET_STATUS_COLOR,
  ASSET_CATEGORY_LABEL,
  ASSET_STATUS_OPTIONS,
  ASSET_CATEGORY_OPTIONS,
  type AssetStatus,
  type AssetCategory,
  type Asset,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ASSET_STATUS_COLOR[status]}`}>
      {ASSET_STATUS_LABEL[status]}
    </span>
  )
}

const EMPTY_FORM = {
  asset_name:     "",
  asset_number:   "",
  category:       "",
  serial_number:  "",
  purchase_date:  "",
  purchase_price: "",
  status:         "",
  location:       "",
  department:     "",
  notes:          "",
}

type FormValues = typeof EMPTY_FORM

export default function Assets() {
  const { data: assets = [], isLoading } = useAssets()
  const createMutation = useCreateAsset()
  const updateMutation = useUpdateAsset()
  const deleteMutation = useDeleteAsset()

  const [search, setSearch]         = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [page, setPage]             = useState(1)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [isSaving, setIsSaving]     = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:             `${P}_assetid`,
    asset_name:     `${P}_asset_name`,
    asset_number:   `${P}_asset_number`,
    category:       `${P}_category`,
    serial_number:  `${P}_serial_number`,
    purchase_date:  `${P}_purchase_date`,
    purchase_price: `${P}_purchase_price`,
    status:         `${P}_status`,
    location:       `${P}_location`,
    department:     `${P}_department`,
    notes:          `${P}_notes`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = assets.filter((a) => {
    const name = (a[f.asset_name] as string ?? "").toLowerCase()
    const num  = (a[f.asset_number] as string ?? "").toLowerCase()
    const loc  = (a[f.location] as string ?? "").toLowerCase()
    const dept = (a[f.department] as string ?? "").toLowerCase()
    const q    = search.toLowerCase()
    const matchSearch = !q || name.includes(q) || num.includes(q) || loc.includes(q) || dept.includes(q)
    const matchStatus   = statusFilter === "all"   || String(a[f.status])   === statusFilter
    const matchCategory = categoryFilter === "all" || String(a[f.category]) === categoryFilter
    return matchSearch && matchStatus && matchCategory
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(asset: Asset) {
    const id = asset[f.id] as string
    setEditingId(id)
    setForm({
      asset_name:     (asset[f.asset_name] as string) ?? "",
      asset_number:   (asset[f.asset_number] as string) ?? "",
      category:       String((asset[f.category] as number) ?? ""),
      serial_number:  (asset[f.serial_number] as string) ?? "",
      purchase_date:  (asset[f.purchase_date] as string)?.slice(0, 10) ?? "",
      purchase_price: String((asset[f.purchase_price] as number) ?? ""),
      status:         String((asset[f.status] as number) ?? ""),
      location:       (asset[f.location] as string) ?? "",
      department:     (asset[f.department] as string) ?? "",
      notes:          (asset[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.asset_name.trim()) {
      toast.error("資産名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.asset_name]:     form.asset_name,
        [f.asset_number]:   form.asset_number || undefined,
        [f.category]:       form.category     ? Number(form.category)     : undefined,
        [f.serial_number]:  form.serial_number || undefined,
        [f.purchase_date]:  form.purchase_date || undefined,
        [f.purchase_price]: form.purchase_price ? Number(form.purchase_price) : undefined,
        [f.status]:         form.status       ? Number(form.status)       : 100000000,
        [f.location]:       form.location     || undefined,
        [f.department]:     form.department   || undefined,
        [f.notes]:          form.notes        || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("資産を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("資産を登録しました")
      }
      setModalOpen(false)
    } catch {
      toast.error(editingId ? "更新に失敗しました" : "登録に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("資産を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">資産台帳</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">資産台帳</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="資産名・番号・場所・部門で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {ASSET_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {ASSET_CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>資産名</TableHead>
                  <TableHead>資産番号</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>場所</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>購入日</TableHead>
                  <TableHead className="text-right">操作</TableHead>
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
                  paginated.map((asset, idx) => {
                    const status   = (asset[f.status] as AssetStatus) ?? 100000000
                    const category = asset[f.category] as AssetCategory
                    const name     = (asset[f.asset_name] as string) ?? "—"
                    const number   = (asset[f.asset_number] as string) ?? "—"
                    const location = (asset[f.location] as string) ?? "—"
                    const dept     = (asset[f.department] as string) ?? "—"
                    const date     = (asset[f.purchase_date] as string)?.slice(0, 10) ?? "—"
                    const id       = asset[f.id] as string
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[180px] truncate">{name}</TableCell>
                        <TableCell>{number}</TableCell>
                        <TableCell>{category != null ? ASSET_CATEGORY_LABEL[category] : "—"}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell>{location}</TableCell>
                        <TableCell>{dept}</TableCell>
                        <TableCell>{date}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="編集"
                              onClick={() => openEdit(asset)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="削除"
                              onClick={() => setDeleteId(id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">
                {filtered.length}件中 {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)}件を表示
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>前へ</Button>
                <span className="text-sm">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 作成・編集モーダル */}
      <FormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? "資産を編集" : "資産を新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="asset_name">資産名 <span className="text-destructive">*</span></Label>
                <Input
                  id="asset_name"
                  value={form.asset_name}
                  onChange={(e) => setForm(f => ({ ...f, asset_name: e.target.value }))}
                  placeholder="例: ThinkPad X1 Carbon"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset_number">資産番号</Label>
                <Input
                  id="asset_number"
                  value={form.asset_number}
                  onChange={(e) => setForm(f => ({ ...f, asset_number: e.target.value }))}
                  placeholder="例: IT-2024-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ</Label>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">ステータス</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="serial_number">シリアル番号</Label>
                <Input
                  id="serial_number"
                  value={form.serial_number}
                  onChange={(e) => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  placeholder="例: SN1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_date">購入日</Label>
                <Input
                  id="purchase_date"
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_price">購入価格 (円)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  value={form.purchase_price}
                  onChange={(e) => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">場所</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="例: 東京本社 3F"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">部門</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="例: 営業部"
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="備考">
            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </FormSection>
        </div>
      </FormModal>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="資産を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
