import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DetailPanel, DetailField, DetailGrid } from "@/components/detail-panel"
import { useDailyReports, useCreateDailyReport, useUpdateDailyReport, useDeleteDailyReport, useWorkOrders, useUpdateWorkOrder } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { WEATHER_LABEL, WEATHER_OPTIONS, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_COLOR, APPROVAL_STATUS_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Send, ThumbsUp, ThumbsDown } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = {
  id: `${P}_dailyreportid`, name: `${P}_name`,
  reportdate: `${P}_reportdate`, department: `${P}_department`,
  weather: `${P}_weather`, approvalstatus: `${P}_approvalstatus`,
  approvalcomment: `${P}_approvalcomment`,
  visitcount: `${P}_visitcount`, completedcount: `${P}_completedcount`,
  revisitcount: `${P}_revisitcount`, partsexchangecount: `${P}_partsexchangecount`,
  totalworktime: `${P}_totalworktime`, avgsatisfaction: `${P}_avgsatisfaction`,
  createdby: `_createdby_value`, createdbyname: `_createdby_value@OData.Community.Display.V1.FormattedValue`,
}
const fwo = { id: `${P}_workorderid`, name: `${P}_name`, dailyreportId: `_${P}_dailyreportid_value`, customersigned: `${P}_customersigned`, status: `${P}_status`, faultsummary: `${P}_faultsummary`, worktime: `${P}_worktime` }

function Badge({ label, color }: { label: string; color: string }) { return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

type FormData = { name: string; reportdate: string; department: string; weather: string }
const EMPTY: FormData = { name: "", reportdate: "", department: "", weather: "" }
const PER_PAGE = 10

export default function DailyReportsPage() {
  const { data: rows = [], isLoading: l1 } = useDailyReports()
  const { data: allWorkOrders = [], isLoading: l2 } = useWorkOrders()
  const isLoading = l1 || l2
  const createM = useCreateDailyReport()
  const updateM = useUpdateDailyReport()
  const deleteM = useDeleteDailyReport()
  const updateWO = useUpdateWorkOrder()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [selectedWoIds, setSelectedWoIds] = useState<string[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterApproval, setFilterApproval] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)
  const [approvalComment, setApprovalComment] = useState("")
  const [showApproval, setShowApproval] = useState(false)
  const [editWoIds, setEditWoIds] = useState<string[]>([])  // WO ids to add during edit

  const createdByName = (item: Record<string, unknown>) => String(item[f.createdbyname] ?? item[f.createdby] ?? "")

  // 日報に紐づく作業オーダー一覧
  const linkedOrders = useMemo(() => {
    if (!selectedItem) return []
    const reportId = String(selectedItem[f.id] ?? "")
    return allWorkOrders.filter(wo => String(wo[fwo.dailyreportId] ?? "") === reportId)
  }, [selectedItem, allWorkOrders])

  // 署名状況チェック
  const signatureStatus = useMemo(() => {
    if (linkedOrders.length === 0) return { allSigned: false, count: 0, unsigned: 0 }
    const unsigned = linkedOrders.filter(wo => !wo[fwo.customersigned]).length
    return { allSigned: unsigned === 0, count: linkedOrders.length, unsigned }
  }, [linkedOrders])

  // 未リンクの作業オーダー（どの日報にも紐づいていない）
  const unlinkedOrders = useMemo(() => {
    return allWorkOrders.filter(wo => !wo[fwo.dailyreportId])
  }, [allWorkOrders])

  // 作業オーダー選択トグル
  const toggleWoSelection = useCallback((woId: string) => {
    setSelectedWoIds(prev => prev.includes(woId) ? prev.filter(id => id !== woId) : [...prev, woId])
  }, [])

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return (!q || String(r[f.name] ?? "").toLowerCase().includes(q) || createdByName(r).toLowerCase().includes(q))
      && (filterApproval === "all" || String(r[f.approvalstatus]) === filterApproval)
  })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false); setShowApproval(false) }
  const handleEdit = () => {
    if (!selectedItem) return
    setEditForm({
      name: String(selectedItem[f.name] ?? ""),
      reportdate: String(selectedItem[f.reportdate] ?? "").slice(0, 10),
      department: String(selectedItem[f.department] ?? ""),
      weather: selectedItem[f.weather] != null ? String(selectedItem[f.weather]) : "",
    })
    setEditWoIds([])
    setIsEditing(true)
  }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("日報番号は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.department]: editForm.department }
    if (editForm.reportdate) data[f.reportdate] = editForm.reportdate
    if (editForm.weather) data[f.weather] = Number(editForm.weather)
    try {
      await updateM.mutateAsync({ id, data })
      // 追加選択した作業オーダーをリンク
      if (editWoIds.length > 0) {
        await Promise.all(editWoIds.map(woId =>
          updateWO.mutateAsync({ id: woId, data: { [`${P}_dailyreportid@odata.bind`]: `/${P}_dailyreports(${id})` } })
        ))
      }
      toast.success("日報を更新しました")
      setSelectedItem({ ...selectedItem, ...data })
      setIsEditing(false)
    } catch { toast.error("保存に失敗しました") }
  }

  // 提出
  const handleSubmit = async () => {
    if (!selectedItem) return
    if (!signatureStatus.allSigned) { toast.error(`未署名の作業オーダーが${signatureStatus.unsigned}件あります。全件署名を取得してください。`); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.approvalstatus]: 100000001 }
    // サマリー自動計算
    data[f.visitcount] = linkedOrders.length
    data[f.completedcount] = linkedOrders.filter(wo => wo[fwo.status] === 100000003).length
    data[f.revisitcount] = linkedOrders.length - (data[f.completedcount] as number)
    const totalTime = linkedOrders.reduce((sum, wo) => sum + (Number(wo[fwo.worktime]) || 0), 0)
    data[f.totalworktime] = totalTime
    try { await updateM.mutateAsync({ id, data }); toast.success("日報を提出しました"); setSelectedItem({ ...selectedItem, ...data }) } catch { toast.error("提出に失敗しました") }
  }

  // 承認/差戻し
  const handleApprove = async (approve: boolean) => {
    if (!selectedItem) return
    const id = String(selectedItem[f.id] ?? "")
    const signComment = signatureStatus.allSigned
      ? `✅ 全${signatureStatus.count}件署名取得済`
      : `⚠️ 未署名: ${signatureStatus.unsigned}件あり`
    const fullComment = `【署名確認】${signComment}\n${approvalComment ? `【コメント】${approvalComment}` : ""}`.trim()
    const data: Record<string, unknown> = {
      [f.approvalstatus]: approve ? 100000002 : 100000003,
      [f.approvalcomment]: fullComment,
    }
    try { await updateM.mutateAsync({ id, data }); toast.success(approve ? "承認しました" : "差し戻しました"); setSelectedItem({ ...selectedItem, ...data }); setShowApproval(false); setApprovalComment("") } catch { toast.error("処理に失敗しました") }
  }

  // 自動採番: DR-YYYYMMDD-NNN
  const generateReportNumber = useCallback(() => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`
    const prefix = `DR-${dateStr}-`
    const todayReports = rows.filter(r => String(r[f.name] ?? "").startsWith(prefix))
    const nextNum = todayReports.length + 1
    return `${prefix}${String(nextNum).padStart(3, "0")}`
  }, [rows])

  const handleNew = () => { setFormData({ ...EMPTY, name: generateReportNumber(), reportdate: new Date().toISOString().slice(0, 10) }); setSelectedWoIds([]); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("日報番号は必須です"); return }
    if (selectedWoIds.length === 0) { toast.error("作業オーダーを1件以上選択してください"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.department]: formData.department, [f.approvalstatus]: 100000000 }
    if (formData.reportdate) data[f.reportdate] = formData.reportdate
    if (formData.weather) data[f.weather] = Number(formData.weather)
    try {
      const result = await createM.mutateAsync(data) as Record<string, unknown>
      const newReportId = String(result[f.id] ?? "")
      // 選択した作業オーダーを日報にリンク
      if (newReportId) {
        await Promise.all(selectedWoIds.map(woId =>
          updateWO.mutateAsync({ id: woId, data: { [`${P}_dailyreportid@odata.bind`]: `/${P}_dailyreports(${newReportId})` } })
        ))
      }
      toast.success("日報を作成しました")
      setIsFormOpen(false)
    } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("日報を削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">日報</h1><LoadingSkeletonList count={5} /></div>

  const currentStatus = selectedItem ? (selectedItem[f.approvalstatus] as number) : null

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-foreground">日報</h1><p className="text-muted-foreground text-sm mt-1">CE業務報告書の作成・提出・承認</p></div>
          <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button>
        </div>
        <Card><CardHeader><CardTitle>日報一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="日報番号で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterApproval} onValueChange={v => { setFilterApproval(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{APPROVAL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[25%]">日報番号</TableHead><TableHead className="w-[18%]">報告日</TableHead><TableHead className="w-[22%]">作成者</TableHead><TableHead className="w-[15%]">訪問件数</TableHead><TableHead className="w-[20%]">ステータス</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">日報がありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell>
                <TableCell className="text-muted-foreground">{String(item[f.reportdate] ?? "").slice(0, 10)}</TableCell>
                <TableCell>{createdByName(item)}</TableCell>
                <TableCell className="text-center">{item[f.visitcount] != null ? String(item[f.visitcount]) : "-"}</TableCell>
                <TableCell>{item[f.approvalstatus] != null && <Badge label={APPROVAL_STATUS_LABEL[item[f.approvalstatus] as keyof typeof APPROVAL_STATUS_LABEL] ?? ""} color={APPROVAL_STATUS_COLOR[item[f.approvalstatus] as keyof typeof APPROVAL_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"} />}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>

      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false); setShowApproval(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? (
          <div className="space-y-6">
            <DetailGrid>
              <DetailField label="日報番号">{String(selectedItem[f.name] ?? "")}</DetailField>
              <DetailField label="報告日">{String(selectedItem[f.reportdate] ?? "").slice(0, 10)}</DetailField>
              <DetailField label="作成者">{createdByName(selectedItem)}</DetailField>
              <DetailField label="所属">{String(selectedItem[f.department] ?? "")}</DetailField>
              <DetailField label="天候">{selectedItem[f.weather] != null ? WEATHER_LABEL[selectedItem[f.weather] as keyof typeof WEATHER_LABEL] : ""}</DetailField>
              <DetailField label="ステータス">{selectedItem[f.approvalstatus] != null ? <Badge label={APPROVAL_STATUS_LABEL[selectedItem[f.approvalstatus] as keyof typeof APPROVAL_STATUS_LABEL] ?? ""} color={APPROVAL_STATUS_COLOR[selectedItem[f.approvalstatus] as keyof typeof APPROVAL_STATUS_COLOR] ?? ""} /> : null}</DetailField>
            </DetailGrid>

            {/* サマリー */}
            {selectedItem[f.visitcount] != null ? (
              <div className="border rounded-md p-3 bg-muted/30">
                <h4 className="text-sm font-medium mb-2">対応サマリー</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">訪問件数:</span><span>{String(selectedItem[f.visitcount] ?? "")}</span>
                  <span className="text-muted-foreground">完了件数:</span><span>{String(selectedItem[f.completedcount] ?? "")}</span>
                  <span className="text-muted-foreground">要再訪:</span><span>{String(selectedItem[f.revisitcount] ?? "")}</span>
                  <span className="text-muted-foreground">部品交換:</span><span>{String(selectedItem[f.partsexchangecount] ?? "")}</span>
                  <span className="text-muted-foreground">総作業時間:</span><span>{String(selectedItem[f.totalworktime] ?? "")}分</span>
                  <span className="text-muted-foreground">平均満足度:</span><span>{String(selectedItem[f.avgsatisfaction] ?? "")}</span>
                </div>
              </div>
            ) : null}

            {/* 作業オーダー一覧 */}
            <div>
              <h4 className="text-sm font-medium mb-2">紐づく作業オーダー ({linkedOrders.length}件)</h4>
              {linkedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">作業オーダーがリンクされていません</p>
              ) : (
                <div className="space-y-2">
                  {linkedOrders.map((wo, i) => {
                    const woName = String(wo[fwo.name] ?? "")
                    const woFault = String(wo[fwo.faultsummary] ?? "")
                    const woTime = Number(wo[fwo.worktime] ?? 0)
                    const woSigned = Boolean(wo[fwo.customersigned])
                    return (
                      <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{woName}</span>
                          {woFault && <span className="text-muted-foreground ml-2 text-xs">{woFault}</span>}
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          {woTime > 0 && <span className="text-xs text-muted-foreground">{woTime}分</span>}
                          {woSigned ? (
                            <span className="inline-flex items-center gap-0.5 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />署名済</span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-amber-600 text-xs"><AlertCircle className="h-3.5 w-3.5" />未署名</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 署名確認ステータス */}
            {linkedOrders.length > 0 && (
              <div className={cn("border rounded-md p-3 text-sm", signatureStatus.allSigned ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200")}>
                {signatureStatus.allSigned ? (
                  <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="h-4 w-4" />全{signatureStatus.count}件 顧客署名取得済</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-700"><AlertCircle className="h-4 w-4" />未署名: {signatureStatus.unsigned}件（提出不可）</span>
                )}
              </div>
            )}

            {/* 承認コメント表示 */}
            {String(selectedItem[f.approvalcomment] ?? "") !== "" && (
              <div className="border rounded-md p-3 bg-muted/30">
                <h4 className="text-sm font-medium mb-1">承認コメント</h4>
                <p className="text-sm whitespace-pre-wrap">{String(selectedItem[f.approvalcomment] ?? "")}</p>
              </div>
            )}

            {/* アクションボタン */}
            <div className="flex gap-2 flex-wrap">
              {currentStatus === 100000000 && (
                <Button onClick={handleSubmit} disabled={!signatureStatus.allSigned || linkedOrders.length === 0} className="gap-1.5">
                  <Send className="h-4 w-4" />提出
                </Button>
              )}
              {currentStatus === 100000001 && !showApproval && (
                <Button variant="outline" onClick={() => setShowApproval(true)} className="gap-1.5">承認/差戻し</Button>
              )}
            </div>

            {/* 承認フォーム */}
            {showApproval && (
              <div className="border rounded-md p-3 space-y-3">
                <h4 className="text-sm font-medium">承認処理</h4>
                <Textarea placeholder="コメント（任意）" value={approvalComment} onChange={e => setApprovalComment(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button onClick={() => handleApprove(true)} className="gap-1.5 bg-green-600 hover:bg-green-700"><ThumbsUp className="h-4 w-4" />承認</Button>
                  <Button variant="destructive" onClick={() => handleApprove(false)} className="gap-1.5"><ThumbsDown className="h-4 w-4" />差戻し</Button>
                  <Button variant="ghost" onClick={() => setShowApproval(false)}>キャンセル</Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
        editContent={<div className="space-y-4">
          <div className="space-y-1.5"><Label>日報番号 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div>
          <div className="space-y-1.5"><Label>報告日</Label><Input type="date" value={editForm.reportdate} onChange={updE("reportdate")} /></div>
          <div className="space-y-1.5"><Label>所属</Label><Input value={editForm.department} onChange={updE("department")} placeholder="東京サービスセンター" /></div>
          <div className="space-y-1.5"><Label>天候</Label><Select value={editForm.weather} onValueChange={v => setEditForm(p => ({ ...p, weather: v }))}><SelectTrigger><SelectValue placeholder="天候" /></SelectTrigger><SelectContent>{WEATHER_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          {/* 現在リンク済みWO */}
          {linkedOrders.length > 0 && (
            <div className="space-y-1.5">
              <Label>リンク済み作業オーダー ({linkedOrders.length}件)</Label>
              <div className="border rounded-md max-h-32 overflow-y-auto divide-y">
                {linkedOrders.map(wo => (
                  <div key={String(wo[fwo.id])} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span>{String(wo[fwo.name] ?? "")}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => {
                      const woId = String(wo[fwo.id] ?? "")
                      updateWO.mutateAsync({ id: woId, data: { [`${P}_dailyreportid@odata.bind`]: null } }).then(() => toast.success("リンクを解除しました"))
                    }}>解除</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 追加可能なWO */}
          {unlinkedOrders.length > 0 && (
            <div className="space-y-1.5">
              <Label>作業オーダーを追加</Label>
              <div className="border rounded-md max-h-32 overflow-y-auto divide-y">
                {unlinkedOrders.map(wo => {
                  const woId = String(wo[fwo.id] ?? "")
                  return (
                    <label key={woId} className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox checked={editWoIds.includes(woId)} onCheckedChange={() => setEditWoIds(prev => prev.includes(woId) ? prev.filter(id => id !== woId) : [...prev, woId])} />
                      <span>{String(wo[fwo.name] ?? "")}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>}
      />

      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="日報新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6">
          <div className="space-y-1.5"><Label>日報番号 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="DR-20260617-01" /></div>
          <FormColumns columns={2}>
            <div className="space-y-1.5"><Label>報告日</Label><Input type="date" value={formData.reportdate} onChange={upd("reportdate")} /></div>
            <div className="space-y-1.5"><Label>所属</Label><Input value={formData.department} onChange={upd("department")} placeholder="東京サービスセンター" /></div>
            <div className="space-y-1.5"><Label>天候</Label><Select value={formData.weather} onValueChange={v => setFormData(p => ({ ...p, weather: v }))}><SelectTrigger><SelectValue placeholder="天候" /></SelectTrigger><SelectContent>{WEATHER_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          </FormColumns>
          {/* 作業オーダー選択 */}
          <div className="space-y-2">
            <Label>作業オーダー <span className="text-destructive">*</span></Label>
            <p className="text-xs text-muted-foreground">この日報に含める作業オーダーを選択してください（{selectedWoIds.length}件選択中）</p>
            <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
              {unlinkedOrders.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">リンク可能な作業オーダーがありません</p>
              ) : (
                unlinkedOrders.map(wo => {
                  const woId = String(wo[fwo.id] ?? "")
                  const woLabel = String(wo[fwo.name] ?? "")
                  const woFault = String(wo[fwo.faultsummary] ?? "")
                  return (
                    <label key={woId} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={selectedWoIds.includes(woId)} onCheckedChange={() => toggleWoSelection(woId)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{woLabel}</span>
                        {woFault && <span className="text-xs text-muted-foreground ml-2">{woFault}</span>}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="日報を削除" description="この日報を削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
