import { useEffect, useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Loader2, MessagesSquare, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { formatDateTime } from "@/lib/date-format"
import { listEvalTurns, turnsQueryKey } from "@/lib/eval-turns"

export function TurnNav({ currentId }: { currentId: string }) {
  const [search, setSearch] = useState("")
  const [term, setTerm] = useState("")

  // Every keystroke would otherwise be a Dataverse round trip.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  const filter = useMemo(() => ({ search: term, actor: "" }), [term])
  const { data, isLoading, isFetching } = useQuery({
    queryKey: turnsQueryKey(filter),
    queryFn: () => listEvalTurns(filter),
    placeholderData: keepPreviousData,
  })

  const turns = data ?? []

  return (
    <aside className="flex h-[calc(100dvh-7rem)] min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">会話</span>
        <span className="ml-auto text-xs text-muted-foreground">{turns.length}</span>
      </div>
      <div className="relative border-b p-2">
        <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="会話を検索"
          className="h-8 pl-7 pr-7 text-xs"
        />
        {isFetching && (
          <Loader2 className="absolute right-4 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {/* ScrollArea だと truncate が効かないので素の div でスクロールさせる */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">読み込み中...</p>
        ) : turns.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">該当する会話がありません</p>
        ) : (
          <ul className="p-1">
            {turns.map((turn) => {
              const isCurrent = turn.id === currentId
              return (
                <li key={turn.id}>
                  <Link
                    to={`/turns/${turn.id}`}
                    className={`block rounded-md px-2 py-2 text-xs ${
                      isCurrent ? "bg-primary/10 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <div className="truncate">{turn.actorLabel}</div>
                    <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                      {turn.query || "(なし)"}
                    </p>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {formatDateTime(turn.occurredOn)}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
