import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormModal, FormColumns } from "@/components/form-modal"
import { WizardSteps } from "@/components/wizard-steps"
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useSuggestions,
  useCreateSuggestion,
  useUpdateSuggestion,
  useDeleteSuggestion,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_VOTING } from "@/config"
import {
  SUGGESTION_STATUS_LABEL,
  SUGGESTION_STATUS_COLOR,
  SUGGESTION_STATUS_OPTIONS,
  STATUS_SUBMITTED,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ThumbsUp } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:            `${P}_suggestionid`,
  name:          `${P}_name`,
  category:      `${P}_category`,
  proposer:      `${P}_proposer`,
  department:    `${P}_department`,
  status:        `${P}_status`,
  votes:         `${P}_votes`,
  proposed_date: `${P}_proposed_date`,
  description:   `${P}_description`,
  effect:        `${P}_effect`,
}

function StatusBadge({ status }: { status: number }) {
  const label = SUGGESTION_STATUS_LABEL[status as keyof typeof SUGGESTION_STATUS_LABEL] ?? String(status)
  const color = SUGGESTION_STATUS_COLOR[status as keyof typeof SUGGESTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  category: string
  proposer: string
  department: string
  status: string
  proposed_date: string
  description: string
  effect: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", proposer: "", department: "",
  status: String(STATUS_SUBMITTED), proposed_date: "", description: "", effect: "",
}

const WIZARD_STEPS = ["基本情報", "提案内容", "確認"]
const ITEMS_PER_PAGE = 10

export default function SuggestionsPage() {
  const { data: suggestions = [], isLoading } = useSuggestions()
  const createSuggestion = useCreateSuggestion()
  const updateSuggestion = useUpdateSuggestion()
  const deleteSuggestion = useDeleteSuggestion()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const isWizard = !editingId

  // フィルター
  const filtered = suggestions
    .filter(s => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(s[f.name] ?? "").toLowerCase().includes(q) ||
        String(s[f.proposer] ?? "").toLowerCase().includes(q) ||
        String(s[f.department] ?? "").toLowerCase().includes(q) ||
        String(s[f.category] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(s[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(b[f.proposed_date] ?? "").localeCompare(String(a[f.proposed_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, proposed_date: new Date().toISOString().slice(0, 10) })
    setStep(0)
    setIsFormOpen(true)
  }

  const handleEdit = (suggestion: Record<string, unknown>) => {
    setEditingId(String(suggestion[f.id] ?? ""))
    setFormData({
      name:          String(suggestion[f.name] ?? ""),
      category:      String(suggestion[f.category] ?? ""),
      proposer:      String(suggestion[f.proposer] ?? ""),
      department:    String(suggestion[f.department] ?? ""),
      status:        suggestion[f.status] != null ? String(suggestion[f.status]) : String(STATUS_SUBMITTED),
      proposed_date: String(suggestion[f.proposed_date] ?? ""),
      description:   String(suggestion[f.description] ?? ""),
      effect:        String(suggestion[f.effect] ?? ""),
    })
    setIsFormOpen(true)
  }

  /** ウィザードのステップ別バリデーション */
  const validateStep = (s: number): boolean => {
    if (s === 0 && !formData.name.trim()) { toast.error("タイトルは必須です"); return false }
    if (s === 1 && !formData.description.trim()) { toast.error("提案内容は必須です"); return false }
    return true
  }

  const handleNext = () => { if (validateStep(step)) setStep(s => s + 1) }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("タイトルは必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:        formData.name,
      [f.category]:    formData.category,
      [f.proposer]:    formData.proposer,
      [f.department]:  formData.department,
      [f.description]: formData.description,
      [f.effect]:      formData.effect,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.proposed_date) data[f.proposed_date] = formData.proposed_date

    try {
      if (editingId) {
        await updateSuggestion.mutateAsync({ id: editingId, data })
        toast.success("提案を更新しました")
      } else {
        data[f.votes] = 0
        await createSuggestion.mutateAsync(data)
        toast.success("提案を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleVote = async (suggestion: Record<string, unknown>) => {
    const id = String(suggestion[f.id] ?? "")
    const votes = ((suggestion[f.votes] as number) ?? 0) + 1
    try {
      await updateSuggestion.mutateAsync({ id, data: { [f.votes]: votes } })
      toast.success("いいねしました")
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSuggestion.mutateAsync(deleteId)
      toast.success("提案を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const update = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData(prev => ({ ...prev, [key]: e.target.value }))

  // ウィザード / 編集共通の入力ブロック
  const basicFields = (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">タイトル <span className="text-destructive">*</span></Label>
        <Input
          id="name"
          value={formData.name}
          onChange={update("name")}
          placeholder="改善したいことを一言で"
        />
      </div>
      <FormColumns columns={2}>
        <div className="space-y-1.5">
          <Label htmlFor="category">分野</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={update("category")}
            placeholder="例: 業務効率, 安全, コスト削減, 5S"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proposed_date">提案日</Label>
          <Input
            id="proposed_date"
            type="date"
            value={formData.proposed_date}
            onChange={update("proposed_date")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proposer">提案者</Label>
          <Input
            id="proposer"
            value={formData.proposer}
            onChange={update("proposer")}
            placeholder="提案者名"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="department">部門</Label>
          <Input
            id="department"
            value={formData.department}
            onChange={update("department")}
            placeholder="部門名"
          />
        </div>
      </FormColumns>
    </div>
  )

  const contentFields = (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="description">提案内容 <span className="text-destructive">*</span></Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={update("description")}
          placeholder="現状の課題と改善案を具体的に"
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="effect">期待効果</Label>
        <Textarea
          id="effect"
          value={formData.effect}
          onChange={update("effect")}
          placeholder="例: 作業時間を月5時間削減できる"
          rows={3}
        />
      </div>
    </div>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">提案一覧</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">提案一覧</h1>
          <p className="text-muted-foreground text-sm mt-1">改善提案の登録・管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規提案
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>提案一覧</CardTitle>
          <CardDescription>{filtered.length} 件（提案日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="タイトル・提案者・部門・分野で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {SUGGESTION_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* テーブル */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タイトル</TableHead>
                  <TableHead>分野</TableHead>
                  <TableHead>提案者</TableHead>
                  <TableHead>ステータス</TableHead>
                  {FEATURE_VOTING && <TableHead className="text-right">いいね</TableHead>}
                  <TableHead>提案日</TableHead>
                  <TableHead className="w-[130px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={FEATURE_VOTING ? 7 : 6} className="h-24 text-center text-muted-foreground">
                      提案がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((suggestion, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[240px] truncate">
                        {String(suggestion[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(suggestion[f.category] ?? "")}</TableCell>
                      <TableCell>{String(suggestion[f.proposer] ?? "")}</TableCell>
                      <TableCell>
                        {suggestion[f.status] != null && (
                          <StatusBadge status={suggestion[f.status] as number} />
                        )}
                      </TableCell>
                      {FEATURE_VOTING && (
                        <TableCell className="text-right">{(suggestion[f.votes] as number) ?? 0}</TableCell>
                      )}
                      <TableCell>{String(suggestion[f.proposed_date] ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {FEATURE_VOTING && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleVote(suggestion)}
                              title="いいね"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(suggestion)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(suggestion[f.id] ?? ""))}
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {filtered.length} 件中 {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} 件を表示
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />前へ
                </Button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(page => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                ))}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                >
                  次へ<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新規: ウィザード / 編集: 通常フォーム */}
      <FormModal
        open={isFormOpen}
        onOpenChange={open => { setIsFormOpen(open); if (!open) setStep(0) }}
        title={editingId ? "提案編集" : "新規提案"}
        maxWidth="2xl"
        onSave={isWizard ? undefined : handleSave}
        isSaving={createSuggestion.isPending || updateSuggestion.isPending}
        footer={isWizard ? (
          <div className="flex w-full items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
            >
              戻る
            </Button>
            {step < WIZARD_STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext}>次へ</Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={createSuggestion.isPending}>
                登録
              </Button>
            )}
          </div>
        ) : undefined}
      >
        {isWizard ? (
          <div className="space-y-6">
            <WizardSteps steps={WIZARD_STEPS} current={step} />
            {step === 0 && basicFields}
            {step === 1 && contentFields}
            {step === 2 && (
              <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">タイトル</dt>
                <dd className="font-medium">{formData.name}</dd>
                <dt className="text-muted-foreground">分野</dt>
                <dd>{formData.category || "—"}</dd>
                <dt className="text-muted-foreground">提案者</dt>
                <dd>{formData.proposer || "—"}</dd>
                <dt className="text-muted-foreground">部門</dt>
                <dd>{formData.department || "—"}</dd>
                <dt className="text-muted-foreground">提案日</dt>
                <dd>{formData.proposed_date || "—"}</dd>
                <dt className="text-muted-foreground">提案内容</dt>
                <dd className="whitespace-pre-wrap">{formData.description}</dd>
                <dt className="text-muted-foreground">期待効果</dt>
                <dd className="whitespace-pre-wrap">{formData.effect || "—"}</dd>
              </dl>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {basicFields}
            {contentFields}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {SUGGESTION_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="提案を削除しますか？"
        description="この操作は取り消せません。提案を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
