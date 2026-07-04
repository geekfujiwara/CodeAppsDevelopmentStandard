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
  useEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EVENT_STATUS_LABEL,
  EVENT_STATUS_COLOR,
  EVENT_STATUS_OPTIONS,
  EVENT_STATUS_OPEN,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:          `${P}_eventid`,
  name:        `${P}_name`,
  category:    `${P}_category`,
  venue:       `${P}_venue`,
  organizer:   `${P}_organizer`,
  status:      `${P}_status`,
  start_date:  `${P}_start_date`,
  capacity:    `${P}_capacity`,
  description: `${P}_description`,
}

function StatusBadge({ status }: { status: number }) {
  const label = EVENT_STATUS_LABEL[status as keyof typeof EVENT_STATUS_LABEL] ?? String(status)
  const color = EVENT_STATUS_COLOR[status as keyof typeof EVENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  category: string
  venue: string
  organizer: string
  status: string
  start_date: string
  capacity: string
  description: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", venue: "", organizer: "",
  status: String(EVENT_STATUS_OPEN), start_date: "", capacity: "", description: "",
}

const ITEMS_PER_PAGE = 10

export default function EventsPage() {
  const navigate = useNavigate()
  const { data: events = [], isLoading } = useEvents()
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const deleteEvent = useDeleteEvent()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = events
    .filter(ev => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(ev[f.name] ?? "").toLowerCase().includes(q) ||
        String(ev[f.category] ?? "").toLowerCase().includes(q) ||
        String(ev[f.venue] ?? "").toLowerCase().includes(q) ||
        String(ev[f.organizer] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(ev[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(b[f.start_date] ?? "").localeCompare(String(a[f.start_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (event: Record<string, unknown>) => {
    setEditingId(String(event[f.id] ?? ""))
    setFormData({
      name:        String(event[f.name] ?? ""),
      category:    String(event[f.category] ?? ""),
      venue:       String(event[f.venue] ?? ""),
      organizer:   String(event[f.organizer] ?? ""),
      status:      event[f.status] != null ? String(event[f.status]) : String(EVENT_STATUS_OPEN),
      start_date:  String(event[f.start_date] ?? ""),
      capacity:    event[f.capacity] != null ? String(event[f.capacity]) : "",
      description: String(event[f.description] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("イベント名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:        formData.name,
      [f.category]:    formData.category,
      [f.venue]:       formData.venue,
      [f.organizer]:   formData.organizer,
      [f.description]: formData.description,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.start_date) data[f.start_date] = formData.start_date
    if (formData.capacity) data[f.capacity] = parseInt(formData.capacity, 10)

    try {
      if (editingId) {
        await updateEvent.mutateAsync({ id: editingId, data })
        toast.success("イベントを更新しました")
      } else {
        await createEvent.mutateAsync(data)
        toast.success("イベントを作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteEvent.mutateAsync(deleteId)
      toast.success("イベントを削除しました")
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
          <h1 className="text-2xl font-bold">イベント</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">イベント</h1>
          <p className="text-muted-foreground text-sm mt-1">社内イベント・セミナーの管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>イベント一覧</CardTitle>
          <CardDescription>{filtered.length} 件（開催日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="イベント名・分野・会場・主催者で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {EVENT_STATUS_OPTIONS.map(o => (
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
                  <TableHead>イベント名</TableHead>
                  <TableHead>分野</TableHead>
                  <TableHead>会場</TableHead>
                  <TableHead>主催者</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>開催日</TableHead>
                  <TableHead className="text-right">定員</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      イベントがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((event, idx) => (
                    <TableRow
                      key={idx}
                      className="cursor-pointer"
                      onClick={() => navigate(`/events/${String(event[f.id] ?? "")}`)}
                    >
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {String(event[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(event[f.category] ?? "")}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{String(event[f.venue] ?? "")}</TableCell>
                      <TableCell>{String(event[f.organizer] ?? "")}</TableCell>
                      <TableCell>
                        {event[f.status] != null && (
                          <StatusBadge status={event[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(event[f.start_date] ?? "")}</TableCell>
                      <TableCell className="text-right">{String(event[f.capacity] ?? "")}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => navigate(`/events/${String(event[f.id] ?? "")}`)}
                            title="詳細"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(event)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(event[f.id] ?? ""))}
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
        title={editingId ? "イベント編集" : "イベント新規作成"}
        onSave={handleSave}
        isSaving={createEvent.isPending || updateEvent.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* イベント名（必須、全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">イベント名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="イベント名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 分野 */}
            <div className="space-y-1.5">
              <Label htmlFor="category">分野</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: 勉強会, 全社イベント, セミナー"
              />
            </div>
            {/* 会場 */}
            <div className="space-y-1.5">
              <Label htmlFor="venue">会場</Label>
              <Input
                id="venue"
                value={formData.venue}
                onChange={update("venue")}
                placeholder="例: 本社 大会議室 / オンライン"
              />
            </div>
            {/* 主催者 */}
            <div className="space-y-1.5">
              <Label htmlFor="organizer">主催者</Label>
              <Input
                id="organizer"
                value={formData.organizer}
                onChange={update("organizer")}
                placeholder="主催者・担当部門"
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
                  {EVENT_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 開催日 */}
            <div className="space-y-1.5">
              <Label htmlFor="start_date">開催日</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={update("start_date")}
              />
            </div>
            {/* 定員 */}
            <div className="space-y-1.5">
              <Label htmlFor="capacity">定員</Label>
              <Input
                id="capacity"
                type="number"
                min={0}
                value={formData.capacity}
                onChange={update("capacity")}
                placeholder="例: 30"
              />
            </div>
          </FormColumns>

          {/* 概要（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="description">概要</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={update("description")}
              placeholder="イベントの目的・対象者・内容"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="イベントを削除しますか？"
        description="この操作は取り消せません。イベントを完全に削除します（参加登録は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
