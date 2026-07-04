import { useState, useMemo, useCallback, useEffect } from "react"
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
import { useWorkOrders, useCreateWorkOrder, useUpdateWorkOrder, useDeleteWorkOrder, useCalls, useEngineers, useReports, useCustomers } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { WORK_ORDER_TYPE_LABEL, WORK_ORDER_TYPE_COLOR, WORK_ORDER_TYPE_OPTIONS, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, WORK_ORDER_STATUS_OPTIONS } from "@/types/dataverse"
import { Plus, Search, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const f = {
  id: `${P}_workorderid`, name: `${P}_name`, worktype: `${P}_worktype`,
  scheduleddate: `${P}_scheduleddate`, status: `${P}_status`, workdetail: `${P}_workdetail`,
  callId: `_${P}_callid_value`, engineerId: `_${P}_engineerid_value`,
  // 日報リニューアル追加フィールド
  customersigned: `${P}_customersigned`, dailyreportId: `_${P}_dailyreportid_value`,
  customerId: `_${P}_customerid_value`,
  installationlocation: `${P}_installationlocation`, modeltype: `${P}_modeltype`,
  serialnumber: `${P}_serialnumber`, faultsummary: `${P}_faultsummary`,
  symptoms: `${P}_symptoms`, errorcode: `${P}_errorcode`, faultpart: `${P}_faultpart`,
  estimatedcause: `${P}_estimatedcause`, countermeasure: `${P}_countermeasure`,
  replacedparts: `${P}_replacedparts`, workstart: `${P}_workstart`, workend: `${P}_workend`,
  worktime: `${P}_worktime`, prevention: `${P}_prevention`,
  satisfaction: `${P}_satisfaction`, notes: `${P}_notes`, visittime: `${P}_visittime`,
}
const fca = { id: `${P}_callid`, name: `${P}_name` }
const fce = { id: `${P}_engineerid`, name: `${P}_name` }
const fdr = { id: `${P}_maintenancereportid`, name: `${P}_name` }
const fc = { id: `${P}_customerid`, name: `${P}_name` }

function Badge({ label, color }: { label: string; color: string }) { return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span> }

type FormData = {
  name: string; worktype: string; scheduleddate: string; status: string; workdetail: string;
  call_id: string; engineer_id: string; dailyreport_id: string; customer_id: string;
  customersigned: boolean;
  installationlocation: string; modeltype: string; serialnumber: string;
  faultsummary: string; symptoms: string; errorcode: string; faultpart: string;
  estimatedcause: string; countermeasure: string; replacedparts: string;
  workstart: string; workend: string; worktime: string; prevention: string;
  satisfaction: string; notes: string; visittime: string;
}
const EMPTY: FormData = {
  name: "", worktype: "", scheduleddate: "", status: "", workdetail: "",
  call_id: "", engineer_id: "", dailyreport_id: "", customer_id: "",
  customersigned: false,
  installationlocation: "", modeltype: "", serialnumber: "",
  faultsummary: "", symptoms: "", errorcode: "", faultpart: "",
  estimatedcause: "", countermeasure: "", replacedparts: "",
  workstart: "", workend: "", worktime: "", prevention: "",
  satisfaction: "", notes: "", visittime: "",
}
const PER_PAGE = 10

export default function WorkOrdersPage() {
  const { data: rows = [], isLoading: l1 } = useWorkOrders()
  const { data: calls = [], isLoading: l2 } = useCalls()
  const { data: engineers = [], isLoading: l3 } = useEngineers()
  const { data: reports = [], isLoading: l4 } = useReports()
  const { data: customers = [], isLoading: l5 } = useCustomers()
  const isLoading = l1 || l2 || l3 || l4 || l5
  const createM = useCreateWorkOrder()
  const updateM = useUpdateWorkOrder()
  const deleteM = useDeleteWorkOrder()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterType, setFilterType] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)

  const callMap = useMemo(() => new Map(calls.map(c => [String(c[fca.id] ?? ""), String(c[fca.name] ?? "")])), [calls])
  const engMap = useMemo(() => new Map(engineers.map(e => [String(e[fce.id] ?? ""), String(e[fce.name] ?? "")])), [engineers])
  const reportMap = useMemo(() => new Map(reports.map(r => [String(r[fdr.id] ?? ""), String(r[fdr.name] ?? "")])), [reports])
  const custMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const callName = (item: Record<string, unknown>) => callMap.get(String(item[f.callId] ?? "")) ?? ""
  const engName = (item: Record<string, unknown>) => engMap.get(String(item[f.engineerId] ?? "")) ?? ""
  const reportName = (item: Record<string, unknown>) => reportMap.get(String(item[f.dailyreportId] ?? "")) ?? ""
  const custName = (item: Record<string, unknown>) => custMap.get(String(item[f.customerId] ?? "")) ?? ""

  const filtered = rows.filter(r => { const q = search.toLowerCase(); return (!q || String(r[f.name] ?? "").toLowerCase().includes(q) || String(r[f.faultsummary] ?? "").toLowerCase().includes(q)) && (filterStatus === "all" || String(r[f.status]) === filterStatus) && (filterType === "all" || String(r[f.worktype]) === filterType) })
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
  const handleEdit = () => {
    if (!selectedItem) return
    setEditForm({
      name: String(selectedItem[f.name] ?? ""), worktype: selectedItem[f.worktype] != null ? String(selectedItem[f.worktype]) : "",
      scheduleddate: String(selectedItem[f.scheduleddate] ?? "").slice(0, 16), status: selectedItem[f.status] != null ? String(selectedItem[f.status]) : "",
      workdetail: String(selectedItem[f.workdetail] ?? ""), call_id: String(selectedItem[f.callId] ?? ""),
      engineer_id: String(selectedItem[f.engineerId] ?? ""), dailyreport_id: String(selectedItem[f.dailyreportId] ?? ""),
      customer_id: String(selectedItem[f.customerId] ?? ""), customersigned: !!selectedItem[f.customersigned],
      installationlocation: String(selectedItem[f.installationlocation] ?? ""), modeltype: String(selectedItem[f.modeltype] ?? ""),
      serialnumber: String(selectedItem[f.serialnumber] ?? ""), faultsummary: String(selectedItem[f.faultsummary] ?? ""),
      symptoms: String(selectedItem[f.symptoms] ?? ""), errorcode: String(selectedItem[f.errorcode] ?? ""),
      faultpart: String(selectedItem[f.faultpart] ?? ""), estimatedcause: String(selectedItem[f.estimatedcause] ?? ""),
      countermeasure: String(selectedItem[f.countermeasure] ?? ""), replacedparts: String(selectedItem[f.replacedparts] ?? ""),
      workstart: String(selectedItem[f.workstart] ?? "").slice(0, 16), workend: String(selectedItem[f.workend] ?? "").slice(0, 16),
      worktime: String(selectedItem[f.worktime] ?? ""), prevention: String(selectedItem[f.prevention] ?? ""),
      satisfaction: String(selectedItem[f.satisfaction] ?? ""), notes: String(selectedItem[f.notes] ?? ""),
      visittime: String(selectedItem[f.visittime] ?? "").slice(0, 16),
    })
    setIsEditing(true)
  }
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.name.trim()) { toast.error("オーダー番号は必須です"); return }
    const id = String(selectedItem[f.id] ?? "")
    const data: Record<string, unknown> = {
      [f.name]: editForm.name, [f.workdetail]: editForm.workdetail, [f.customersigned]: editForm.customersigned,
      [f.installationlocation]: editForm.installationlocation, [f.modeltype]: editForm.modeltype,
      [f.serialnumber]: editForm.serialnumber, [f.faultsummary]: editForm.faultsummary,
      [f.symptoms]: editForm.symptoms, [f.errorcode]: editForm.errorcode, [f.faultpart]: editForm.faultpart,
      [f.estimatedcause]: editForm.estimatedcause, [f.countermeasure]: editForm.countermeasure,
      [f.replacedparts]: editForm.replacedparts, [f.prevention]: editForm.prevention, [f.notes]: editForm.notes,
    }
    if (editForm.worktype) data[f.worktype] = Number(editForm.worktype)
    if (editForm.status) data[f.status] = Number(editForm.status)
    if (editForm.scheduleddate) data[f.scheduleddate] = new Date(editForm.scheduleddate).toISOString()
    if (editForm.workstart) data[f.workstart] = new Date(editForm.workstart).toISOString()
    if (editForm.workend) data[f.workend] = new Date(editForm.workend).toISOString()
    if (editForm.worktime) data[f.worktime] = Number(editForm.worktime)
    if (editForm.satisfaction) data[f.satisfaction] = Number(editForm.satisfaction)
    if (editForm.visittime) data[f.visittime] = new Date(editForm.visittime).toISOString()
    if (editForm.call_id) data[`${P}_callid@odata.bind`] = `/${P}_calls(${editForm.call_id})`
    if (editForm.engineer_id) data[`${P}_engineerid@odata.bind`] = `/${P}_engineers(${editForm.engineer_id})`
    if (editForm.dailyreport_id) data[`${P}_dailyreportid@odata.bind`] = `/${P}_maintenancereports(${editForm.dailyreport_id})`
    if (editForm.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${editForm.customer_id})`
    try { await updateM.mutateAsync({ id, data }); toast.success("作業オーダーを更新しました"); setSelectedItem({ ...selectedItem, ...data }); setIsEditing(false) } catch { toast.error("保存に失敗しました") }
  }
  // 自動採番: WO-YYYYMMDD-NNN
  const generateOrderNumber = useCallback(() => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`
    const prefix = `WO-${dateStr}-`
    const todayOrders = rows.filter(r => String(r[f.name] ?? "").startsWith(prefix))
    const nextNum = todayOrders.length + 1
    return `${prefix}${String(nextNum).padStart(3, "0")}`
  }, [rows])

  const handleNew = () => { setFormData({ ...EMPTY, name: generateOrderNumber() }); setIsFormOpen(true) }
  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("オーダー番号は必須です"); return }
    const data: Record<string, unknown> = {
      [f.name]: formData.name, [f.workdetail]: formData.workdetail, [f.customersigned]: formData.customersigned,
      [f.installationlocation]: formData.installationlocation, [f.modeltype]: formData.modeltype,
      [f.serialnumber]: formData.serialnumber, [f.faultsummary]: formData.faultsummary,
      [f.symptoms]: formData.symptoms, [f.errorcode]: formData.errorcode, [f.faultpart]: formData.faultpart,
      [f.estimatedcause]: formData.estimatedcause, [f.countermeasure]: formData.countermeasure,
      [f.replacedparts]: formData.replacedparts, [f.prevention]: formData.prevention, [f.notes]: formData.notes,
    }
    if (formData.worktype) data[f.worktype] = Number(formData.worktype)
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.scheduleddate) data[f.scheduleddate] = new Date(formData.scheduleddate).toISOString()
    if (formData.workstart) data[f.workstart] = new Date(formData.workstart).toISOString()
    if (formData.workend) data[f.workend] = new Date(formData.workend).toISOString()
    if (formData.worktime) data[f.worktime] = Number(formData.worktime)
    if (formData.satisfaction) data[f.satisfaction] = Number(formData.satisfaction)
    if (formData.visittime) data[f.visittime] = new Date(formData.visittime).toISOString()
    if (formData.call_id) data[`${P}_callid@odata.bind`] = `/${P}_calls(${formData.call_id})`
    if (formData.engineer_id) data[`${P}_engineerid@odata.bind`] = `/${P}_engineers(${formData.engineer_id})`
    if (formData.dailyreport_id) data[`${P}_dailyreportid@odata.bind`] = `/${P}_maintenancereports(${formData.dailyreport_id})`
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    try { await createM.mutateAsync(data); toast.success("作業オーダーを作成しました"); setIsFormOpen(false) } catch { toast.error("保存に失敗しました") }
  }
  const handleDelete = async () => { if (!deleteId) return; try { await deleteM.mutateAsync(deleteId); toast.success("作業オーダーを削除しました"); if (selectedItem && String(selectedItem[f.id]) === deleteId) setSelectedItem(null); setDeleteId(null) } catch { toast.error("削除に失敗しました") } }
  const upd = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))
  const updE = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  if (isLoading) return <div className="space-y-6"><h1 className="text-2xl font-bold">作業オーダー</h1><LoadingSkeletonList count={5} /></div>

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">作業オーダー</h1><p className="text-muted-foreground text-sm mt-1">作業オーダー（故障対応明細）の管理</p></div><Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />新規作成</Button></div>
        <Card><CardHeader><CardTitle>オーダー一覧</CardTitle><CardDescription>{filtered.length} 件</CardDescription></CardHeader><CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="オーダー番号・故障概要で検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" /></div>
            <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="作業種別" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{WORK_ORDER_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1) }}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem>{WORK_ORDER_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="rounded-md border overflow-hidden"><Table className="table-fixed w-full"><TableHeader><TableRow><TableHead className="w-[20%]">オーダー番号</TableHead><TableHead className="w-[15%]">作業種別</TableHead><TableHead className="w-[13%]">ステータス</TableHead><TableHead className="w-[22%]">顧客</TableHead><TableHead className="w-[20%]">担当CE</TableHead><TableHead className="w-[10%]">署名</TableHead></TableRow></TableHeader><TableBody>
            {paginated.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">作業オーダーがありません</TableCell></TableRow> : paginated.map((item, i) => (
              <TableRow key={i} className={cn("cursor-pointer hover:bg-muted/50", selectedItem && String(selectedItem[f.id]) === String(item[f.id]) && "bg-muted")} onClick={() => handleRowClick(item)}>
                <TableCell className="font-medium">{String(item[f.name] ?? "")}</TableCell>
                <TableCell>{item[f.worktype] != null && <Badge label={WORK_ORDER_TYPE_LABEL[item[f.worktype] as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""} color={WORK_ORDER_TYPE_COLOR[item[f.worktype] as keyof typeof WORK_ORDER_TYPE_COLOR] ?? "bg-gray-100 text-gray-600"} />}</TableCell>
                <TableCell>{item[f.status] != null && <Badge label={WORK_ORDER_STATUS_LABEL[item[f.status] as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""} color={WORK_ORDER_STATUS_COLOR[item[f.status] as keyof typeof WORK_ORDER_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"} />}</TableCell>
                <TableCell>{custName(item)}</TableCell>
                <TableCell>{engName(item)}</TableCell>
                <TableCell>{item[f.customersigned] ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
              </TableRow>))}
          </TableBody></Table></div>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><span className="text-sm text-muted-foreground">{filtered.length} 件中 {start + 1}-{Math.min(start + PER_PAGE, filtered.length)} 件を表示</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" />前へ</Button>{Array.from({ length: totalPages }, (_, i) => i + 1).map(n => <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-8 h-8 p-0">{n}</Button>)}<Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>次へ<ChevronRight className="h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </div>
      <DetailPanel open={!!selectedItem} onClose={() => { setSelectedItem(null); setIsEditing(false) }} title={selectedItem ? String(selectedItem[f.name] ?? "") : ""} isEditing={isEditing} onEdit={handleEdit} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} onDelete={() => { if (selectedItem) setDeleteId(String(selectedItem[f.id] ?? "")) }} isSaving={updateM.isPending}
        viewContent={selectedItem ? (
          <div className="space-y-5">
            <DetailGrid>
              <DetailField label="オーダー番号">{String(selectedItem[f.name] ?? "")}</DetailField>
              <DetailField label="作業種別">{selectedItem[f.worktype] != null ? <Badge label={WORK_ORDER_TYPE_LABEL[selectedItem[f.worktype] as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""} color={WORK_ORDER_TYPE_COLOR[selectedItem[f.worktype] as keyof typeof WORK_ORDER_TYPE_COLOR] ?? ""} /> : null}</DetailField>
              <DetailField label="ステータス">{selectedItem[f.status] != null ? <Badge label={WORK_ORDER_STATUS_LABEL[selectedItem[f.status] as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""} color={WORK_ORDER_STATUS_COLOR[selectedItem[f.status] as keyof typeof WORK_ORDER_STATUS_COLOR] ?? ""} /> : null}</DetailField>
              <DetailField label="顧客">{custName(selectedItem)}</DetailField>
              <DetailField label="担当CE">{engName(selectedItem)}</DetailField>
              <DetailField label="コール">{callName(selectedItem)}</DetailField>
              <DetailField label="日報">{reportName(selectedItem)}</DetailField>
              <DetailField label="顧客署名">{selectedItem[f.customersigned] ? <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-4 w-4" />署名済</span> : <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><AlertCircle className="h-4 w-4" />未署名</span>}</DetailField>
            </DetailGrid>
            {/* 故障対応詳細 */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">故障対応詳細</h4>
              <DetailGrid>
                <DetailField label="訪問時刻">{String(selectedItem[f.visittime] ?? "").slice(11, 16)}</DetailField>
                <DetailField label="設置場所">{String(selectedItem[f.installationlocation] ?? "")}</DetailField>
                <DetailField label="機種/型番">{String(selectedItem[f.modeltype] ?? "")}</DetailField>
                <DetailField label="シリアルNo.">{String(selectedItem[f.serialnumber] ?? "")}</DetailField>
                <DetailField label="故障概要">{String(selectedItem[f.faultsummary] ?? "")}</DetailField>
                <DetailField label="症状">{String(selectedItem[f.symptoms] ?? "")}</DetailField>
                <DetailField label="エラーコード">{String(selectedItem[f.errorcode] ?? "")}</DetailField>
                <DetailField label="故障部位/部品">{String(selectedItem[f.faultpart] ?? "")}</DetailField>
                <DetailField label="推定原因">{String(selectedItem[f.estimatedcause] ?? "")}</DetailField>
                <DetailField label="実施した対策">{String(selectedItem[f.countermeasure] ?? "")}</DetailField>
                <DetailField label="交換部品">{String(selectedItem[f.replacedparts] ?? "")}</DetailField>
                <DetailField label="作業開始">{String(selectedItem[f.workstart] ?? "").slice(11, 16)}</DetailField>
                <DetailField label="作業終了">{String(selectedItem[f.workend] ?? "").slice(11, 16)}</DetailField>
                <DetailField label="作業時間">{selectedItem[f.worktime] ? `${selectedItem[f.worktime]}分` : ""}</DetailField>
                <DetailField label="再発防止策">{String(selectedItem[f.prevention] ?? "")}</DetailField>
                <DetailField label="満足度">{selectedItem[f.satisfaction] ? `${selectedItem[f.satisfaction]}/5` : ""}</DetailField>
                <DetailField label="備考">{String(selectedItem[f.notes] ?? "")}</DetailField>
              </DetailGrid>
            </div>
          </div>
        ) : null}
        editContent={<div className="space-y-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">基本情報</h4>
          <div className="space-y-1.5"><Label>オーダー番号 <span className="text-destructive">*</span></Label><Input value={editForm.name} onChange={updE("name")} /></div>
          <div className="space-y-1.5"><Label>作業種別</Label><Select value={editForm.worktype} onValueChange={v => setEditForm(p => ({ ...p, worktype: v }))}><SelectTrigger><SelectValue placeholder="作業種別" /></SelectTrigger><SelectContent>{WORK_ORDER_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>ステータス</Label><Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent>{WORK_ORDER_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>顧客</Label><Select value={editForm.customer_id} onValueChange={v => setEditForm(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>担当CE</Label><Select value={editForm.engineer_id} onValueChange={v => setEditForm(p => ({ ...p, engineer_id: v }))}><SelectTrigger><SelectValue placeholder="CE" /></SelectTrigger><SelectContent>{engineers.map(e => <SelectItem key={String(e[fce.id])} value={String(e[fce.id])}>{String(e[fce.name])}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>コール</Label><Select value={editForm.call_id} onValueChange={v => setEditForm(p => ({ ...p, call_id: v }))}><SelectTrigger><SelectValue placeholder="コール" /></SelectTrigger><SelectContent>{calls.map(c => <SelectItem key={String(c[fca.id])} value={String(c[fca.id])}>{String(c[fca.name])}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>日報</Label><Select value={editForm.dailyreport_id} onValueChange={v => setEditForm(p => ({ ...p, dailyreport_id: v }))}><SelectTrigger><SelectValue placeholder="日報を選択" /></SelectTrigger><SelectContent>{reports.map(r => <SelectItem key={String(r[fdr.id])} value={String(r[fdr.id])}>{String(r[fdr.name])}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center gap-2"><Checkbox checked={editForm.customersigned} onCheckedChange={v => setEditForm(p => ({ ...p, customersigned: !!v }))} /><Label className="cursor-pointer">顧客署名取得済</Label></div>

          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">故障対応詳細</h4>
          <div className="space-y-1.5"><Label>訪問時刻</Label><Input type="datetime-local" value={editForm.visittime} onChange={updE("visittime")} /></div>
          <div className="space-y-1.5"><Label>設置場所</Label><Input value={editForm.installationlocation} onChange={updE("installationlocation")} /></div>
          <div className="space-y-1.5"><Label>機種/型番</Label><Input value={editForm.modeltype} onChange={updE("modeltype")} /></div>
          <div className="space-y-1.5"><Label>シリアルNo.</Label><Input value={editForm.serialnumber} onChange={updE("serialnumber")} /></div>
          <div className="space-y-1.5"><Label>故障概要</Label><Input value={editForm.faultsummary} onChange={updE("faultsummary")} /></div>
          <div className="space-y-1.5"><Label>症状</Label><Textarea value={editForm.symptoms} onChange={updE("symptoms")} rows={2} /></div>
          <div className="space-y-1.5"><Label>エラーコード</Label><Input value={editForm.errorcode} onChange={updE("errorcode")} /></div>
          <div className="space-y-1.5"><Label>故障部位/部品</Label><Input value={editForm.faultpart} onChange={updE("faultpart")} /></div>
          <div className="space-y-1.5"><Label>推定原因</Label><Textarea value={editForm.estimatedcause} onChange={updE("estimatedcause")} rows={2} /></div>
          <div className="space-y-1.5"><Label>実施した対策</Label><Textarea value={editForm.countermeasure} onChange={updE("countermeasure")} rows={2} /></div>
          <div className="space-y-1.5"><Label>交換部品</Label><Input value={editForm.replacedparts} onChange={updE("replacedparts")} /></div>
          <div className="space-y-1.5"><Label>作業開始</Label><Input type="datetime-local" value={editForm.workstart} onChange={updE("workstart")} /></div>
          <div className="space-y-1.5"><Label>作業終了</Label><Input type="datetime-local" value={editForm.workend} onChange={updE("workend")} /></div>
          <div className="space-y-1.5"><Label>作業時間(分)</Label><Input type="number" value={editForm.worktime} onChange={updE("worktime")} /></div>
          <div className="space-y-1.5"><Label>再発防止策</Label><Textarea value={editForm.prevention} onChange={updE("prevention")} rows={2} /></div>
          <div className="space-y-1.5"><Label>満足度(1-5)</Label><Input type="number" min="1" max="5" value={editForm.satisfaction} onChange={updE("satisfaction")} /></div>
          <div className="space-y-1.5"><Label>備考</Label><Textarea value={editForm.notes} onChange={updE("notes")} rows={2} /></div>
          <div className="space-y-1.5"><Label>作業内容(旧)</Label><Textarea value={editForm.workdetail} onChange={updE("workdetail")} rows={2} /></div>
        </div>}
      />
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="作業オーダー新規作成" onSave={handleCreateSave} isSaving={createM.isPending} maxWidth="2xl">
        <div className="space-y-6">
          <div className="space-y-1.5"><Label>オーダー番号 <span className="text-destructive">*</span></Label><Input value={formData.name} onChange={upd("name")} placeholder="WO-001" /></div>
          <FormColumns columns={2}>
            <div className="space-y-1.5"><Label>作業種別</Label><Select value={formData.worktype} onValueChange={v => setFormData(p => ({ ...p, worktype: v }))}><SelectTrigger><SelectValue placeholder="作業種別" /></SelectTrigger><SelectContent>{WORK_ORDER_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>ステータス</Label><Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="ステータス" /></SelectTrigger><SelectContent>{WORK_ORDER_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>顧客</Label><Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}><SelectTrigger><SelectValue placeholder="顧客" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>{String(c[fc.name])}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>担当CE</Label><Select value={formData.engineer_id} onValueChange={v => setFormData(p => ({ ...p, engineer_id: v }))}><SelectTrigger><SelectValue placeholder="CE" /></SelectTrigger><SelectContent>{engineers.map(e => <SelectItem key={String(e[fce.id])} value={String(e[fce.id])}>{String(e[fce.name])}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>コール</Label><Select value={formData.call_id} onValueChange={v => setFormData(p => ({ ...p, call_id: v }))}><SelectTrigger><SelectValue placeholder="コール" /></SelectTrigger><SelectContent>{calls.map(c => <SelectItem key={String(c[fca.id])} value={String(c[fca.id])}>{String(c[fca.name])}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>日報</Label><Select value={formData.dailyreport_id} onValueChange={v => setFormData(p => ({ ...p, dailyreport_id: v }))}><SelectTrigger><SelectValue placeholder="日報" /></SelectTrigger><SelectContent>{reports.map(r => <SelectItem key={String(r[fdr.id])} value={String(r[fdr.id])}>{String(r[fdr.name])}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>予定日時</Label><Input type="datetime-local" value={formData.scheduleddate} onChange={upd("scheduleddate")} /></div>
            <div className="space-y-1.5"><Label>訪問時刻</Label><Input type="datetime-local" value={formData.visittime} onChange={upd("visittime")} /></div>
          </FormColumns>
          <div className="space-y-1.5"><Label>故障概要</Label><Input value={formData.faultsummary} onChange={upd("faultsummary")} /></div>
          <FormColumns columns={2}>
            <div className="space-y-1.5"><Label>設置場所</Label><Input value={formData.installationlocation} onChange={upd("installationlocation")} /></div>
            <div className="space-y-1.5"><Label>機種/型番</Label><Input value={formData.modeltype} onChange={upd("modeltype")} /></div>
            <div className="space-y-1.5"><Label>シリアルNo.</Label><Input value={formData.serialnumber} onChange={upd("serialnumber")} /></div>
            <div className="space-y-1.5"><Label>エラーコード</Label><Input value={formData.errorcode} onChange={upd("errorcode")} /></div>
            <div className="space-y-1.5"><Label>故障部位</Label><Input value={formData.faultpart} onChange={upd("faultpart")} /></div>
            <div className="space-y-1.5"><Label>交換部品</Label><Input value={formData.replacedparts} onChange={upd("replacedparts")} /></div>
            <div className="space-y-1.5"><Label>作業開始</Label><Input type="datetime-local" value={formData.workstart} onChange={upd("workstart")} /></div>
            <div className="space-y-1.5"><Label>作業終了</Label><Input type="datetime-local" value={formData.workend} onChange={upd("workend")} /></div>
            <div className="space-y-1.5"><Label>作業時間(分)</Label><Input type="number" value={formData.worktime} onChange={upd("worktime")} /></div>
            <div className="space-y-1.5"><Label>満足度(1-5)</Label><Input type="number" min="1" max="5" value={formData.satisfaction} onChange={upd("satisfaction")} /></div>
          </FormColumns>
          <div className="space-y-1.5"><Label>症状</Label><Textarea value={formData.symptoms} onChange={upd("symptoms")} rows={2} /></div>
          <div className="space-y-1.5"><Label>推定原因</Label><Textarea value={formData.estimatedcause} onChange={upd("estimatedcause")} rows={2} /></div>
          <div className="space-y-1.5"><Label>実施した対策</Label><Textarea value={formData.countermeasure} onChange={upd("countermeasure")} rows={2} /></div>
          <div className="space-y-1.5"><Label>再発防止策</Label><Textarea value={formData.prevention} onChange={upd("prevention")} rows={2} /></div>
          <div className="space-y-1.5"><Label>備考</Label><Textarea value={formData.notes} onChange={upd("notes")} rows={2} /></div>
          <div className="flex items-center gap-2"><Checkbox checked={formData.customersigned} onCheckedChange={v => setFormData(p => ({ ...p, customersigned: !!v }))} /><Label className="cursor-pointer">顧客署名取得済</Label></div>
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} title="作業オーダーを削除" description="この作業オーダーを削除してもよろしいですか？この操作は取り消せません。" confirmLabel="削除" onConfirm={handleDelete} variant="destructive" />
    </div>
  )
}
