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
  useVendors,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_VENDORS } from "@/config"
import { VENDOR_RATING_OPTIONS } from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_vendorid`,
  name:         `${P}_name`,
  category:     `${P}_category`,
  contact_name: `${P}_contact_name`,
  email:        `${P}_email`,
  phone:        `${P}_phone`,
  rating:       `${P}_rating`,
  notes:        `${P}_notes`,
}

function StarsDisplay({ rating }: { rating: number }) {
  const stars = rating - 100000000 + 1
  return (
    <span className="text-yellow-500 text-sm">
      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
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
            仕入先管理は現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_VENDORS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  category: string
  contact_name: string
  email: string
  phone: string
  rating: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", contact_name: "", email: "", phone: "", rating: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function VendorsPage() {
  if (!FEATURE_VENDORS) return <DisabledFeatureCard />
  return <VendorsContent />
}

function VendorsContent() {
  const { data: vendors = [], isLoading } = useVendors()
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const deleteVendor = useDeleteVendor()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterRating, setFilterRating] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(v[f.name] ?? "").toLowerCase().includes(q) ||
      String(v[f.category] ?? "").toLowerCase().includes(q) ||
      String(v[f.contact_name] ?? "").toLowerCase().includes(q)
    const matchRating = filterRating === "all" || String(v[f.rating]) === filterRating
    return matchSearch && matchRating
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (vendor: Record<string, unknown>) => {
    setEditingId(String(vendor[f.id] ?? ""))
    setFormData({
      name:         String(vendor[f.name] ?? ""),
      category:     String(vendor[f.category] ?? ""),
      contact_name: String(vendor[f.contact_name] ?? ""),
      email:        String(vendor[f.email] ?? ""),
      phone:        String(vendor[f.phone] ?? ""),
      rating:       vendor[f.rating] != null ? String(vendor[f.rating]) : "",
      notes:        String(vendor[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("仕入先名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:         formData.name,
      [f.category]:     formData.category,
      [f.contact_name]: formData.contact_name,
      [f.email]:        formData.email,
      [f.phone]:        formData.phone,
      [f.notes]:        formData.notes,
    }
    if (formData.rating) data[f.rating] = Number(formData.rating)

    try {
      if (editingId) {
        await updateVendor.mutateAsync({ id: editingId, data })
        toast.success("仕入先を更新しました")
      } else {
        await createVendor.mutateAsync(data)
        toast.success("仕入先を作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteVendor.mutateAsync(deleteId)
      toast.success("仕入先を削除しました")
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
          <h1 className="text-2xl font-bold">仕入先管理</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">仕入先管理</h1>
          <p className="text-muted-foreground text-sm mt-1">仕入先マスタの管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>仕入先一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="仕入先名・業種・担当者で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterRating} onValueChange={v => { setFilterRating(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="評価" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての評価</SelectItem>
                {VENDOR_RATING_OPTIONS.map(o => (
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
                  <TableHead>仕入先名</TableHead>
                  <TableHead>業種</TableHead>
                  <TableHead>担当者名</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>評価</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      仕入先がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((vendor, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{String(vendor[f.name] ?? "")}</TableCell>
                      <TableCell>{String(vendor[f.category] ?? "")}</TableCell>
                      <TableCell>{String(vendor[f.contact_name] ?? "")}</TableCell>
                      <TableCell>{String(vendor[f.email] ?? "")}</TableCell>
                      <TableCell>{String(vendor[f.phone] ?? "")}</TableCell>
                      <TableCell>
                        {vendor[f.rating] != null && (
                          <StarsDisplay rating={vendor[f.rating] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(vendor)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(vendor[f.id] ?? ""))}
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
        title={editingId ? "仕入先編集" : "仕入先新規登録"}
        onSave={handleSave}
        isSaving={createVendor.isPending || updateVendor.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 仕入先名（必須） */}
          <div className="space-y-1.5">
            <Label htmlFor="v-name">仕入先名 <span className="text-destructive">*</span></Label>
            <Input
              id="v-name"
              value={formData.name}
              onChange={update("name")}
              placeholder="仕入先名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 業種 */}
            <div className="space-y-1.5">
              <Label htmlFor="v-category">業種</Label>
              <Input
                id="v-category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: IT, 製造, 物流"
              />
            </div>
            {/* 担当者名 */}
            <div className="space-y-1.5">
              <Label htmlFor="v-contact">担当者名</Label>
              <Input
                id="v-contact"
                value={formData.contact_name}
                onChange={update("contact_name")}
                placeholder="担当者名"
              />
            </div>
            {/* メール */}
            <div className="space-y-1.5">
              <Label htmlFor="v-email">メール</Label>
              <Input
                id="v-email"
                type="email"
                value={formData.email}
                onChange={update("email")}
                placeholder="example@company.com"
              />
            </div>
            {/* 電話 */}
            <div className="space-y-1.5">
              <Label htmlFor="v-phone">電話</Label>
              <Input
                id="v-phone"
                type="tel"
                value={formData.phone}
                onChange={update("phone")}
                placeholder="03-0000-0000"
              />
            </div>
            {/* 評価 */}
            <div className="space-y-1.5">
              <Label>評価</Label>
              <Select value={formData.rating} onValueChange={v => setFormData(p => ({ ...p, rating: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="評価を選択" />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_RATING_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormColumns>

          {/* 備考 */}
          <div className="space-y-1.5">
            <Label htmlFor="v-notes">備考</Label>
            <Textarea
              id="v-notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="備考・メモ"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="仕入先を削除しますか？"
        description="この操作は取り消せません。仕入先を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
