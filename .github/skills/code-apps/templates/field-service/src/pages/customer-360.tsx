import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  useCustomers, useEquipment, useContracts, useCalls, useWorkOrders,
  useKpis, useRecommendations,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  SLA_TIER_LABEL, SLA_TIER_COLOR,
  EQUIPMENT_STATUS_LABEL, EQUIPMENT_STATUS_COLOR,
  CONTRACT_TYPE_LABEL, CONTRACT_TYPE_COLOR,
  CALL_STATUS_LABEL, CALL_STATUS_COLOR,
  PRIORITY_LABEL, PRIORITY_COLOR,
  WORK_ORDER_TYPE_LABEL, WORK_ORDER_TYPE_COLOR,
  WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR,
  RECOMMENDATION_CATEGORY_LABEL, RECOMMENDATION_CATEGORY_COLOR,
  RECOMMENDATION_PRIORITY_LABEL, RECOMMENDATION_PRIORITY_COLOR,
  CALL_STATUS,
  WORK_ORDER_STATUS,
} from "@/types/dataverse"
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import {
  Printer, FileSignature, PhoneCall, ClipboardList, Gauge, Lightbulb,
  Building2, Mail, Phone, MapPin,
  AlertTriangle, CheckCircle2,
} from "lucide-react"

const P = PUBLISHER_PREFIX
const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#8b5cf6", "#eab308"]

// --- Field maps ---
const fc = { id: `${P}_customerid`, name: `${P}_name`, address: `${P}_address`, phone: `${P}_phone`, email: `${P}_email`, satier: `${P}_satier` }
const feq = { id: `${P}_equipmentid`, name: `${P}_name`, model: `${P}_model`, serialno: `${P}_serialno`, location: `${P}_location`, status: `${P}_status`, installdate: `${P}_installdate`, eoldate: `${P}_eoldate`, customerId: `_${P}_customerid_value` }
const fct = { id: `${P}_maintenancecontractid`, name: `${P}_name`, contracttype: `${P}_contracttype`, slacondition: `${P}_slacondition`, startdate: `${P}_startdate`, enddate: `${P}_enddate`, customerId: `_${P}_customerid_value` }
const fcl = { id: `${P}_callid`, name: `${P}_name`, channel: `${P}_channel`, description: `${P}_description`, priority: `${P}_priority`, status: `${P}_status`, receiveddate: `${P}_receiveddate`, customerId: `_${P}_customerid_value` }
const fwo = { id: `${P}_workorderid`, name: `${P}_name`, worktype: `${P}_worktype`, scheduleddate: `${P}_scheduleddate`, status: `${P}_status`, customerId: `_${P}_customerid_value` }
const fkp = { id: `${P}_annualkpiid`, name: `${P}_name`, targetyear: `${P}_targetyear`, requestcount: `${P}_requestcount`, slaachievement: `${P}_slaachievement`, avgresponse: `${P}_avgresponse`, avgresolution: `${P}_avgresolution`, uptimerate: `${P}_uptimerate`, satisfaction: `${P}_satisfaction`, downtimehours: `${P}_downtimehours`, maintenancecost: `${P}_maintenancecost`, customerId: `_${P}_customerid_value` }
const frc = { id: `${P}_recommendationid`, name: `${P}_name`, category: `${P}_category`, detail: `${P}_detail`, priority: `${P}_priority`, customerId: `_${P}_customerid_value` }

// --- Badge helpers ---
function StatusBadge({ v, labels, colors }: { v: number; labels: Record<number, string>; colors: Record<number, string> }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[v] ?? "bg-gray-100 text-gray-600"}`}>{labels[v] ?? String(v)}</span>
}

function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Customer360Page() {
  const { data: customers = [], isLoading: lc } = useCustomers()
  const { data: equipment = [], isLoading: le } = useEquipment()
  const { data: contracts = [], isLoading: lct } = useContracts()
  const { data: calls = [], isLoading: lcl } = useCalls()
  const { data: workOrders = [], isLoading: lwo } = useWorkOrders()
  const { data: kpis = [], isLoading: lkp } = useKpis()
  const { data: recommendations = [], isLoading: lrc } = useRecommendations()
  const isLoading = lc || le || lct || lcl || lwo || lkp || lrc

  const [selectedId, setSelectedId] = useState<string>("")

  const customer = useMemo(() => customers.find(c => String(c[fc.id]) === selectedId), [customers, selectedId])

  // Filter related data
  const custEquipment = useMemo(() => equipment.filter(e => String(e[feq.customerId] ?? "") === selectedId), [equipment, selectedId])
  const custContracts = useMemo(() => contracts.filter(c => String(c[fct.customerId] ?? "") === selectedId), [contracts, selectedId])
  const custCalls = useMemo(() => calls.filter(c => String(c[fcl.customerId] ?? "") === selectedId).sort((a, b) => String(b[fcl.receiveddate] ?? "").localeCompare(String(a[fcl.receiveddate] ?? ""))), [calls, selectedId])
  const custWorkOrders = useMemo(() => workOrders.filter(w => String(w[fwo.customerId] ?? "") === selectedId).sort((a, b) => String(b[fwo.scheduleddate] ?? "").localeCompare(String(a[fwo.scheduleddate] ?? ""))), [workOrders, selectedId])
  const custKpis = useMemo(() => kpis.filter(k => String(k[fkp.customerId] ?? "") === selectedId).sort((a, b) => Number(b[fkp.targetyear] ?? 0) - Number(a[fkp.targetyear] ?? 0)), [kpis, selectedId])
  const custRecommendations = useMemo(() => recommendations.filter(r => String(r[frc.customerId] ?? "") === selectedId), [recommendations, selectedId])

  // KPI calculations
  const openCalls = useMemo(() => custCalls.filter(c => {
    const s = c[fcl.status] as number | undefined
    return s != null && s !== CALL_STATUS.COMPLETED && s !== CALL_STATUS.CLOSED
  }).length, [custCalls])
  const openWo = useMemo(() => custWorkOrders.filter(w => {
    const s = w[fwo.status] as number | undefined
    return s != null && s !== WORK_ORDER_STATUS.COMPLETED
  }).length, [custWorkOrders])
  const activeContracts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return custContracts.filter(c => {
      const end = String(c[fct.enddate] ?? "").slice(0, 10)
      return !end || end >= today
    }).length
  }, [custContracts])

  // Chart data for call status distribution
  const callStatusData = useMemo(() => {
    const m = new Map<number, number>()
    custCalls.forEach(c => {
      const s = c[fcl.status] as number | undefined
      if (s != null) m.set(s, (m.get(s) ?? 0) + 1)
    })
    return Array.from(m.entries()).map(([k, v]) => ({
      name: CALL_STATUS_LABEL[k as keyof typeof CALL_STATUS_LABEL] ?? String(k), value: v,
    }))
  }, [custCalls])

  // Chart data for KPI trend (SLA achievement over years)
  const kpiTrendData = useMemo(() =>
    [...custKpis].sort((a, b) => Number(a[fkp.targetyear] ?? 0) - Number(b[fkp.targetyear] ?? 0)).map(k => ({
      year: String(k[fkp.targetyear] ?? ""),
      SLA達成率: Number(k[fkp.slaachievement] ?? 0),
      稼働率: Number(k[fkp.uptimerate] ?? 0),
      満足度: Number(k[fkp.satisfaction] ?? 0),
    })),
  [custKpis])

  if (isLoading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">Customer 360</h1><LoadingSkeletonList count={5} /></div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customer 360</h1>
          <p className="text-muted-foreground text-sm mt-1">顧客を中心とした 360° ビュー</p>
        </div>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full sm:w-[300px]">
            <SelectValue placeholder="顧客を選択してください" />
          </SelectTrigger>
          <SelectContent>
            {customers.map(c => (
              <SelectItem key={String(c[fc.id])} value={String(c[fc.id])}>
                {String(c[fc.name] ?? "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-4 opacity-40" />
            <p className="text-lg font-medium">顧客を選択してください</p>
            <p className="text-sm mt-1">上部のセレクターから顧客を選択すると、関連データを一覧表示します</p>
          </CardContent>
        </Card>
      )}

      {customer && (
        <>
          {/* Customer Profile Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{String(customer[fc.name] ?? "")}</h2>
                    {customer[fc.satier] != null && (
                      <StatusBadge v={customer[fc.satier] as number} labels={SLA_TIER_LABEL} colors={SLA_TIER_COLOR} />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                  {customer[fc.phone] != null && String(customer[fc.phone]) !== "" && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{String(customer[fc.phone])}</span>
                    </div>
                  )}
                  {customer[fc.email] != null && String(customer[fc.email]) !== "" && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span>{String(customer[fc.email])}</span>
                    </div>
                  )}
                  {customer[fc.address] != null && String(customer[fc.address]) !== "" && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{String(customer[fc.address])}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="設置機器" value={custEquipment.length} sub={`${custEquipment.filter(e => e[feq.status] === 100000000).length} 台稼働中`} icon={Printer} color="bg-blue-500" />
            <KpiCard title="有効契約" value={activeContracts} sub={`全 ${custContracts.length} 件中`} icon={FileSignature} color="bg-green-500" />
            <KpiCard title="未対応コール" value={openCalls} sub={`累計 ${custCalls.length} 件`} icon={openCalls > 0 ? AlertTriangle : CheckCircle2} color={openCalls > 0 ? "bg-orange-500" : "bg-green-500"} />
            <KpiCard title="進行中オーダー" value={openWo} sub={`累計 ${custWorkOrders.length} 件`} icon={ClipboardList} color={openWo > 0 ? "bg-blue-500" : "bg-green-500"} />
          </div>

          {/* Tabbed content */}
          <Tabs defaultValue="equipment">
            <TabsList className="flex-wrap">
              <TabsTrigger value="equipment" className="gap-1.5"><Printer className="h-4 w-4" />機器 <Badge variant="secondary" className="ml-1">{custEquipment.length}</Badge></TabsTrigger>
              <TabsTrigger value="contracts" className="gap-1.5"><FileSignature className="h-4 w-4" />保守契約 <Badge variant="secondary" className="ml-1">{custContracts.length}</Badge></TabsTrigger>
              <TabsTrigger value="calls" className="gap-1.5"><PhoneCall className="h-4 w-4" />コール <Badge variant="secondary" className="ml-1">{custCalls.length}</Badge></TabsTrigger>
              <TabsTrigger value="work-orders" className="gap-1.5"><ClipboardList className="h-4 w-4" />作業オーダー <Badge variant="secondary" className="ml-1">{custWorkOrders.length}</Badge></TabsTrigger>
              <TabsTrigger value="kpi" className="gap-1.5"><Gauge className="h-4 w-4" />年間KPI <Badge variant="secondary" className="ml-1">{custKpis.length}</Badge></TabsTrigger>
              <TabsTrigger value="recommendations" className="gap-1.5"><Lightbulb className="h-4 w-4" />改善提案 <Badge variant="secondary" className="ml-1">{custRecommendations.length}</Badge></TabsTrigger>
            </TabsList>

            {/* Equipment Tab */}
            <TabsContent value="equipment">
              <Card>
                <CardHeader><CardTitle>設置機器一覧</CardTitle><CardDescription>この顧客に設置された機器</CardDescription></CardHeader>
                <CardContent>
                  {custEquipment.length === 0 ? <p className="text-muted-foreground text-center py-8">設置機器がありません</p> : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>機器名</TableHead><TableHead>型番</TableHead><TableHead>シリアル番号</TableHead><TableHead>ステータス</TableHead><TableHead>設置場所</TableHead><TableHead>導入日</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {custEquipment.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{String(item[feq.name] ?? "")}</TableCell>
                              <TableCell>{String(item[feq.model] ?? "")}</TableCell>
                              <TableCell className="text-muted-foreground">{String(item[feq.serialno] ?? "")}</TableCell>
                              <TableCell>{item[feq.status] != null && <StatusBadge v={item[feq.status] as number} labels={EQUIPMENT_STATUS_LABEL} colors={EQUIPMENT_STATUS_COLOR} />}</TableCell>
                              <TableCell className="text-muted-foreground">{String(item[feq.location] ?? "")}</TableCell>
                              <TableCell className="text-muted-foreground">{String(item[feq.installdate] ?? "").slice(0, 10)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Contracts Tab */}
            <TabsContent value="contracts">
              <Card>
                <CardHeader><CardTitle>保守契約一覧</CardTitle><CardDescription>この顧客の保守契約</CardDescription></CardHeader>
                <CardContent>
                  {custContracts.length === 0 ? <p className="text-muted-foreground text-center py-8">保守契約がありません</p> : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>契約名</TableHead><TableHead>契約種別</TableHead><TableHead>SLA条件</TableHead><TableHead>開始日</TableHead><TableHead>終了日</TableHead><TableHead>ステータス</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {custContracts.map((item, i) => {
                            const end = String(item[fct.enddate] ?? "").slice(0, 10)
                            const today = new Date().toISOString().slice(0, 10)
                            const isExpired = end && end < today
                            return (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{String(item[fct.name] ?? "")}</TableCell>
                                <TableCell>{item[fct.contracttype] != null && <StatusBadge v={item[fct.contracttype] as number} labels={CONTRACT_TYPE_LABEL} colors={CONTRACT_TYPE_COLOR} />}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[200px] truncate">{String(item[fct.slacondition] ?? "")}</TableCell>
                                <TableCell className="text-muted-foreground">{String(item[fct.startdate] ?? "").slice(0, 10)}</TableCell>
                                <TableCell className="text-muted-foreground">{end}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800"}`}>
                                    {isExpired ? "期限切れ" : "有効"}
                                  </span>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Calls Tab */}
            <TabsContent value="calls">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader><CardTitle>コール履歴</CardTitle><CardDescription>この顧客からのコール（新しい順）</CardDescription></CardHeader>
                    <CardContent>
                      {custCalls.length === 0 ? <p className="text-muted-foreground text-center py-8">コール履歴がありません</p> : (
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead>コール名</TableHead><TableHead>ステータス</TableHead><TableHead>優先度</TableHead><TableHead>受付日</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {custCalls.slice(0, 20).map((item, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{String(item[fcl.name] ?? "")}</TableCell>
                                  <TableCell>{item[fcl.status] != null && <StatusBadge v={item[fcl.status] as number} labels={CALL_STATUS_LABEL} colors={CALL_STATUS_COLOR} />}</TableCell>
                                  <TableCell>{item[fcl.priority] != null && <StatusBadge v={item[fcl.priority] as number} labels={PRIORITY_LABEL} colors={PRIORITY_COLOR} />}</TableCell>
                                  <TableCell className="text-muted-foreground">{String(item[fcl.receiveddate] ?? "").slice(0, 10)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                {callStatusData.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>ステータス分布</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={callStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label>
                            {callStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Work Orders Tab */}
            <TabsContent value="work-orders">
              <Card>
                <CardHeader><CardTitle>作業オーダー一覧</CardTitle><CardDescription>この顧客に関連する作業オーダー</CardDescription></CardHeader>
                <CardContent>
                  {custWorkOrders.length === 0 ? <p className="text-muted-foreground text-center py-8">作業オーダーがありません</p> : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>オーダー名</TableHead><TableHead>作業種別</TableHead><TableHead>ステータス</TableHead><TableHead>予定日</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {custWorkOrders.slice(0, 20).map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{String(item[fwo.name] ?? "")}</TableCell>
                              <TableCell>{item[fwo.worktype] != null && <StatusBadge v={item[fwo.worktype] as number} labels={WORK_ORDER_TYPE_LABEL} colors={WORK_ORDER_TYPE_COLOR} />}</TableCell>
                              <TableCell>{item[fwo.status] != null && <StatusBadge v={item[fwo.status] as number} labels={WORK_ORDER_STATUS_LABEL} colors={WORK_ORDER_STATUS_COLOR} />}</TableCell>
                              <TableCell className="text-muted-foreground">{String(item[fwo.scheduleddate] ?? "").slice(0, 10)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* KPI Tab */}
            <TabsContent value="kpi">
              <div className="space-y-4">
                {kpiTrendData.length > 1 && (
                  <Card>
                    <CardHeader><CardTitle>KPI トレンド</CardTitle><CardDescription>年間推移（%）</CardDescription></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={kpiTrendData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="year" fontSize={12} />
                          <YAxis domain={[0, 100]} fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="SLA達成率" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="稼働率" fill="#22c55e" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="満足度" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader><CardTitle>年間KPI一覧</CardTitle><CardDescription>年度別 KPI 実績</CardDescription></CardHeader>
                  <CardContent>
                    {custKpis.length === 0 ? <p className="text-muted-foreground text-center py-8">KPIデータがありません</p> : (
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>年度</TableHead><TableHead>リクエスト数</TableHead><TableHead>SLA達成率</TableHead><TableHead>平均応答</TableHead><TableHead>平均解決</TableHead><TableHead>稼働率</TableHead><TableHead>満足度</TableHead><TableHead>保守コスト</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {custKpis.map((item, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{String(item[fkp.targetyear] ?? "")}</TableCell>
                                <TableCell>{Number(item[fkp.requestcount] ?? 0).toLocaleString()}</TableCell>
                                <TableCell>
                                  <span className={`font-medium ${Number(item[fkp.slaachievement] ?? 0) >= 90 ? "text-green-600" : Number(item[fkp.slaachievement] ?? 0) >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                                    {Number(item[fkp.slaachievement] ?? 0).toFixed(1)}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{Number(item[fkp.avgresponse] ?? 0).toFixed(1)}h</TableCell>
                                <TableCell className="text-muted-foreground">{Number(item[fkp.avgresolution] ?? 0).toFixed(1)}h</TableCell>
                                <TableCell className="text-muted-foreground">{Number(item[fkp.uptimerate] ?? 0).toFixed(1)}%</TableCell>
                                <TableCell className="text-muted-foreground">{Number(item[fkp.satisfaction] ?? 0).toFixed(1)}</TableCell>
                                <TableCell className="text-muted-foreground">¥{Number(item[fkp.maintenancecost] ?? 0).toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Recommendations Tab */}
            <TabsContent value="recommendations">
              <Card>
                <CardHeader><CardTitle>改善提案一覧</CardTitle><CardDescription>この顧客に対する改善提案</CardDescription></CardHeader>
                <CardContent>
                  {custRecommendations.length === 0 ? <p className="text-muted-foreground text-center py-8">改善提案がありません</p> : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>提案名</TableHead><TableHead>カテゴリ</TableHead><TableHead>優先度</TableHead><TableHead>詳細</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {custRecommendations.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{String(item[frc.name] ?? "")}</TableCell>
                              <TableCell>{item[frc.category] != null && <StatusBadge v={item[frc.category] as number} labels={RECOMMENDATION_CATEGORY_LABEL} colors={RECOMMENDATION_CATEGORY_COLOR} />}</TableCell>
                              <TableCell>{item[frc.priority] != null && <StatusBadge v={item[frc.priority] as number} labels={RECOMMENDATION_PRIORITY_LABEL} colors={RECOMMENDATION_PRIORITY_COLOR} />}</TableCell>
                              <TableCell className="text-muted-foreground max-w-[300px] truncate">{String(item[frc.detail] ?? "")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
