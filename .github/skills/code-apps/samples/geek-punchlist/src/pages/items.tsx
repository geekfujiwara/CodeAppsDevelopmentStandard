import { useMemo, useState } from "react"
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
  useSites,
  usePunchItems,
  useCreatePunchItem,
  useUpdatePunchItem,
  useDeletePunchItem,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ITEM_STATUS_LABEL,
  ITEM_STATUS_COLOR,
  ITEM_STATUS_OPTIONS,
  ITEM_OPEN,
  ITEM_VERIFIED,
  NEXT_STATUS,
  type ItemStatus,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle, ArrowRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:         `${P}_punch_itemid`,
  name:       `${P}_name`,
  site_ref:   `${P}_site_ref`,
  location:   `${P}_location`,
  category:   `${P}_category`,
  contractor: `${P}_contractor`,
  status:     `${P}_status`,
  found_date: `${P}_found_date`,
  due_date:   `${P}_due_date`,
  detail:     `${P}_detail`,
}

const st = {
  id:   `${P}_siteid`,
  name: `${P}_name`,
}

function StatusBadge({ status }: { status: number }) {
  const label = ITEM_STATUS_LABEL[status as keyof typeof ITEM_STATUS_LABEL] ?? String(status)
  const color = ITEM_STATUS_COLOR[status as keyof typeof ITEM_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  site_ref: string
  location: string
  category: string
  contractor: string
  status: string
  found_date: string
  due_date: string
  detail: string
}

const EMPTY_FORM: FormData = {
  name: "", site_ref: "", location: "", category: "", contractor: "",
  status: String(ITEM_OPEN), found_date: "", due_date: "", detail: "",
}

const ITEMS_PER_PAGE = 10

export default function ItemsPage() {
  const { data: items = [], isLoading } = usePunchItems()
  const { data: sites = [] } = useSites()
  const createItem = useCreatePunchItem()
  const updateItem = useUpdatePunchItem()
  const deleteItem = useDeletePunchItem()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterSite, setFilterSite] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const siteNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const site of sites) {
      map.set(String(site[st.id] ?? ""), String(site[st.name] ?? ""))
    }
    return map
  }, [sites])

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = (item: Record<string, unknown>) =>
    (item[f.status] as number) !== ITEM_VERIFIED &&
    !!item[f.due_date] && String(item[f.due_date]) < today

  // フィルター
  const filtered = items
    .filter(r => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(r[f.name] ?? "").toLowerCase().includes(q) ||
        String(r[f.location] ?? "").toLowerCase().includes(q) ||
        String(r[f.contractor] ?? "").toLowerCase().includes(q) ||
        String(r[f.category] ?? "").toLowerCase().includes(q)
      const matchSite = filterSite === "all" || String(r[f.site_ref]) === filterSite
      const matchStatus = filterStatus === "all" || String(r[f.status]) === filterStatus
      return matchSearch && matchSite && matchStatus
    })
    .sort((a, b) => {
      const aDone = (a[f.status] as number) === ITEM_VERIFIED ? 1 : 0
      const bDone = (b[f.status] as number) === ITEM_VERIFIED ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return String(a[f.due_date] ?? "9999").localeCompare(String(b[f.due_date] ?? "9999"))
    })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, found_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setEditingId(String(item[f.id] ?? ""))
    setFormData({
      name:       String(item[f.name] ?? ""),
      site_ref:   String(item[f.site_ref] ?? ""),
      location:   String(item[f.location] ?? ""),
      category:   String(item[f.category] ?? ""),
      contractor: String(item[f.contractor] ?? ""),
      status:     item[f.status] != null ? String(item[f.status]) : String(ITEM_OPEN),
      found_date: String(item[f.found_date] ?? ""),
      due_date:   String(item[f.due_date] ?? ""),
      detail:     String(item[f.detail] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("指摘内容は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:       formData.name,
      [f.site_ref]:   formData.site_ref,
      [f.location]:   formData.location,
      [f.category]:   formData.category || "未分類",
      [f.contractor]: formData.contractor,
      [f.detail]:     formData.detail,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.found_date) data[f.found_date] = formData.found_date
    if (formData.due_date) data[f.due_date] = formData.due_date

    try {
      if (editingId) {
        await updateItem.mutateAsync({ id: editingId, data })
        toast.success("指摘事項を更新しました")
      } else {
        await createItem.mutateAsync(data)
        toast.success("指摘事項を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  /** ワンクリックで次の状態へ送る（指摘→是正中→是正済→確認済） */
  const handleAdvance = async (item: Record<string, unknown>) => {
    const status = item[f.status] as ItemStatus
    const next = NEXT_STATUS[status]
    if (!next) return
    try {
      await updateItem.mutateAsync({ id: String(item[f.id] ?? ""), data: { [f.status]: next.value } })
      toast.success(`「${ITEM_STATUS_LABEL[next.value]}」にしました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteItem.mutateAsync(deleteId)
      toast.success("指摘事項を削除しました")
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
          <h1 className="text-2xl font-bold">指摘事項</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">指摘事項</h1>
          <p className="text-muted-foreground text-sm mt-1">竣工検査・是正指摘（パンチリスト）の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規指摘
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>指摘事項一覧</CardTitle>
          <CardDescription>{filtered.length} 件（未完了優先・是正期限の近い順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="指摘内容・場所・業者・分類で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterSite} onValueChange={v => { setFilterSite(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="現場" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての現場</SelectItem>
                {sites.map((site, idx) => (
                  <SelectItem key={idx} value={String(site[st.id] ?? "")}>
                    {String(site[st.name] ?? "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {ITEM_STATUS_OPTIONS.map(o => (
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
                  <TableHead>指摘内容</TableHead>
                  <TableHead>現場</TableHead>
                  <TableHead>場所</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>担当業者</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>是正期限</TableHead>
                  <TableHead className="w-[180px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      指摘事項がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((item, idx) => {
                    const status = item[f.status] as ItemStatus
                    const next = NEXT_STATUS[status]
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[220px] truncate">
                          {String(item[f.name] ?? "")}
                        </TableCell>
                        <TableCell className="max-w-[130px] truncate">
                          {siteNameMap.get(String(item[f.site_ref] ?? "")) || "—"}
                        </TableCell>
                        <TableCell>{String(item[f.location] ?? "")}</TableCell>
                        <TableCell>{String(item[f.category] ?? "")}</TableCell>
                        <TableCell>{String(item[f.contractor] ?? "")}</TableCell>
                        <TableCell>
                          {item[f.status] != null && <StatusBadge status={status} />}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            {String(item[f.due_date] ?? "")}
                            {isOverdue(item) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                <AlertTriangle className="h-3 w-3" />超過
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {next && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => handleAdvance(item)}
                                title={`次の状態（${ITEM_STATUS_LABEL[next.value]}）へ`}
                              >
                                {next.label}<ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
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
                    )
                  })
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
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(page => (
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
        title={editingId ? "指摘事項編集" : "新規指摘"}
        onSave={handleSave}
        isSaving={createItem.isPending || updateItem.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 指摘内容（必須、全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">指摘内容 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="例: クロスに浮きあり"
            />
          </div>

          <FormColumns columns={2}>
            {/* 現場 */}
            <div className="space-y-1.5">
              <Label>現場</Label>
              <Select value={formData.site_ref} onValueChange={v => setFormData(p => ({ ...p, site_ref: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="現場を選択" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site, idx) => (
                    <SelectItem key={idx} value={String(site[st.id] ?? "")}>
                      {String(site[st.name] ?? "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 場所 */}
            <div className="space-y-1.5">
              <Label htmlFor="location">場所</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={update("location")}
                placeholder="例: 3F 305号室"
              />
            </div>
            {/* 分類 */}
            <div className="space-y-1.5">
              <Label htmlFor="category">分類</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: 建築, 電気, 機械設備, 外構"
              />
            </div>
            {/* 担当業者 */}
            <div className="space-y-1.5">
              <Label htmlFor="contractor">担当業者</Label>
              <Input
                id="contractor"
                value={formData.contractor}
                onChange={update("contractor")}
                placeholder="是正を担当する業者名"
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
                  {ITEM_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 指摘日 */}
            <div className="space-y-1.5">
              <Label htmlFor="found_date">指摘日</Label>
              <Input
                id="found_date"
                type="date"
                value={formData.found_date}
                onChange={update("found_date")}
              />
            </div>
            {/* 是正期限 */}
            <div className="space-y-1.5">
              <Label htmlFor="due_date">是正期限</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={update("due_date")}
              />
            </div>
          </FormColumns>

          {/* 詳細（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="detail">詳細</Label>
            <Textarea
              id="detail"
              value={formData.detail}
              onChange={update("detail")}
              placeholder="指摘の詳細・是正方法の指示"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="指摘事項を削除しますか？"
        description="この操作は取り消せません。指摘事項を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
