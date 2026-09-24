import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataState } from "@/components/crm/data-state"
import { PageHeader } from "@/components/crm/page-header"
import { RecordDialog } from "@/components/crm/record-dialog"
import { displayValue } from "@/crm/api"
import { cellText } from "@/crm/cell-text"
import { ENTITIES, type EntityKey } from "@/crm/schema"
import { useEntityRows, useUserMap } from "@/hooks/use-crm"

const DESCRIPTIONS: Partial<Record<EntityKey, string>> = {
  lead: "見込み客を育成し、認定したら商談へ進めます",
  account: "取引先企業の一覧",
  contact: "取引先の担当者。メール・日程調整の宛先になります",
  activity: "訪問・電話・メール・会議などの営業活動",
  target: "個人・部門の四半期目標。ダッシュボードの達成率の分母になります",
}

export default function RecordsPage({ entity }: { entity: EntityKey }) {
  const def = ENTITIES[entity]
  const navigate = useNavigate()
  const rows = useEntityRows(entity)
  const users = useUserMap()
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const columns = def.fields.filter((f) => f.inList)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows.data ?? []
    return (rows.data ?? []).filter((r) => columns.some((f) => displayValue(r, f).toLowerCase().includes(q)))
  }, [rows.data, query, columns])

  return (
    <div className="space-y-6">
      <PageHeader title={def.label} description={DESCRIPTIONS[entity]}
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{def.label}を追加</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <p className="ml-auto text-sm text-muted-foreground">{filtered.length} 件</p>
      </div>
      <DataState isLoading={rows.isLoading} error={rows.error}>
        <Card className="min-w-0">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((f) => <TableHead key={f.name}>{f.label}</TableHead>)}
                  {def.ownerScoped && <TableHead>所有者</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={String(r[def.idField])} className="cursor-pointer" onClick={() => navigate(`${def.path}/${String(r[def.idField])}`)}>
                    {columns.map((f) => <TableCell key={f.name} className={f.type === "money" ? "tabular-nums" : undefined}>{cellText(r, f)}</TableCell>)}
                    {def.ownerScoped && <TableCell>{users.get(String(r._ownerid_value ?? ""))?.name ?? "—"}</TableCell>}
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </DataState>
      <RecordDialog entity={entity} open={creating} onOpenChange={setCreating} />
    </div>
  )
}
