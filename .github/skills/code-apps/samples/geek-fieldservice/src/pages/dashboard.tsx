import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCalls, useWorkOrders, useEngineers, useReports, useCurrentUserId, useCustomers, useRecommendations, useCreateRecommendation, useEquipment, useAreas } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  CALL_STATUS, CALL_STATUS_LABEL, CALL_STATUS_COLOR, PRIORITY_LABEL, PRIORITY_COLOR,
  CALL_CHANNEL_LABEL, WORK_STATUS, WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR,
  WORK_ORDER_TYPE_LABEL,
  RECOMMENDATION_CATEGORY_LABEL, RECOMMENDATION_CATEGORY_COLOR, RECOMMENDATION_CATEGORY_OPTIONS,
  RECOMMENDATION_PRIORITY_OPTIONS,
  SLA_TIER_LABEL,
} from "@/types/dataverse"
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { PhoneCall, Wrench, Users, FileCheck, Plus, AlertTriangle, ClipboardList, BookMarked, MapPin } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#8b5cf6", "#eab308", "#06b6d4", "#ec4899"]

function KpiCard({ title, value, icon: Icon, color, subtitle }: { title: string; value: number; icon: React.ElementType; color: string; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", color)}>{label}</span>
}

export default function DashboardPage() {
  const { data: calls = [], isLoading: l1 } = useCalls()
  const { data: workOrders = [], isLoading: l2 } = useWorkOrders()
  const { data: engineers = [], isLoading: l3 } = useEngineers()
  const { data: reports = [], isLoading: l4 } = useReports()
  const { data: currentUserId } = useCurrentUserId()
  const { data: customers = [] } = useCustomers()
  const { data: recommendations = [] } = useRecommendations()
  const { data: equipment = [] } = useEquipment()
  const { data: areas = [] } = useAreas()
  const createRecommendation = useCreateRecommendation()
  const isLoading = l1 || l2 || l3 || l4

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">保守オペレーションの全体状況</p>
      </div>

      <Tabs defaultValue="mypage">
        <TabsList>
          <TabsTrigger value="mypage">マイページ</TabsTrigger>
          <TabsTrigger value="overview">全体ダッシュボード</TabsTrigger>
        </TabsList>

        <TabsContent value="mypage" className="mt-4">
          {isLoading ? <LoadingSkeletonList count={4} /> : (
            <MyPageContent
              calls={calls} workOrders={workOrders} engineers={engineers}
              currentUserId={currentUserId} customers={customers}
              recommendations={recommendations} equipment={equipment}
              createRecommendation={createRecommendation} areas={areas}
            />
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          {isLoading ? <LoadingSkeletonList count={4} /> : (
            <OverviewContent calls={calls} workOrders={workOrders} engineers={engineers} reports={reports} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   マイページ
   ═══════════════════════════════════════════════════════════════ */

type Rec = Record<string, unknown>

function MyPageContent({ calls, workOrders, engineers, currentUserId, customers, recommendations, equipment, createRecommendation, areas }: {
  calls: Rec[]; workOrders: Rec[]; engineers: Rec[]; currentUserId: string | null | undefined
  customers: Rec[]; recommendations: Rec[]; equipment: Rec[]; areas: Rec[]
  createRecommendation: ReturnType<typeof useCreateRecommendation>
}) {
  // ── 自分のエンジニアレコードを特定 ──
  const myEngineer = useMemo(() =>
    engineers.find(e => String(e[`_${P}_userid_value`] ?? "").toLowerCase() === currentUserId?.toLowerCase()),
    [engineers, currentUserId]
  )
  const myEngineerId = myEngineer ? String(myEngineer[`${P}_engineerid`] ?? "") : ""
  const myAreaId = myEngineer ? String(myEngineer[`_${P}_areaid_value`] ?? "") : ""
  const myAreaName = useMemo(() => {
    const area = areas.find(a => String(a[`${P}_areaid`] ?? "") === myAreaId)
    return area ? String(area[`${P}_name`] ?? "") : ""
  }, [areas, myAreaId])

  // ── 同エリアのエンジニア ──
  const areaEngineers = useMemo(() =>
    myAreaId ? engineers.filter(e => String(e[`_${P}_areaid_value`] ?? "") === myAreaId) : [],
    [engineers, myAreaId]
  )
  const areaEngineerIds = useMemo(() => new Set(areaEngineers.map(e => String(e[`${P}_engineerid`] ?? ""))), [areaEngineers])

  // ── 自分の作業オーダー ──
  const myWorkOrders = useMemo(() =>
    workOrders.filter(w => String(w[`_${P}_engineerid_value`] ?? "").toLowerCase() === myEngineerId.toLowerCase()),
    [workOrders, myEngineerId]
  )

  // ── 自分のコール（自分のWOに紐づくコール） ──
  const myCallIds = useMemo(() => new Set(myWorkOrders.map(w => String(w[`_${P}_callid_value`] ?? "")).filter(Boolean)), [myWorkOrders])
  const myCalls = useMemo(() =>
    calls.filter(c => myCallIds.has(String(c[`${P}_callid`] ?? ""))),
    [calls, myCallIds]
  )

  // ── 全WOに紐づいているコールID ──
  const assignedCallIds = useMemo(() => new Set(workOrders.map(w => String(w[`_${P}_callid_value`] ?? "")).filter(Boolean)), [workOrders])

  // ── 未割り当てコール（WOが無いコール、受付/対応中のみ） ──
  const unassignedCalls = useMemo(() =>
    calls.filter(c => {
      const id = String(c[`${P}_callid`] ?? "")
      const status = c[`${P}_status`] as number
      return !assignedCallIds.has(id) && (status === CALL_STATUS.RECEIVED || status === CALL_STATUS.IN_PROGRESS)
    }),
    [calls, assignedCallIds]
  )

  // ── 未割り当て作業オーダー（エンジニア未設定） ──
  const unassignedWorkOrders = useMemo(() =>
    workOrders.filter(w => !w[`_${P}_engineerid_value`]),
    [workOrders]
  )

  // ── 自分が作成したナレッジ（Recommendation） ──
  const myRecommendations = useMemo(() =>
    recommendations.filter(r => String(r[`_createdby_value`] ?? "").toLowerCase() === currentUserId?.toLowerCase()),
    [recommendations, currentUserId]
  )

  // ── 顧客名マップ ──
  const customerNameMap = useMemo(() => new Map(customers.map(c => [String(c[`${P}_customerid`] ?? ""), String(c[`${P}_name`] ?? "")])), [customers])
  const equipmentNameMap = useMemo(() => new Map(equipment.map(e => [String(e[`${P}_equipmentid`] ?? ""), String(e[`${P}_name`] ?? "")])), [equipment])

  // ── エリアメンバーのWO実績（完了数） ──
  const teamPerformanceData = useMemo(() => {
    const m = new Map<string, { name: string; completed: number; working: number; total: number }>()
    areaEngineers.forEach(e => {
      const eid = String(e[`${P}_engineerid`] ?? "")
      const name = String(e[`${P}_name`] ?? "")
      m.set(eid, { name, completed: 0, working: 0, total: 0 })
    })
    workOrders.forEach(w => {
      const eid = String(w[`_${P}_engineerid_value`] ?? "")
      const entry = m.get(eid)
      if (!entry) return
      entry.total++
      const st = w[`${P}_status`] as number
      if (st === WORK_ORDER_STATUS.COMPLETED) entry.completed++
      else if (st === WORK_ORDER_STATUS.WORKING) entry.working++
    })
    return Array.from(m.values()).sort((a, b) => b.completed - a.completed)
  }, [areaEngineers, workOrders])

  // ── エリア顧客グラフ（SLA Tier分布 & コール件数トップ顧客） ──
  const areaCallIds = useMemo(() => {
    const ids = new Set<string>()
    workOrders.forEach(w => {
      const eid = String(w[`_${P}_engineerid_value`] ?? "")
      if (areaEngineerIds.has(eid)) {
        const cid = String(w[`_${P}_callid_value`] ?? "")
        if (cid) ids.add(cid)
      }
    })
    return ids
  }, [workOrders, areaEngineerIds])

  const areaCustomerIds = useMemo(() => {
    const ids = new Set<string>()
    calls.forEach(c => {
      if (areaCallIds.has(String(c[`${P}_callid`] ?? ""))) {
        const cid = String(c[`_${P}_customerid_value`] ?? "")
        if (cid) ids.add(cid)
      }
    })
    return ids
  }, [calls, areaCallIds])

  const areaCustomers = useMemo(() =>
    customers.filter(c => areaCustomerIds.has(String(c[`${P}_customerid`] ?? ""))),
    [customers, areaCustomerIds]
  )

  const customerTierData = useMemo(() => {
    const m = new Map<number, number>()
    areaCustomers.forEach(c => {
      const tier = c[`${P}_satier`] as number | undefined
      if (tier != null) m.set(tier, (m.get(tier) ?? 0) + 1)
    })
    return Array.from(m.entries()).map(([k, v]) => ({
      name: SLA_TIER_LABEL[k as keyof typeof SLA_TIER_LABEL] ?? String(k), value: v,
    }))
  }, [areaCustomers])

  const customerCallCountData = useMemo(() => {
    const m = new Map<string, number>()
    calls.forEach(c => {
      if (areaCallIds.has(String(c[`${P}_callid`] ?? ""))) {
        const cid = String(c[`_${P}_customerid_value`] ?? "")
        if (cid) m.set(cid, (m.get(cid) ?? 0) + 1)
      }
    })
    return Array.from(m.entries())
      .map(([k, v]) => ({ name: customerNameMap.get(k) ?? k, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [calls, areaCallIds, customerNameMap])

  // ── ナレッジ作成モーダル ──
  type TipForm = { name: string; category: string; detail: string; expectedeffect: string; priority: string; targetperiod: string; customer_id: string; equipment_id: string }
  const EMPTY: TipForm = { name: "", category: "", detail: "", expectedeffect: "", priority: "", targetperiod: "", customer_id: "", equipment_id: "" }
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<TipForm>(EMPTY)
  const upd = (k: keyof TipForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [k]: e.target.value }))

  const handleCreateSave = async () => {
    if (!formData.name.trim()) { toast.error("Tips名は必須です"); return }
    const data: Rec = {
      [`${P}_name`]: formData.name, [`${P}_detail`]: formData.detail,
      [`${P}_expectedeffect`]: formData.expectedeffect, [`${P}_targetperiod`]: formData.targetperiod,
    }
    if (formData.category) data[`${P}_category`] = Number(formData.category)
    if (formData.priority) data[`${P}_priority`] = Number(formData.priority)
    if (formData.customer_id) data[`${P}_customerid@odata.bind`] = `/${P}_customers(${formData.customer_id})`
    if (formData.equipment_id) data[`${P}_equipmentid@odata.bind`] = `/${P}_equipments(${formData.equipment_id})`
    try { await createRecommendation.mutateAsync(data); toast.success("ナレッジを作成しました"); setIsFormOpen(false); setFormData(EMPTY) } catch { toast.error("保存に失敗しました") }
  }

  if (!myEngineer) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-lg font-semibold">エンジニアレコードが見つかりません</p>
          <p className="text-sm text-muted-foreground">現在のユーザーに紐づくカスタマーエンジニアレコードが登録されていません。</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── ヘッダー情報 ── */}
      <div className="flex items-center gap-3">
        <MapPin className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">{String(myEngineer[`${P}_name`] ?? "")}</span>
        <StatusBadge label={myAreaName || "未設定"} color="bg-primary/10 text-primary" />
      </div>

      {/* ── KPIカード ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="自分の作業オーダー" value={myWorkOrders.length} icon={ClipboardList} color="bg-blue-500" subtitle={`完了: ${myWorkOrders.filter(w => w[`${P}_status`] === WORK_ORDER_STATUS.COMPLETED).length}`} />
        <KpiCard title="自分のコール" value={myCalls.length} icon={PhoneCall} color="bg-indigo-500" />
        <KpiCard title="未割り当てコール" value={unassignedCalls.length} icon={AlertTriangle} color="bg-amber-500" />
        <KpiCard title="未割り当てオーダー" value={unassignedWorkOrders.length} icon={Wrench} color="bg-red-500" />
      </div>

      {/* ── 自分の作業オーダー & コール ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />自分の作業オーダー</CardTitle>
            <CardDescription>自分に割り当てられた作業オーダー</CardDescription>
          </CardHeader>
          <CardContent>
            <CompactTable
              rows={myWorkOrders.slice(0, 8)}
              columns={[
                { key: `${P}_name`, label: "オーダー名" },
                { key: `${P}_status`, label: "ステータス", render: (v) => {
                  const s = v as number; return <StatusBadge label={WORK_ORDER_STATUS_LABEL[s as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""} color={WORK_ORDER_STATUS_COLOR[s as keyof typeof WORK_ORDER_STATUS_COLOR] ?? ""} />
                }},
                { key: `${P}_scheduleddate`, label: "予定日", render: (v) => v ? new Date(String(v)).toLocaleDateString("ja-JP") : "" },
              ]}
              emptyMessage="作業オーダーがありません"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PhoneCall className="h-4 w-4" />自分のコール</CardTitle>
            <CardDescription>自分の作業オーダーに関連するコール</CardDescription>
          </CardHeader>
          <CardContent>
            <CompactTable
              rows={myCalls.slice(0, 8)}
              columns={[
                { key: `${P}_name`, label: "コール名" },
                { key: `${P}_status`, label: "ステータス", render: (v) => {
                  const s = v as number; return <StatusBadge label={CALL_STATUS_LABEL[s as keyof typeof CALL_STATUS_LABEL] ?? ""} color={CALL_STATUS_COLOR[s as keyof typeof CALL_STATUS_COLOR] ?? ""} />
                }},
                { key: `${P}_priority`, label: "優先度", render: (v) => {
                  const p = v as number; return <StatusBadge label={PRIORITY_LABEL[p as keyof typeof PRIORITY_LABEL] ?? ""} color={PRIORITY_COLOR[p as keyof typeof PRIORITY_COLOR] ?? ""} />
                }},
              ]}
              emptyMessage="コールがありません"
            />
          </CardContent>
        </Card>
      </div>

      {/* ── 未割り当て ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />未割り当てコール</CardTitle>
            <CardDescription>まだ作業オーダーが作成されていないコール</CardDescription>
          </CardHeader>
          <CardContent>
            <CompactTable
              rows={unassignedCalls.slice(0, 8)}
              columns={[
                { key: `${P}_name`, label: "コール名" },
                { key: `${P}_priority`, label: "優先度", render: (v) => {
                  const p = v as number; return <StatusBadge label={PRIORITY_LABEL[p as keyof typeof PRIORITY_LABEL] ?? ""} color={PRIORITY_COLOR[p as keyof typeof PRIORITY_COLOR] ?? ""} />
                }},
                { key: `_${P}_customerid_value`, label: "顧客", render: (v) => customerNameMap.get(String(v ?? "")) ?? "" },
              ]}
              emptyMessage="未割り当てコールはありません"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4 text-red-500" />未割り当て作業オーダー</CardTitle>
            <CardDescription>エンジニアが割り当てられていない作業オーダー</CardDescription>
          </CardHeader>
          <CardContent>
            <CompactTable
              rows={unassignedWorkOrders.slice(0, 8)}
              columns={[
                { key: `${P}_name`, label: "オーダー名" },
                { key: `${P}_status`, label: "ステータス", render: (v) => {
                  const s = v as number; return <StatusBadge label={WORK_ORDER_STATUS_LABEL[s as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""} color={WORK_ORDER_STATUS_COLOR[s as keyof typeof WORK_ORDER_STATUS_COLOR] ?? ""} />
                }},
                { key: `${P}_worktype`, label: "種別", render: (v) => {
                  const t = v as number; return WORK_ORDER_TYPE_LABEL[t as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""
                }},
              ]}
              emptyMessage="未割り当てオーダーはありません"
            />
          </CardContent>
        </Card>
      </div>

      {/* ── ナレッジ ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BookMarked className="h-4 w-4" />マイナレッジ</CardTitle>
              <CardDescription>自分が作成したナレッジ・Tips</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setFormData(EMPTY); setIsFormOpen(true) }}>
              <Plus className="h-4 w-4 mr-1" />作成
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <CompactTable
            rows={myRecommendations.slice(0, 8)}
            columns={[
              { key: `${P}_name`, label: "タイトル" },
              { key: `${P}_category`, label: "カテゴリ", render: (v) => {
                const c = v as number; return <StatusBadge label={RECOMMENDATION_CATEGORY_LABEL[c as keyof typeof RECOMMENDATION_CATEGORY_LABEL] ?? ""} color={RECOMMENDATION_CATEGORY_COLOR[c as keyof typeof RECOMMENDATION_CATEGORY_COLOR] ?? ""} />
              }},
              { key: `_${P}_customerid_value`, label: "顧客", render: (v) => customerNameMap.get(String(v ?? "")) ?? "" },
              { key: `_${P}_equipmentid_value`, label: "機器", render: (v) => equipmentNameMap.get(String(v ?? "")) ?? "" },
            ]}
            emptyMessage="ナレッジがありません"
          />
        </CardContent>
      </Card>

      {/* ── エリアグラフ ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>エリアメンバー作業オーダー実績</CardTitle>
            <CardDescription>{myAreaName}エリアのメンバー別実績</CardDescription>
          </CardHeader>
          <CardContent>
            {teamPerformanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={teamPerformanceData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} fontSize={12} />
                  <YAxis type="category" dataKey="name" fontSize={12} width={80} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" name="完了" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="working" name="作業中" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="total" name="合計" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>担当エリア顧客 SLA分布</CardTitle>
            <CardDescription>{myAreaName}エリアの顧客SLA Tier</CardDescription>
          </CardHeader>
          <CardContent>
            {customerTierData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={customerTierData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {customerTierData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>担当エリア顧客別コール件数</CardTitle>
            <CardDescription>{myAreaName}エリアの顧客別コール件数（上位10社）</CardDescription>
          </CardHeader>
          <CardContent>
            {customerCallCountData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={customerCallCountData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" fontSize={11} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" name="コール件数" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── ナレッジ作成モーダル ── */}
      <FormModal open={isFormOpen} onOpenChange={setIsFormOpen} title="ナレッジを作成" onSave={handleCreateSave} isSaving={createRecommendation.isPending}>
        <div className="space-y-4">
          <div><Label>タイトル *</Label><Input value={formData.name} onChange={upd("name")} /></div>
          <FormColumns>
            <div><Label>カテゴリ</Label>
              <Select value={formData.category} onValueChange={v => setFormData(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{RECOMMENDATION_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>優先度</Label>
              <Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{RECOMMENDATION_PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </FormColumns>
          <div><Label>詳細</Label><Textarea rows={3} value={formData.detail} onChange={upd("detail")} /></div>
          <div><Label>期待効果</Label><Textarea rows={2} value={formData.expectedeffect} onChange={upd("expectedeffect")} /></div>
          <FormColumns>
            <div><Label>対象期間</Label><Input value={formData.targetperiod} onChange={upd("targetperiod")} /></div>
            <div><Label>顧客</Label>
              <Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={String(c[`${P}_customerid`])} value={String(c[`${P}_customerid`])}>{String(c[`${P}_name`] ?? "")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </FormColumns>
          <div><Label>機器</Label>
            <Select value={formData.equipment_id} onValueChange={v => setFormData(p => ({ ...p, equipment_id: v }))}>
              <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
              <SelectContent>{equipment.map(e => <SelectItem key={String(e[`${P}_equipmentid`])} value={String(e[`${P}_equipmentid`])}>{String(e[`${P}_name`] ?? "")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>
    </div>
  )
}

/* ── コンパクトテーブル ── */
type ColDef = { key: string; label: string; render?: (value: unknown, row: Rec) => React.ReactNode }
function CompactTable({ rows, columns, emptyMessage }: { rows: Rec[]; columns: ColDef[]; emptyMessage: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>
  return (
    <div className="overflow-auto max-h-[320px]">
      <Table>
        <TableHeader>
          <TableRow>{columns.map(c => <TableHead key={c.key} className="text-xs">{c.label}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {columns.map(c => (
                <TableCell key={c.key} className="text-sm py-2">
                  {c.render ? c.render(r[c.key], r) : String(r[c.key] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   全体ダッシュボード（既存）
   ═══════════════════════════════════════════════════════════════ */

function OverviewContent({ calls, workOrders, engineers, reports }: { calls: Rec[]; workOrders: Rec[]; engineers: Rec[]; reports: Rec[] }) {
  const kpi = useMemo(() => {
    const received = calls.filter(c => c[`${P}_status`] === CALL_STATUS.RECEIVED).length
    const inProgress = calls.filter(c => c[`${P}_status`] === CALL_STATUS.IN_PROGRESS).length
    const workingCe = engineers.filter(e => e[`${P}_workstatus`] === WORK_STATUS.WORKING).length
    const completedWo = workOrders.filter(w => w[`${P}_status`] === WORK_ORDER_STATUS.COMPLETED).length
    return { received, inProgress, workingCe, completedWo }
  }, [calls, engineers, workOrders])

  const priorityData = useMemo(() => {
    const m = new Map<number, number>()
    calls.forEach(c => {
      const p = c[`${P}_priority`] as number | undefined
      if (p != null) m.set(p, (m.get(p) ?? 0) + 1)
    })
    return Array.from(m.entries()).map(([k, v]) => ({ name: PRIORITY_LABEL[k as keyof typeof PRIORITY_LABEL] ?? String(k), value: v }))
  }, [calls])

  const channelData = useMemo(() => {
    const m = new Map<number, number>()
    calls.forEach(c => {
      const ch = c[`${P}_channel`] as number | undefined
      if (ch != null) m.set(ch, (m.get(ch) ?? 0) + 1)
    })
    return Array.from(m.entries()).map(([k, v]) => ({ name: CALL_CHANNEL_LABEL[k as keyof typeof CALL_CHANNEL_LABEL] ?? String(k), value: v }))
  }, [calls])

  const statusData = useMemo(() => {
    const m = new Map<number, number>()
    calls.forEach(c => {
      const s = c[`${P}_status`] as number | undefined
      if (s != null) m.set(s, (m.get(s) ?? 0) + 1)
    })
    return Array.from(m.entries()).map(([k, v]) => ({ name: CALL_STATUS_LABEL[k as keyof typeof CALL_STATUS_LABEL] ?? String(k), value: v }))
  }, [calls])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="受付コール" value={kpi.received} icon={PhoneCall} color="bg-red-500" />
        <KpiCard title="対応中コール" value={kpi.inProgress} icon={Wrench} color="bg-orange-500" />
        <KpiCard title="稼働中CE" value={kpi.workingCe} icon={Users} color="bg-blue-500" />
        <KpiCard title="完了オーダー" value={kpi.completedWo} icon={FileCheck} color="bg-green-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>コール ステータス別</CardTitle>
            <CardDescription>現在のコール対応状況</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" name="件数" radius={[4, 4, 0, 0]}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>優先度別 コール</CardTitle>
            <CardDescription>優先度の分布</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {priorityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>受付チャネル別</CardTitle>
            <CardDescription>コールの受付経路</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>サマリー</CardTitle>
            <CardDescription>主要指標</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm text-muted-foreground">総コール数</span>
              <span className="font-semibold">{calls.length}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm text-muted-foreground">総作業オーダー数</span>
              <span className="font-semibold">{workOrders.length}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm text-muted-foreground">登録CE数</span>
              <span className="font-semibold">{engineers.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">完了レポート数</span>
              <span className="font-semibold">{reports.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
