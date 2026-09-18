import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Bot, ChevronDown, ChevronRight, Mail, Search, Server } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { UpdateNote } from "@/components/update-note"
import {
  buildOrgTree,
  listEvalAgents,
  EVAL_AGENTS_KEY,
  STATUS_ACTIVE,
  STATUS_BUILDING,
  STATUS_RETIRED,
  type EvalAgent,
  type OrgNode,
} from "@/lib/eval-agents"

const STATUS_STYLE: Record<number, string> = {
  [STATUS_ACTIVE]: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  [STATUS_BUILDING]: "border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  [STATUS_RETIRED]: "border-muted bg-muted text-muted-foreground",
}

function AgentCard({ agent }: { agent: EvalAgent }) {
  return (
    <div className="min-w-[16rem] rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-md bg-muted p-1.5">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{agent.name || agent.agentKey}</span>
            <Badge
              variant="outline"
              className={agent.status ? STATUS_STYLE[agent.status] : undefined}
            >
              {agent.statusLabel}
            </Badge>
          </div>
          {agent.role && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{agent.role}</p>
          )}
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {agent.upn && (
              <p className="flex items-center gap-1 truncate">
                <Mail className="size-3 shrink-0" />
                <span className="truncate">{agent.upn}</span>
              </p>
            )}
            {agent.webAppName && (
              <p className="flex items-center gap-1 truncate">
                <Server className="size-3 shrink-0" />
                <span className="truncate font-mono">{agent.webAppName}</span>
              </p>
            )}
          </div>
          {agent.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.skills.slice(0, 4).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-[10px]">
                  {skill}
                </Badge>
              ))}
              {agent.skills.length > 4 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{agent.skills.length - 4}
                </Badge>
              )}
            </div>
          )}
          <Link
            to={`/turns?agent=${encodeURIComponent(agent.agentKey)}`}
            className="mt-2 inline-block text-xs text-primary underline-offset-2 hover:underline"
          >
            このチームメイトの評価ターンを見る
          </Link>
        </div>
      </div>
    </div>
  )
}

function OrgBranch({ node, depth }: { node: OrgNode; depth: number }) {
  const [open, setOpen] = useState(true)
  const hasReports = node.reports.length > 0

  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-6 h-px w-4 bg-border" aria-hidden />
      <div className="flex items-start gap-1 py-1">
        {hasReports ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-3 rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={open ? "閉じる" : "開く"}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="mt-3 size-5" aria-hidden />
        )}
        <AgentCard agent={node.agent} />
      </div>
      {hasReports && open && (
        <ul className="relative ml-2 border-l">
          {node.reports.map((child) => (
            <OrgBranch key={child.agent.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function OrgChart() {
  const [search, setSearch] = useState("")

  const { data, isLoading, isError, error } = useQuery({
    queryKey: EVAL_AGENTS_KEY,
    queryFn: listEvalAgents,
    staleTime: 5 * 60 * 1000,
  })

  const agents = useMemo(() => data ?? [], [data])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return agents
    return agents.filter((agent) =>
      [agent.name, agent.agentKey, agent.role, agent.description, agent.upn].some((field) =>
        field.toLowerCase().includes(term),
      ),
    )
  }, [agents, search])

  const roots = useMemo(() => buildOrgTree(visible), [visible])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">組織図</h2>
        <p className="text-sm text-muted-foreground">
          この環境で働いている AI チームメイトを、上長（マネージャー）のつながりで表示します。
        </p>
      </div>

      <UpdateNote>
        <p>
          並びは各チームメイトのマスター行が持つ「上長キー」で決まります。上長が未設定・廃止・循環している場合は
          最上位として表示されます。マスター行はデプロイのたびに自動登録され、表示名と役割はこの画面側の編集が優先されます。
        </p>
      </UpdateNote>

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="名前・役割・メールで絞り込む"
          className="pl-8"
        />
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          チームメイトを取得できませんでした: {(error as Error)?.message}
        </p>
      ) : isLoading ? (
        <LoadingSkeletonList />
      ) : roots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          表示できるチームメイトがいません。エージェントをデプロイするとマスター行が自動登録されます。
        </p>
      ) : (
        <ul className="space-y-2">
          {roots.map((node) => (
            <OrgBranch key={node.agent.id} node={node} depth={0} />
          ))}
        </ul>
      )}
    </div>
  )
}
