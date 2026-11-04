import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DetailPanel, DetailField, DetailGrid } from "@/components/detail-panel"
import { useReports, useCreateReport, useUpdateReport, useDeleteReport, useWorkOrders } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_maintenancereportid`, name: `${P}_name`, workcontent: `${P}_workcontent`, partsused: `${P}_partsused`, completeddate: `${P}_completeddate`, customersigned: `${P}_customersigned`, workorderId: `_${P}_workorderid_value` }
const fwo = { id: `${P}_workorderid`, name: `${P}_name` }

type FormData = { name: string; workcontent: string; partsused: string; completeddate: string; customersigned: boolean; workorder_id: string }
const EMPTY: FormData = { name: "", workcontent: "", partsused: "", completeddate: "", customersigned: false, workorder_id: "" }
const PER_PAGE = 10

export default function ReportsPage() {
  const { data: rows = [], isLoading: l1 } = useReports()
  const { data: workOrders = [], isLoading: l2 } = useWorkOrders()
  const isLoading = l1 || l2
  const createM = useCreateReport()
  const updateM = useUpdateReport()
  const deleteM = useDeleteReport()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterSigned, setFilterSigned] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const woMap = useMemo(() => new Map(workOrders.map(w => [String(w[fwo.id] ?? ""), String(w[fwo.name] ?? "")])), [workOrders])
  const woName = (item: Record<string, unknown>) => woMap.get(String(item[f.workorderId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return (!q || String(r[f.name] ?? "").toLowerCase().includes(q)) && (filterSigned === "all" || String(!!r[f.customersigned]) === filterSigned) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), workcontent: String(selectedItem[f.workcontent] ?? ""), partsused: String(selectedItem[f.partsused] ?? ""), completeddate: String(selectedItem[f.completeddate] ?? "").slice(0, 16), customersigned: !!selectedItem[f.customersigned], workorder_id: String(selectedItem[f.workorderId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("レポート番号は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.workcontent]: editForm.workcontent, [f.partsused]: editForm.partsused, [f.customersigned]: editForm.customersigned }
    if (editForm.completeddate) data[f.completeddate] = new Date(editForm.completeddate).toISOString()
    if (editForm.workorder_id) data[`${P}_workorderid@odata.bind`] = `/${P}_workorders(${editForm.workorder_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("レポートを更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  // 自動採番: MR-YYYYMMDD-NNN
  const generateReportNumber = useCallback(() => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`
    const prefix = `MR-${dateStr}-`
    const todayReports = rows.filter(r => String(r[f.name] ?? "").startsWith(prefix))
    const nextNum = todayReports.length + 1
    return `${prefix}${String(nextNum).padStart(3, "0")}`
  }, [rows])

  const handleNew = () => { setFormData({ ...EMPTY, name: generateReportNumber() }); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("レポート番号は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.workcontent]: formData.workcontent, [f.partsused]: formData.partsused, [f.customersigned]: formData.customersigned }
    if (formData.completeddate) data[f.completeddate] = new Date(formData.completeddate).toISOString()
    if (formData.workorder_id) data[`${P}_workorderid@odata.bind`] = `/${P}_workorders(${formData.workorder_id})`
    try { await createM.mutateAsync(data); toast.success("レポートを作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("レポートを削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">修理事例</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">修理事例</h1><p className="text-muted-foreground text-sm mt-1">作業完了レポート・修理ナレッジの蓄積</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>レポート一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="レポート番号で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterSigned} onValueChange={v => { setFilterSigned(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="顧客署名" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="true">署名済</SelectItem><SelectItem value="false">未署名</SelectItem></SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[20%]">レポート番号</TableHead><TableHead className="w-[30%]">作業オーダー</TableHead><TableHead className="w-[15%]">完了日</TableHead><TableHead className="w-[35%]">作業内容</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">レポートがありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium truncate">{String(item[f.name] ?? "")}</TableCell><TableCell className="text-muted-foreground truncate">{woName(item)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{String(item[f.completeddate] ?? "").slice(0, 10)}</TableCell>
                <TableCell className="truncate text-muted-foreground">{String(item[f.workcontent] ?? "")}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="レポート番号">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="作業オーダー">{woName(selectedItem)}</DetailField><DetailField label="完了日時">{String(selectedItem[f.completeddate] ?? "").slice(0, 16).replace("T", " ")}</DetailField><DetailField label="顧客署名">{selectedItem[f.customersigned] ? "署名済" : "未署名"}</DetailField><DetailField label="作業内容">{String(selectedItem[f.workcontent] ?? "")}</DetailField><DetailField label="使用部品">{String(selectedItem[f.partsused] ?? "")}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>レポート番号 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>作業オーダー</Label><Select value={editForm.workorder_id} onValueChange={v => setEditForm(p => ({ ...p, workorder_id: v }))}><SelectTrigger><SelectValue placeholder="作業オーダーを選択" /></SelectTrigger><SelectContent>{workOrders.map(w => <SelectItem key={String(w[fwo.id])} value={String(w[fwo.id])}>{String(w[fwo.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>完了日時</Label><Input type="datetime-local" value={editForm.completeddate} onChange={updE("completeddate")} /></div><div className="space-y-1.5"><Label>作業内容</Label><Textarea value={editForm.workcontent} onChange={updE("workcontent")} rows={3} /></div><div className="space-y-1.5"><Label>使用部品</Label><Textarea value={editForm.partsused} onChange={updE("partsused")} rows={2} /></div><div className="flex items-center gap-2"><Checkbox checked={editForm.customersigned} onCheckedChange={v => setEditForm(p => ({ ...p, customersigned: !!v }))} /><Label className="cursor-pointer">顧客署名取得済</Label></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="レポート新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label>レポート番号 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="レポート番号" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>作業オーダー</Label><Select value={formData.workorder_id} onValueChange={v => setFormData(p => ({ ...p, workorder_id: v }))}><SelectTrigger><SelectValue placeholder="作業オーダーを選択" /></SelectTrigger><SelectContent>{workOrders.map(w => <SelectItem key={String(w[fwo.id])} value={String(w[fwo.id])}>{String(w[fwo.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>完了日時</Label><Input type="datetime-local" value={formData.completeddate} onChange={upd("completeddate")} /></div></FormColumns>
          <div className="space-y-1.5"><Label>作業内容</Label><Textarea value={formData.workcontent} onChange={upd("workcontent")} placeholder="実施した作業内容" rows={3} /></div>
          <div className="space-y-1.5"><Label>使用部品</Label><Textarea value={formData.partsused} onChange={upd("partsused")} placeholder="使用した部品" rows={2} /></div>
          <div className="flex items-center gap-2"><Checkbox checked={formData.customersigned} onCheckedChange={v => setFormData(p => ({ ...p, customersigned: !!v }))} /><Label className="cursor-pointer">顧客署名取得済</Label></div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="レポートを削除" description="このレポートを削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
