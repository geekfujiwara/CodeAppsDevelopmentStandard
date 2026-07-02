import { useState } from "react"
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
import { useEngineers, useCreateEngineer, useUpdateEngineer, useDeleteEngineer, useAreas, useSystemUsers } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { SKILL_LEVEL_LABEL, SKILL_LEVEL_COLOR, SKILL_LEVEL_OPTIONS, WORK_STATUS_LABEL, WORK_STATUS_COLOR, WORK_STATUS_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = { id: `${P}_engineerid`, name: `${P}_name`, area: `${P}_area`, skill: `${P}_skill`, skilllevel: `${P}_skilllevel`, workstatus: `${P}_workstatus`, areaid: `_${P}_areaid_value`, userid: `_${P}_userid_value` }

function SkillBadge({ v }: { v: number }) { const label = SKILL_LEVEL_LABEL[v as keyof typeof SKILL_LEVEL_LABEL] ?? String(v); const color = SKILL_LEVEL_COLOR[v as keyof typeof SKILL_LEVEL_COLOR] ?? "bg-gray-100 text-gray-600"; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }
function StatusBadge({ v }: { v: number }) { const label = WORK_STATUS_LABEL[v as keyof typeof WORK_STATUS_LABEL] ?? String(v); const color = WORK_STATUS_COLOR[v as keyof typeof WORK_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

type FormData = { name: string; area: string; areaid: string; userid: string; skill: string; skilllevel: string; workstatus: string }
const EMPTY: FormData = { name: "", area: "", areaid: "", userid: "", skill: "", skilllevel: "", workstatus: "" }
const PER_PAGE = 10

export default function EngineersPage() {
  const { data: rows = [], isLoading } = useEngineers()
  const { data: areas = [] } = useAreas()
  const { data: systemUsers = [] } = useSystemUsers()
  const createM = useCreateEngineer()
  const updateM = useUpdateEngineer()
  const deleteM = useDeleteEngineer()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterLevel, setFilterLevel] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const filtered = rows.filter(r => { const q = search.toLowerCase(); const areaName = areas.find(a => String(a[`${P}_areaid`]) === String(r[f.areaid] ?? ""))?.[`${P}_name`] ?? r[f.area] ?? ""; return (!q || String(r[f.name] ?? "").toLowerCase().includes(q) || String(areaName).toLowerCase().includes(q)) && (filterLevel === "all" || String(r[f.skilllevel]) === filterLevel) && (filterStatus === "all" || String(r[f.workstatus]) === filterStatus) })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const start = (page - 1) * PER_PAGE
  const paginated = filtered.slice(start, start + PER_PAGE)

  const handleRowClick = (item: Record<string, unknown>) => { setSelectedItem(item); setIsEditing(false) }
  const handleEdit = () => { if (!selectedItem) return; setEditForm({ name: String(selectedItem[f.name] ?? ""), area: String(selectedItem[f.area] ?? ""), areaid: String(selectedItem[f.areaid] ?? ""), userid: String(selectedItem[f.userid] ?? ""), skill: String(selectedItem[f.skill] ?? ""), skilllevel: selectedItem[f.skilllevel] != null ? String(selectedItem[f.skilllevel]) : "", workstatus: selectedItem[f.workstatus] != null ? String(selectedItem[f.workstatus]) : "" }); setIsEditing(true) }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("CE名は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = { [f.name]: editForm.name, [f.skill]: editForm.skill }
    if (editForm.skilllevel) data[f.skilllevel] = Number(editForm.skilllevel)
    if (editForm.workstatus) data[f.workstatus] = Number(editForm.workstatus)
    if (editForm.areaid) data[`${P}_areaid@odata.bind`] = `/${P}_areas(${editForm.areaid})`
    if (editForm.userid) data[`${P}_userid@odata.bind`] = `/systemusers(${editForm.userid})`
    try { await updateM.mutateAsync({ id, data }); toast.success("CEを更新しました"); setSelectedItem({ ...selectedItem, ...data, [f.areaid]: editForm.areaid, [f.userid]: editForm.userid }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleNew = () => { setFormData(EMPTY); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("CE名は必須です"); return }
    const data: Record<string, unknown> = { [f.name]: formData.name, [f.skill]: formData.skill }
    if (formData.skilllevel) data[f.skilllevel] = Number(formData.skilllevel)
    if (formData.workstatus) data[f.workstatus] = Number(formData.workstatus)
    if (formData.areaid) data[`${P}_areaid@odata.bind`] = `/${P}_areas(${formData.areaid})`
    if (formData.userid) data[`${P}_userid@odata.bind`] = `/systemusers(${formData.userid})`
    try { await createM.mutateAsync(data); toast.success("CEを作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("CEを削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">カスタマーエンジニア</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">カスタマーエンジニア</h1><p className="text-muted-foreground text-sm mt-1">CE マスタの管理</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>CE 一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="CE名・エリアで検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterLevel} onValueChange={v => { setFilterLevel(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="スキルレベル" /></SelectTrigger><SelectContent><SelectItem value="all">すべてのレベル</SelectItem>{SKILL_LEVEL_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="稼働状況" /></SelectTrigger><SelectContent><SelectItem value="all">すべての状況</SelectItem>{WORK_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[22%]">CE名</TableHead><TableHead className="w-[18%]">エリア</TableHead><TableHead className="w-[18%]">スキルレベル</TableHead><TableHead className="w-[15%]">稼働状況</TableHead><TableHead className="w-[27%]">スキル</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">CEがありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell><TableCell>{areas.find(a => String(a[`${P}_areaid`]) === String(item[f.areaid] ?? ""))?.[`${P}_name`] as string ?? String(item[f.area] ?? "")}</TableCell>
                <TableCell>{item[f.skilllevel] != null && <SkillBadge v={item[f.skilllevel] as number} />}</TableCell>
                <TableCell>{item[f.workstatus] != null && <StatusBadge v={item[f.workstatus] as number} />}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">{String(item[f.skill] ?? "")}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? <DetailGrid><DetailField label="CE名">{String(selectedItem[f.name] ?? "")}</DetailField><DetailField label="担当エリア">{areas.find(a => String(a[`${P}_areaid`]) === String(selectedItem[f.areaid] ?? ""))?.[`${P}_name`] as string ?? String(selectedItem[f.area] ?? "")}</DetailField><DetailField label="ユーザー">{systemUsers.find(u => String(u.systemuserid) === String(selectedItem[f.userid] ?? ""))?.fullname as string ?? "未割当"}</DetailField><DetailField label="スキルレベル">{selectedItem[f.skilllevel] != null ? <SkillBadge v={selectedItem[f.skilllevel] as number} /> : null}</DetailField><DetailField label="稼働状況">{selectedItem[f.workstatus] != null ? <StatusBadge v={selectedItem[f.workstatus] as number} /> : null}</DetailField><DetailField label="保有スキル">{String(selectedItem[f.skill] ?? "")}</DetailField></DetailGrid> : null}
        editContent={<div className="space-y-4"><div className="space-y-1.5"><Label>CE名 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div><div className="space-y-1.5"><Label>担当エリア</Label><Select value={editForm.areaid} onValueChange={v => setEditForm(p => ({ ...p, areaid: v }))}><SelectTrigger><SelectValue placeholder="エリアを選択" /></SelectTrigger><SelectContent>{areas.map(a => <SelectItem key={String(a[`${P}_areaid`])} value={String(a[`${P}_areaid`])}>{String(a[`${P}_name`])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>ユーザー</Label><Select value={editForm.userid} onValueChange={v => setEditForm(p => ({ ...p, userid: v }))}><SelectTrigger><SelectValue placeholder="ユーザーを選択" /></SelectTrigger><SelectContent>{systemUsers.map(u => <SelectItem key={String(u.systemuserid)} value={String(u.systemuserid)}>{String(u.fullname)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>スキルレベル</Label><Select value={editForm.skilllevel} onValueChange={v => setEditForm(p => ({ ...p, skilllevel: v }))}><SelectTrigger><SelectValue placeholder="レベルを選択" /></SelectTrigger><SelectContent>{SKILL_LEVEL_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>稼働状況</Label><Select value={editForm.workstatus} onValueChange={v => setEditForm(p => ({ ...p, workstatus: v }))}><SelectTrigger><SelectValue placeholder="状況を選択" /></SelectTrigger><SelectContent>{WORK_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>保有スキル</Label><Textarea value={editForm.skill} onChange={updE("skill")} rows={3} /></div></div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="CE新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6"><div className="space-y-1.5"><Label htmlFor="e-name">CE名 <span className="text-destructive">*</span></Label><Input id="e-name" value={formData.name} onChange={upd("name")} placeholder="CE名を入力" /></div>
          <FormColumns columns={2}><div className="space-y-1.5"><Label>担当エリア</Label><Select value={formData.areaid} onValueChange={v => setFormData(p => ({ ...p, areaid: v }))}><SelectTrigger><SelectValue placeholder="エリアを選択" /></SelectTrigger><SelectContent>{areas.map(a => <SelectItem key={String(a[`${P}_areaid`])} value={String(a[`${P}_areaid`])}>{String(a[`${P}_name`])}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>ユーザー</Label><Select value={formData.userid} onValueChange={v => setFormData(p => ({ ...p, userid: v }))}><SelectTrigger><SelectValue placeholder="ユーザーを選択" /></SelectTrigger><SelectContent>{systemUsers.map(u => <SelectItem key={String(u.systemuserid)} value={String(u.systemuserid)}>{String(u.fullname)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>スキルレベル</Label><Select value={formData.skilllevel} onValueChange={v => setFormData(p => ({ ...p, skilllevel: v }))}><SelectTrigger><SelectValue placeholder="レベルを選択" /></SelectTrigger><SelectContent>{SKILL_LEVEL_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>稼働状況</Label><Select value={formData.workstatus} onValueChange={v => setFormData(p => ({ ...p, workstatus: v }))}><SelectTrigger><SelectValue placeholder="状況を選択" /></SelectTrigger><SelectContent>{WORK_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div></FormColumns>
          <div className="space-y-1.5"><Label htmlFor="e-skill">保有スキル</Label><Textarea id="e-skill" value={formData.skill} onChange={upd("skill")} placeholder="保有スキル・資格など" rows={3} /></div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="CEを削除" description="このCEを削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
