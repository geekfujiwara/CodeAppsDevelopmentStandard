import { useMemo } from "react"
import { useContracts } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX as P } from "@/config"
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_COLOR,
  CONTRACT_TYPE_LABEL,
  AUTO_RENEWAL_LABEL,
  type ContractStatus,
  type ContractType,
  type AutoRenewal,
} from "@/types/dataverse"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const f = {
  id:           `${P}_contractid`,
  name:         `${P}_name`,
  counterparty: `${P}_counterparty`,
  type:         `${P}_contract_type`,
  start:        `${P}_start_date`,
  end:          `${P}_end_date`,
  auto_renewal: `${P}_auto_renewal`,
  status:       `${P}_status`,
  value:        `${P}_value`,
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#eab308", "#6b7280", "#3b82f6"]

export default function Dashboard() {
  const { data: contracts = [], isLoading } = useContracts()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const in90Days     = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const stats = useMemo(() => {
    const active    = contracts.filter(c => c[f.status] === 100000000)
    const thisMonth = contracts.filter(c => {
      const d = c[f.end] ? new Date(c[f.end] as string) : null
      return d && d >= startOfMonth && d <= endOfMonth
    })
    const within90  = contracts.filter(c => {
      const d = c[f.end] ? new Date(c[f.end] as string) : null
      return d && d >= now && d <= in90Days && c[f.status] === 100000000
    })
    const autoRenew = contracts.filter(c => c[f.auto_renewal] === 100000000 && c[f.status] === 100000000)
    return { active, thisMonth, within90, autoRenew }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts])

  const typeChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    contracts.forEach(c => {
      const t = c[f.type] as number
      counts[t] = (counts[t] ?? 0) + 1
    })
    return Object.entries(counts).map(([k, v]) => ({
      name: CONTRACT_TYPE_LABEL[Number(k) as ContractType] ?? k,
      count: v,
    }))
  }, [contracts])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    contracts.forEach(c => {
      const s = c[f.status] as number
      counts[s] = (counts[s] ?? 0) + 1
    })
    return Object.entries(counts).map(([k, v]) => ({
      name: CONTRACT_STATUS_LABEL[Number(k) as ContractStatus] ?? k,
      value: v,
      color: CONTRACT_STATUS_COLOR[Number(k) as ContractStatus]?.split(" ")[0]?.replace("bg-", "") ?? "#6b7280",
    }))
  }, [contracts])

  const alertContracts = useMemo(() => {
    return contracts
      .filter(c => {
        const d = c[f.end] ? new Date(c[f.end] as string) : null
        return d && d >= now && d <= in90Days && c[f.status] === 100000000
      })
      .sort((a, b) => {
        const da = new Date(a[f.end] as string).getTime()
        const db = new Date(b[f.end] as string).getTime()
        return da - db
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts])

  const PIE_COLOR_MAP: Record<string, string> = {
    "bg-green-100": "#22c55e",
    "bg-red-100":   "#ef4444",
    "bg-yellow-100":"#eab308",
    "bg-gray-100":  "#6b7280",
    "bg-blue-100":  "#3b82f6",
  }

  function getStatusBgClass(status: number): string {
    const colorStr = CONTRACT_STATUS_COLOR[status as ContractStatus] ?? ""
    return colorStr.split(" ")[0] ?? "bg-gray-100"
  }

  function getStatusColor(status: number): string {
    const bg = getStatusBgClass(status)
    return PIE_COLOR_MAP[bg] ?? "#6b7280"
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">有効契約数</CardTitle>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.active.length}</div>
            <p className="text-xs text-muted-foreground mt-1">現在有効な契約</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">今月期限</CardTitle>
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.thisMonth.length}</div>
            <p className="text-xs text-muted-foreground mt-1">今月末までに期限切れ</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">3ヶ月以内期限</CardTitle>
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.within90.length}</div>
            <p className="text-xs text-muted-foreground mt-1">90日以内に期限（有効のみ）</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">自動更新あり</CardTitle>
              <RefreshCw className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.autoRenew.length}</div>
            <p className="text-xs text-muted-foreground mt-1">有効 × 自動更新あり</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart: by contract type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">契約種別ごとの件数</CardTitle>
          </CardHeader>
          <CardContent>
            {typeChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={typeChartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="件数" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie chart: by status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ステータス別件数</CardTitle>
          </CardHeader>
          <CardContent>
            {statusChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getStatusColor(
                          Object.keys(CONTRACT_STATUS_LABEL).find(
                            k => CONTRACT_STATUS_LABEL[Number(k) as ContractStatus] === entry.name
                          ) ? Number(Object.keys(CONTRACT_STATUS_LABEL).find(
                            k => CONTRACT_STATUS_LABEL[Number(k) as ContractStatus] === entry.name
                          )) : 0
                        )}
                      />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiry alert table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            期限アラート（90日以内・有効契約）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertContracts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">期限が近い契約はありません</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>件名</TableHead>
                    <TableHead>取引先</TableHead>
                    <TableHead>終了日</TableHead>
                    <TableHead>自動更新</TableHead>
                    <TableHead>ステータス</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertContracts.map((c, i) => {
                    const status = c[f.status] as ContractStatus
                    const colorClass = CONTRACT_STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600"
                    const autoRenewal = c[f.auto_renewal] as AutoRenewal
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{String(c[f.name] ?? "")}</TableCell>
                        <TableCell>{String(c[f.counterparty] ?? "")}</TableCell>
                        <TableCell>{c[f.end] ? String(c[f.end]).slice(0, 10) : ""}</TableCell>
                        <TableCell>{AUTO_RENEWAL_LABEL[autoRenewal] ?? ""}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                            {CONTRACT_STATUS_LABEL[status] ?? String(status)}
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
    </div>
  )
}
