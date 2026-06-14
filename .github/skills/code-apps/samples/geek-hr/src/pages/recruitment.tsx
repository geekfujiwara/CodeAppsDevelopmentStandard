import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  useRecruitments, useCreateRecruitment, useUpdateRecruitment, useDeleteRecruitment,
  useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_RECRUITMENT } from "@/config"
import {
  RECRUITMENT_STATUS_LABEL,
  RECRUITMENT_STATUS_COLOR,
  RECRUITMENT_STATUS_OPTIONS,
  CANDIDATE_STAGE_LABEL,
  CANDIDATE_STAGE_COLOR,
  CANDIDATE_STAGE_OPTIONS,
  type RecruitmentStatus,
  type CandidateStage,
  type Recruitment,
  type Candidate,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Info } from "lucide-react"
import { toast } from "sonner"

const EMPTY_RECRUIT_FORM = {
  title: "",
  department: "",
  required_count: "1",
  status: "100000000",
  deadline: "",
  description: "",
}
type RecruitForm = typeof EMPTY_RECRUIT_FORM

const EMPTY_CANDIDATE_FORM = {
  full_name: "",
  recruitment_id: "",
  stage: "100000000",
  score: "",
  interview_date: "",
  notes: "",
}
type CandidateForm = typeof EMPTY_CANDIDATE_FORM

export default function Recruitment() {
  const { data: recruitments = [], isLoading: recLoading } = useRecruitments()
  const { data: candidates = [], isLoading: candLoading } = useCandidates()

  const createRecruit = useCreateRecruitment()
  const updateRecruit = useUpdateRecruitment()
  const deleteRecruit = useDeleteRecruitment()
  const createCand    = useCreateCandidate()
  const updateCand    = useUpdateCandidate()
  const deleteCand    = useDeleteCandidate()

  const [recruitModal, setRecruitModal]   = useState(false)
  const [editRecruitId, setEditRecruitId] = useState<string | null>(null)
  const [recruitForm, setRecruitForm]     = useState<RecruitForm>(EMPTY_RECRUIT_FORM)
  const [deleteRecruitId, setDeleteRecruitId] = useState<string | null>(null)

  const [candModal, setCandModal]         = useState(false)
  const [editCandId, setEditCandId]       = useState<string | null>(null)
  const [candForm, setCandForm]           = useState<CandidateForm>(EMPTY_CANDIDATE_FORM)
  const [deleteCandId, setDeleteCandId]   = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)

  const P = PUBLISHER_PREFIX
  const rf = {
    id:             `${P}_recruitmentid`,
    title:          `${P}_title`,
    department:     `${P}_department`,
    required_count: `${P}_required_count`,
    status:         `${P}_status`,
    deadline:       `${P}_deadline`,
    description:    `${P}_description`,
  }
  const cf = {
    id:             `${P}_candidateid`,
    full_name:      `${P}_full_name`,
    recruitment_id: `_${P}_recruitment_id_value`,
    stage:          `${P}_stage`,
    score:          `${P}_score`,
    interview_date: `${P}_interview_date`,
    notes:          `${P}_notes`,
  }

  if (!FEATURE_RECRUITMENT) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">採用管理</h1>
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Info className="h-5 w-5" />
              採用管理は無効です
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-400">
              採用管理ページを有効にするには、.env に以下を設定してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-blue-700 dark:text-blue-400">
            <code className="font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
              VITE_FEATURE_RECRUITMENT=true
            </code>
          </CardContent>
        </Card>
      </div>
    )
  }

  function openCreateRecruit() {
    setEditRecruitId(null)
    setRecruitForm(EMPTY_RECRUIT_FORM)
    setRecruitModal(true)
  }
  function openEditRecruit(r: Recruitment) {
    const id = r[rf.id] as string
    setEditRecruitId(id)
    setRecruitForm({
      title:          (r[rf.title] as string) ?? "",
      department:     (r[rf.department] as string) ?? "",
      required_count: String((r[rf.required_count] as number) ?? 1),
      status:         String((r[rf.status] as number) ?? 100000000),
      deadline:       (r[rf.deadline] as string)?.slice(0, 10) ?? "",
      description:    (r[rf.description] as string) ?? "",
    })
    setRecruitModal(true)
  }

  async function handleSaveRecruit() {
    if (!recruitForm.title.trim()) { toast.error("ポジション名は必須です"); return }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        title:          recruitForm.title,
        department:     recruitForm.department || undefined,
        required_count: recruitForm.required_count ? Number(recruitForm.required_count) : 1,
        status:         recruitForm.status ? Number(recruitForm.status) : 100000000,
        deadline:       recruitForm.deadline || undefined,
        description:    recruitForm.description || undefined,
      }
      if (editRecruitId) {
        await updateRecruit.mutateAsync({ id: editRecruitId, data })
        toast.success("採用ポジションを更新しました")
      } else {
        await createRecruit.mutateAsync(data)
        toast.success("採用ポジションを作成しました")
      }
      setRecruitModal(false)
    } catch {
      toast.error("保存に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteRecruit() {
    if (!deleteRecruitId) return
    try {
      await deleteRecruit.mutateAsync(deleteRecruitId)
      toast.success("削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteRecruitId(null)
    }
  }

  function openCreateCand(recruitmentId?: string) {
    setEditCandId(null)
    setCandForm({ ...EMPTY_CANDIDATE_FORM, recruitment_id: recruitmentId ?? "" })
    setCandModal(true)
  }
  function openEditCand(c: Candidate) {
    const id = c[cf.id] as string
    setEditCandId(id)
    setCandForm({
      full_name:      (c[cf.full_name] as string) ?? "",
      recruitment_id: (c[cf.recruitment_id] as string) ?? "",
      stage:          String((c[cf.stage] as number) ?? 100000000),
      score:          String((c[cf.score] as number) ?? ""),
      interview_date: (c[cf.interview_date] as string)?.slice(0, 10) ?? "",
      notes:          (c[cf.notes] as string) ?? "",
    })
    setCandModal(true)
  }

  async function handleSaveCand() {
    if (!candForm.full_name.trim()) { toast.error("氏名は必須です"); return }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        full_name:      candForm.full_name,
        recruitment_id: candForm.recruitment_id || undefined,
        stage:          candForm.stage ? Number(candForm.stage) : 100000000,
        score:          candForm.score ? Number(candForm.score) : undefined,
        interview_date: candForm.interview_date || undefined,
        notes:          candForm.notes || undefined,
      }
      if (editCandId) {
        await updateCand.mutateAsync({ id: editCandId, data })
        toast.success("候補者情報を更新しました")
      } else {
        await createCand.mutateAsync(data)
        toast.success("候補者を登録しました")
      }
      setCandModal(false)
    } catch {
      toast.error("保存に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteCand() {
    if (!deleteCandId) return
    try {
      await deleteCand.mutateAsync(deleteCandId)
      toast.success("削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteCandId(null)
    }
  }

  const isLoading = recLoading || candLoading

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">採用管理</h1>

      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">採用ポジション</TabsTrigger>
          <TabsTrigger value="candidates">候補者</TabsTrigger>
        </TabsList>

        {/* ── ポジション一覧 ── */}
        <TabsContent value="positions" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateRecruit} className="gap-2">
              <Plus className="h-4 w-4" />
              新規ポジション
            </Button>
          </div>
          {isLoading ? <LoadingSkeletonList count={4} /> : (
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ポジション名</TableHead>
                        <TableHead>部門</TableHead>
                        <TableHead className="text-right">募集人数</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead>締切日</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recruitments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">データがありません</TableCell>
                        </TableRow>
                      ) : (
                        recruitments.map((r, idx) => {
                          const status = (r[rf.status] as RecruitmentStatus) ?? 100000000
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{(r[rf.title] as string) ?? "—"}</TableCell>
                              <TableCell>{(r[rf.department] as string) ?? "—"}</TableCell>
                              <TableCell className="text-right">{(r[rf.required_count] as number) ?? 1}名</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_STATUS_COLOR[status]}`}>
                                  {RECRUITMENT_STATUS_LABEL[status]}
                                </span>
                              </TableCell>
                              <TableCell>{(r[rf.deadline] as string)?.slice(0, 10) ?? "—"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditRecruit(r)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteRecruitId(r[rf.id] as string)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        </TabsContent>

        {/* ── 候補者一覧 ── */}
        <TabsContent value="candidates" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateCand()} className="gap-2">
              <Plus className="h-4 w-4" />
              新規候補者
            </Button>
          </div>
          {isLoading ? <LoadingSkeletonList count={4} /> : (
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>氏名</TableHead>
                        <TableHead>選考ステージ</TableHead>
                        <TableHead className="text-right">スコア</TableHead>
                        <TableHead>面接日</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">データがありません</TableCell>
                        </TableRow>
                      ) : (
                        candidates.map((c, idx) => {
                          const stage = (c[cf.stage] as CandidateStage) ?? 100000000
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{(c[cf.full_name] as string) ?? "—"}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CANDIDATE_STAGE_COLOR[stage]}`}>
                                  {CANDIDATE_STAGE_LABEL[stage]}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{(c[cf.score] as number) ?? "—"}</TableCell>
                              <TableCell>{(c[cf.interview_date] as string)?.slice(0, 10) ?? "—"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditCand(c)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteCandId(c[cf.id] as string)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        </TabsContent>
      </Tabs>

      {/* 採用ポジションモーダル */}
      <FormModal open={recruitModal} onOpenChange={setRecruitModal}
        title={editRecruitId ? "採用ポジションを編集" : "採用ポジションを新規作成"}
        onSave={handleSaveRecruit} isSaving={isSaving} saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="r-title">ポジション名 <span className="text-destructive">*</span></Label>
                <Input id="r-title" value={recruitForm.title} onChange={(e) => setRecruitForm(f => ({ ...f, title: e.target.value }))} placeholder="例: バックエンドエンジニア" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-dept">部門</Label>
                <Input id="r-dept" value={recruitForm.department} onChange={(e) => setRecruitForm(f => ({ ...f, department: e.target.value }))} placeholder="例: 開発部" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-count">募集人数</Label>
                <Input id="r-count" type="number" min="1" value={recruitForm.required_count} onChange={(e) => setRecruitForm(f => ({ ...f, required_count: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-status">ステータス</Label>
                <Select value={recruitForm.status} onValueChange={(v) => setRecruitForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="r-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECRUITMENT_STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-deadline">締切日</Label>
                <Input id="r-deadline" type="date" value={recruitForm.deadline} onChange={(e) => setRecruitForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="詳細">
            <div className="space-y-2">
              <Label htmlFor="r-desc">職務内容</Label>
              <Textarea id="r-desc" value={recruitForm.description} onChange={(e) => setRecruitForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
          </FormSection>
        </div>
      </FormModal>

      {/* 候補者モーダル */}
      <FormModal open={candModal} onOpenChange={setCandModal}
        title={editCandId ? "候補者情報を編集" : "候補者を登録"}
        onSave={handleSaveCand} isSaving={isSaving} saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="候補者情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="c-name">氏名 <span className="text-destructive">*</span></Label>
                <Input id="c-name" value={candForm.full_name} onChange={(e) => setCandForm(f => ({ ...f, full_name: e.target.value }))} placeholder="例: 鈴木 花子" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-stage">選考ステージ</Label>
                <Select value={candForm.stage} onValueChange={(v) => setCandForm(f => ({ ...f, stage: v }))}>
                  <SelectTrigger id="c-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANDIDATE_STAGE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-score">評価スコア（任意）</Label>
                <Input id="c-score" type="number" min="0" max="100" value={candForm.score} onChange={(e) => setCandForm(f => ({ ...f, score: e.target.value }))} placeholder="0〜100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-date">面接日</Label>
                <Input id="c-date" type="date" value={candForm.interview_date} onChange={(e) => setCandForm(f => ({ ...f, interview_date: e.target.value }))} />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="備考">
            <div className="space-y-2">
              <Label htmlFor="c-notes">メモ</Label>
              <Textarea id="c-notes" value={candForm.notes} onChange={(e) => setCandForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </FormSection>
        </div>
      </FormModal>

      <ConfirmDialog open={!!deleteRecruitId} onOpenChange={(o) => { if (!o) setDeleteRecruitId(null) }}
        title="採用ポジションを削除しますか？" description="この操作は取り消せません。"
        confirmLabel="削除" variant="destructive" onConfirm={handleDeleteRecruit}
      />
      <ConfirmDialog open={!!deleteCandId} onOpenChange={(o) => { if (!o) setDeleteCandId(null) }}
        title="候補者を削除しますか？" description="この操作は取り消せません。"
        confirmLabel="削除" variant="destructive" onConfirm={handleDeleteCand}
      />
    </div>
  )
}
