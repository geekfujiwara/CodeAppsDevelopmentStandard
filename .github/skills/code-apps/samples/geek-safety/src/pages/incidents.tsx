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
  useIncidents,
  useCreateIncident,
  useUpdateIncident,
  useDeleteIncident,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  SEVERITY_LABEL,
  SEVERITY_COLOR,
  SEVERITY_OPTIONS,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_COLOR,
  INCIDENT_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:            `${P}_incidentid`,
  name:          `${P}_name`,
  site:          `${P}_site`,
  category:      `${P}_category`,
  severity:      `${P}_severity`,
  status:        `${P}_status`,
  reporter:      `${P}_reporter`,
  occurred_date: `${P}_occurred_date`,
  description:   `${P}_description`,
  cause:         `${P}_cause`,
  notes:         `${P}_notes`,
}

function SeverityBadge({ severity }: { severity: number }) {
  const label = SEVERITY_LABEL[severity as keyof typeof SEVERITY_LABEL] ?? String(severity)
  const color = SEVERITY_COLOR[severity as keyof typeof SEVERITY_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: number }) {
  const label = INCIDENT_STATUS_LABEL[status as keyof typeof INCIDENT_STATUS_LABEL] ?? String(status)
  const color = INCIDENT_STATUS_COLOR[status as keyof typeof INCIDENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  site: string
  category: string
  severity: string
  status: string
  reporter: string
  occurred_date: string
  description: string
  cause: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", site: "", category: "", severity: String(100000000),
  status: String(100000000), reporter: "", occurred_date: "",
  description: "", cause: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function IncidentsPage() {
  const navigate = useNavigate()
  const { data: incidents = [], isLoading } = useIncidents()
  const createIncident = useCreateIncident()
  const updateIncident = useUpdateIncident()
  const deleteIncident = useDeleteIncident()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterSeverity, setFilterSeverity] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = incidents
    .filter(r => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(r[f.name] ?? "").toLowerCase().includes(q) ||
        String(r[f.site] ?? "").toLowerCase().includes(q) ||
        String(r[f.reporter] ?? "").toLowerCase().includes(q) ||
        String(r[f.category] ?? "").toLowerCase().includes(q)
      const matchSeverity = filterSeverity === "all" || String(r[f.severity]) === filterSeverity
      const matchStatus = filterStatus === "all" || String(r[f.status]) === filterStatus
      return matchSearch && matchSeverity && matchStatus
    })
    .sort((a, b) => String(b[f.occurred_date] ?? "").localeCompare(String(a[f.occurred_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, occurred_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (incident: Record<string, unknown>) => {
    setEditingId(String(incident[f.id] ?? ""))
    setFormData({
      name:          String(incident[f.name] ?? ""),
      site:          String(incident[f.site] ?? ""),
      category:      String(incident[f.category] ?? ""),
      severity:      incident[f.severity] != null ? String(incident[f.severity]) : String(100000000),
      status:        incident[f.status] != null ? String(incident[f.status]) : String(100000000),
      reporter:      String(incident[f.reporter] ?? ""),
      occurred_date: String(incident[f.occurred_date] ?? ""),
      description:   String(incident[f.description] ?? ""),
      cause:         String(incident[f.cause] ?? ""),
      notes:         String(incident[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:        formData.name,
      [f.site]:        formData.site,
      [f.category]:    formData.category,
      [f.reporter]:    formData.reporter,
      [f.description]: formData.description,
      [f.cause]:       formData.cause,
      [f.notes]:       formData.notes,
    }
    if (formData.severity) data[f.severity] = Number(formData.severity)
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.occurred_date) data[f.occurred_date] = formData.occurred_date

    try {
      if (editingId) {
        await updateIncident.mutateAsync({ id: editingId, data })
        toast.success("報告を更新しました")
      } else {
        await createIncident.mutateAsync(data)
        toast.success("報告を作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteIncident.mutateAsync(deleteId)
      toast.success("報告を削除しました")
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
          <h1 className="text-2xl font-bold">ヒヤリハット報告</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ヒヤリハット報告</h1>
          <p className="text-muted-foreground text-sm mt-1">ヒヤリハット・事故報告の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規報告
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>報告一覧</CardTitle>
          <CardDescription>{filtered.length} 件（発生日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・拠点・報告者・種別で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterSeverity} onValueChange={v => { setFilterSeverity(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="重大度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての重大度</SelectItem>
                {SEVERITY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {INCIDENT_STATUS_OPTIONS.map(o => (
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
                  <TableHead>件名</TableHead>
                  <TableHead>拠点・場所</TableHead>
                  <TableHead>種別</TableHead>
                  <TableHead>重大度</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>報告者</TableHead>
                  <TableHead>発生日</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      報告がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((incident, idx) => (
                    <TableRow
                      key={idx}
                      className="cursor-pointer"
                      onClick={() => navigate(`/incidents/${String(incident[f.id] ?? "")}`)}
                    >
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(incident[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(incident[f.site] ?? "")}</TableCell>
                      <TableCell>{String(incident[f.category] ?? "")}</TableCell>
                      <TableCell>
                        {incident[f.severity] != null && (
                          <SeverityBadge severity={incident[f.severity] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {incident[f.status] != null && (
                          <StatusBadge status={incident[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(incident[f.reporter] ?? "")}</TableCell>
                      <TableCell>{String(incident[f.occurred_date] ?? "")}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => navigate(`/incidents/${String(incident[f.id] ?? "")}`)}
                            title="詳細"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(incident)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(incident[f.id] ?? ""))}
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
        title={editingId ? "報告編集" : "新規報告"}
        onSave={handleSave}
        isSaving={createIncident.isPending || updateIncident.isPending}
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
              placeholder="何が起きたかを簡潔に入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 拠点・場所 */}
            <div className="space-y-1.5">
              <Label htmlFor="site">拠点・場所</Label>
              <Input
                id="site"
                value={formData.site}
                onChange={update("site")}
                placeholder="例: 本社工場 第2ライン"
              />
            </div>
            {/* 種別 */}
            <div className="space-y-1.5">
              <Label htmlFor="category">種別</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: 転倒, 挟まれ, 交通, 落下物"
              />
            </div>
            {/* 重大度 */}
            <div className="space-y-1.5">
              <Label>重大度</Label>
              <Select value={formData.severity} onValueChange={v => setFormData(p => ({ ...p, severity: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="重大度を選択" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* ステータス */}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 報告者 */}
            <div className="space-y-1.5">
              <Label htmlFor="reporter">報告者</Label>
              <Input
                id="reporter"
                value={formData.reporter}
                onChange={update("reporter")}
                placeholder="報告者名"
              />
            </div>
            {/* 発生日 */}
            <div className="space-y-1.5">
              <Label htmlFor="occurred_date">発生日</Label>
              <Input
                id="occurred_date"
                type="date"
                value={formData.occurred_date}
                onChange={update("occurred_date")}
              />
            </div>
          </FormColumns>

          {/* 状況詳細（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="description">状況詳細</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={update("description")}
              placeholder="いつ・どこで・誰が・何をしていて・何が起きたか"
              rows={3}
            />
          </div>

          {/* 原因（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="cause">原因</Label>
            <Textarea
              id="cause"
              value={formData.cause}
              onChange={update("cause")}
              placeholder="推定される原因・背景要因"
              rows={2}
            />
          </div>

          {/* 備考（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="備考・メモ"
              rows={2}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="報告を削除しますか？"
        description="この操作は取り消せません。報告を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
