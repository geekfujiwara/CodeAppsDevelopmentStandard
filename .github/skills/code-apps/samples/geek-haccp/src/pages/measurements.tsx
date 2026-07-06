import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { ThresholdGauge } from "@/components/threshold-gauge"
import {
  useCheckpoints,
  useMeasurements,
  useCreateMeasurement,
  useUpdateMeasurement,
  useDeleteMeasurement,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  TIME_SLOT_LABEL,
  TIME_SLOT_OPTIONS,
} from "@/types/dataverse"
import { judgeThreshold, formatRange } from "@/lib/threshold"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:             `${P}_measurementid`,
  name:           `${P}_name`,
  checkpoint_ref: `${P}_checkpoint_ref`,
  value:          `${P}_value`,
  measured_date:  `${P}_measured_date`,
  time_slot:      `${P}_time_slot`,
  inspector:      `${P}_inspector`,
  action:         `${P}_action`,
}

const c = {
  id:   `${P}_checkpointid`,
  name: `${P}_name`,
  unit: `${P}_unit`,
  min:  `${P}_min_value`,
  max:  `${P}_max_value`,
}

type FormData = {
  checkpoint_ref: string
  value: string
  measured_date: string
  time_slot: string
  inspector: string
  action: string
}

const EMPTY_FORM: FormData = {
  checkpoint_ref: "", value: "", measured_date: "", time_slot: String(100000000), inspector: "", action: "",
}

const ITEMS_PER_PAGE = 12

export default function MeasurementsPage() {
  const { data: measurements = [], isLoading } = useMeasurements()
  const { data: checkpoints = [] } = useCheckpoints()
  const createMeasurement = useCreateMeasurement()
  const updateMeasurement = useUpdateMeasurement()
  const deleteMeasurement = useDeleteMeasurement()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterResult, setFilterResult] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const checkpointMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const cp of checkpoints) map.set(String(cp[c.id] ?? ""), cp)
    return map
  }, [checkpoints])

  const getCp = (m: Record<string, unknown>) => checkpointMap.get(String(m[f.checkpoint_ref] ?? ""))
  const getJudge = (m: Record<string, unknown>) => {
    const cp = getCp(m)
    return judgeThreshold(
      m[f.value] as number | null,
      (cp?.[c.min] as number | null) ?? null,
      (cp?.[c.max] as number | null) ?? null,
    )
  }

  // フィルター
  const filtered = measurements
    .filter(m => {
      const q = search.toLowerCase()
      const cpName = String(getCp(m)?.[c.name] ?? "")
      const matchSearch = !q ||
        cpName.toLowerCase().includes(q) ||
        String(m[f.inspector] ?? "").toLowerCase().includes(q)
      const j = getJudge(m).judgement
      const matchResult = filterResult === "all"
        || (filterResult === "deviated" && (j === "low" || j === "high"))
        || (filterResult === "ok" && j === "ok")
      return matchSearch && matchResult
    })
    .sort((a, b) => String(b[f.measured_date] ?? "").localeCompare(String(a[f.measured_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, measured_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (m: Record<string, unknown>) => {
    setEditingId(String(m[f.id] ?? ""))
    setFormData({
      checkpoint_ref: String(m[f.checkpoint_ref] ?? ""),
      value:          m[f.value] != null ? String(m[f.value]) : "",
      measured_date:  String(m[f.measured_date] ?? ""),
      time_slot:      m[f.time_slot] != null ? String(m[f.time_slot]) : String(100000000),
      inspector:      String(m[f.inspector] ?? ""),
      action:         String(m[f.action] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.checkpoint_ref) {
      toast.error("点検項目は必須です")
      return
    }
    if (formData.value.trim() === "") {
      toast.error("測定値は必須です")
      return
    }
    const cp = checkpointMap.get(formData.checkpoint_ref)
    const value = parseFloat(formData.value)
    const j = judgeThreshold(value, (cp?.[c.min] as number | null) ?? null, (cp?.[c.max] as number | null) ?? null)
    const data: Record<string, unknown> = {
      // 主名列は「項目名 日付 時間帯」で自動生成
      [f.name]:           `${String(cp?.[c.name] ?? "測定")} ${formData.measured_date}`,
      [f.checkpoint_ref]: formData.checkpoint_ref,
      [f.value]:          value,
      [f.time_slot]:      Number(formData.time_slot),
      [f.inspector]:      formData.inspector,
      [f.action]:         formData.action,
    }
    if (formData.measured_date) data[f.measured_date] = formData.measured_date

    try {
      if (editingId) {
        await updateMeasurement.mutateAsync({ id: editingId, data })
        toast.success("測定記録を更新しました")
      } else {
        await createMeasurement.mutateAsync(data)
        toast.success(j.deviated ? `記録しました（${j.label}）— 是正措置を記入してください` : "測定記録を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteMeasurement.mutateAsync(deleteId)
      toast.success("測定記録を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  // 選択中点検項目の基準（フォーム内ゲージ用）
  const selectedCp = checkpointMap.get(formData.checkpoint_ref)
  const previewValue = formData.value.trim() === "" ? null : parseFloat(formData.value)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">測定記録</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">測定記録</h1>
          <p className="text-muted-foreground text-sm mt-1">温度・衛生点検の測定と基準判定</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          測定を記録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>測定記録一覧</CardTitle>
          <CardDescription>{filtered.length} 件（測定日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="点検項目・測定者で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterResult} onValueChange={v => { setFilterResult(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="判定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての判定</SelectItem>
                <SelectItem value="ok">適合のみ</SelectItem>
                <SelectItem value="deviated">逸脱のみ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* テーブル */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>点検項目</TableHead>
                  <TableHead>基準</TableHead>
                  <TableHead className="text-right">測定値</TableHead>
                  <TableHead>判定</TableHead>
                  <TableHead>時間帯</TableHead>
                  <TableHead>測定者</TableHead>
                  <TableHead>測定日</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      測定記録がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((m, idx) => {
                    const cp = getCp(m)
                    const unit = String(cp?.[c.unit] ?? "")
                    const j = getJudge(m)
                    return (
                      <TableRow key={idx} className={j.deviated ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {String(cp?.[c.name] ?? "（削除された項目）")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRange((cp?.[c.min] as number | null) ?? null, (cp?.[c.max] as number | null) ?? null, unit)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {m[f.value] != null ? `${m[f.value]}${unit}` : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${j.colorClass}`}>
                            {j.deviated && <AlertTriangle className="h-3 w-3" />}
                            {j.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {m[f.time_slot] != null
                            ? TIME_SLOT_LABEL[m[f.time_slot] as keyof typeof TIME_SLOT_LABEL] ?? ""
                            : ""}
                        </TableCell>
                        <TableCell>{String(m[f.inspector] ?? "")}</TableCell>
                        <TableCell>{String(m[f.measured_date] ?? "")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(m)} title="編集">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(String(m[f.id] ?? ""))}
                              title="削除" className="text-destructive hover:text-destructive">
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
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />前へ
                </Button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(page => (
                  <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm"
                    onClick={() => setCurrentPage(page)} className="w-8 h-8 p-0">
                    {page}
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
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
        title={editingId ? "測定記録編集" : "測定を記録"}
        onSave={handleSave}
        isSaving={createMeasurement.isPending || updateMeasurement.isPending}
        maxWidth="lg"
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label>点検項目 <span className="text-destructive">*</span></Label>
            <Select value={formData.checkpoint_ref} onValueChange={v => setFormData(p => ({ ...p, checkpoint_ref: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="点検項目を選択" />
              </SelectTrigger>
              <SelectContent>
                {checkpoints.map((cp, idx) => (
                  <SelectItem key={idx} value={String(cp[c.id] ?? "")}>
                    {String(cp[c.name] ?? "")}（{formatRange((cp[c.min] as number | null) ?? null, (cp[c.max] as number | null) ?? null, String(cp[c.unit] ?? ""))}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {checkpoints.length === 0 && (
              <p className="text-xs text-muted-foreground">
                点検項目がありません。先に「点検項目」ページ（機能フラグ）で登録するか、setup スクリプトで標準項目を投入してください。
              </p>
            )}
          </div>

          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="value">測定値 <span className="text-destructive">*</span></Label>
              <Input
                id="value"
                type="number"
                step="0.1"
                value={formData.value}
                onChange={e => setFormData(p => ({ ...p, value: e.target.value }))}
                placeholder={`例: 3.5 ${String(selectedCp?.[c.unit] ?? "")}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>時間帯</Label>
              <Select value={formData.time_slot} onValueChange={v => setFormData(p => ({ ...p, time_slot: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="時間帯を選択" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="measured_date">測定日</Label>
              <Input
                id="measured_date"
                type="date"
                value={formData.measured_date}
                onChange={e => setFormData(p => ({ ...p, measured_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspector">測定者</Label>
              <Input
                id="inspector"
                value={formData.inspector}
                onChange={e => setFormData(p => ({ ...p, inspector: e.target.value }))}
                placeholder="測定者名"
              />
            </div>
          </FormColumns>

          {/* リアルタイム判定ゲージ */}
          {selectedCp && (
            <div className="rounded-md border bg-muted/20 p-3">
              <ThresholdGauge
                value={previewValue}
                min={(selectedCp[c.min] as number | null) ?? null}
                max={(selectedCp[c.max] as number | null) ?? null}
                unit={String(selectedCp[c.unit] ?? "")}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="action">是正措置（逸脱時）</Label>
            <Input
              id="action"
              value={formData.action}
              onChange={e => setFormData(p => ({ ...p, action: e.target.value }))}
              placeholder="例: 設定温度を再調整し 30 分後に再測定"
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="測定記録を削除しますか？"
        description="この操作は取り消せません。測定記録を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
