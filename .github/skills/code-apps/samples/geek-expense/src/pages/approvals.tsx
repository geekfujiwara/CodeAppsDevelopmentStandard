import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useExpenses, useApproveExpense, useRejectExpense } from "@/hooks/use-dataverse"
import { FEATURE_APPROVAL_FLOW, PUBLISHER_PREFIX } from "@/config"
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/types/dataverse"
import { CheckCircle, XCircle, Info } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

export default function Approvals() {
  const { data: expenses = [], isLoading } = useExpenses()
  const approveMutation = useApproveExpense()
  const rejectMutation  = useRejectExpense()

  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId]   = useState<string | null>(null)

  const f = {
    id:       `${PUBLISHER_PREFIX}_expenseid`,
    title:    `${PUBLISHER_PREFIX}_title`,
    amount:   `${PUBLISHER_PREFIX}_amount`,
    category: `${PUBLISHER_PREFIX}_category`,
    status:   `${PUBLISHER_PREFIX}_status`,
    dept:     `${PUBLISHER_PREFIX}_department`,
    date:     `${PUBLISHER_PREFIX}_expensedate`,
  }

  // フィルター: 申請中のみ (100000001)
  const pending = expenses.filter((e) => (e[f.status] as number) === 100000001)

  async function handleApprove() {
    if (!approveId) return
    try {
      await approveMutation.mutateAsync(approveId)
      toast.success("承認しました")
    } catch {
      toast.error("承認に失敗しました")
    } finally {
      setApproveId(null)
    }
  }

  async function handleReject() {
    if (!rejectId) return
    try {
      await rejectMutation.mutateAsync(rejectId)
      toast.success("差戻しました")
    } catch {
      toast.error("差戻しに失敗しました")
    } finally {
      setRejectId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">承認</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">承認</h1>

      {/* 機能無効時の説明カード */}
      {!FEATURE_APPROVAL_FLOW && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Info className="h-5 w-5" />
              Power Automate 承認フロー連携は無効です
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-400">
              メール通知付きの承認フローを有効にするには、以下を設定してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
            <ol className="list-decimal list-inside space-y-1">
              <li>.env に <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">VITE_FEATURE_APPROVAL_FLOW=true</code> を設定</li>
              <li>Power Automate でフローを作成し <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">FLOW_WORKFLOW_ID</code> を取得</li>
              <li><code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">pac code add-data-source -a logicflows -t {"FLOW_WORKFLOW_ID"}</code> を実行</li>
              <li>Outlook 接続参照を設定: <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">CONNREF_OUTLOOK</code></li>
            </ol>
            <p className="mt-3 text-xs">フローなしでも、下記テーブルから直接承認・差戻し操作が行えます。</p>
          </CardContent>
        </Card>
      )}

      {/* 申請中テーブル */}
      <Card>
        <CardHeader>
          <CardTitle>承認待ち（申請中）</CardTitle>
          <CardDescription>{pending.length} 件の申請があります</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-b-xl border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>件名</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>費用発生日</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      承認待ちの申請はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((expense, idx) => {
                    const id       = expense[f.id] as string
                    const title    = (expense[f.title] as string) ?? "—"
                    const amount   = (expense[f.amount] as number) ?? 0
                    const category = expense[f.category] as ExpenseCategory
                    const date     = (expense[f.date] as string)?.slice(0, 10) ?? "—"
                    const dept     = (expense[f.dept] as string) ?? "—"

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[200px] truncate">{title}</TableCell>
                        <TableCell className="text-right">¥{amount.toLocaleString()}</TableCell>
                        <TableCell>{category != null ? EXPENSE_CATEGORY_LABEL[category] : "—"}</TableCell>
                        <TableCell>{date}</TableCell>
                        <TableCell>{dept}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => setApproveId(id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                              承認
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() => setRejectId(id)}
                            >
                              <XCircle className="h-4 w-4" />
                              差戻し
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 承認確認 */}
      <ConfirmDialog
        open={!!approveId}
        onOpenChange={(open) => { if (!open) setApproveId(null) }}
        title="承認しますか？"
        description="この経費申請を承認します。"
        confirmLabel="承認する"
        onConfirm={handleApprove}
      />

      {/* 差戻し確認 */}
      <ConfirmDialog
        open={!!rejectId}
        onOpenChange={(open) => { if (!open) setRejectId(null) }}
        title="差戻しますか？"
        description="この経費申請を差戻します。申請者に修正を促してください。"
        confirmLabel="差戻す"
        variant="destructive"
        onConfirm={handleReject}
      />
    </div>
  )
}
