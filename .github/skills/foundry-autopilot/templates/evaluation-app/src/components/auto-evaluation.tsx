import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, ExternalLink, Lightbulb, Quote } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScoreBadge } from "@/components/eval-bits"
import { suggestionTargetLabel, type EvalResult } from "@/lib/eval-results"
import type { EvalRule } from "@/lib/eval-rules"

const KIND_LABELS: Record<string, string> = {
  query: "質問",
  response: "応答",
  tool_call: "ツール呼び出し",
}

function EvidenceList({ result }: { result: EvalResult }) {
  if (result.evidence.length === 0) {
    return <p className="text-xs text-muted-foreground">根拠として抜き出された箇所はありません。</p>
  }
  return (
    <ul className="space-y-2">
      {result.evidence.map((item, index) => (
        <li key={index} className="min-w-0 space-y-1 rounded-md border bg-background p-2">
          <div className="flex items-center gap-1.5">
            <Quote className="size-3 shrink-0 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            <Badge
              variant={item.polarity === "positive" ? "default" : "destructive"}
              className="ml-auto shrink-0 text-[10px]"
            >
              {item.polarity === "positive" ? "良い点" : "問題点"}
            </Badge>
          </div>
          <p
            className={`border-l-2 pl-2 text-[11px] [overflow-wrap:anywhere] ${
              item.polarity === "positive"
                ? "border-emerald-500/60 bg-emerald-500/10"
                : "border-amber-500/60 bg-amber-500/10"
            }`}
          >
            {item.quote}
          </p>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.note}</p>
          {item.matched === false && (
            <p className="text-[10px] text-muted-foreground">
              （原文と完全には一致しなかったため、会話側では色が付きません）
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function SuggestionList({ result }: { result: EvalResult }) {
  if (result.suggestions.length === 0) {
    return <p className="text-xs text-muted-foreground">このルールでの改善点はありません。</p>
  }
  return (
    <ul className="space-y-2">
      {result.suggestions.map((item, index) => (
        <li key={index} className="min-w-0 space-y-1.5 rounded-md border bg-background p-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 text-xs font-medium [overflow-wrap:anywhere]">{item.title}</span>
            <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
              {suggestionTargetLabel(item.target)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.detail}</p>
          {item.example && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[10px] [overflow-wrap:anywhere]">
              {item.example}
            </pre>
          )}
        </li>
      ))}
    </ul>
  )
}

function ResultCard({
  result,
  rule,
  active,
  onSelect,
}: {
  result: EvalResult
  rule?: EvalRule
  active: boolean
  onSelect: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`min-w-0 rounded-lg border ${active ? "border-primary bg-primary/5" : ""}`}>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full min-w-0 items-start gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{result.ruleName || result.ruleKey}</span>
            <ScoreBadge score={result.score} />
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {result.reason || "-"}
          </p>
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-1.5 text-xs">
        {rule ? (
          <Link
            to={`/rules/${rule.id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            <ExternalLink className="size-3" />
            判定ルールを見る
          </Link>
        ) : (
          <span className="text-muted-foreground">ルールは削除されています</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          根拠 {result.evidence.length} ・ 改善点 {result.suggestions.length}
          <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">どこを見て判定したか</p>
            <EvidenceList result={result} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">改善点</p>
            <SuggestionList result={result} />
          </div>
        </div>
      )}
    </div>
  )
}

export function AutoEvaluation({
  results,
  rules,
  activeRuleKey,
  onActiveRuleKeyChange,
}: {
  results: EvalResult[]
  rules: EvalRule[]
  activeRuleKey: string | null
  onActiveRuleKeyChange: (ruleKey: string | null) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">自動評価</CardTitle>
        <p className="text-xs text-muted-foreground">
          カードを選ぶと、その判定の根拠になった箇所が会話側に色付きで表示されます。
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {results.map((result) => (
          <ResultCard
            key={result.id}
            result={result}
            rule={rules.find((rule) => rule.ruleKey === result.ruleKey)}
            active={activeRuleKey === result.ruleKey}
            onSelect={() =>
              onActiveRuleKeyChange(activeRuleKey === result.ruleKey ? null : result.ruleKey)
            }
          />
        ))}
      </CardContent>
    </Card>
  )
}
