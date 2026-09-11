import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2, Search } from "lucide-react"
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { MergeAction } from "@/components/merge-action"
import { ScoreBadge, VerdictBadge } from "@/components/eval-bits"
import { formatDateTime } from "@/lib/date-format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  listEvalTurns,
  listTurnActors,
  needsAttention,
  TURN_ACTORS_KEY,
  turnsQueryKey,
  VERDICT_NG,
  VERDICT_OK,
  type EvalTurn,
} from "@/lib/eval-turns"

const VIEWS = [
  { key: "all", label: "すべて", match: () => true },
  { key: "attention", label: "要確認", match: needsAttention },
  { key: "unlabeled", label: "未評価", match: (t: EvalTurn) => t.humanVerdict === null },
  { key: "ok", label: "OK", match: (t: EvalTurn) => t.humanVerdict === VERDICT_OK },
  { key: "ng", label: "NG", match: (t: EvalTurn) => t.humanVerdict === VERDICT_NG },
] as const

type ViewKey = (typeof VIEWS)[number]["key"]

export default function Turns() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState("")
  const [term, setTerm] = useState("")
  const [actor, setActor] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const requested = searchParams.get("view")
  const view: ViewKey = VIEWS.some((item) => item.key === requested)
    ? (requested as ViewKey)
    : "all"

  // Every keystroke would otherwise be a Dataverse round trip.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  const filter = useMemo(() => ({ search: term, actor }), [term, actor])
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: turnsQueryKey(filter),
    queryFn: () => listEvalTurns(filter),
    placeholderData: keepPreviousData,
  })

  const { data: actors } = useQuery({
    queryKey: TURN_ACTORS_KEY,
    queryFn: listTurnActors,
    staleTime: 5 * 60 * 1000,
  })

  const turns = useMemo(() => data ?? [], [data])
  const counts = useMemo(
    () =>
      Object.fromEntries(
        VIEWS.map((item) => [item.key, turns.filter(item.match).length]),
      ) as Record<ViewKey, number>,
    [turns],
  )
  const visible = useMemo(
    () => turns.filter(VIEWS.find((item) => item.key === view)!.match),
    [turns, view],
  )
  // 選んだ行は絞り込みを変えても覚えているので、今見えているものだけを統合対象にする。
  const selected = useMemo(() => visible.filter((turn) => picked.has(turn.id)), [visible, picked])

  const columns: TableColumn<EvalTurn>[] = [
    {
      key: "pick",
      label: "",
      width: "44px",
      align: "center",
      render: (item) => (
        <span className="flex justify-center" onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={picked.has(item.id)}
            disabled={item.isMerged}
            onCheckedChange={() =>
              setPicked((current) => {
                const next = new Set(current)
                if (next.has(item.id)) next.delete(item.id)
                else next.add(item.id)
                return next
              })
            }
            aria-label="統合するターンとして選ぶ"
          />
        </span>
      ),
    },
    {
      key: "occurredOn",
      label: "会話日時",
      sortable: true,
      width: "150px",
      render: (item) => <span className="text-xs">{formatDateTime(item.occurredOn)}</span>,
    },
    {
      key: "actorLabel",
      label: "相手",
      sortable: true,
      width: "180px",
      render: (item) => (
        <div className="text-xs">
          <div className="truncate font-medium">{item.actorLabel}</div>
          <div className="text-muted-foreground">{item.sourceLabel}</div>
        </div>
      ),
    },
    {
      key: "query",
      label: "質問",
      render: (item) => (
        <div className="min-w-0 space-y-1">
          {item.isMerged && (
            <Badge variant="secondary" className="text-[10px]">
              {item.turnCount ?? 0} ターンを統合
            </Badge>
          )}
          <span className="line-clamp-2 text-sm">{item.query || "(なし)"}</span>
        </div>
      ),
    },
    { key: "toolCount", label: "ツール数", sortable: true, align: "center", width: "90px" },
    {
      key: "toolCallAccuracy",
      label: "ツール精度",
      sortable: true,
      align: "center",
      width: "100px",
      render: (item) => <ScoreBadge score={item.toolCallAccuracy} />,
    },
    {
      key: "taskAdherence",
      label: "遵守度",
      sortable: true,
      align: "center",
      width: "90px",
      render: (item) => <ScoreBadge score={item.taskAdherence} />,
    },
    {
      key: "verdictLabel",
      label: "人手",
      align: "center",
      width: "90px",
      render: (item) => <VerdictBadge label={item.verdictLabel} />,
    },
  ]

  const filters: FilterConfig<EvalTurn>[] = [
    {
      key: "verdictLabel",
      label: "人手ラベル",
      options: [
        { value: "未評価", label: "未評価" },
        { value: "OK", label: "OK" },
        { value: "NG", label: "NG" },
      ],
    },
    {
      key: "sourceLabel",
      label: "経路",
      options: Array.from(new Set(turns.map((turn) => turn.sourceLabel))).map((value) => ({
        value,
        label: value,
      })),
    },
  ]

  if (isLoading) return <LoadingSkeletonList count={5} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">評価ターン</h1>
        <p className="text-muted-foreground">
          行をクリックすると会話の詳細が開き、人手ラベルを付けられます。
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="質問・応答・ツール名で Dataverse を検索..."
            className="pl-9"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="w-full sm:w-[260px]">
          <Combobox
            options={[
              { value: "all", label: "すべての相手" },
              ...(actors ?? []).map((value) => ({ value, label: value })),
            ]}
            value={actor || "all"}
            onValueChange={(value) => setActor(value === "all" ? "" : value)}
            placeholder="相手で絞り込む"
            searchPlaceholder="相手を検索..."
          />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <Tabs
          value={view}
          onValueChange={(next) =>
            setSearchParams(next === "all" ? {} : { view: next }, { replace: true })
          }
        >
          <TabsList>
            {VIEWS.map((item) => (
              <TabsTrigger key={item.key} value={item.key}>
                {item.label}
                <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[item.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {selected.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm">{selected.length} 件を選択中</span>
          <MergeAction turns={selected} onMerged={() => setPicked(new Set())} />
          <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
            選択を解除
          </Button>
          {selected.length < 2 ? (
            <span className="text-xs text-muted-foreground">2 件以上を選ぶと統合できます。</span>
          ) : (
            new Set(selected.map((turn) => turn.actorLabel)).size > 1 && (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                相手が異なるターンが混ざっています。
              </span>
            )
          )}
        </div>
      )}

      {isError ? (
        <p className="text-sm text-destructive">
          評価ターンを取得できませんでした: {(error as Error).message}
        </p>
      ) : (
        <ListTable
          data={visible}
          columns={columns}
          filters={filters}
          searchable={false}
          itemsPerPage={15}
          emptyMessage={
            term || actor || view !== "all"
              ? "条件に合う会話は見つかりませんでした"
              : "評価ターンがまだありません"
          }
          onRowClick={(item) => navigate(`/turns/${item.id}`)}
        />
      )}
    </div>
  )
}
