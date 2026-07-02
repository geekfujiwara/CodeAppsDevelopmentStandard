import { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DetailPanel, DetailField, DetailGrid } from "@/components/detail-panel"
import { useCalls, useCreateCall, useUpdateCall, useDeleteCall, useCustomers, useEquipment } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { CALL_CHANNEL_LABEL, CALL_CHANNEL_COLOR, CALL_CHANNEL_OPTIONS, PRIORITY_LABEL, PRIORITY_COLOR, PRIORITY_OPTIONS, CALL_STATUS_LABEL, CALL_STATUS_COLOR, CALL_STATUS_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { useSearchParams } from "react-router-dom"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_callid`, name: `${P}_name`, channel: `${P}_channel`, description: `${P}_description`, priority: `${P}_priority`, status: `${P}_status`, receiveddate: `${P}_receiveddate`, customerId: `_${P}_customerid_value`, equipmentId: `_${P}_equipmentid_value` }
const fc = { id: `${P}_customerid`, name: `${P}_name` }
const fe = { id: `${P}_equipmentid`, name: `${P}_name` }

function Badge({ label, color }: { label: string; color: string }) { return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

type FormData = { name: string; channel: string; description: string; priority: string; status: string; receiveddate: string; customer_id: string; equipment_id: string }
const EMPTY: FormData = { name: "", channel: "", description: "", priority: "", status: "", receiveddate: "", customer_id: "", equipment_id: "" }
const PER_PAGE = 10

export default function CallsPage() {
  const { data: rows = [], isLoading: l1 } = useCalls()
  const { data: customers = [], isLoading: l2 } = useCustomers()
  const { data: equipment = [], isLoading: l3 } = useEquipment()
  const isLoading = l1 || l2 || l3
  const createM = useCreateCall()
  const updateM = useUpdateCall()
  const deleteM = useDeleteCall()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const customerMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const equipmentMap = useMemo(() => new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])), [equipment])
  const custName = (item: Record<string, unknown>) => customerMap.get(String(item[f.customerId] ?? "")) ?? ""
  const eqName = (item: Record<string, unknown>) => equipmentMap.get(String(item[f.equipmentId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return (!q || String(r[f.name] ?? "").toLowerCase().includes(q)) && (filterStatus === "all" || String(r[f.status]) === filterStatus) && (filterPriority === "all" || String(r[f.priority]) === filterPriority) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }

  // Auto-select record from URL param
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const selectId = searchParams.get("select")
    if (selectId && rows.length > 0) {
      const found = rows.find(r => String(r[f.id] ?? "") === selectId)
      if (found) { setSelectedItem(found); setIsEditing(false) }
      setSearchParams({}, { replace: true })
    }
  }, [rows, searchParams, setSearchParams])
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), channel: selectedItem[f.channel] != null ? String(selectedItem[f.channel]) : "", description: String(selectedItem[f.description] ?? ""), priority: selectedItem[f.priority] != null ? String(selectedItem[f.priority]) : "", status: selectedItem[f.status] != null ? String(selectedItem[f.status]) : "", receiveddate: String(selectedItem[f.receiveddate] ?? "").slice(0, 16), customer_id: String(selectedItem[f.customerId] ?? ""), equipment_id: String(selectedItem[f.equipmentId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("件名は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.description]: editForm.description }
    if (editForm.channel) data[f.channel] = Number(editForm.channel)
    if (editForm.priority) data[f.priority] = Number(editForm.priority)
    if (editForm.status) data[f.status] = Number(editForm.status)
    if (editForm.receiveddate) data[f.receiveddate] = new Date(editForm.receiveddate).toISOString()
    if (editForm.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${editForm.customer_id})`
    if (editForm.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${editForm.equipment_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("コールを更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  // 自動採番: CL-YYYYMMDD-NNN
  const generateCallNumber = useCallback(() => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`
    const prefix = `CL-${dateStr}-`
    const todayCalls = rows.filter(r => String(r[f.name] ?? "").startsWith(prefix))
    const nextNum = todayCalls.length + 1
    return `${prefix}${String(nextNum).padStart(3, "0")}`
  }, [rows])

  const handleNew = () => { setFormData({ ...EMPTY, name: generateCallNumber(), receiveddate: new Date().toISOString().slice(0, 16) }); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("件名は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.description]: formData.description }
    if (formData.channel) data[f.channel] = Number(formData.channel)
    if (formData.priority) data[f.priority] = Number(formData.priority)
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.receiveddate) data[f.receiveddate] = new Date(formData.receiveddate).toISOString()
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    if (formData.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${formData.equipment_id})`
    try { await createM.mutateAsync(data); toast.success("コールを作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("コールを削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">コール</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">コール</h1><p className="text-muted-foreground text-sm mt-1">問い合わせ・故障受付の管理</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規受付</Button></div>
        <Card><CardHeader><CardTitle>コール一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="件名で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{CALL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
            <Select value={filterPriority} onValueChange={v => { setFilterPriority(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="優先度" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[25%]">件名</TableHead><TableHead className="w-[18%]">顧客</TableHead><TableHead className="w-[12%]">チャネル</TableHead><TableHead className="w-[12%]">優先度</TableHead><TableHead className="w-[13%]">ステータス</TableHead><TableHead className="w-[20%]">受付日時</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">コールがありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium max-w-[160px] truncate">{String(item[f.name] ?? "")}</TableCell><TableCell>{custName(item)}</TableCell>
                <TableCell>{item[f.channel] != null && <Badge label={CALL_CHANNEL_LABEL[item[f.channel] as keyof typeof CALL_CHANNEL_LABEL] ?? ""} color={CALL_CHANNEL_COLOR[item[f.channel] as keyof typeof CALL_CHANNEL_COLOR] ?? "bg-gray-100 text-gray-600"} />}</TableCell>
                <TableCell>{item[f.priority] != null && <Badge label={PRIORITY_LABEL[item[f.priority] as keyof typeof PRIORITY_LABEL] ?? ""} color={PRIORITY_COLOR[item[f.priority] as keyof typeof PRIORITY_COLOR] ?? "bg-gray-100 text-gray-600"} />}</TableCell>
                <TableCell>{item[f.status] != null && <Badge label={CALL_STATUS_LABEL[item[f.status] as keyof typeof CALL_STATUS_LABEL] ?? ""} color={CALL_STATUS_COLOR[item[f.status] as keyof typeof CALL_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"} />}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{String(item[f.receiveddate] ?? "").slice(0, 16).replace("T", " ")}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="件名">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="チャネル">{selectedItem[f.channel] != null ? <Badge label={CALL_CHANNEL_LABEL[selectedItem[f.channel] as keyof typeof CALL_CHANNEL_LABEL] ?? ""} color={CALL_CHANNEL_COLOR[selectedItem[f.channel] as keyof typeof CALL_CHANNEL_COLOR] ?? ""} /> : null}</DetailField><DetailField label="優先度">{selectedItem[f.priority] != null ? <Badge label={PRIORITY_LABEL[selectedItem[f.priority] as keyof typeof PRIORITY_LABEL] ?? ""} color={PRIORITY_COLOR[selectedItem[f.priority] as keyof typeof PRIORITY_COLOR] ?? ""} /> : null}</DetailField><DetailField label="ステータス">{selectedItem[f.status] != null ? <Badge label={CALL_STATUS_LABEL[selectedItem[f.status] as keyof typeof CALL_STATUS_LABEL] ?? ""} color={CALL_STATUS_COLOR[selectedItem[f.status] as keyof typeof CALL_STATUS_COLOR] ?? ""} /> : null}</DetailField><DetailField label="顧客">{custName(selectedItem)}</DetailField><DetailField label="機器">{eqName(selectedItem)}</DetailField><DetailField label="受付日時">{String(selectedItem[f.receiveddate] ?? "").slice(0, 16).replace("T", " ")}</DetailField><DetailField label="内容">{String(selectedItem[f.description] ?? "")}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>件名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>チャネル</Label><Select value={editForm.channel} onValueChange={v => setEditForm(p => ({ ...p, channel: v }))}><SelectTrigger><SelectValue placeholder="チャネル" /></SelectTrigger><SelectContent>{CALL_CHANNEL_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>優先度</Label><Select value={editForm.priority} onValueChange={v => setEditForm(p => ({ ...p, priority: v }))}><SelectTrigger><SelectValue placeholder="優先度" /></SelectTrigger><SelectContent>{PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>ステータス</Label><Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent>{CALL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>顧客</Label><Select value={editForm.customer_id} onValueChange={v => setEditForm(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>機器</Label><Select value={editForm.equipment_id} onValueChange={v => setEditForm(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>受付日時</Label><Input type="datetime-local" value={editForm.receiveddate} onChange={updE("receiveddate")} /></div><div className="space-y-1.5"><Label>内容</Label><Textarea value={editForm.description} onChange={updE("description")} rows={3} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="コール新規受付" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label>件名 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="コールの件名" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>顧客</Label><Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>機器</Label><Select value={formData.equipment_id} onValueChange={v => setFormData(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器を選択" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>チャネル</Label><Select value={formData.channel} onValueChange={v => setFormData(p => ({ ...p, channel: v }))}><SelectTrigger><SelectValue placeholder="チャネル" /></SelectTrigger><SelectContent>{CALL_CHANNEL_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>優先度</Label><Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v }))}><SelectTrigger><SelectValue placeholder="優先度" /></SelectTrigger><SelectContent>{PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>ステータス</Label><Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent>{CALL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>受付日時</Label><Input type="datetime-local" value={formData.receiveddate} onChange={upd("receiveddate")} /></div></FormColumns>
          <div className="space-y-1.5"><Label>内容</Label><Textarea value={formData.description} onChange={upd("description")} placeholder="問い合わせ・故障内容" rows={3} /></div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="コールを削除" description="このコールを削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
