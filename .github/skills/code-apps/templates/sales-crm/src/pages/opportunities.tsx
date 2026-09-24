import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataState } from "@/components/crm/data-state"
import { PageHeader } from "@/components/crm/page-header"
import { RecordDialog } from "@/components/crm/record-dialog"
import { formatDate, formatMoney, optionLabel } from "@/crm/format"
import { isOpen } from "@/crm/metrics"
import { STAGE_OPTIONS } from "@/crm/schema"
import { useAccounts, useOpportunities, useUserMap } from "@/hooks/use-crm"

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm"

export default function Opportunities() {
  const navigate = useNavigate()
  const opportunities = useOpportunities()
  const accounts = useAccounts()
  const users = useUserMap()
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState("open")
  const [owner, setOwner] = useState("all")
  const [creating, setCreating] = useState(false)

  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data])
  const owners = useMemo(() => [...new Set((opportunities.data ?? []).map((o) => o.ownerId).filter((id): id is string => !!id))], [opportunities.data])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (opportunities.data ?? []).filter((o) =>
      (stage === "all" || (stage === "open" ? isOpen(o) : o.stage === Number(stage))) &&
      (owner === "all" || o.ownerId === owner) &&
      (!q || o.name.toLowerCase().includes(q) || (accountName.get(o.accountId ?? "") ?? "").toLowerCase().includes(q)),
    )
  }, [opportunities.data, query, stage, owner, accountName])
  const total = rows.reduce((s, o) => s + o.amount, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="商談" description="パイプラインを検索・絞り込み、詳細で更新します"
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />商談を追加</Button>} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="商談名・取引先で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="ステージ">
          <option value="open">進行中</option>
          <option value="all">すべて</option>
          {STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="担当者">
          <option value="all">全担当者</option>
          {owners.map((id) => <option key={id} value={id}>{users.get(id)?.name ?? id}</option>)}
        </select>
        <p className="ml-auto text-sm text-muted-foreground">{rows.length} 件・合計 <span className="font-semibold text-foreground">{formatMoney(total)}</span></p>
      </div>

      <DataState isLoading={opportunities.isLoading} error={opportunities.error}>
        <Card className="min-w-0">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商談名</TableHead><TableHead>取引先</TableHead><TableHead>ステージ</TableHead>
                  <TableHead className="text-right">金額</TableHead><TableHead className="text-right">確度</TableHead>
                  <TableHead>クローズ予定</TableHead><TableHead>担当者</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/opportunities/${o.id}`)}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell>{accountName.get(o.accountId ?? "") ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{optionLabel(STAGE_OPTIONS, o.stage)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(o.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.probability}%</TableCell>
                    <TableCell>{formatDate(o.closeDate)}</TableCell>
                    <TableCell>{users.get(o.ownerId ?? "")?.name ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">該当する商談がありません</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </DataState>

      <RecordDialog entity="opportunity" open={creating} onOpenChange={setCreating} />
    </div>
  )
}
