import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  useCustomers, useEquipment, useConsumptions, useKpis, useRecommendations,
  useCalls,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  LIFECYCLE_ACTION_LABEL, LIFECYCLE_ACTION_COLOR,
  RECOMMENDATION_CATEGORY_LABEL, RECOMMENDATION_CATEGORY_COLOR,
  RECOMMENDATION_PRIORITY_LABEL, RECOMMENDATION_PRIORITY_COLOR,
} from "@/types/dataverse"
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart,
} from "recharts"
import {
  Activity, Gauge, Clock, Smile, Printer, TrendingDown, AlertTriangle, Wallet, FileText,
} from "lucide-react"

const P = PUBLISHER_PREFIX
const fcust = { id: `${P}_customerid`, name: `${P}_name` }
const feq = {
  id: `${P}_equipmentid`, name: `${P}_name`, model: `${P}_model`,
  status: `${P}_status`, remainingyears: `${P}_remainingyears`, eoldate: `${P}_eoldate`,
  monthlyvolume: `${P}_monthlyvolume`, totalcount: `${P}_totalcount`,
  lifecycleaction: `${P}_lifecycleaction`, customerId: `_${P}_customerid_value`,
}
const fcons = {
  yearmonth: `${P}_yearmonth`, printcount: `${P}_printcount`, tonercount: `${P}_tonercount`,
  cost: `${P}_consumablecost`, equipmentId: `_${P}_equipmentid_value`,
}
const fkpi = {
  name: `${P}_name`, targetyear: `${P}_targetyear`, requestcount: `${P}_requestcount`,
  slaachievement: `${P}_slaachievement`, avgresponse: `${P}_avgresponse`, avgresolution: `${P}_avgresolution`,
  uptimerate: `${P}_uptimerate`, satisfaction: `${P}_satisfaction`, downtimehours: `${P}_downtimehours`,
  maintenancecost: `${P}_maintenancecost`, customerId: `_${P}_customerid_value`,
}
const frec = {
  name: `${P}_name`, category: `${P}_category`, detail: `${P}_detail`,
  expectedeffect: `${P}_expectedeffect`, priority: `${P}_priority`, targetperiod: `${P}_targetperiod`,
  customerId: `_${P}_customerid_value`, equipmentId: `_${P}_equipmentid_value`,
}
const fcall = { customerId: `_${P}_customerid_value` }

const num = (v: unknown) => Number(v ?? 0).toLocaleString("ja-JP")

function KpiTile({ icon: Icon, label, value, unit, accent }: { icon: typeof Activity; label: string; value: string; unit?: string; accent: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent}`}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-xl font-bold tabular-nums">{value}<span className="text-sm font-medium text-muted-foreground ml-0.5">{unit}</span></div>
      </div>
    </div>
  )
}

function LifecycleBadge({ v }: { v: number }) {
  const label = LIFECYCLE_ACTION_LABEL[v as keyof typeof LIFECYCLE_ACTION_LABEL] ?? "-"
  const color = LIFECYCLE_ACTION_COLOR[v as keyof typeof LIFECYCLE_ACTION_COLOR] ?? "bg-gray-100 text-gray-600"
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
}

export default function AnnualReviewPage() {
  const { data: customers = [], isLoading: l1 } = useCustomers()
  const { data: equipment = [], isLoading: l2 } = useEquipment()
  const { data: consumptions = [], isLoading: l3 } = useConsumptions()
  const { data: kpis = [], isLoading: l4 } = useKpis()
  const { data: recommendations = [], isLoading: l5 } = useRecommendations()
  const { data: calls = [], isLoading: l6 } = useCalls()
  const isLoading = l1 || l2 || l3 || l4 || l5 || l6

  const [customerId, setCustomerId] = useState<string>("")

  // 既定顧客: 山田製作所、なければ先頭
  const selectedId = useMemo(() => {
    if (customerId) return customerId
    const yamada = customers.find(c => String(c[fcust.name] ?? "").includes("山田製作所"))
    return String((yamada ?? customers[0])?.[fcust.id] ?? "")
  }, [customerId, customers])

  const selectedCustomer = customers.find(c => String(c[fcust.id]) === selectedId)
  const custName = String(selectedCustomer?.[fcust.name] ?? "")

  const custEquip = useMemo(() => equipment.filter(e => String(e[feq.customerId]) === selectedId), [equipment, selectedId])
  const custEquipIds = useMemo(() => new Set(custEquip.map(e => String(e[feq.id]))), [custEquip])
  const custCons = useMemo(() => consumptions.filter(c => custEquipIds.has(String(c[fcons.equipmentId]))), [consumptions, custEquipIds])
  const custKpis = useMemo(() => kpis.filter(k => String(k[fkpi.customerId]) === selectedId).sort((a, b) => Number(b[fkpi.targetyear] ?? 0) - Number(a[fkpi.targetyear] ?? 0)), [kpis, selectedId])
  const custRecs = useMemo(() => recommendations.filter(r => String(r[frec.customerId]) === selectedId)
    .sort((a, b) => Number(a[frec.priority] ?? 9) - Number(b[frec.priority] ?? 9)), [recommendations, selectedId])
  const callCount = useMemo(() => calls.filter(c => String(c[fcall.customerId]) === selectedId).length, [calls, selectedId])

  const latestKpi = custKpis[0]

  // 消費トレンド（年月で集計）
  const trend = useMemo(() => {
    const m = new Map<string, { ym: string; prints: number; toner: number; cost: number }>()
    for (const r of custCons) {
      const ym = String(r[fcons.yearmonth] ?? "")
      if (!ym) continue
      const e = m.get(ym) ?? { ym, prints: 0, toner: 0, cost: 0 }
      e.prints += Number(r[fcons.printcount] ?? 0)
      e.toner += Number(r[fcons.tonercount] ?? 0)
      e.cost += Number(r[fcons.cost] ?? 0)
      m.set(ym, e)
    }
    return [...m.values()].sort((a, b) => a.ym.localeCompare(b.ym))
  }, [custCons])

  // 機器別累計印刷枚数
  const equipVolume = useMemo(() => custEquip.map(e => ({
    name: String(e[feq.name] ?? "").replace(/^[A-Z]+-\d+\s*/, ""),
    monthly: Number(e[feq.monthlyvolume] ?? 0),
    total: Number(e[feq.totalcount] ?? 0),
  })), [custEquip])

  const totalMonthly = custEquip.reduce((s, e) => s + Number(e[feq.monthlyvolume] ?? 0), 0)
  const replaceCount = custEquip.filter(e => Number(e[feq.lifecycleaction]) === 100000002).length

  if (isLoading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">年間レビュー</h1><LoadingSkeletonList count={6} /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">年間レビュー</h1>
          <p className="text-muted-foreground text-sm mt-1">顧客向け年次レビュー・今後の計画相談ダッシュボード</p>
        </div>
        <div className="w-full sm:w-[320px]">
          <Select value={selectedId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger>
            <SelectContent>{customers.map(c => <SelectItem key={String(c[fcust.id])} value={String(c[fcust.id])}>{String(c[fcust.name])}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI サマリ */}
      <Card>
        <CardHeader>
          <CardTitle>{custName} ─ 年間KPIサマリ{latestKpi ? `（${String(latestKpi[fkpi.targetyear])}年度）` : ""}</CardTitle>
          <CardDescription>{latestKpi ? String(latestKpi[fkpi.name]) : "KPIデータがありません"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <KpiTile icon={FileText} label="年間リクエスト件数" value={latestKpi ? num(latestKpi[fkpi.requestcount]) : String(callCount)} unit="件" accent="bg-blue-100 text-blue-700" />
            <KpiTile icon={Gauge} label="SLA達成率" value={latestKpi ? num(latestKpi[fkpi.slaachievement]) : "-"} unit="%" accent="bg-emerald-100 text-emerald-700" />
            <KpiTile icon={Activity} label="機器稼働率" value={latestKpi ? num(latestKpi[fkpi.uptimerate]) : "-"} unit="%" accent="bg-teal-100 text-teal-700" />
            <KpiTile icon={Clock} label="平均応答時間" value={latestKpi ? num(latestKpi[fkpi.avgresponse]) : "-"} unit="分" accent="bg-indigo-100 text-indigo-700" />
            <KpiTile icon={Clock} label="平均復旧時間" value={latestKpi ? num(latestKpi[fkpi.avgresolution]) : "-"} unit="分" accent="bg-violet-100 text-violet-700" />
            <KpiTile icon={AlertTriangle} label="年間ダウンタイム" value={latestKpi ? num(latestKpi[fkpi.downtimehours]) : "-"} unit="時間" accent="bg-amber-100 text-amber-700" />
            <KpiTile icon={Smile} label="顧客満足度" value={latestKpi ? num(latestKpi[fkpi.satisfaction]) : "-"} unit="/5" accent="bg-pink-100 text-pink-700" />
            <KpiTile icon={Wallet} label="年間保守コスト" value={latestKpi ? `¥${num(latestKpi[fkpi.maintenancecost])}` : "-"} accent="bg-rose-100 text-rose-700" />
          </div>
        </CardContent>
      </Card>

      {/* 消費動向トレンド */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" />消費動向（月次）</CardTitle>
            <CardDescription>印刷枚数と消耗品コストの推移</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">消費実績データがありません</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="ym" fontSize={11} />
                  <YAxis yAxisId="left" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" fontSize={11} />
                  <Tooltip formatter={(v) => num(Number(v))} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="prints" name="印刷枚数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="cost" name="消耗品コスト(円)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingDown className="h-4 w-4" />消費サマリ</CardTitle>
            <CardDescription>当該顧客の機器全体</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <KpiTile icon={Printer} label="月間印刷枚数(全機器)" value={num(totalMonthly)} unit="枚" accent="bg-blue-100 text-blue-700" />
            <KpiTile icon={Activity} label="稼働機器台数" value={String(custEquip.length)} unit="台" accent="bg-emerald-100 text-emerald-700" />
            <KpiTile icon={AlertTriangle} label="更新推奨の機器" value={String(replaceCount)} unit="台" accent="bg-red-100 text-red-700" />
            <KpiTile icon={FileText} label="未対応含む年間コール" value={String(callCount)} unit="件" accent="bg-indigo-100 text-indigo-700" />
          </CardContent>
        </Card>
      </div>

      {/* 機器ライフサイクル */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>機器ライフサイクル</CardTitle>
            <CardDescription>今後の対応年数・推奨アクション</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {custEquip.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center">機器がありません</div>
              ) : custEquip.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{String(e[feq.name] ?? "")}</div>
                    <div className="text-xs text-muted-foreground">{String(e[feq.model] ?? "")} ・ 保守終了 {String(e[feq.eoldate] ?? "").slice(0, 10)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">対応年数</div>
                      <div className="font-bold tabular-nums">{num(e[feq.remainingyears])}<span className="text-xs font-normal ml-0.5">年</span></div>
                    </div>
                    {e[feq.lifecycleaction] != null && <LifecycleBadge v={e[feq.lifecycleaction] as number} />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>機器別 印刷ボリューム</CardTitle>
            <CardDescription>月間／累計の印刷枚数</CardDescription>
          </CardHeader>
          <CardContent>
            {equipVolume.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">データがありません</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={equipVolume} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" width={90} fontSize={11} />
                  <Tooltip formatter={(v) => num(Number(v))} />
                  <Legend />
                  <Bar dataKey="monthly" name="月間枚数" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 改善提案・今後の計画 */}
      <Card>
        <CardHeader>
          <CardTitle>今後の計画・改善提案</CardTitle>
          <CardDescription>顧客とのディスカッション用の提案一覧（優先度順）</CardDescription>
        </CardHeader>
        <CardContent>
          {custRecs.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">改善提案がありません</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {custRecs.map((r, i) => {
                const cat = Number(r[frec.category])
                const pri = Number(r[frec.priority])
                return (
                  <div key={i} className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm">{String(r[frec.name] ?? "")}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RECOMMENDATION_PRIORITY_COLOR[pri as keyof typeof RECOMMENDATION_PRIORITY_COLOR] ?? "bg-gray-100 text-gray-600"}`}>{RECOMMENDATION_PRIORITY_LABEL[pri as keyof typeof RECOMMENDATION_PRIORITY_LABEL] ?? "-"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RECOMMENDATION_CATEGORY_COLOR[cat as keyof typeof RECOMMENDATION_CATEGORY_COLOR] ?? "bg-gray-100 text-gray-600"}`}>{RECOMMENDATION_CATEGORY_LABEL[cat as keyof typeof RECOMMENDATION_CATEGORY_LABEL] ?? "-"}</span>
                      <span className="text-xs text-muted-foreground">{String(r[frec.targetperiod] ?? "")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{String(r[frec.detail] ?? "")}</p>
                    {r[frec.expectedeffect] ? (
                      <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5"><span className="font-medium">想定効果: </span>{String(r[frec.expectedeffect])}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
