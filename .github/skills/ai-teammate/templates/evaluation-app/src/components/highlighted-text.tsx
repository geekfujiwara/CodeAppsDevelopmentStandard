import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { highlightSegments } from "@/lib/highlight"
import type { Evidence } from "@/lib/eval-results"

const TONE = {
  positive: "bg-emerald-500/25 decoration-emerald-600",
  negative: "bg-amber-500/30 decoration-amber-600",
} as const

/**
 * 評価の根拠にあたる箇所を原文の上でハイライトする。
 * Markdown として描画すると引用の位置がずれるので、ハイライト中は素のテキストに落とす。
 */
export function HighlightedText({ text, evidence }: { text: string; evidence: Evidence[] }) {
  const segments = highlightSegments(text, evidence)

  // break-words だと min-content 幅が長い URL のまま残り、グリッドのトラックを押し広げてしまう。
  return (
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {segments.map((segment, index) =>
        segment.evidence ? (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <mark
                className={`cursor-help rounded-sm px-0.5 text-foreground underline decoration-dotted underline-offset-4 ${
                  TONE[segment.evidence.polarity] ?? TONE.negative
                }`}
              >
                {segment.text}
              </mark>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{segment.evidence.note}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  )
}
