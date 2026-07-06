import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { CrossTab } from "@/components/cross-tab"
import { useSites, usePunchItems } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { ITEM_VERIFIED } from "@/types/dataverse"

const P = PUBLISHER_PREFIX

const f = {
  site_ref: `${P}_site_ref`,
  location: `${P}_location`,
  category: `${P}_category`,
  status:   `${P}_status`,
}

const st = {
  id:   `${P}_siteid`,
  name: `${P}_name`,
}

export default function MatrixPage() {
  const { data: items = [], isLoading } = usePunchItems()
  const { data: sites = [] } = useSites()

  const [siteFilter, setSiteFilter] = useState("all")
  const [scope, setScope] = useState<"open" | "all">("open")

  const entries = useMemo(() =>
    items
      .filter(item => siteFilter === "all" || String(item[f.site_ref]) === siteFilter)
      .filter(item => scope === "all" || (item[f.status] as number) !== ITEM_VERIFIED)
      .map(item => ({
        row: (item[f.location] as string) || "場所未設定",
        col: (item[f.category] as string) || "未分類",
      })),
    [items, siteFilter, scope]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">マトリクス</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">マトリクス</h1>
        <p className="text-muted-foreground text-sm mt-1">
          場所 × 分類のクロス集計。色が濃いセルほど指摘が集中しています
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>指摘の集中箇所</CardTitle>
              <CardDescription>{entries.length} 件を集計</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="現場" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての現場</SelectItem>
                  {sites.map((site, idx) => (
                    <SelectItem key={idx} value={String(site[st.id] ?? "")}>
                      {String(site[st.name] ?? "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={scope} onValueChange={v => setScope(v as "open" | "all")}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="対象" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">未完了のみ</SelectItem>
                  <SelectItem value="all">すべての指摘</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CrossTab
            entries={entries}
            rowHeader="場所"
            emptyText={scope === "open" ? "未完了の指摘がありません" : "指摘がありません"}
          />
        </CardContent>
      </Card>
    </div>
  )
}
