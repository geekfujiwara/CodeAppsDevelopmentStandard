import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormModal } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { StagePath } from "@/components/stage-path"
import {
  useApprovalRequests,
  useUpdateApprovalRequest,
  useApprovalSteps,
  useCreateApprovalStep,
  useDeleteApprovalStep,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  STAGE_PATH_ITEMS,
  STAGE_REJECTED,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  DECISION_LABEL,
  DECISION_COLOR,
} from "@/types/dataverse"
import {
  ArrowLeft, Send, CheckCircle2, Undo2, XCircle, Trash2,
  Tag, User, Coins, CalendarDays,
} from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_approval_requestid`,
  name:         `${P}_name`,
  category:     `${P}_category`,
  applicant:    `${P}_applicant`,
  department:   `${P}_department`,
  amount:       `${P}_amount`,
  stage:        `${P}_stage`,
  priority:     `${P}_priority`,
  request_date: `${P}_request_date`,
  description:  `${P}_description`,
  notes:        `${P}_notes`,
}

const s = {
  id:           `${P}_approval_stepid`,
  name:         `${P}_name`,
  request_ref:  `${P}_request_ref`,
  approver:     `${P}_approver`,
  decision:     `${P}_decision`,
  comment:      `${P}_comment`,
  decided_date: `${P}_decided_date`,
}

// ステージ値
const STAGE_DRAFT    = 100000000
const STAGE_MANAGER  = 100000001
const STAGE_DIRECTOR = 100000002
const STAGE_APPROVED = 100000003

// 判定値
const DECISION_APPROVE = 100000000
const DECISION_RETURN  = 100000001
const DECISION_REJECT  = 100000002

const STEP_NAME: Record<number, string> = {
  [STAGE_MANAGER]:  "課長承認",
  [STAGE_DIRECTOR]: "部長承認",
}

type DecisionAction = {
  decision: number
  nextStage: number
  successMessage: string
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: requests = [], isLoading } = useApprovalRequests()
  const { data: steps = [] } = useApprovalSteps()
  const updateRequest = useUpdateApprovalRequest()
  const createStep = useCreateApprovalStep()
  const deleteStep = useDeleteApprovalStep()

  const [action, setAction] = useState<DecisionAction | null>(null)
  const [approver, setApprover] = useState("")
  const [comment, setComment] = useState("")

  const request = useMemo(
    () => requests.find(r => String(r[f.id] ?? "") === id),
    [requests, id]
  )

  const requestSteps = useMemo(
    () => steps
      .filter(st => String(st[s.request_ref] ?? "") === id)
      .sort((a, b) => String(a.createdon ?? "").localeCompare(String(b.createdon ?? ""))),
    [steps, id]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">申請詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!request || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/requests")}>
          <ArrowLeft className="h-4 w-4" />申請一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>申請が見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const stage = request[f.stage] as number | undefined
  const priority = request[f.priority] as number | undefined
  const amount = (request[f.amount] as number) ?? 0

  const changeStage = async (nextStage: number, successMessage: string) => {
    try {
      await updateRequest.mutateAsync({ id, data: { [f.stage]: nextStage } })
      toast.success(successMessage)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const openDecision = (decisionAction: DecisionAction) => {
    setApprover("")
    setComment("")
    setAction(decisionAction)
  }

  const handleDecide = async () => {
    if (!action || stage == null) return
    if (!approver.trim()) {
      toast.error("承認者名は必須です")
      return
    }
    try {
      await createStep.mutateAsync({
        [s.name]:         STEP_NAME[stage] ?? "承認",
        [s.request_ref]:  id,
        [s.approver]:     approver,
        [s.decision]:     action.decision,
        [s.comment]:      comment,
        [s.decided_date]: new Date().toISOString().slice(0, 10),
      })
      await updateRequest.mutateAsync({ id, data: { [f.stage]: action.nextStage } })
      toast.success(action.successMessage)
      setAction(null)
    } catch {
      toast.error("処理に失敗しました")
    }
  }

  const handleDeleteStep = async (stepId: string) => {
    try {
      await deleteStep.mutateAsync(stepId)
      toast.success("承認履歴を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/requests")}>
            <ArrowLeft className="h-4 w-4" />申請一覧へ戻る
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{String(request[f.name] ?? "")}</h1>
        </div>
        {/* ステージ操作 */}
        <div className="flex items-center gap-2">
          {stage === STAGE_DRAFT && (
            <Button className="gap-2" onClick={() => changeStage(STAGE_MANAGER, "申請を提出しました")}>
              <Send className="h-4 w-4" />申請する
            </Button>
          )}
          {(stage === STAGE_MANAGER || stage === STAGE_DIRECTOR) && (
            <>
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => openDecision({
                  decision: DECISION_APPROVE,
                  nextStage: stage === STAGE_MANAGER ? STAGE_DIRECTOR : STAGE_APPROVED,
                  successMessage: "承認しました",
                })}
              >
                <CheckCircle2 className="h-4 w-4" />承認
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => openDecision({
                  decision: DECISION_RETURN,
                  nextStage: STAGE_DRAFT,
                  successMessage: "申請者へ差し戻しました",
                })}
              >
                <Undo2 className="h-4 w-4" />差戻し
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => openDecision({
                  decision: DECISION_REJECT,
                  nextStage: STAGE_REJECTED,
                  successMessage: "却下しました",
                })}
              >
                <XCircle className="h-4 w-4" />却下
              </Button>
            </>
          )}
          {(stage === STAGE_APPROVED || stage === STAGE_REJECTED) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => changeStage(STAGE_DRAFT, "下書きに戻しました")}
            >
              <Undo2 className="h-4 w-4" />下書きに戻す
            </Button>
          )}
        </div>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">種別</div>
                <div className="truncate text-sm font-medium">{String(request[f.category] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">申請者 / 部門</div>
                <div className="truncate text-sm font-medium">
                  {String(request[f.applicant] ?? "—")}
                  {request[f.department] ? ` / ${String(request[f.department])}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Coins className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">金額</div>
                <div className="truncate text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  ¥{amount.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">申請日 / 優先度</div>
                <div className="truncate text-sm font-medium">
                  {String(request[f.request_date] ?? "—")}
                  {priority != null && (
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[priority as keyof typeof PRIORITY_COLOR] ?? ""}`}>
                      {PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ステージ矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={STAGE_PATH_ITEMS}
              current={stage}
              negativeValue={STAGE_REJECTED}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              ステージは右上の「申請する / 承認 / 差戻し / 却下」ボタンで進みます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 申請内容・備考 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">申請内容</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {String(request[f.description] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">備考</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {String(request[f.notes] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 承認履歴 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">承認履歴</CardTitle>
          <CardDescription>{requestSteps.length} 件</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ステップ</TableHead>
                  <TableHead>承認者</TableHead>
                  <TableHead>判定</TableHead>
                  <TableHead>コメント</TableHead>
                  <TableHead>判定日</TableHead>
                  <TableHead className="w-[60px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestSteps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      承認履歴がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  requestSteps.map((step, i) => {
                    const decision = step[s.decision] as number | undefined
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{String(step[s.name] ?? "")}</TableCell>
                        <TableCell>{String(step[s.approver] ?? "")}</TableCell>
                        <TableCell>
                          {decision != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DECISION_COLOR[decision as keyof typeof DECISION_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {DECISION_LABEL[decision as keyof typeof DECISION_LABEL] ?? String(decision)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate">{String(step[s.comment] ?? "")}</TableCell>
                        <TableCell>{String(step[s.decided_date] ?? "")}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteStep(String(step[s.id] ?? ""))}
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* 判定ダイアログ */}
      <FormModal
        open={!!action}
        onOpenChange={open => { if (!open) setAction(null) }}
        title={action ? `${DECISION_LABEL[action.decision as keyof typeof DECISION_LABEL] ?? ""}の記録` : ""}
        onSave={handleDecide}
        isSaving={createStep.isPending || updateRequest.isPending}
        saveLabel="確定"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="approver">承認者名 <span className="text-destructive">*</span></Label>
            <Input
              id="approver"
              value={approver}
              onChange={e => setApprover(e.target.value)}
              placeholder="承認者の氏名"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comment">コメント</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="判定理由・コメント"
              rows={3}
            />
          </div>
        </div>
      </FormModal>
    </div>
  )
}
