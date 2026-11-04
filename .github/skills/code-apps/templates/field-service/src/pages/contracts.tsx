import { useState, useMemo } from "react"
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
import { useContracts, useCreateContract, useUpdateContract, useDeleteContract, useCustomers, useEquipment } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { CONTRACT_TYPE_LABEL, CONTRACT_TYPE_COLOR, CONTRACT_TYPE_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_maintenancecontractid`, name: `${P}_name`, contracttype: `${P}_contracttype`, slacondition: `${P}_slacondition`, startdate: `${P}_startdate`, enddate: `${P}_enddate`, customerId: `_${P}_customerid_value`, equipmentId: `_${P}_equipmentid_value` }
const fc = { id: `${P}_customerid`, name: `${P}_name` }
const fe = { id: `${P}_equipmentid`, name: `${P}_name` }

function TypeBadge({ v }: { v: number }) { const label = CONTRACT_TYPE_LABEL[v as keyof typeof CONTRACT_TYPE_LABEL] ?? String(v); const color = CONTRACT_TYPE_COLOR[v as keyof typeof CONTRACT_TYPE_COLOR] ?? "bg-gray-100 text-gray-600"; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

type FormData = { name: string; contracttype: string; slacondition: string; startdate: string; enddate: string; customer_id: string; equipment_id: string }
const EMPTY: FormData = { name: "", contracttype: "", slacondition: "", startdate: "", enddate: "", customer_id: "", equipment_id: "" }
const PER_PAGE = 10

export default function ContractsPage() {
  const { data: rows = [], isLoading: l1 } = useContracts()
  const { data: customers = [], isLoading: l2 } = useCustomers()
  const { data: equipment = [], isLoading: l3 } = useEquipment()
  const isLoading = l1 || l2 || l3
  const createM = useCreateContract()
  const updateM = useUpdateContract()
  const deleteM = useDeleteContract()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const customerMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const equipmentMap = useMemo(() => new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])), [equipment])
  const custName = (item: Record<string, unknown>) => customerMap.get(String(item[f.customerId] ?? "")) ?? ""
  const eqName = (item: Record<string, unknown>) => equipmentMap.get(String(item[f.equipmentId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return (!q || String(r[f.name] ?? "").toLowerCase().includes(q)) && (filterType === "all" || String(r[f.contracttype]) === filterType) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), contracttype: selectedItem[f.contracttype] != null ? String(selectedItem[f.contracttype]) : "", slacondition: String(selectedItem[f.slacondition] ?? ""), startdate: String(selectedItem[f.startdate] ?? "").slice(0, 10), enddate: String(selectedItem[f.enddate] ?? "").slice(0, 10), customer_id: String(selectedItem[f.customerId] ?? ""), equipment_id: String(selectedItem[f.equipmentId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("契約番号は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.slacondition]: editForm.slacondition }
    if (editForm.contracttype) data[f.contracttype] = Number(editForm.contracttype)
    if (editForm.startdate) data[f.startdate] = editForm.startdate
    if (editForm.enddate) data[f.enddate] = editForm.enddate
    if (editForm.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${editForm.customer_id})`
    if (editForm.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${editForm.equipment_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("保守契約を更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("契約番号は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.slacondition]: formData.slacondition }
    if (formData.contracttype) data[f.contracttype] = Number(formData.contracttype)
    if (formData.startdate) data[f.startdate] = formData.startdate
    if (formData.enddate) data[f.enddate] = formData.enddate
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    if (formData.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${formData.equipment_id})`
    try { await createM.mutateAsync(data); toast.success("保守契約を作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("保守契約を削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">保守契約</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">保守契約</h1><p className="text-muted-foreground text-sm mt-1">保守契約の管理</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>契約一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="契約番号で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="契約種別" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{CONTRACT_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[20%]">契約番号</TableHead><TableHead className="w-[15%]">契約種別</TableHead><TableHead className="w-[22%]">顧客</TableHead><TableHead className="w-[22%]">機器</TableHead><TableHead className="w-[10%]">開始日</TableHead><TableHead className="w-[10%]">終了日</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">保守契約がありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell>
                <TableCell>{item[f.contracttype] != null && <TypeBadge v={item[f.contracttype] as number} />}</TableCell>
                <TableCell>{custName(item)}</TableCell><TableCell className="text-muted-foreground">{eqName(item)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{String(item[f.startdate] ?? "").slice(0, 10)}</TableCell><TableCell className="text-muted-foreground text-xs">{String(item[f.enddate] ?? "").slice(0, 10)}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="契約番号">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="契約種別">{selectedItem[f.contracttype] != null ? <TypeBadge v={selectedItem[f.contracttype] as number} /> : null}</DetailField><DetailField label="顧客">{custName(selectedItem)}</DetailField><DetailField label="機器">{eqName(selectedItem)}</DetailField><DetailField label="開始日">{String(selectedItem[f.startdate] ?? "").slice(0, 10)}</DetailField><DetailField label="終了日">{String(selectedItem[f.enddate] ?? "").slice(0, 10)}</DetailField><DetailField label="SLA条件">{String(selectedItem[f.slacondition] ?? "")}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>契約番号 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>契約種別</Label><Select value={editForm.contracttype} onValueChange={v => setEditForm(p => ({ ...p, contracttype: v }))}><SelectTrigger><SelectValue placeholder="種別を選択" /></SelectTrigger><SelectContent>{CONTRACT_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>顧客</Label><Select value={editForm.customer_id} onValueChange={v => setEditForm(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>機器</Label><Select value={editForm.equipment_id} onValueChange={v => setEditForm(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器を選択" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>開始日</Label><Input type="date" value={editForm.startdate} onChange={updE("startdate")} /></div><div className="space-y-1.5"><Label>終了日</Label><Input type="date" value={editForm.enddate} onChange={updE("enddate")} /></div><div className="space-y-1.5"><Label>SLA条件</Label><Textarea value={editForm.slacondition} onChange={updE("slacondition")} rows={3} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="保守契約新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label>契約番号 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="契約番号" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>契約種別</Label><Select value={formData.contracttype} onValueChange={v => setFormData(p => ({ ...p, contracttype: v }))}><SelectTrigger><SelectValue placeholder="種別を選択" /></SelectTrigger><SelectContent>{CONTRACT_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>顧客</Label><Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>機器</Label><Select value={formData.equipment_id} onValueChange={v => setFormData(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器を選択" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>開始日</Label><Input type="date" value={formData.startdate} onChange={upd("startdate")} /></div><div className="space-y-1.5"><Label>終了日</Label><Input type="date" value={formData.enddate} onChange={upd("enddate")} /></div></FormColumns>
          <div className="space-y-1.5"><Label>SLA条件</Label><Textarea value={formData.slacondition} onChange={upd("slacondition")} placeholder="SLA条件の詳細" rows={3} /></div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="保守契約を削除" description="この保守契約を削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
