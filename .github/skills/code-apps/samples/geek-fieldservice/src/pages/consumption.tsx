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
import { useConsumptions, useCreateConsumption, useUpdateConsumption, useDeleteConsumption, useEquipment } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_consumptionrecordid`, name: `${P}_name`, yearmonth: `${P}_yearmonth`, printcount: `${P}_printcount`, tonercount: `${P}_tonercount`, papercount: `${P}_papercount`, consumablecost: `${P}_consumablecost`, equipmentId: `_${P}_equipmentid_value` }
const fe = { id: `${P}_equipmentid`, name: `${P}_name` }

type FormData = { name: string; yearmonth: string; printcount: string; tonercount: string; papercount: string; consumablecost: string; equipment_id: string }
const EMPTY: FormData = { name: "", yearmonth: "", printcount: "", tonercount: "", papercount: "", consumablecost: "", equipment_id: "" }
const PER_PAGE = 10
const num = (v: unknown) => v != null ? Number(v).toLocaleString() : ""

export default function ConsumptionPage() {
  const { data: rows = [], isLoading: l1 } = useConsumptions()
  const { data: equipment = [], isLoading: l2 } = useEquipment()
  const isLoading = l1 || l2
  const createM = useCreateConsumption()
  const updateM = useUpdateConsumption()
  const deleteM = useDeleteConsumption()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const eqMap = useMemo(() => new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])), [equipment])
  const eqName = (item: Record<string, unknown>) => eqMap.get(String(item[f.equipmentId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return !q || String(r[f.name] ?? "").toLowerCase().includes(q) || String(r[f.yearmonth] ?? "").includes(q) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), yearmonth: String(selectedItem[f.yearmonth] ?? ""), printcount: String(selectedItem[f.printcount] ?? ""), tonercount: String(selectedItem[f.tonercount] ?? ""), papercount: String(selectedItem[f.papercount] ?? ""), consumablecost: String(selectedItem[f.consumablecost] ?? ""), equipment_id: String(selectedItem[f.equipmentId] ?? "") }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("明細名は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.yearmonth]: editForm.yearmonth }
    if (editForm.printcount) data[f.printcount] = Number(editForm.printcount)
    if (editForm.tonercount) data[f.tonercount] = Number(editForm.tonercount)
    if (editForm.papercount) data[f.papercount] = Number(editForm.papercount)
    if (editForm.consumablecost) data[f.consumablecost] = Number(editForm.consumablecost)
    if (editForm.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${editForm.equipment_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("消費実績を更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("明細名は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.yearmonth]: formData.yearmonth }
    if (formData.printcount) data[f.printcount] = Number(formData.printcount)
    if (formData.tonercount) data[f.tonercount] = Number(formData.tonercount)
    if (formData.papercount) data[f.papercount] = Number(formData.papercount)
    if (formData.consumablecost) data[f.consumablecost] = Number(formData.consumablecost)
    if (formData.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${formData.equipment_id})`
    try { await createM.mutateAsync(data); toast.success("消費実績を作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("消費実績を削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">消費実績</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">消費実績</h1><p className="text-muted-foreground text-sm mt-1">機器の月次消費実績</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>消費実績一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="relative w-full sm:max-w-md mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="明細名・年月で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[25%]">明細名</TableHead><TableHead className="w-[12%]">年月</TableHead><TableHead className="w-[15%] text-right">印刷枚数</TableHead><TableHead className="w-[15%] text-right">トナー</TableHead><TableHead className="w-[15%] text-right">用紙</TableHead><TableHead className="w-[18%] text-right">コスト</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">消費実績がありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell><TableCell>{String(item[f.yearmonth] ?? "")}</TableCell>
                <TableCell className="text-right">{num(item[f.printcount])}</TableCell><TableCell className="text-right">{num(item[f.tonercount])}</TableCell><TableCell className="text-right">{num(item[f.papercount])}</TableCell><TableCell className="text-right">{num(item[f.consumablecost])}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="明細名">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="年月">{String(selectedItem[f.yearmonth] ?? "")}</DetailField><DetailField label="機器">{eqName(selectedItem)}</DetailField><DetailField label="印刷枚数">{num(selectedItem[f.printcount])}</DetailField><DetailField label="トナー消費数">{num(selectedItem[f.tonercount])}</DetailField><DetailField label="用紙消費数">{num(selectedItem[f.papercount])}</DetailField><DetailField label="消耗品コスト">{num(selectedItem[f.consumablecost])}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>明細名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>年月</Label><Input value={editForm.yearmonth} onChange={updE("yearmonth")} placeholder="2026-01" /></div><div className="space-y-1.5"><Label>機器</Label><Select value={editForm.equipment_id} onValueChange={v => setEditForm(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器を選択" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>印刷枚数</Label><Input type="number" value={editForm.printcount} onChange={updE("printcount")} /></div><div className="space-y-1.5"><Label>トナー消費数</Label><Input type="number" value={editForm.tonercount} onChange={updE("tonercount")} /></div><div className="space-y-1.5"><Label>用紙消費数</Label><Input type="number" value={editForm.papercount} onChange={updE("papercount")} /></div><div className="space-y-1.5"><Label>消耗品コスト</Label><Input type="number" value={editForm.consumablecost} onChange={updE("consumablecost")} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="消費実績新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label>明細名 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="明細名" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>年月</Label><Input value={formData.yearmonth} onChange={upd("yearmonth")} placeholder="2026-01" /></div><div className="space-y-1.5"><Label>機器</Label><Select value={formData.equipment_id} onValueChange={v => setFormData(p => ({ ...p, equipment_id: v }))}><SelectTrigger><SelectValue placeholder="機器を選択" /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={String(e[fe.id])} value={String(e[fe.id])}>{String(e[fe.name])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>印刷枚数</Label><Input type="number" value={formData.printcount} onChange={upd("printcount")} /></div><div className="space-y-1.5"><Label>トナー</Label><Input type="number" value={formData.tonercount} onChange={upd("tonercount")} /></div><div className="space-y-1.5"><Label>用紙</Label><Input type="number" value={formData.papercount} onChange={upd("papercount")} /></div><div className="space-y-1.5"><Label>コスト</Label><Input type="number" value={formData.consumablecost} onChange={upd("consumablecost")} /></div></FormColumns>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="消費実績を削除" description="この消費実績を削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
