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
import { useKpis, useCreateKpi, useUpdateKpi, useDeleteKpi, useCustomers } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_annualkpiid`, name: `${P}_name`, targetyear: `${P}_targetyear`, requestcount: `${P}_requestcount`, slaachievement: `${P}_slaachievement`, avgresponse: `${P}_avgresponse`, avgresolution: `${P}_avgresolution`, uptimerate: `${P}_uptimerate`, satisfaction: `${P}_satisfaction`, downtimehours: `${P}_downtimehours`, maintenancecost: `${P}_maintenancecost`, customerId: `_${P}_customerid_value` }
const fc = { id: `${P}_customerid`, name: `${P}_name` }

type FormData = { name: string; targetyear: string; requestcount: string; slaachievement: string; avgresponse: string; avgresolution: string; uptimerate: string; satisfaction: string; downtimehours: string; maintenancecost: string; customer_id: string }
const EMPTY: FormData = { name: "", targetyear: "", requestcount: "", slaachievement: "", avgresponse: "", avgresolution: "", uptimerate: "", satisfaction: "", downtimehours: "", maintenancecost: "", customer_id: "" }
const PER_PAGE = 10
const num = (v: unknown) => v != null && v !== "" ? Number(v).toLocaleString() : ""
const pct = (v: unknown) => v != null && v !== "" ? `${Number(v)}%` : ""

export default function AnnualKpiPage() {
  const { data: rows = [], isLoading: l1 } = useKpis()
  const { data: customers = [], isLoading: l2 } = useCustomers()
  const isLoading = l1 || l2
  const createM = useCreateKpi()
  const updateM = useUpdateKpi()
  const deleteM = useDeleteKpi()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const custMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const custName = (item: Record<string, unknown>) => custMap.get(String(item[f.customerId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return !q || String(r[f.name] ?? "").toLowerCase().includes(q) || String(r[f.targetyear] ?? "").includes(q) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), targetyear: String(selectedItem[f.targetyear] ?? ""), requestcount: String(selectedItem[f.requestcount] ?? ""), slaachievement: String(selectedItem[f.slaachievement] ?? ""), avgresponse: String(selectedItem[f.avgresponse] ?? ""), avgresolution: String(selectedItem[f.avgresolution] ?? ""), uptimerate: String(selectedItem[f.uptimerate] ?? ""), satisfaction: String(selectedItem[f.satisfaction] ?? ""), downtimehours: String(selectedItem[f.downtimehours] ?? ""), maintenancecost: String(selectedItem[f.maintenancecost] ?? ""), customer_id: String(selectedItem[f.customerId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("KPI名は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name }
    if (editForm.targetyear) data[f.targetyear] = Number(editForm.targetyear)
    if (editForm.requestcount) data[f.requestcount] = Number(editForm.requestcount)
    if (editForm.slaachievement) data[f.slaachievement] = Number(editForm.slaachievement)
    if (editForm.avgresponse) data[f.avgresponse] = Number(editForm.avgresponse)
    if (editForm.avgresolution) data[f.avgresolution] = Number(editForm.avgresolution)
    if (editForm.uptimerate) data[f.uptimerate] = Number(editForm.uptimerate)
    if (editForm.satisfaction) data[f.satisfaction] = Number(editForm.satisfaction)
    if (editForm.downtimehours) data[f.downtimehours] = Number(editForm.downtimehours)
    if (editForm.maintenancecost) data[f.maintenancecost] = Number(editForm.maintenancecost)
    if (editForm.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${editForm.customer_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("KPIを更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("KPI名は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name }
    if (formData.targetyear) data[f.targetyear] = Number(formData.targetyear)
    if (formData.requestcount) data[f.requestcount] = Number(formData.requestcount)
    if (formData.slaachievement) data[f.slaachievement] = Number(formData.slaachievement)
    if (formData.avgresponse) data[f.avgresponse] = Number(formData.avgresponse)
    if (formData.avgresolution) data[f.avgresolution] = Number(formData.avgresolution)
    if (formData.uptimerate) data[f.uptimerate] = Number(formData.uptimerate)
    if (formData.satisfaction) data[f.satisfaction] = Number(formData.satisfaction)
    if (formData.downtimehours) data[f.downtimehours] = Number(formData.downtimehours)
    if (formData.maintenancecost) data[f.maintenancecost] = Number(formData.maintenancecost)
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    try { await createM.mutateAsync(data); toast.success("KPIを作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("KPIを削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">年間KPI</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">年間KPI</h1><p className="text-muted-foreground text-sm mt-1">顧客別の年間パフォーマンス指標</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>KPI一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="relative w-full sm:max-w-md mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="KPI名・年度で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[22%]">KPI名</TableHead><TableHead className="w-[20%]">顧客</TableHead><TableHead className="w-[12%]">年度</TableHead><TableHead className="w-[16%] text-right">SLA達成率</TableHead><TableHead className="w-[15%] text-right">満足度</TableHead><TableHead className="w-[15%] text-right">稼働率</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">KPIデータがありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell><TableCell>{custName(item)}</TableCell><TableCell>{String(item[f.targetyear] ?? "")}</TableCell>
                <TableCell className="text-right">{pct(item[f.slaachievement])}</TableCell><TableCell className="text-right">{pct(item[f.satisfaction])}</TableCell><TableCell className="text-right">{pct(item[f.uptimerate])}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="KPI名">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="顧客">{custName(selectedItem)}</DetailField><DetailField label="年度">{String(selectedItem[f.targetyear] ?? "")}</DetailField><DetailField label="依頼件数">{num(selectedItem[f.requestcount])}</DetailField><DetailField label="SLA達成率">{pct(selectedItem[f.slaachievement])}</DetailField><DetailField label="平均応答時間(h)">{num(selectedItem[f.avgresponse])}</DetailField><DetailField label="平均解決時間(h)">{num(selectedItem[f.avgresolution])}</DetailField><DetailField label="稼働率">{pct(selectedItem[f.uptimerate])}</DetailField><DetailField label="満足度">{pct(selectedItem[f.satisfaction])}</DetailField><DetailField label="ダウンタイム(h)">{num(selectedItem[f.downtimehours])}</DetailField><DetailField label="保守コスト">{num(selectedItem[f.maintenancecost])}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>KPI名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>顧客</Label><Select value={editForm.customer_id} onValueChange={v => setEditForm(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>年度</Label><Input type="number" value={editForm.targetyear} onChange={updE("targetyear")} /></div><div className="space-y-1.5"><Label>依頼件数</Label><Input type="number" value={editForm.requestcount} onChange={updE("requestcount")} /></div><div className="space-y-1.5"><Label>SLA達成率(%)</Label><Input type="number" value={editForm.slaachievement} onChange={updE("slaachievement")} /></div><div className="space-y-1.5"><Label>平均応答時間(h)</Label><Input type="number" value={editForm.avgresponse} onChange={updE("avgresponse")} /></div><div className="space-y-1.5"><Label>平均解決時間(h)</Label><Input type="number" value={editForm.avgresolution} onChange={updE("avgresolution")} /></div><div className="space-y-1.5"><Label>稼働率(%)</Label><Input type="number" value={editForm.uptimerate} onChange={updE("uptimerate")} /></div><div className="space-y-1.5"><Label>満足度(%)</Label><Input type="number" value={editForm.satisfaction} onChange={updE("satisfaction")} /></div><div className="space-y-1.5"><Label>ダウンタイム(h)</Label><Input type="number" value={editForm.downtimehours} onChange={updE("downtimehours")} /></div><div className="space-y-1.5"><Label>保守コスト</Label><Input type="number" value={editForm.maintenancecost} onChange={updE("maintenancecost")} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="年間KPI新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label>KPI名 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="KPI名" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>顧客</Label><Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>年度</Label><Input type="number" value={formData.targetyear} onChange={upd("targetyear")} placeholder="2025" /></div><div className="space-y-1.5"><Label>依頼件数</Label><Input type="number" value={formData.requestcount} onChange={upd("requestcount")} /></div><div className="space-y-1.5"><Label>SLA達成率(%)</Label><Input type="number" value={formData.slaachievement} onChange={upd("slaachievement")} /></div><div className="space-y-1.5"><Label>平均応答時間(h)</Label><Input type="number" value={formData.avgresponse} onChange={upd("avgresponse")} /></div><div className="space-y-1.5"><Label>平均解決時間(h)</Label><Input type="number" value={formData.avgresolution} onChange={upd("avgresolution")} /></div><div className="space-y-1.5"><Label>稼働率(%)</Label><Input type="number" value={formData.uptimerate} onChange={upd("uptimerate")} /></div><div className="space-y-1.5"><Label>満足度(%)</Label><Input type="number" value={formData.satisfaction} onChange={upd("satisfaction")} /></div><div className="space-y-1.5"><Label>ダウンタイム(h)</Label><Input type="number" value={formData.downtimehours} onChange={upd("downtimehours")} /></div><div className="space-y-1.5"><Label>保守コスト</Label><Input type="number" value={formData.maintenancecost} onChange={upd("maintenancecost")} /></div></FormColumns>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="KPIを削除" description="このKPIデータを削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
