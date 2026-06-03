# 日本地図パターン（Code Apps 向け）

Code Apps（React + TypeScript + Tailwind CSS + shadcn/ui）で日本地図を表示し、都道府県別のデータ可視化を行うデザインパターン。
SVG アセットは `public/maps/` に格納済み。

> **出典**: [geolonia/japanese-prefectures](https://github.com/geolonia/japanese-prefectures)（GFDL ライセンス）

---

## SVG ファイル選定ガイド

| ファイル | パス | 推奨場面 |
|---------|------|---------|
| `map-full.svg` | `/maps/map-full.svg` | デスクトップ向け詳細表示。実際の地形に近いパス |
| `map-mobile.svg` | `/maps/map-mobile.svg` | モバイルレイアウト |
| `map-circle.svg` | `/maps/map-circle.svg` | デフォルメ表示（丸）。ヒートマップ風 |
| `map-polygon.svg` | `/maps/map-polygon.svg` | デフォルメ表示（矩形）。シンプルなエリア色分け |

---

## パターン 6: 日本地図ダッシュボード

**向いている場面**: 地域別売上可視化・拠点管理・設備分布・顧客分布・災害対応マップ

### コンポーネント構成

```tsx
// ページ構成: StatsCards → JapanMap + 詳細パネル + DataGrid
<div className="space-y-6">
  <StatsCards cards={regionStats} />
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>地域別データ</CardTitle>
        {/* 地方フィルタ */}
        <Select value={selectedRegion} onValueChange={setSelectedRegion}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="地方を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全国</SelectItem>
            <SelectItem value="hokkaido">北海道</SelectItem>
            <SelectItem value="tohoku">東北</SelectItem>
            <SelectItem value="kanto">関東</SelectItem>
            <SelectItem value="chubu">中部</SelectItem>
            <SelectItem value="kinki">近畿</SelectItem>
            <SelectItem value="chugoku">中国</SelectItem>
            <SelectItem value="shikoku">四国</SelectItem>
            <SelectItem value="kyushu-okinawa">九州・沖縄</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <JapanMap
          data={prefectureData}
          selectedRegion={selectedRegion}
          onPrefectureClick={setSelectedPrefecture}
        />
        <MapLegend items={legendItems} />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>
          {selectedPrefecture ? prefectureNames[selectedPrefecture] : "都道府県を選択"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PrefectureDetail code={selectedPrefecture} data={prefectureData} />
      </CardContent>
    </Card>
  </div>
  <Card>
    <CardHeader><CardTitle>データ一覧</CardTitle></CardHeader>
    <CardContent>
      <ListTable data={tableData} columns={prefectureColumns} searchKeys={["name"]} />
    </CardContent>
  </Card>
</div>
```

### JapanMap コンポーネント実装

```tsx
// src/components/japan-map.tsx
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface JapanMapProps {
  /** 都道府県コード → 数値のマッピング */
  data: Record<string, number>
  /** 選択中の地方フィルタ（CSS クラス名）。"all" で全地方表示 */
  selectedRegion?: string
  /** 都道府県クリック時のコールバック（都道府県コード） */
  onPrefectureClick?: (code: string) => void
  /** SVG バリアント（デフォルト: full） */
  variant?: "full" | "mobile" | "circle" | "polygon"
  /** 色分け関数（値 → Tailwind/CSS カラー） */
  colorScale?: (value: number) => string
  className?: string
}

const SVG_PATHS: Record<string, string> = {
  full: "/maps/map-full.svg",
  mobile: "/maps/map-mobile.svg",
  circle: "/maps/map-circle.svg",
  polygon: "/maps/map-polygon.svg",
}

/** デフォルトの5段階カラースケール */
function defaultColorScale(value: number): string {
  if (value >= 80) return "#1a8f6e" // teal
  if (value >= 60) return "#2d5faa" // blue
  if (value >= 40) return "#b8850e" // amber
  if (value >= 20) return "#c4532a" // coral
  return "#c43a3a"                   // red
}

export function JapanMap({
  data,
  selectedRegion = "all",
  onPrefectureClick,
  variant = "full",
  colorScale = defaultColorScale,
  className,
}: JapanMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    text: string; x: number; y: number
  } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // SVG を fetch してインライン展開
    fetch(SVG_PATHS[variant])
      .then((res) => res.text())
      .then((svgText) => {
        container.innerHTML = svgText

        const prefs = container.querySelectorAll(".prefecture")
        prefs.forEach((pref) => {
          const el = pref as SVGGElement
          const code = el.getAttribute("data-code") || ""
          const titleEl = el.querySelector("title")
          const name = titleEl?.textContent || ""
          const value = data[code]

          // データに基づく色分け
          if (value !== undefined) {
            el.querySelectorAll("path, circle, polygon").forEach((shape) => {
              const s = shape as SVGElement
              s.style.fill = colorScale(value)
              s.style.cursor = "pointer"
              s.style.transition = "fill 0.2s, opacity 0.2s"
            })
          } else {
            el.querySelectorAll("path, circle, polygon").forEach((shape) => {
              const s = shape as SVGElement
              s.style.fill = "#e5e7eb"
              s.style.cursor = "pointer"
              s.style.transition = "fill 0.2s, opacity 0.2s"
            })
          }

          // ホバー
          el.addEventListener("mouseover", (e: Event) => {
            el.querySelectorAll("path, circle, polygon").forEach((shape) => {
              ;(shape as SVGElement).style.opacity = "0.7"
            })
            const rect = container.getBoundingClientRect()
            const me = e as MouseEvent
            setTooltip({
              text: name + (value !== undefined ? `: ${value}` : ""),
              x: me.clientX - rect.left + 10,
              y: me.clientY - rect.top - 10,
            })
          })

          el.addEventListener("mouseleave", () => {
            el.querySelectorAll("path, circle, polygon").forEach((shape) => {
              ;(shape as SVGElement).style.opacity = "1"
            })
            setTooltip(null)
          })

          // クリック
          el.addEventListener("click", () => {
            onPrefectureClick?.(code)
          })
        })
      })

    return () => {
      container.innerHTML = ""
    }
  }, [data, variant, colorScale, onPrefectureClick])

  // 地方フィルタ
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const prefs = container.querySelectorAll(".prefecture")
    prefs.forEach((pref) => {
      const el = pref as SVGGElement
      if (selectedRegion === "all" || el.classList.contains(selectedRegion)) {
        el.style.opacity = "1"
      } else {
        el.style.opacity = "0.15"
      }
    })
  }, [selectedRegion])

  return (
    <div className={cn("relative w-full", className)}>
      <div ref={containerRef} className="w-full [&_svg]:w-full [&_svg]:h-auto" />
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 rounded bg-background text-foreground text-xs font-medium px-2 py-1 shadow-md"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
```

### MapLegend コンポーネント

```tsx
// src/components/map-legend.tsx
interface LegendItem {
  color: string
  label: string
}

export function MapLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex gap-4 justify-center mt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
```

### ページ実装例

```tsx
// src/pages/region-dashboard.tsx
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { DataverseService } from "@/services/DataverseService"
import { JapanMap } from "@/components/japan-map"
import { MapLegend } from "@/components/map-legend"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatsCards } from "@/components/gallery-components"
import type { StatCardData } from "@/components/search-filter-gallery"
import { ListTable } from "@/components/list-table"
import type { TableColumn } from "@/components/list-table"
import { MapPin, TrendingUp, Building, Users } from "lucide-react"

export default function RegionDashboard() {
  const [selectedRegion, setSelectedRegion] = useState("all")
  const [selectedPrefecture, setSelectedPrefecture] = useState<string | null>(null)

  // Dataverse からデータ取得
  const { data: records = [] } = useQuery({
    queryKey: ["{prefix}_regions"],
    queryFn: () =>
      DataverseService.GetItems(
        "{prefix}_regions",
        "$select={prefix}_prefecturecode,{prefix}_value,{prefix}_name"
      ),
  })

  // 都道府県コード → 値のマッピング
  const prefectureData = useMemo(() => {
    const map: Record<string, number> = {}
    records.forEach((r: any) => {
      const code = String(r["{prefix}_prefecturecode"])
      map[code] = (map[code] || 0) + Number(r["{prefix}_value"] || 0)
    })
    return map
  }, [records])

  // KPI
  const stats: StatCardData[] = [
    { title: "全国合計", value: String(Object.values(prefectureData).reduce((a, b) => a + b, 0)), icon: MapPin },
    { title: "都道府県数", value: String(Object.keys(prefectureData).length), icon: Building },
  ]

  const legendItems = [
    { color: "#1a8f6e", label: "80〜100" },
    { color: "#2d5faa", label: "60〜79" },
    { color: "#b8850e", label: "40〜59" },
    { color: "#c4532a", label: "20〜39" },
    { color: "#c43a3a", label: "0〜19" },
  ]

  return (
    <div className="space-y-6">
      <StatsCards cards={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>地域別データ</CardTitle>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="地方を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全国</SelectItem>
                <SelectItem value="hokkaido">北海道</SelectItem>
                <SelectItem value="tohoku">東北</SelectItem>
                <SelectItem value="kanto">関東</SelectItem>
                <SelectItem value="chubu">中部</SelectItem>
                <SelectItem value="kinki">近畿</SelectItem>
                <SelectItem value="chugoku">中国</SelectItem>
                <SelectItem value="shikoku">四国</SelectItem>
                <SelectItem value="kyushu-okinawa">九州・沖縄</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <JapanMap
              data={prefectureData}
              selectedRegion={selectedRegion}
              onPrefectureClick={setSelectedPrefecture}
            />
            <MapLegend items={legendItems} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedPrefecture ? `コード: ${selectedPrefecture}` : "都道府県を選択"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPrefecture ? (
              <div className="space-y-2 text-sm">
                <p>値: {prefectureData[selectedPrefecture] ?? "データなし"}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">地図上の都道府県をクリックしてください</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

## コンポーネント選定ガイドへの追加

| やりたいこと | 推奨コンポーネント |
|------------|-----------------|
| 地域別データを地図で可視化 | `JapanMap`（SVG 都道府県クリック + 色分け + 地方フィルタ） |
| 地図の凡例表示 | `MapLegend`（カラースケール + ラベル） |

---

## 都道府県コード一覧

| コード | 都道府県 | 地方 CSS クラス |
|--------|---------|----------------|
| 1 | 北海道 | `hokkaido` |
| 2 | 青森 | `tohoku` |
| 3 | 岩手 | `tohoku` |
| 4 | 宮城 | `tohoku` |
| 5 | 秋田 | `tohoku` |
| 6 | 山形 | `tohoku` |
| 7 | 福島 | `tohoku` |
| 8 | 茨城 | `kanto` |
| 9 | 栃木 | `kanto` |
| 10 | 群馬 | `kanto` |
| 11 | 埼玉 | `kanto` |
| 12 | 千葉 | `kanto` |
| 13 | 東京 | `kanto` |
| 14 | 神奈川 | `kanto` |
| 15 | 新潟 | `chubu` |
| 16 | 富山 | `chubu` |
| 17 | 石川 | `chubu` |
| 18 | 福井 | `chubu` |
| 19 | 山梨 | `chubu` |
| 20 | 長野 | `chubu` |
| 21 | 岐阜 | `chubu` |
| 22 | 静岡 | `chubu` |
| 23 | 愛知 | `chubu` |
| 24 | 三重 | `kinki` |
| 25 | 滋賀 | `kinki` |
| 26 | 京都 | `kinki` |
| 27 | 大阪 | `kinki` |
| 28 | 兵庫 | `kinki` |
| 29 | 奈良 | `kinki` |
| 30 | 和歌山 | `kinki` |
| 31 | 鳥取 | `chugoku` |
| 32 | 島根 | `chugoku` |
| 33 | 岡山 | `chugoku` |
| 34 | 広島 | `chugoku` |
| 35 | 山口 | `chugoku` |
| 36 | 徳島 | `shikoku` |
| 37 | 香川 | `shikoku` |
| 38 | 愛媛 | `shikoku` |
| 39 | 高知 | `shikoku` |
| 40 | 福岡 | `kyushu-okinawa` |
| 41 | 佐賀 | `kyushu-okinawa` |
| 42 | 長崎 | `kyushu-okinawa` |
| 43 | 熊本 | `kyushu-okinawa` |
| 44 | 大分 | `kyushu-okinawa` |
| 45 | 宮崎 | `kyushu-okinawa` |
| 46 | 鹿児島 | `kyushu-okinawa` |
| 47 | 沖縄 | `kyushu-okinawa` |
