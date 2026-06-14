import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormModal, FormColumns, FormSection } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useEvaluations, useCreateEvaluation, useUpdateEvaluation, useDeleteEvaluation, useEmployees } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_EVALUATION } from "@/config"
import type { Evaluation } from "@/types/dataverse"
import { Plus, Pencil, Trash2, Star, Info } from "lucide-react"
import { toast } from "sonner"

const EMPTY_FORM = {
  employee_id:     "",
  period:          "",
  score:           "3",
  comment:         "",
  evaluation_date: "",
}
type FormValues = typeof EMPTY_FORM

function StarRating({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${s <= score ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground">{score}/5</span>
    </div>
  )
}

export default function Evaluations() {
  const { data: evaluations = [], isLoading: evalLoading } = useEvaluations()
  const { data: employees = [],   isLoading: empLoading  } = useEmployees()
  const createMutation = useCreateEvaluation()
  const updateMutation = useUpdateEvaluation()
  const deleteMutation = useDeleteEvaluation()

  const [modalOpen, setModalOpen]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [isSaving, setIsSaving]     = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:              `${P}_evaluationid`,
    employee_id:     `_${P}_employee_id_value`,
    period:          `${P}_period`,
    score:           `${P}_score`,
    comment:         `${P}_comment`,
    evaluation_date: `${P}_evaluation_date`,
  }
  const ef = {
    id:   `${P}_employeeid`,
    name: `${P}_name`,
  }

  const employeeOptions = employees.map((e) => ({
    id:   e[ef.id] as string,
    name: (e[ef.name] as string) ?? "—",
  }))

  if (!FEATURE_EVALUATION) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">評価管理</h1>
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Info className="h-5 w-5" />
              評価管理は無効です
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-400">
              評価管理ページを有効にするには、.env に以下を設定してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-blue-700 dark:text-blue-400">
            <code className="font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
              VITE_FEATURE_EVALUATION=true
            </code>
          </CardContent>
        </Card>
      </div>
    )
  }

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  function openEdit(ev: Evaluation) {
    const id = ev[f.id] as string
    setEditingId(id)
    setForm({
      employee_id:     (ev[f.employee_id] as string) ?? "",
      period:          (ev[f.period] as string) ?? "",
      score:           String((ev[f.score] as number) ?? 3),
      comment:         (ev[f.comment] as string) ?? "",
      evaluation_date: (ev[f.evaluation_date] as string)?.slice(0, 10) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.period.trim()) { toast.error("評価期間は必須です"); return }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        employee_id:     form.employee_id || undefined,
        period:          form.period,
        score:           form.score ? Number(form.score) : 3,
        comment:         form.comment || undefined,
        evaluation_date: form.evaluation_date || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("評価を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("評価を作成しました")
      }
      setModalOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  const isLoading = evalLoading || empLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">評価管理</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規評価
        </Button>
      </div>

      {isLoading ? <LoadingSkeletonList count={5} /> : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>社員名</TableHead>
                    <TableHead>評価期間</TableHead>
                    <TableHead>スコア</TableHead>
                    <TableHead>評価日</TableHead>
                    <TableHead>コメント</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        データがありません
                      </TableCell>
                    </TableRow>
                  ) : (
                    evaluations.map((ev, idx) => {
                      const empId    = ev[f.employee_id] as string
                      const empName  = employeeOptions.find((e) => e.id === empId)?.name ?? "—"
                      const score    = (ev[f.score] as number) ?? 0
                      const period   = (ev[f.period] as string) ?? "—"
                      const evDate   = (ev[f.evaluation_date] as string)?.slice(0, 10) ?? "—"
                      const comment  = (ev[f.comment] as string) ?? ""
                      const id       = ev[f.id] as string

                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{empName}</TableCell>
                          <TableCell>{period}</TableCell>
                          <TableCell><StarRating score={Math.min(5, Math.max(1, score))} /></TableCell>
                          <TableCell>{evDate}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{comment || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(ev)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteId(id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
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
      )}

      <FormModal open={modalOpen} onOpenChange={setModalOpen}
        title={editingId ? "評価を編集" : "評価を新規作成"}
        onSave={handleSave} isSaving={isSaving} saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="評価情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="emp">社員</Label>
                <select
                  id="emp"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.employee_id}
                  onChange={(e) => setForm(f => ({ ...f, employee_id: e.target.value }))}
                >
                  <option value="">未選択</option>
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">評価期間 <span className="text-destructive">*</span></Label>
                <Input id="period" value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} placeholder="例: 2025-H1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="score">スコア（1〜5）</Label>
                <Input id="score" type="number" min="1" max="5" value={form.score} onChange={(e) => setForm(f => ({ ...f, score: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eval-date">評価日</Label>
                <Input id="eval-date" type="date" value={form.evaluation_date} onChange={(e) => setForm(f => ({ ...f, evaluation_date: e.target.value }))} />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="コメント">
            <div className="space-y-2">
              <Label htmlFor="comment">コメント</Label>
              <Textarea id="comment" value={form.comment} onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))} rows={4} placeholder="評価コメントを入力してください" />
            </div>
          </FormSection>
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null) }}
        title="評価を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
