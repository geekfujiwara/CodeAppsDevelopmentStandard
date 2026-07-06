import { useMemo, useState } from "react"
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
  useVehicles,
  useRoutes,
  useStops,
  useCreateRoute,
  useUpdateRoute,
  useDeleteRoute,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ROUTE_STATUS_LABEL,
  ROUTE_STATUS_COLOR,
  ROUTE_STATUS_OPTIONS,
  STOP_HANDLED_STATUSES,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:          `${P}_delivery_routeid`,
  name:        `${P}_name`,
  vehicle_ref: `${P}_vehicle_ref`,
  driver:      `${P}_driver`,
  status:      `${P}_status`,
  route_date:  `${P}_route_date`,
  notes:       `${P}_notes`,
}

const v = {
  id:   `${P}_vehicleid`,
  name: `${P}_name`,
}

const s = {
  route_ref: `${P}_route_ref`,
  status:    `${P}_status`,
}

function StatusBadge({ status }: { status: number }) {
  const label = ROUTE_STATUS_LABEL[status as keyof typeof ROUTE_STATUS_LABEL] ?? String(status)
  const color = ROUTE_STATUS_COLOR[status as keyof typeof ROUTE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  vehicle_ref: string
  driver: string
  status: string
  route_date: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", vehicle_ref: "", driver: "",
  status: String(100000000), route_date: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function RoutesPage() {
  const navigate = useNavigate()
  const { data: routes = [], isLoading } = useRoutes()
  const { data: vehicles = [] } = useVehicles()
  const { data: stops = [] } = useStops()
  const createRoute = useCreateRoute()
  const updateRoute = useUpdateRoute()
  const deleteRoute = useDeleteRoute()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const vehicleNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const vehicle of vehicles) {
      map.set(String(vehicle[v.id] ?? ""), String(vehicle[v.name] ?? ""))
    }
    return map
  }, [vehicles])

  /** 便ごとの配送先進捗（対応済み / 全件） */
  const progressMap = useMemo(() => {
    const map = new Map<string, { handled: number; total: number }>()
    for (const stop of stops) {
      const routeId = String(stop[s.route_ref] ?? "")
      const entry = map.get(routeId) ?? { handled: 0, total: 0 }
      entry.total++
      if (STOP_HANDLED_STATUSES.includes(stop[s.status] as number)) entry.handled++
      map.set(routeId, entry)
    }
    return map
  }, [stops])

  // フィルター
  const filtered = routes
    .filter(r => {
      const q = search.toLowerCase()
      const vehicleName = vehicleNameMap.get(String(r[f.vehicle_ref] ?? "")) ?? ""
      const matchSearch = !q ||
        String(r[f.name] ?? "").toLowerCase().includes(q) ||
        String(r[f.driver] ?? "").toLowerCase().includes(q) ||
        vehicleName.toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(r[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(b[f.route_date] ?? "").localeCompare(String(a[f.route_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, route_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (route: Record<string, unknown>) => {
    setEditingId(String(route[f.id] ?? ""))
    setFormData({
      name:        String(route[f.name] ?? ""),
      vehicle_ref: String(route[f.vehicle_ref] ?? ""),
      driver:      String(route[f.driver] ?? ""),
      status:      route[f.status] != null ? String(route[f.status]) : String(100000000),
      route_date:  String(route[f.route_date] ?? ""),
      notes:       String(route[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("便名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:        formData.name,
      [f.vehicle_ref]: formData.vehicle_ref,
      [f.driver]:      formData.driver,
      [f.notes]:       formData.notes,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.route_date) data[f.route_date] = formData.route_date

    try {
      if (editingId) {
        await updateRoute.mutateAsync({ id: editingId, data })
        toast.success("配送便を更新しました")
      } else {
        await createRoute.mutateAsync(data)
        toast.success("配送便を作成しました。配送先は詳細画面から追加してください")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteRoute.mutateAsync(deleteId)
      toast.success("配送便を削除しました")
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
          <h1 className="text-2xl font-bold">配送便</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">配送便</h1>
          <p className="text-muted-foreground text-sm mt-1">配送便の計画・運行・配達トラッキング</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>配送便一覧</CardTitle>
          <CardDescription>{filtered.length} 件（運行日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="便名・ドライバー・車両で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={vv => { setFilterStatus(vv); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {ROUTE_STATUS_OPTIONS.map(o => (
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
                  <TableHead>便名</TableHead>
                  <TableHead>車両</TableHead>
                  <TableHead>ドライバー</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>配達進捗</TableHead>
                  <TableHead>運行日</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      配送便がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((route, idx) => {
                    const routeId = String(route[f.id] ?? "")
                    const progress = progressMap.get(routeId) ?? { handled: 0, total: 0 }
                    return (
                      <TableRow
                        key={idx}
                        className="cursor-pointer"
                        onClick={() => navigate(`/routes/${routeId}`)}
                      >
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {String(route[f.name] ?? "")}
                        </TableCell>
                        <TableCell>{vehicleNameMap.get(String(route[f.vehicle_ref] ?? "")) || "—"}</TableCell>
                        <TableCell>{String(route[f.driver] ?? "")}</TableCell>
                        <TableCell>
                          {route[f.status] != null && (
                            <StatusBadge status={route[f.status] as number} />
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {progress.total > 0 ? `${progress.handled} / ${progress.total} 件` : "—"}
                        </TableCell>
                        <TableCell>{String(route[f.route_date] ?? "")}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(route)}
                              title="編集"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteId(routeId)}
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
        title={editingId ? "配送便編集" : "配送便新規作成"}
        onSave={handleSave}
        isSaving={createRoute.isPending || updateRoute.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 便名（必須、全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">便名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="例: 4/15 午前便（東ルート）"
            />
          </div>

          <FormColumns columns={2}>
            {/* 車両 */}
            <div className="space-y-1.5">
              <Label>車両</Label>
              <Select value={formData.vehicle_ref} onValueChange={vv => setFormData(p => ({ ...p, vehicle_ref: vv }))}>
                <SelectTrigger>
                  <SelectValue placeholder="車両を選択" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle, idx) => (
                    <SelectItem key={idx} value={String(vehicle[v.id] ?? "")}>
                      {String(vehicle[v.name] ?? "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* ドライバー */}
            <div className="space-y-1.5">
              <Label htmlFor="driver">ドライバー</Label>
              <Input
                id="driver"
                value={formData.driver}
                onChange={update("driver")}
                placeholder="ドライバー名"
              />
            </div>
            {/* ステータス */}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={vv => setFormData(p => ({ ...p, status: vv }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {ROUTE_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 運行日 */}
            <div className="space-y-1.5">
              <Label htmlFor="route_date">運行日</Label>
              <Input
                id="route_date"
                type="date"
                value={formData.route_date}
                onChange={update("route_date")}
              />
            </div>
          </FormColumns>

          {/* 備考（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="運行上の注意事項"
              rows={2}
            />
          </div>

          {!editingId && (
            <p className="text-xs text-muted-foreground">
              配送先（経由地）は保存後、詳細画面から順番付きで追加できます。
            </p>
          )}
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="配送便を削除しますか？"
        description="この操作は取り消せません。配送便を完全に削除します（配送先は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
