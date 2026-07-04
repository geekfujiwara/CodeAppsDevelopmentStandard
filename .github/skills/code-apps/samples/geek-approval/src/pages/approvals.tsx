import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormModal } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useApprovalRequests,
  useUpdateApprovalRequest,
  useCreateApprovalStep,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  REQUEST_STAGE_LABEL,
  REQUEST_STAGE_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  DECISION_LABEL,
  PENDING_STAGES,
  STAGE_REJECTED,
} from "@/types/dataverse"
import { CheckCircle2, Undo2, XCircle, Eye } from "lucide-react"
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
}

const s = {
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

type PendingAction = {
  requestId: string
  requestName: string
  stage: number
  decision: number
  nextStage: number
  successMessage: string
}

function StageBadge({ stage }: { stage: number }) {
  const label = REQUEST_STAGE_LABEL[stage as keyof typeof REQUEST_STAGE_LABEL] ?? String(stage)
  const color = REQUEST_STAGE_COLOR[stage as keyof typeof REQUEST_STAGE_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function ApprovalsPage() {
  const navigate = useNavigate()
  const { data: requests = [], isLoading } = useApprovalRequests()
  const updateRequest = useUpdateApprovalRequest()
  const createStep = useCreateApprovalStep()

  const [action, setAction] = useState<PendingAction | null>(null)
  const [approver, setApprover] = useState("")
  const [comment, setComment] = useState("")

  const pending = useMemo(
    () => requests
      .filter(r => PENDING_STAGES.includes(r[f.stage] as number))
      .sort((a, b) => String(a[f.request_date] ?? "").localeCompare(String(b[f.request_date] ?? ""))),
    [requests]
  )

  const openDecision = (
    request: Record<string, unknown>,
    decision: number,
    nextStage: number,
    successMessage: string,
  ) => {
    setApprover("")
    setComment("")
    setAction({
      requestId: String(request[f.id] ?? ""),
      requestName: String(request[f.name] ?? ""),
      stage: request[f.stage] as number,
      decision,
      nextStage,
      successMessage,
    })
  }

  const handleDecide = async () => {
    if (!action) return
    if (!approver.trim()) {
      toast.error("承認者名は必須です")
      return
    }
    try {
      await createStep.mutateAsync({
        [s.name]:         STEP_NAME[action.stage] ?? "承認",
        [s.request_ref]:  action.requestId,
        [s.approver]:     approver,
        [s.decision]:     action.decision,
        [s.comment]:      comment,
        [s.decided_date]: new Date().toISOString().slice(0, 10),
      })
      await updateRequest.mutateAsync({ id: action.requestId, data: { [f.stage]: action.nextStage } })
      toast.success(action.successMessage)
      setAction(null)
    } catch {
      toast.error("処理に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">承認箱</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">承認箱</h1>
        <p className="text-muted-foreground text-sm mt-1">承認待ちの申請を処理します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>承認待ち一覧</CardTitle>
          <CardDescription>{pending.length} 件（申請日の古い順）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>件名</TableHead>
                  <TableHead>種別</TableHead>
                  <TableHead>申請者</TableHead>
                  <TableHead>承認ステージ</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>申請日</TableHead>
                  <TableHead className="w-[220px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      承認待ちの申請はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((request, i) => {
                    const stage = request[f.stage] as number
                    const priority = request[f.priority] as number | undefined
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {String(request[f.name] ?? "")}
                        </TableCell>
                        <TableCell>{String(request[f.category] ?? "")}</TableCell>
                        <TableCell>{String(request[f.applicant] ?? "")}</TableCell>
                        <TableCell><StageBadge stage={stage} /></TableCell>
                        <TableCell>
                          {priority != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[priority as keyof typeof PRIORITY_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? String(priority)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {((request[f.amount] as number) ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" })}
                        </TableCell>
                        <TableCell>{String(request[f.request_date] ?? "")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => navigate(`/requests/${String(request[f.id] ?? "")}`)}
                              title="詳細"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openDecision(
                                request,
                                DECISION_APPROVE,
                                stage === STAGE_MANAGER ? STAGE_DIRECTOR : STAGE_APPROVED,
                                "承認しました",
                              )}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />承認
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openDecision(request, DECISION_RETURN, STAGE_DRAFT, "申請者へ差し戻しました")}
                            >
                              <Undo2 className="h-3.5 w-3.5" />差戻し
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1"
                              onClick={() => openDecision(request, DECISION_REJECT, STAGE_REJECTED, "却下しました")}
                            >
                              <XCircle className="h-3.5 w-3.5" />却下
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

      {/* 判定ダイアログ */}
      <FormModal
        open={!!action}
        onOpenChange={open => { if (!open) setAction(null) }}
        title={action ? `「${action.requestName}」の${DECISION_LABEL[action.decision as keyof typeof DECISION_LABEL] ?? ""}` : ""}
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
