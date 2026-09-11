import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Check, Download, Undo2, X } from "lucide-react"
import type { Drawing } from "@/drawing/drawing-schema"
import type { DrawingChange } from "@/drawing/drawing-diff"
import { parseDrawing, hashDrawing } from "@/drawing/drawing-schema"
import { diffDrawings, summarizeChanges } from "@/drawing/drawing-diff"
import { downloadBlob } from "@/drawing/drawing-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWorkspace } from "@/state/workspace-context"

type ParsedProposal = { candidate: Drawing | null; changes: DrawingChange[]; error: string }

function ChangeTable({ changes }: { changes: DrawingChange[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">現在の下書きとの差分はありません。</p>
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[10rem]">項目</TableHead>
            <TableHead className="min-w-[6rem]">変更前</TableHead>
            <TableHead className="min-w-[6rem]">変更後</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.slice(0, 40).map((change) => (
            <TableRow key={change.path}>
              <TableCell className="min-w-0 [overflow-wrap:anywhere]">
                <span className="block">{change.label}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{change.path}</span>
              </TableCell>
              <TableCell className="min-w-0 [overflow-wrap:anywhere] text-muted-foreground">{change.before}</TableCell>
              <TableCell className="min-w-0 [overflow-wrap:anywhere] font-medium">{change.after}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {changes.length > 40 && <p className="mt-1 text-xs text-muted-foreground">ほか {changes.length - 40} 件</p>}
    </div>
  )
}

export default function RevisionsPage() {
  const { state, dispatch } = useWorkspace()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const currentHash = hashDrawing(state.drawing)

  const parsed = useMemo(() => {
    const entries = new Map<string, ParsedProposal>()
    for (const proposal of state.proposals) {
      try {
        const candidate = parseDrawing(proposal.candidateJson)
        entries.set(proposal.id, { candidate, changes: diffDrawings(state.drawing, candidate), error: "" })
      } catch (error) {
        entries.set(proposal.id, { candidate: null, changes: [], error: (error as Error).message })
      }
    }
    return entries
  }, [state.proposals, state.drawing])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">改訂と候補</h2>
        <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          候補は未審査の提案です。差分を確認して採用すると下書きが変わり、Undo で戻せます。共有保存は別操作です。
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">現在の下書き hash {currentHash} / 編集 v{state.version}</p>
      </div>

      <section className="min-w-0 space-y-3" data-tour="proposals">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">候補（{state.proposals.length}）</h3>
        {state.proposals.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            候補はまだありません。ワークベンチの「依頼」タブから送信してください。
          </p>
        )}
        {state.proposals.map((proposal) => {
          const detail = parsed.get(proposal.id)
          const staleBase = proposal.baseHash !== currentHash
          return (
            <article key={proposal.id} className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={proposal.status === "adopted" ? "default" : proposal.status === "rejected" ? "secondary" : "outline"}
                  className="max-w-full break-words"
                >
                  {proposal.status === "adopted" ? "採用済み" : proposal.status === "rejected" ? "却下" : "未審査"}
                </Badge>
                <Badge variant="outline" className="max-w-full break-words">
                  {proposal.workerKind === "demo" ? "DEMO ワーカー" : "Dataverse ワーカー"}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{proposal.turnId}</span>
              </div>
              <p className="text-sm [overflow-wrap:anywhere]">{proposal.summary}</p>
              <p className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                基準 hash {proposal.baseHash} / v{proposal.baseVersion}
              </p>
              {staleBase && (
                <p className="text-xs text-destructive [overflow-wrap:anywhere]">
                  送信時点の図面から変わっています。採用すると現在の下書きを候補で置き換えます。差分を必ず確認してください。
                </p>
              )}
              {detail?.error !== "" && detail?.error !== undefined && (
                <p className="text-xs text-destructive [overflow-wrap:anywhere]">候補 JSON が不正です: {detail.error}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setExpandedId(expandedId === proposal.id ? null : proposal.id)}>
                  {expandedId === proposal.id ? "差分を隠す" : `差分を見る（${summarizeChanges(detail?.changes ?? [])}）`}
                </Button>
                <Button
                  size="sm"
                  disabled={proposal.status !== "pending" || !detail?.candidate}
                  onClick={() => {
                    if (!detail?.candidate) return
                    dispatch({ type: "adopt-proposal", id: proposal.id, drawing: detail.candidate })
                    toast.success("候補を採用しました。元に戻すこともできます。")
                  }}
                >
                  <Check className="mr-1 h-4 w-4" />
                  採用
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={proposal.status !== "pending"}
                  onClick={() => {
                    dispatch({ type: "reject-proposal", id: proposal.id })
                    toast.success("候補を却下しました")
                  }}
                >
                  <X className="mr-1 h-4 w-4" />
                  却下
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={state.undo.length === 0}
                  onClick={() => {
                    dispatch({ type: "undo" })
                    toast.success("直前の変更を元に戻しました")
                  }}
                >
                  <Undo2 className="mr-1 h-4 w-4" />
                  元に戻す
                </Button>
              </div>

              {expandedId === proposal.id && <ChangeTable changes={detail?.changes ?? []} />}
            </article>
          )
        })}
      </section>

      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">改訂履歴（{state.revisions.length}）</h3>
        {state.revisions.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            まだ保存していません。ワークベンチの「改訂を保存」で記録します。
          </p>
        )}
        <ul className="space-y-2">
          {state.revisions.map((revision) => (
            <li key={`${revision.revision}-${revision.hash}`} className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Rev.{revision.revision}</p>
                <p className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">hash {revision.hash}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {new Date(revision.savedAt).toLocaleString("ja-JP")} / {revision.note}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadBlob(new Blob([revision.json], { type: "application/json" }), `rev${revision.revision}.json`)}
              >
                <Download className="mr-1 h-4 w-4" />
                JSON
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
