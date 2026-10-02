import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Search } from "lucide-react"
import { ConstructionService } from "@/services/construction-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"

export default function Knowledge() {
  const [query, setQuery] = useState("")
  const [workTypeId, setWorkTypeId] = useState("")
  const [kind, setKind] = useState("")
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const workTypes = useQuery({ queryKey: ["workTypes"], queryFn: ConstructionService.workTypes })
  const filtered = useMemo(() => {
    const term = query.toLocaleLowerCase("ja")
    return knowledge.data?.filter((item) =>
      (!term || `${item.name} ${item.event} ${item.lesson} ${item.keywords}`.toLocaleLowerCase("ja").includes(term)) &&
      (!workTypeId || item.workTypeId === workTypeId) &&
      (!kind || item.knowledgeType === Number(kind))
    ) ?? []
  }, [kind, knowledge.data, query, workTypeId])
  if (knowledge.isLoading || workTypes.isLoading) return <LoadingSkeletonGrid count={4} columns={2} />
  if (knowledge.error || workTypes.error) return <p className="rounded-lg border border-destructive p-4 text-destructive">ナレッジを取得できませんでした。</p>

  return <div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-primary">現場横断の知恵</p><h1 className="text-3xl font-bold">ナレッジ検索</h1><p className="text-muted-foreground">過去の事象と対策を検索し、安全活動に活用します。</p></header>
    <Card><CardContent className="grid grid-cols-[minmax(0,1fr)_16rem_12rem] gap-3 p-5 max-lg:grid-cols-1">
      <label className="relative min-w-0"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><input className="h-11 w-full rounded-md border bg-background pl-10 pr-3" placeholder="タイトル、事象、対策、キーワード" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select className="h-11 rounded-md border bg-background px-3" value={workTypeId} onChange={(event) => setWorkTypeId(event.target.value)}><option value="">すべての工種</option>{workTypes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select className="h-11 rounded-md border bg-background px-3" value={kind} onChange={(event) => setKind(event.target.value)}><option value="">すべての区分</option><option value="100000000">安全</option><option value="100000001">品質</option><option value="100000002">工程</option><option value="100000003">工法</option></select>
    </CardContent></Card>
    <p className="text-sm text-muted-foreground">{filtered.length}件のナレッジ</p>
    <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">{filtered.map((item) => <Card key={item.id} className="min-w-0"><CardHeader><CardTitle className="[overflow-wrap:anywhere]">{item.name}</CardTitle></CardHeader><CardContent className="space-y-3"><p><strong>事象:</strong> {item.event}</p><p><strong>対策・教訓:</strong> {item.lesson}</p><p className="text-sm text-muted-foreground">{item.keywords}</p>{item.sourceIncidentId && <Link className="text-sm font-semibold text-primary underline" to="/incidents">元のヒヤリハットを確認</Link>}</CardContent></Card>)}</div>
    {!filtered.length && <p className="rounded-lg border p-8 text-center text-muted-foreground">条件に一致するナレッジはありません。</p>}
  </div>
}
