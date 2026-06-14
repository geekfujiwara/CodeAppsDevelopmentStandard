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
import { useEquipment, useCreateEquipment, useUpdateEquipment, useDeleteEquipment } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_STATUS_COLOR,
  EQUIPMENT_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:            `${P}_equipmentid`,
  name:          `${P}_name`,
  equipment_code:`${P}_equipment_code`,
  category:      `${P}_category`,
  location:      `${P}_location`,
  manufacturer:  `${P}_manufacturer`,
  model:         `${P}_model`,
  install_date:  `${P}_install_date`,
  status:        `${P}_status`,
  notes:         `${P}_notes`,
}

function StatusBadge({ status }: { status: number }) {
  const label = EQUIPMENT_STATUS_LABEL[status as keyof typeof EQUIPMENT_STATUS_LABEL] ?? String(status)
  const color = EQUIPMENT_STATUS_COLOR[status as keyof typeof EQUIPMENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  equipment_code: string
  category: string
  location: string
  manufacturer: string
  model: string
  install_date: string
  status: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", equipment_code: "", category: "", location: "",
  manufacturer: "", model: "", install_date: "", status: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function EquipmentPage() {
  const { data: equipment = [], isLoading } = useEquipment()
  const createEquipment = useCreateEquipment()
  const updateEquipment = useUpdateEquipment()
  const deleteEquipment = useDeleteEquipment()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const filtered = equipment.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(e[f.name] ?? "").toLowerCase().includes(q) ||
      String(e[f.equipment_code] ?? "").toLowerCase().includes(q) ||
      String(e[f.location] ?? "").toLowerCase().includes(q) ||
      String(e[f.manufacturer] ?? "").toLowerCase().includes(q)
    const matchStatus = filterStatus === "all" || String(e[f.status]) === filterStatus
    return matchSearch && matchStatus
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setEditingId(String(item[f.id] ?? ""))
    setFormData({
      name:           String(item[f.name] ?? ""),
      equipment_code: String(item[f.equipment_code] ?? ""),
      category:       String(item[f.category] ?? ""),
      location:       String(item[f.location] ?? ""),
      manufacturer:   String(item[f.manufacturer] ?? ""),
      model:          String(item[f.model] ?? ""),
      install_date:   String(item[f.install_date] ?? ""),
      status:         item[f.status] != null ? String(item[f.status]) : "",
      notes:          String(item[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("設備名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:           formData.name,
      [f.equipment_code]: formData.equipment_code,
      [f.category]:       formData.category,
      [f.location]:       formData.location,
      [f.manufacturer]:   formData.manufacturer,
      [f.model]:          formData.model,
      [f.notes]:          formData.notes,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.install_date) data[f.install_date] = formData.install_date

    try {
      if (editingId) {
        await updateEquipment.mutateAsync({ id: editingId, data })
        toast.success("設備を更新しました")
      } else {
        await createEquipment.mutateAsync(data)
        toast.success("設備を作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteEquipment.mutateAsync(deleteId)
      toast.success("設備を削除しました")
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
          <h1 className="text-2xl font-bold">設備マスタ</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">設備マスタ</h1>
          <p className="text-muted-foreground text-sm mt-1">設備情報の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>設備一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="設備名・設備コード・場所・メーカーで検索..."
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
                {EQUIPMENT_STATUS_OPTIONS.map(o => (
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
                  <TableHead>設備名</TableHead>
                  <TableHead>設備コード</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>場所</TableHead>
                  <TableHead>メーカー</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>設置日</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      設備がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {String(item[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(item[f.equipment_code] ?? "")}</TableCell>
                      <TableCell>{String(item[f.category] ?? "")}</TableCell>
                      <TableCell>{String(item[f.location] ?? "")}</TableCell>
                      <TableCell>{String(item[f.manufacturer] ?? "")}</TableCell>
                      <TableCell>
                        {item[f.status] != null && (
                          <StatusBadge status={item[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(item[f.install_date] ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(item)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(item[f.id] ?? ""))}
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
        title={editingId ? "設備編集" : "設備新規登録"}
        onSave={handleSave}
        isSaving={createEquipment.isPending || updateEquipment.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          <FormColumns columns={2}>
            {/* 設備名（必須） */}
            <div className="space-y-1.5">
              <Label htmlFor="name">設備名 <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={update("name")}
                placeholder="設備名を入力"
              />
            </div>
            {/* 設備コード */}
            <div className="space-y-1.5">
              <Label htmlFor="equipment_code">設備コード</Label>
              <Input
                id="equipment_code"
                value={formData.equipment_code}
                onChange={update("equipment_code")}
                placeholder="例: EQ-001"
              />
            </div>
            {/* カテゴリ */}
            <div className="space-y-1.5">
              <Label htmlFor="category">カテゴリ</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: 空調設備, 電気設備"
              />
            </div>
            {/* 設置場所 */}
            <div className="space-y-1.5">
              <Label htmlFor="location">設置場所</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={update("location")}
                placeholder="例: 1F 機械室"
              />
            </div>
            {/* メーカー */}
            <div className="space-y-1.5">
              <Label htmlFor="manufacturer">メーカー</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={update("manufacturer")}
                placeholder="メーカー名"
              />
            </div>
            {/* モデル */}
            <div className="space-y-1.5">
              <Label htmlFor="model">モデル</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={update("model")}
                placeholder="型番・モデル名"
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
                  {EQUIPMENT_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 設置日 */}
            <div className="space-y-1.5">
              <Label htmlFor="install_date">設置日</Label>
              <Input
                id="install_date"
                type="date"
                value={formData.install_date}
                onChange={update("install_date")}
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
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="設備を削除しますか？"
        description="この操作は取り消せません。設備を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
