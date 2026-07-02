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
import { useRecommendations, useCreateRecommendation, useUpdateRecommendation, useDeleteRecommendation, useCustomers, useEquipment } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { RECOMMENDATION_CATEGORY_LABEL, RECOMMENDATION_CATEGORY_COLOR, RECOMMENDATION_CATEGORY_OPTIONS, RECOMMENDATION_PRIORITY_LABEL, RECOMMENDATION_PRIORITY_COLOR, RECOMMENDATION_PRIORITY_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const ft = { id: `${P}_recommendationid`, name: `${P}_name`, category: `${P}_category`, detail: `${P}_detail`, expectedeffect: `${P}_expectedeffect`, priority: `${P}_priority`, targetperiod: `${P}_targetperiod`, customerId: `_${P}_customerid_value`, equipmentId: `_${P}_equipmentid_value` }
const fc = { id: `${P}_customerid`, name: `${P}_name` }
const fe = { id: `${P}_equipmentid`, name: `${P}_name` }

function Badge({ label, color }: { label: string; color: string }) { return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

const PER_PAGE = 10

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">ナレッジ</h1><p className="text-muted-foreground text-sm mt-1">Tips・改善提案の管理</p></div>
      <TipsContent />
    </div>
  )
}

/* ─── Tips ─── */
function TipsContent() {
  const { data: rows = [], isLoading: l1 } = useRecommendations()
  const { data: customers = [], isLoading: l2 } = useCustomers()
  const { data: equipment = [], isLoading: l3 } = useEquipment()
  const isLoading = l1 || l2 || l3
  const createM = useCreateRecommendation()
  const updateM = useUpdateRecommendation()
  const deleteM = useDeleteRecommendation()

  type TipForm = { name: string; category: string; detail: string; expectedeffect: string; priority: string; targetperiod: string; customer_id: string; equipment_id: string }
  const EMPTY: TipForm = { name: "", category: "", detail: "", expectedeffect: "", priority: "", targetperiod: "", customer_id: "", equipment_id: "" }
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<TipForm>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<TipForm>(EMPTY)

  const custMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const eqMap = useMemo(() => new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])), [equipment])
  const custName = (item: Record<string, unknown>) => custMap.get(String(item[ft.customerId] ?? "")) ?? ""
  const eqName = (item: Record<string, unknown>) => eqMap.get(String(item[ft.equipmentId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return (!q || String(r[ft.name] ?? "").toLowerCase().includes(q) || String(r[ft.detail] ?? "").toLowerCase().includes(q)) && (filterCategory === "all" || String(r[ft.category]) === filterCategory) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[ft.name] ?? ""), category: selectedItem[ft.category] != null ? String(selectedItem[ft.category]) : "", detail: String(selectedItem[ft.detail] ?? ""), expectedeffect: String(selectedItem[ft.expectedeffect] ?? ""), priority: selectedItem[ft.priority] != null ? String(selectedItem[ft.priority]) : "", targetperiod: String(selectedItem[ft.targetperiod] ?? ""), customer_id: String(selectedItem[ft.customerId] ?? ""), equipment_id: String(selectedItem[ft.equipmentId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("Tips名は必須です"); return }
    const id = String(selectedItem[ft.id] ?? "")
    const data: Record<string, unknown> = { [ft.name]: editForm.name, [ft.detail]: editForm.detail, [ft.expectedeffect]: editForm.expectedeffect, [ft.targetperiod]: editForm.targetperiod }
    if (editForm.category) data[ft.category] = Number(editForm.category)
    if (editForm.priority) data[ft.priority] = Number(editForm.priority)
    if (editForm.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${editForm.customer_id})`
    if (editForm.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${editForm.equipment_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("Tipsを更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("Tips名は必須です"); return }
    const data: Record<string, unknown> = { [ft.name]: formData.name, [ft.detail]: formData.detail, [ft.expectedeffect]: formData.expectedeffect, [ft.targetperiod]: formData.targetperiod }
    if (formData.category) data[ft.category] = Number(formData.category)
    if (formData.priority) data[ft.priority] = Number(formData.priority)
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    if (formData.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${formData.equipment_id})`
    try { await createM.mutateAsync(data); toast.success("Tipsを作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("Tipsを削除しました"); if (selectedItem && String(selectedItem[ft.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof TipForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof TipForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <LoadingSkeletonList count={5} />

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex justify-end"><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />Tips追加</Button></div>
        <Card><CardHeader className="py-3"><CardTitle className="text-base">Tips</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="キーワード検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="カテゴリ" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{RECOMMENDATION_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[25%]">Tips名</TableHead><TableHead className="w-[18%]">カテゴリ</TableHead><TableHead className="w-[17%]">優先度</TableHead><TableHead className="w-[40%]">詳細</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Tipsがありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[ft.id]) === String(item[ft.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium max-w-[140px] truncate">{String(item[ft.name] ?? "")}</TableCell>
                <TableCell>{item[ft.category] != null && <Badge label={RECOMMENDATION_CATEGORY_LABEL[item[ft.category] as keyof typeof RECOMMENDATION_CATEGORY_LABEL] ?? ""} color={RECOMMENDATION_CATEGORY_COLOR[item[ft.category] as keyof typeof RECOMMENDATION_CATEGORY_COLOR] ?? ""} />}</TableCell>
                <TableCell>{item[ft.priority] != null && <Badge label={RECOMMENDATION_PRIORITY_LABEL[item[ft.priority] as keyof typeof RECOMMENDATION_PRIORITY_LABEL] ?? ""} color={RECOMMENDATION_PRIORITY_COLOR[item[ft.priority] as keyof typeof RECOMMENDATION_PRIORITY_COLOR] ?? ""} />}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">{String(item[ft.detail] ?? "")}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{start + 1}-{Math.min(start + PER_PAGE, filtered.length)} / {filtered.length}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[ft.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[ft.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="Tips名">{String(selectedItem[ft.name] ?? "")}</DetailField><DetailField label="カテゴリ">{selectedItem[ft.category] != null ? <Badge label={RECOMMENDATION_CATEGORY_LABEL[selectedItem[ft.category] as keyof typeof RECOMMENDATION_CATEGORY_LABEL] ?? ""} color={RECOMMENDATION_CATEGORY_COLOR[selectedItem[ft.category] as keyof typeof RECOMMENDATION_CATEGORY_COLOR] ?? ""} /> : null}</DetailField><DetailField label="優先度">{selectedItem[ft.priority] != null ? <Badge label={RECOMMENDATION_PRIORITY_LABEL[selectedItem[ft.priority] as keyof typeof RECOMMENDATION_PRIORITY_LABEL] ?? ""} color={RECOMMENDATION_PRIORITY_COLOR[selectedItem[ft.priority] as keyof typeof RECOMMENDATION_PRIORITY_COLOR] ?? ""} /> : null}</DetailField><DetailField label="顧客">{custName(selectedItem)}</DetailField><DetailField label="機器">{eqName(selectedItem)}</DetailField><DetailField label="対象期間">{String(selectedItem[ft.targetperiod] ?? "")}</DetailField><DetailField label="詳細">{String(selectedItem[ft.detail] ?? "")}</DetailField><DetailField label="期待効果">{String(selectedItem[ft.expectedeffect] ?? "")}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>Tips名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>カテゴリ</Label><Select value={editForm.category} onValueChange={v => setEditForm(p => ({ ...p, category: v }))}><SelectTrigger><SelectValue placeholder="カテゴリ" /></SelectTrigger><SelectContent>{RECOMMENDATION_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>優先度</Label><Select value={editForm.priority} onValueChange={v => setEditForm(p => ({ ...p, priority: v }))}><SelectTrigger><SelectValue placeholder="優先度" /></SelectTrigger><SelectContent>{RECOMMENDATION_PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>顧客</Label><Select value={editForm.customer_id} onValueChange={v => setEditForm(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>機器</Label><Select value={editForm.equipment_id} onValueChange={v => setEditForm(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器を選択" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>対象期間</Label><Input value={editForm.targetperiod} onChange={updE("targetperiod")} /></div><div className="space-y-1.5"><Label>詳細</Label><Textarea value={editForm.detail} onChange={updE("detail")} rows={3} /></div><div className="space-y-1.5"><Label>期待効果</Label><Textarea value={editForm.expectedeffect} onChange={updE("expectedeffect")} rows={3} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="Tips追加" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label>Tips名 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="Tips名" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>顧客</Label><Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>機器</Label><Select value={formData.equipment_id} onValueChange={v => setFormData(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>カテゴリ</Label><Select value={formData.category} onValueChange={v => setFormData(p => ({ ...p, category: v }))}><SelectTrigger><SelectValue placeholder="カテゴリ" /></SelectTrigger><SelectContent>{RECOMMENDATION_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>優先度</Label><Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v }))}><SelectTrigger><SelectValue placeholder="優先度" /></SelectTrigger><SelectContent>{RECOMMENDATION_PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>対象期間</Label><Input value={formData.targetperiod} onChange={upd("targetperiod")} placeholder="2025年度" /></div></FormColumns>
          <div className="space-y-1.5"><Label>詳細</Label><Textarea value={formData.detail} onChange={upd("detail")} rows={3} /></div>
          <div className="space-y-1.5"><Label>期待効果</Label><Textarea value={formData.expectedeffect} onChange={upd("expectedeffect")} rows={3} /></div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="Tipsを削除" description="削除してもよろしいですか？" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
