import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Merge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EVAL_TURNS_KEY, mergeTurns, type EvalTurn } from "@/lib/eval-turns"
import { EVAL_JOBS_KEY, queueUnlessPending } from "@/lib/eval-jobs"

/** 会話の統合ページと評価ターン一覧の両方から同じ操作を出す。 */
export function MergeAction({
  turns,
  size = "sm",
  onMerged,
}: {
  turns: EvalTurn[]
  size?: "sm" | "default"
  onMerged?: () => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const merge = useMutation({
    mutationFn: async () => {
      const name = await mergeTurns(turns)
      return { name, queued: await queueUnlessPending() }
    },
    onSuccess: ({ name, queued }) => {
      toast.success(
        queued
          ? `${name} にまとめました。再評価ジョブを積みました。`
          : `${name} にまとめました。待機中のジョブが再評価します。`,
      )
      queryClient.invalidateQueries({ queryKey: EVAL_TURNS_KEY })
      queryClient.invalidateQueries({ queryKey: EVAL_JOBS_KEY })
      onMerged?.()
    },
    onError: (error: Error) => toast.error(`統合できませんでした: ${error.message}`),
  })

  return (
    <>
      <Button size={size} disabled={turns.length < 2 || merge.isPending} onClick={() => setConfirming(true)}>
        <Merge className="size-4" />
        {turns.length} 件を 1 つの会話に統合
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="この会話を統合しますか？"
        description={`${turns.length} 件のターンを 1 つの評価ターンにまとめます。元のターンは残りますが一覧からは隠れ、統合したターンは未評価として採点し直されます。`}
        confirmLabel="統合する"
        onConfirm={() => merge.mutate()}
      />
    </>
  )
}
