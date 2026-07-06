import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StagePath } from "@/components/stage-path"
import { VerticalTimeline, type TimelineItem } from "@/components/vertical-timeline"
import {
  useVehicles,
  useRoutes,
  useUpdateRoute,
  useStops,
  useCreateStop,
  useUpdateStop,
  useDeleteStop,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ROUTE_STAGE_PATH_ITEMS,
  ROUTE_STATUS_LABEL,
  STOP_STATUS_LABEL,
  STOP_STATUS_COLOR,
  STOP_PENDING,
  STOP_DELIVERED,
  STOP_ABSENT,
  STOP_RETURNED,
  STOP_HANDLED_STATUSES,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Pencil, Trash2, Truck, User, CalendarDays, PackageCheck,
  CheckCircle2, DoorClosed, Undo2, RotateCcw,
} from "lucide-react"
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

const s = {
  id:           `${P}_stopid`,
  name:         `${P}_name`,
  route_ref:    `${P}_route_ref`,
  seq:          `${P}_seq`,
  area:         `${P}_area`,
  planned_time: `${P}_planned_time`,
  status:       `${P}_status`,
  remark:       `${P}_remark`,
}

const v = {
  id:   `${P}_vehicleid`,
  name: `${P}_name`,
}

type StopForm = { name: string; seq: string; area: string; planned_time: string; remark: string }
const EMPTY_STOP: StopForm = { name: "", seq: "", area: "", planned_time: "", remark: "" }

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: routes = [], isLoading } = useRoutes()
  const { data: allStops = [] } = useStops()
  const { data: vehicles = [] } = useVehicles()
  const updateRoute = useUpdateRoute()
  const createStop = useCreateStop()
  const updateStop = useUpdateStop()
  const deleteStop = useDeleteStop()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<StopForm>(EMPTY_STOP)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const route = useMemo(
    () => routes.find(r => String(r[f.id] ?? "") === id),
    [routes, id]
  )

  const stops = useMemo(
    () => allStops
      .filter(stop => String(stop[s.route_ref] ?? "") === id)
      .sort((a, b) => ((a[s.seq] as number) ?? 0) - ((b[s.seq] as number) ?? 0)),
    [allStops, id]
  )

  const handledCount = useMemo(
    () => stops.filter(stop => STOP_HANDLED_STATUSES.includes(stop[s.status] as number)).length,
    [stops]
  )

  const vehicleName = useMemo(() => {
    if (!route) return ""
    const vehicle = vehicles.find(x => String(x[v.id] ?? "") === String(route[f.vehicle_ref] ?? ""))
    return vehicle ? String(vehicle[v.name] ?? "") : ""
  }, [vehicles, route])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">配送便詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!route || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/routes")}>
          <ArrowLeft className="h-4 w-4" />配送便一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>配送便が見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = route[f.status] as number | undefined
  const progress = stops.length > 0 ? Math.round((handledCount / stops.length) * 100) : 0

  const handleStageSelect = async (value: number) => {
    try {
      await updateRoute.mutateAsync({ id, data: { [f.status]: value } })
      toast.success(`ステータスを「${(ROUTE_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  /** 配達結果のワンクリック記録（同じ結果をもう一度押すと未配達に戻す） */
  const handleStopResult = async (stop: Record<string, unknown>, value: number) => {
    const stopId = String(stop[s.id] ?? "")
    const current = (stop[s.status] as number) ?? STOP_PENDING
    const next = current === value ? STOP_PENDING : value
    try {
      await updateStop.mutateAsync({ id: stopId, data: { [s.status]: next } })
      toast.success(`「${(STOP_STATUS_LABEL as Record<number, string>)[next] ?? ""}」にしました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleNew = () => {
    setEditingId(null)
    setForm({ ...EMPTY_STOP, seq: String(stops.length + 1) })
    setIsFormOpen(true)
  }

  const handleEdit = (stop: Record<string, unknown>) => {
    setEditingId(String(stop[s.id] ?? ""))
    setForm({
      name:         String(stop[s.name] ?? ""),
      seq:          stop[s.seq] != null ? String(stop[s.seq]) : "",
      area:         String(stop[s.area] ?? ""),
      planned_time: String(stop[s.planned_time] ?? ""),
      remark:       String(stop[s.remark] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("配送先名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [s.name]:         form.name,
      [s.route_ref]:    id,
      [s.area]:         form.area,
      [s.planned_time]: form.planned_time,
      [s.remark]:       form.remark,
    }
    if (form.seq) data[s.seq] = parseInt(form.seq, 10)
    try {
      if (editingId) {
        await updateStop.mutateAsync({ id: editingId, data })
        toast.success("配送先を更新しました")
      } else {
        data[s.status] = STOP_PENDING
        await createStop.mutateAsync(data)
        toast.success("配送先を追加しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteStop.mutateAsync(deleteId)
      toast.success("配送先を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  /** 配送先 → タイムライン項目へ変換（最初の未配達を current にする） */
  const firstPendingId = stops.find(stop => (stop[s.status] as number ?? STOP_PENDING) === STOP_PENDING)
  const firstPendingKey = firstPendingId ? String(firstPendingId[s.id] ?? "") : null

  const timelineItems: TimelineItem[] = stops.map(stop => {
    const stopId = String(stop[s.id] ?? "")
    const stopStatus = (stop[s.status] as number) ?? STOP_PENDING
    const state = stopStatus === STOP_DELIVERED ? "done"
      : stopStatus === STOP_ABSENT || stopStatus === STOP_RETURNED ? "problem"
      : stopId === firstPendingKey ? "current"
      : "pending"
    return {
      id: stopId,
      title: String(stop[s.name] ?? ""),
      subtitle: [String(stop[s.area] ?? ""), String(stop[s.remark] ?? "")].filter(Boolean).join(" / "),
      state,
      meta: (
        <>
          {!!stop[s.planned_time] && (
            <span className="text-xs text-muted-foreground">予定 {String(stop[s.planned_time])}</span>
          )}
          {stopStatus !== STOP_PENDING && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STOP_STATUS_COLOR[stopStatus as keyof typeof STOP_STATUS_COLOR] ?? ""}`}>
              {STOP_STATUS_LABEL[stopStatus as keyof typeof STOP_STATUS_LABEL] ?? ""}
            </span>
          )}
        </>
      ),
      actions: (
        <>
          {stopStatus === STOP_PENDING ? (
            <>
              <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleStopResult(stop, STOP_DELIVERED)}>
                <CheckCircle2 className="h-3.5 w-3.5" />配達完了
              </Button>
              <Button size="sm" variant="outline" className="gap-1"
                onClick={() => handleStopResult(stop, STOP_ABSENT)}>
                <DoorClosed className="h-3.5 w-3.5" />不在
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-rose-600 hover:text-rose-600"
                onClick={() => handleStopResult(stop, STOP_RETURNED)}>
                <Undo2 className="h-3.5 w-3.5" />持ち戻り
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground"
              onClick={() => handleStopResult(stop, stopStatus)} title="未配達に戻す">
              <RotateCcw className="h-3.5 w-3.5" />戻す
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(stop)} title="編集">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(stopId)} title="削除"
            className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      ),
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/routes")}>
            <ArrowLeft className="h-4 w-4" />配送便一覧へ戻る
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{String(route[f.name] ?? "")}</h1>
        </div>
        <Button size="sm" className="gap-1" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" />配送先を追加
        </Button>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">車両</div>
                <div className="truncate text-sm font-medium">{vehicleName || "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">ドライバー</div>
                <div className="truncate text-sm font-medium">{String(route[f.driver] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">運行日</div>
                <div className="truncate text-sm font-medium">{String(route[f.route_date] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <PackageCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">配達進捗</div>
                <div className="text-sm font-medium">{handledCount} / {stops.length} 件</div>
                <Progress value={progress} className="mt-1 h-2" />
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={ROUTE_STAGE_PATH_ITEMS}
              current={status}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 配送タイムライン */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">配送タイムライン</CardTitle>
          <CardDescription>
            順序どおりに上から表示。配達完了 / 不在 / 持ち戻り をワンクリックで記録できます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerticalTimeline
            items={timelineItems}
            emptyText="配送先がありません。「配送先を追加」から順番付きで登録してください"
          />
        </CardContent>
      </Card>

      {/* 備考 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">備考</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(route[f.notes] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 配送先フォーム */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "配送先編集" : "配送先追加"}
        onSave={handleSave}
        isSaving={createStop.isPending || updateStop.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stop_name">配送先名 <span className="text-destructive">*</span></Label>
            <Input
              id="stop_name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="例: サンプル商店 本店"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="stop_seq">順序</Label>
              <Input
                id="stop_seq"
                type="number"
                min={1}
                value={form.seq}
                onChange={e => setForm(p => ({ ...p, seq: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stop_time">予定時刻</Label>
              <Input
                id="stop_time"
                type="time"
                value={form.planned_time}
                onChange={e => setForm(p => ({ ...p, planned_time: e.target.value }))}
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label htmlFor="stop_area">エリア・住所メモ</Label>
            <Input
              id="stop_area"
              value={form.area}
              onChange={e => setForm(p => ({ ...p, area: e.target.value }))}
              placeholder="例: 中央区 ○○ 1-2-3"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stop_remark">備考</Label>
            <Input
              id="stop_remark"
              value={form.remark}
              onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
              placeholder="例: 裏口へ回る, 時間指定あり"
            />
          </div>
        </div>
      </FormModal>

      {/* 配送先削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="配送先を削除しますか？"
        description="この操作は取り消せません。配送先を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
