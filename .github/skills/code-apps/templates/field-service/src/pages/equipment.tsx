import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DetailPanel, DetailField, DetailGrid } from "@/components/detail-panel"
import { useEquipment, useCreateEquipment, useUpdateEquipment, useDeleteEquipment, useCustomers } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { EQUIPMENT_STATUS_LABEL, EQUIPMENT_STATUS_COLOR, EQUIPMENT_STATUS_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_equipmentid`, name: `${P}_name`, model: `${P}_model`, serialno: `${P}_serialno`, location: `${P}_location`, status: `${P}_status`, installdate: `${P}_installdate`, eoldate: `${P}_eoldate`, customerId: `_${P}_customerid_value` }
const fc = { id: `${P}_customerid`, name: `${P}_name` }

function EqStatusBadge({ v }: { v: number }) { const label = EQUIPMENT_STATUS_LABEL[v as keyof typeof EQUIPMENT_STATUS_LABEL] ?? String(v); const color = EQUIPMENT_STATUS_COLOR[v as keyof typeof EQUIPMENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

type FormData = { name: string; model: string; serialno: string; location: string; status: string; installdate: string; eoldate: string; customer_id: string }
const EMPTY: FormData = { name: "", model: "", serialno: "", location: "", status: "", installdate: "", eoldate: "", customer_id: "" }
const PER_PAGE = 10

export default function EquipmentPage() {
  const { data: rows = [], isLoading: l1 } = useEquipment()
  const { data: customers = [], isLoading: l2 } = useCustomers()
  const isLoading = l1 || l2
  const createM = useCreateEquipment()
  const updateM = useUpdateEquipment()
  const deleteM = useDeleteEquipment()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const customerMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const custName = (item: Record<string, unknown>) => customerMap.get(String(item[f.customerId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return (!q || String(r[f.name] ?? "").toLowerCase().includes(q) || String(r[f.model] ?? "").toLowerCase().includes(q) || String(r[f.serialno] ?? "").toLowerCase().includes(q)) && (filterStatus === "all" || String(r[f.status]) === filterStatus) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), model: String(selectedItem[f.model] ?? ""), serialno: String(selectedItem[f.serialno] ?? ""), location: String(selectedItem[f.location] ?? ""), status: selectedItem[f.status] != null ? String(selectedItem[f.status]) : "", installdate: String(selectedItem[f.installdate] ?? "").slice(0, 10), eoldate: String(selectedItem[f.eoldate] ?? "").slice(0, 10), customer_id: String(selectedItem[f.customerId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("機器名は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.model]: editForm.model, [f.serialno]: editForm.serialno, [f.location]: editForm.location }
    if (editForm.status) data[f.status] = Number(editForm.status)
    if (editForm.installdate) data[f.installdate] = editForm.installdate
    if (editForm.eoldate) data[f.eoldate] = editForm.eoldate
    if (editForm.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${editForm.customer_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("機器情報を更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("機器名は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.model]: formData.model, [f.serialno]: formData.serialno, [f.location]: formData.location }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.installdate) data[f.installdate] = formData.installdate
    if (formData.eoldate) data[f.eoldate] = formData.eoldate
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    try { await createM.mutateAsync(data); toast.success("機器情報を作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("機器情報を削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">機器情報</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">機器情報</h1><p className="text-muted-foreground text-sm mt-1">機器マスタの管理</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>機器一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="機器名・型番・シリアルで検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{EQUIPMENT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[25%]">機器名</TableHead><TableHead className="w-[20%]">型番</TableHead><TableHead className="w-[20%]">シリアル番号</TableHead><TableHead className="w-[15%]">ステータス</TableHead><TableHead className="w-[20%]">設置場所</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">機器情報がありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell><TableCell>{String(item[f.model] ?? "")}</TableCell><TableCell className="text-muted-foreground">{String(item[f.serialno] ?? "")}</TableCell>
                <TableCell>{item[f.status] != null && <EqStatusBadge v={item[f.status] as number} />}</TableCell><TableCell className="max-w-[180px] truncate text-muted-foreground">{String(item[f.location] ?? "")}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="機器名">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="型番">{String(selectedItem[f.model] ?? "")}</DetailField><DetailField label="シリアル番号">{String(selectedItem[f.serialno] ?? "")}</DetailField><DetailField label="ステータス">{selectedItem[f.status] != null ? <EqStatusBadge v={selectedItem[f.status] as number} /> : null}</DetailField><DetailField label="設置場所">{String(selectedItem[f.location] ?? "")}</DetailField><DetailField label="顧客">{custName(selectedItem)}</DetailField><DetailField label="導入日">{String(selectedItem[f.installdate] ?? "").slice(0, 10)}</DetailField><DetailField label="保守終了日">{String(selectedItem[f.eoldate] ?? "").slice(0, 10)}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>機器名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>型番</Label><Input value={editForm.model} onChange={updE("model")} /></div><div className="space-y-1.5"><Label>シリアル番号</Label><Input value={editForm.serialno} onChange={updE("serialno")} /></div><div className="space-y-1.5"><Label>ステータス</Label><Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="ステータスを選択" /></SelectTrigger><SelectContent>{EQUIPMENT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>設置場所</Label><Input value={editForm.location} onChange={updE("location")} /></div><div className="space-y-1.5"><Label>顧客</Label><Select value={editForm.customer_id} onValueChange={v => setEditForm(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>導入日</Label><Input type="date" value={editForm.installdate} onChange={updE("installdate")} /></div><div className="space-y-1.5"><Label>保守終了日</Label><Input type="date" value={editForm.eoldate} onChange={updE("eoldate")} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="機器情報新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label htmlFor="eq-name">機器名 <span className="text-destructive">*</span></Label><Input id="eq-name" value={formData.name} onChange={upd("name")} placeholder="機器名を入力" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>型番</Label><Input value={formData.model} onChange={upd("model")} /></div><div className="space-y-1.5"><Label>シリアル番号</Label><Input value={formData.serialno} onChange={upd("serialno")} /></div><div className="space-y-1.5"><Label>ステータス</Label><Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="ステータスを選択" /></SelectTrigger><SelectContent>{EQUIPMENT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>設置場所</Label><Input value={formData.location} onChange={upd("location")} /></div><div className="space-y-1.5"><Label>顧客</Label><Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>導入日</Label><Input type="date" value={formData.installdate} onChange={upd("installdate")} /></div><div className="space-y-1.5"><Label>保守終了日</Label><Input type="date" value={formData.eoldate} onChange={upd("eoldate")} /></div></FormColumns>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="機器情報を削除" description="この機器情報を削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
