import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useAssets, useLoans, useDisposals } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ASSET_STATUS_LABEL,
  ASSET_CATEGORY_LABEL,
  type AssetStatus,
  type AssetCategory,
} from "@/types/dataverse"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { Package, ArrowLeftRight, AlertCircle, Trash2 } from "lucide-react"

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function Dashboard() {
  const P = PUBLISHER_PREFIX

  const { data: assets = [], isLoading: assetsLoading }   = useAssets()
  const { data: loans  = [], isLoading: loansLoading  }   = useLoans()
  const { data: disposals = [], isLoading: disposalsLoading } = useDisposals()

  const assetStatus  = `${P}_status`
  const assetCategory = `${P}_category`
  const assetName    = `${P}_asset_name`
  const loanStatus   = `${P}_status`
  const loanReturn   = `${P}_return_due_date`
  const disposalSt   = `${P}_status`

  const isLoading = assetsLoading || loansLoading || disposalsLoading

  const stats = useMemo(() => {
    const totalAssets   = assets.length
    const onLoan        = assets.filter((a) => (a[assetStatus] as number) === 100000001).length
    const today         = new Date().toISOString().slice(0, 10)
    const overdueLoans  = loans.filter((l) => {
      const due  = (l[loanReturn] as string)?.slice(0, 10) ?? ""
      const stat = (l[loanStatus] as number)
      return stat === 100000000 && due && due < today
    }).length
    const pendingDisposals = disposals.filter((d) => (d[disposalSt] as number) === 100000000).length
    return { totalAssets, onLoan, overdueLoans, pendingDisposals }
  }, [assets, loans, disposals, assetStatus, loanReturn, loanStatus, disposalSt])

  const categoryChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    assets.forEach((a) => {
      const c = (a[assetCategory] as number) ?? -1
      counts[c] = (counts[c] ?? 0) + 1
    })
    return Object.entries(ASSET_CATEGORY_LABEL).map(([value, label]) => ({
      name: label,
      件数: counts[Number(value)] ?? 0,
    })).filter((d) => d.件数 > 0)
  }, [assets, assetCategory])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    assets.forEach((a) => {
      const s = (a[assetStatus] as number) ?? 100000000
      counts[s] = (counts[s] ?? 0) + 1
    })
    return Object.entries(ASSET_STATUS_LABEL).map(([value, label]) => ({
      name: label,
      value: counts[Number(value)] ?? 0,
    })).filter((d) => d.value > 0)
  }, [assets, assetStatus])

  const recentAssets = useMemo(() => assets.slice(0, 5), [assets])

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

      {/* KPIカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              総資産数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalAssets}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              貸出中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.onLoan}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              延滞返却
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.overdueLoans}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              廃棄申請中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{stats.pendingDisposals}</p>
          </CardContent>
        </Card>
      </div>

      {/* チャートエリア */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* カテゴリ別資産数 BarChart */}
        <Card>
          <CardHeader>
            <CardTitle>カテゴリ別資産数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={categoryChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="件数" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ステータス別 PieChart */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス別</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusChartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 最近登録された資産 */}
      <Card>
        <CardHeader>
          <CardTitle>最近登録された資産（直近5件）</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAssets.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">資産データがありません</p>
          ) : (
            <div className="divide-y divide-border">
              {recentAssets.map((asset, idx) => {
                const status   = (asset[assetStatus] as AssetStatus) ?? 100000000
                const category = asset[assetCategory] as AssetCategory
                const name     = (asset[assetName] as string) ?? "（名称なし）"
                return (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        status === 100000000 ? "bg-green-100 text-green-800" :
                        status === 100000001 ? "bg-blue-100 text-blue-800" :
                        status === 100000002 ? "bg-gray-100 text-gray-700" :
                        status === 100000003 ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {ASSET_STATUS_LABEL[status]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {category != null ? ASSET_CATEGORY_LABEL[category] : "—"}
                        </p>
                      </div>
                    </div>
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
