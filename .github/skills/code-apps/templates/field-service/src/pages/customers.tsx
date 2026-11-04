import { useState } from "react"
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
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { SLA_TIER_LABEL, SLA_TIER_COLOR, SLA_TIER_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_customerid`, name: `${P}_name`, address: `${P}_address`, phone: `${P}_phone`, email: `${P}_email`, satier: `${P}_satier` }

function TierBadge({ v }: { v: number }) {
  const label = SLA_TIER_LABEL[v as keyof typeof SLA_TIER_LABEL] ?? String(v)
  const color = SLA_TIER_COLOR[v as keyof typeof SLA_TIER_COLOR] ?? "bg-gray-100 text-gray-600"
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
}

type FormData = { name: string; address: string; phone: string; email: string; satier: string }
const EMPTY: FormData = { name: "", address: "", phone: "", email: "", satier: "" }
const PER_PAGE = 10

export default function CustomersPage() {
  const { data: rows = [], isLoading } = useCustomers()
  const createM = useCreateCustomer()
  const updateM = useUpdateCustomer()
  const deleteM = useDeleteCustomer()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterTier, setFilterTier] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return (!q || String(r[f.name] ?? "").toLowerCase().includes(q) || String(r[f.email] ?? "").toLowerCase().includes(q)) && (filterTier === "all" || String(r[f.satier]) === filterTier)
  })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => {
    if (!selectedItem) return
    setEditForm({ name: String(selectedItem[f.name] ?? ""), address: String(selectedItem[f.address] ?? ""), phone: String(selectedItem[f.phone] ?? ""), email: String(selectedItem[f.email] ?? ""), satier: selectedItem[f.satier] != null ? String(selectedItem[f.satier]) : "" })
    setIsEditing(true)
  }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("顧客名は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.address]: editForm.address, [f.phone]: editForm.phone, [f.email]: editForm.email }
    if (editForm.satier) data[f.satier] = Number(editForm.satier)
    try { await updateM.mutateAsync({ id, data }); toast.success("顧客を更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) }
    catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("顧客名は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.address]: formData.address, [f.phone]: formData.phone, [f.email]: formData.email }
    if (formData.satier) data[f.satier] = Number(formData.satier)
    try { await createM.mutateAsync(data); toast.success("顧客を作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => {
    if (!deleteId) return
    try { await deleteM.mutateAsync(deleteId); toast.success("顧客を削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") }
  }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">顧客</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-foreground">顧客</h1><p className="text-muted-foreground text-sm mt-1">顧客マスタの管理</p></div>
          <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button>
        </div>
        <Card>
          <CardHeader><CardTitle>顧客一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="顧客名・メールで検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
              <Select value={filterTier} onValueChange={v => { setFilterTier(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="SLAティア" /></SelectTrigger><SelectContent><SelectItem value="all">すべてのティア</SelectItem>{SLA_TIER_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[22%]">顧客名</TableHead><TableHead className="w-[13%]">SLAティア</TableHead><TableHead className="w-[18%]">電話</TableHead><TableHead className="w-[25%]">メール</TableHead><TableHead className="w-[22%]">住所</TableHead></TableRow></TableHeader><TableBody>
              {paginated.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">顧客がありません</TableCell></TableRow> : paginated.map((item, i) => (
                <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                  <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell>
                  <TableCell>{item[f.satier] != null && <TierBadge v={item[f.satier] as number} />}</TableCell>
                  <TableCell>{String(item[f.phone] ?? "")}</TableCell>
                  <TableCell className="text-muted-foreground">{String(item[f.email] ?? "")}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">{String(item[f.address] ?? "")}</TableCell>
                </TableRow>))}
            </TableBody></Table></div>
            {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
          </CardContent>
        </Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="顧客名">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="SLAティア">{selectedItem[f.satier] != null ? <TierBadge v={selectedItem[f.satier] as number} /> : null}</DetailField><DetailField label="電話">{String(selectedItem[f.phone] ?? "")}</DetailField><DetailField label="メール">{String(selectedItem[f.email] ?? "")}</DetailField><DetailField label="住所">{String(selectedItem[f.address] ?? "")}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>顧客名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>SLAティア</Label><Select value={editForm.satier} onValueChange={v => setEditForm(p => ({ ...p, satier: v }))}><SelectTrigger><SelectValue placeholder="ティアを選択" /></SelectTrigger><SelectContent>{SLA_TIER_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>電話</Label><Input value={editForm.phone} onChange={updE("phone")} /></div><div className="space-y-1.5"><Label>メール</Label><Input type="email" value={editForm.email} onChange={updE("email")} /></div><div className="space-y-1.5"><Label>住所</Label><Input value={editForm.address} onChange={updE("address")} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="顧客新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label htmlFor="c-name">顧客名 <span className="text-destructive">*</span></Label><Input id="c-name" value={formData.name} onChange={upd("name")} placeholder="顧客名を入力" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>SLAティア</Label><Select value={formData.satier} onValueChange={v => setFormData(p => ({ ...p, satier: v }))}><SelectTrigger><SelectValue placeholder="ティアを選択" /></SelectTrigger><SelectContent>{SLA_TIER_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="c-phone">電話</Label><Input id="c-phone" value={formData.phone} onChange={upd("phone")} placeholder="電話番号" /></div><div className="space-y-1.5"><Label htmlFor="c-email">メール</Label><Input id="c-email" type="email" value={formData.email} onChange={upd("email")} placeholder="メールアドレス" /></div><div className="space-y-1.5"><Label htmlFor="c-address">住所</Label><Input id="c-address" value={formData.address} onChange={upd("address")} placeholder="住所" /></div></FormColumns>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="顧客を削除" description="この顧客を削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
