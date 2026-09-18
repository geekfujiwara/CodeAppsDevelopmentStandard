import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { Bot, Mail, Server } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Combobox } from "@/components/ui/combobox"
import { EVAL_AGENTS_KEY, listEvalAgents, type EvalAgent } from "@/lib/eval-agents"

/**
 * 「AIチームメイトの設計」のページ群で、どのチームメイトの設計を見ているかを URL（?agent=）で持つ。
 * URL に置くのは、別のチームメイトの設計をそのままリンクで共有できるようにするため。
 * 未指定のときは一覧の先頭（並び順）を既定にする。
 */
export function useSelectedAgent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading } = useQuery({
    queryKey: EVAL_AGENTS_KEY,
    queryFn: listEvalAgents,
    staleTime: 5 * 60 * 1000,
  })

  const agents = data ?? []
  const requested = searchParams.get("agent") ?? ""
  const agent: EvalAgent | undefined =
    agents.find((a) => a.agentKey === requested) ?? agents[0]

  const setAgentKey = (key: string) => {
    setSearchParams(key ? { agent: key } : {}, { replace: true })
  }

  return { agents, agent, agentKey: agent?.agentKey ?? requested, setAgentKey, isLoading }
}

export function AgentSwitcher({
  agents,
  agent,
  onChange,
}: {
  agents: EvalAgent[]
  agent?: EvalAgent
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{agent?.name || agent?.agentKey || "チームメイト未登録"}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {agent?.role && <span className="truncate">{agent.role}</span>}
            {agent?.upn && (
              <span className="flex items-center gap-1 truncate font-mono">
                <Mail className="size-3" />
                {agent.upn}
              </span>
            )}
            {agent?.webAppName && (
              <span className="flex items-center gap-1 truncate font-mono">
                <Server className="size-3" />
                {agent.webAppName}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {agent?.agentKey && (
          <Badge variant="outline" className="font-mono text-[10px] font-normal">
            {agent.agentKey}
          </Badge>
        )}
        <div className="w-full sm:w-[220px]">
          <Combobox
            options={agents.map((a) => ({ value: a.agentKey, label: a.name || a.agentKey }))}
            value={agent?.agentKey ?? ""}
            onValueChange={onChange}
            placeholder="チームメイトを選ぶ"
            searchPlaceholder="チームメイトを検索..."
          />
        </div>
      </div>
    </div>
  )
}
