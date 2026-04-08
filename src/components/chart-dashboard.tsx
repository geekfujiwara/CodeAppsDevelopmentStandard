import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChartConfig } from "@/components/ui/chart"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart, Pie, PieChart, Cell } from "recharts"
import { useLearnCatalog } from "@/hooks/use-learn-catalog"
import { useMemo } from "react"

export function ChartDashboard() {
  const { data: catalog, isLoading } = useLearnCatalog()

  // データ集計
  const chartData = useMemo(() => {
    if (!catalog?.modules) return null

    // 1. ロール別モジュール数
    const roleCount = new Map<string, number>()
    catalog.modules.forEach((module) => {
      module.roles.forEach((role) => {
        roleCount.set(role, (roleCount.get(role) || 0) + 1)
      })
    })

    const roleData = Array.from(roleCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([role, count]) => ({
        role: role.replace("administrator", "管理者")
          .replace("developer", "開発者")
          .replace("business-user", "ビジネスユーザー")
          .replace("functional-consultant", "機能コンサルタント")
          .replace("solution-architect", "ソリューションアーキテクト"),
        count,
      }))

    // 2. レベル別分布
    const levelCount = new Map<string, number>()
    catalog.modules.forEach((module) => {
      module.levels.forEach((level) => {
        levelCount.set(level, (levelCount.get(level) || 0) + 1)
      })
    })

    const levelData = Array.from(levelCount.entries()).map(([level, count]) => ({
      level: level.replace("beginner", "初級")
        .replace("intermediate", "中級")
        .replace("advanced", "上級"),
      count,
      fill: level === "beginner" ? "#93c5fd" : 
            level === "intermediate" ? "#c4b5fd" : "#86efac",
    }))

    // 3. 製品別モジュール数（トップ10）
    const productCount = new Map<string, number>()
    catalog.modules.forEach((module) => {
      module.products.forEach((product) => {
        productCount.set(product, (productCount.get(product) || 0) + 1)
      })
    })

    const productData = Array.from(productCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([product, count]) => ({
        product: product.length > 20 ? product.substring(0, 20) + "..." : product,
        count,
      }))

    // 4. 学習時間の分布
    const durationRanges = [
      { range: "0-30分", min: 0, max: 30, count: 0 },
      { range: "31-60分", min: 31, max: 60, count: 0 },
      { range: "61-120分", min: 61, max: 120, count: 0 },
      { range: "121-180分", min: 121, max: 180, count: 0 },
      { range: "181分以上", min: 181, max: Infinity, count: 0 },
    ]

    catalog.modules.forEach((module) => {
      const duration = module.durationInMinutes
      const range = durationRanges.find((r) => duration >= r.min && duration <= r.max)
      if (range) range.count++
    })

    return {
      roleData,
      levelData,
      productData,
      durationData: durationRanges,
    }
  }, [catalog])

  if (isLoading || !chartData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          データを読み込んでいます...
        </CardContent>
      </Card>
    )
  }

  const chartConfig = {
    count: {
      label: "モジュール数",
      color: "#93c5fd",
    },
  } satisfies ChartConfig

  const levelChartConfig = {
    count: {
      label: "モジュール数",
    },
  } satisfies ChartConfig

  return (
    <div className="space-y-6">
      {/* グラフグリッド */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ロール別モジュール数 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ロール別モジュール数</CardTitle>
            <CardDescription>各ロールに対応するモジュールの数</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={chartData.roleData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="role"
                  tickLine={false}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => `ロール: ${value}`}
                      formatter={(value) => [`${value}`, "モジュール数"]}
                    />
                  }
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* レベル別分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">レベル別分布</CardTitle>
            <CardDescription>難易度レベルごとのモジュール分布</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={levelChartConfig} className="h-[300px] w-full max-w-[300px]">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => `レベル: ${value}`}
                      formatter={(value) => [`${value}`, "モジュール数"]}
                    />
                  }
                />
                <Pie
                  data={chartData.levelData}
                  dataKey="count"
                  nameKey="level"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={40}
                  label={({
                    cx,
                    cy,
                    midAngle,
                    innerRadius,
                    outerRadius,
                    level,
                  }) => {
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180)
                    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180)
                    
                    return (
                      <g>
                        <rect
                          x={x - 20}
                          y={y - 10}
                          width={40}
                          height={20}
                          fill="rgba(0, 0, 0, 0.7)"
                          rx={4}
                        />
                        <text
                          x={x}
                          y={y}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={12}
                          fontWeight="bold"
                        >
                          {`${level}`}
                        </text>
                      </g>
                    )
                  }}
                  labelLine={false}
                >
                  {chartData.levelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 製品別モジュール数 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">製品別モジュール数（トップ10）</CardTitle>
            <CardDescription>各製品に関連するモジュールの数</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={chartData.productData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="product"
                  tickLine={false}
                  axisLine={false}
                  width={150}
                  fontSize={12}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => `製品: ${value}`}
                      formatter={(value) => [`${value}`, "モジュール数"]}
                    />
                  }
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 学習時間の分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">学習時間の分布</CardTitle>
            <CardDescription>所要時間別のモジュール分布</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={chartData.durationData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="range"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => `時間: ${value}`}
                      formatter={(value) => [`${value}`, "モジュール数"]}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-count)", r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総モジュール数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{catalog?.modules?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              平均学習時間
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {catalog?.modules
                ? Math.round(
                    catalog.modules.reduce((sum, m) => sum + m.durationInMinutes, 0) /
                      catalog.modules.length
                  )
                : 0}
              <span className="text-lg text-muted-foreground ml-1">分</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              対応ロール数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{chartData.roleData.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              対応製品数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{chartData.productData.length}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
