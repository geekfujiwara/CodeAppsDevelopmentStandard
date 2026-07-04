import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StagePath } from "@/components/stage-path"
import { ResultToggle } from "@/components/result-toggle"
import { computeChecklistStats } from "@/lib/checklist"
import {
  useStores,
  useAudits,
  useUpdateAudit,
  useAuditItems,
  useCreateAuditItem,
  useUpdateAuditItem,
  useDeleteAuditItem,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  AUDIT_STAGE_PATH_ITEMS,
  AUDIT_STATUS_LABEL,
  RESULT_TOGGLE_OPTIONS,
  RESULT_UNCHECKED,
  RESULT_FAIL,
  STANDARD_CHECKLIST,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Trash2, Store, User, Gauge, ListChecks, MessageSquare,
} from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const a = {
  id:         `${P}_store_auditid`,
  name:       `${P}_name`,
  store_ref:  `${P}_store_ref`,
  auditor:    `${P}_auditor`,
  status:     `${P}_status`,
  audit_date: `${P}_audit_date`,
  score:      `${P}_score`,
  notes:      `${P}_notes`,
}

const it = {
  id:        `${P}_audit_itemid`,
  name:      `${P}_name`,
  audit_ref: `${P}_audit_ref`,
  category:  `${P}_category`,
  result:    `${P}_result`,
  comment:   `${P}_comment`,
}

const st = {
  id:   `${P}_storeid`,
  name: `${P}_name`,
}

type ItemForm = { name: string; category: string }
const EMPTY_ITEM: ItemForm = { name: "", category: "" }

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: audits = [], isLoading } = useAudits()
  const { data: allItems = [] } = useAuditItems()
  const { data: stores = [] } = useStores()
  const updateAudit = useUpdateAudit()
  const createItem = useCreateAuditItem()
  const updateItem = useUpdateAuditItem()
  const deleteItem = useDeleteAuditItem()

  const [isItemFormOpen, setIsItemFormOpen] = useState(false)
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)
  const [commentItemId, setCommentItemId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const audit = useMemo(
    () => audits.find(r => String(r[a.id] ?? "") === id),
    [audits, id]
  )

  const items = useMemo(
    () => allItems
      .filter(item => String(item[it.audit_ref] ?? "") === id)
      .sort((x, y) => String(x.createdon ?? "").localeCompare(String(y.createdon ?? ""))),
    [allItems, id]
  )

  /** カテゴリ別グルーピング（テンプレートの並び順を優先） */
  const grouped = useMemo(() => {
    const order = [...new Set(STANDARD_CHECKLIST.map(c => c.category))]
    const map = new Map<string, Record<string, unknown>[]>()
    for (const item of items) {
      const cat = (item[it.category] as string) || "その他"
      map.set(cat, [...(map.get(cat) ?? []), item])
    }
    return [...map.entries()].sort((x, y) => {
      const xi = order.indexOf(x[0]); const yi = order.indexOf(y[0])
      return (xi === -1 ? 999 : xi) - (yi === -1 ? 999 : yi)
    })
  }, [items])

  const stats = useMemo(
    () => computeChecklistStats(items.map(item => (item[it.result] as number) ?? RESULT_UNCHECKED)),
    [items]
  )

  const storeName = useMemo(() => {
    if (!audit) return ""
    const store = stores.find(s => String(s[st.id] ?? "") === String(audit[a.store_ref] ?? ""))
    return store ? String(store[st.name] ?? "") : ""
  }, [stores, audit])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">臨店チェック詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!audit || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/audits")}>
          <ArrowLeft className="h-4 w-4" />臨店チェック一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>臨店チェックが見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = audit[a.status] as number | undefined

  /** 判定変更のたびにスコアを再計算して臨店レコードへ同期する */
  const syncScore = async (nextResults: number[]) => {
    const next = computeChecklistStats(nextResults)
    if (next.score != null) {
      await updateAudit.mutateAsync({ id, data: { [a.score]: next.score } })
    }
  }

  const handleStageSelect = async (value: number) => {
    try {
      await updateAudit.mutateAsync({ id, data: { [a.status]: value } })
      toast.success(`ステータスを「${(AUDIT_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  /** 同じ判定をもう一度クリックすると未確認に戻す */
  const handleResultSelect = async (item: Record<string, unknown>, value: number) => {
    const itemId = String(item[it.id] ?? "")
    const current = (item[it.result] as number) ?? RESULT_UNCHECKED
    const next = current === value ? RESULT_UNCHECKED : value
    try {
      await updateItem.mutateAsync({ id: itemId, data: { [it.result]: next } })
      await syncScore(items.map(x =>
        String(x[it.id] ?? "") === itemId ? next : ((x[it.result] as number) ?? RESULT_UNCHECKED)
      ))
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  /** 標準チェックリスト（テンプレート）から項目を一括生成 */
  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      for (const tpl of STANDARD_CHECKLIST) {
        await createItem.mutateAsync({
          [it.name]:      tpl.name,
          [it.audit_ref]: id,
          [it.category]:  tpl.category,
          [it.result]:    RESULT_UNCHECKED,
        })
      }
      toast.success(`標準チェックリスト ${STANDARD_CHECKLIST.length} 項目を生成しました`)
    } catch {
      toast.error("項目の生成に失敗しました")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleAddItem = async () => {
    if (!itemForm.name.trim()) {
      toast.error("項目名は必須です")
      return
    }
    try {
      await createItem.mutateAsync({
        [it.name]:      itemForm.name,
        [it.audit_ref]: id,
        [it.category]:  itemForm.category || "その他",
        [it.result]:    RESULT_UNCHECKED,
      })
      toast.success("項目を追加しました")
      setIsItemFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDeleteItem = async () => {
    if (!deleteItemId) return
    try {
      await deleteItem.mutateAsync(deleteItemId)
      await syncScore(items
        .filter(x => String(x[it.id] ?? "") !== deleteItemId)
        .map(x => (x[it.result] as number) ?? RESULT_UNCHECKED))
      toast.success("項目を削除しました")
      setDeleteItemId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const openComment = (item: Record<string, unknown>) => {
    setCommentItemId(String(item[it.id] ?? ""))
    setCommentDraft(String(item[it.comment] ?? ""))
  }

  const handleSaveComment = async () => {
    if (!commentItemId) return
    try {
      await updateItem.mutateAsync({ id: commentItemId, data: { [it.comment]: commentDraft } })
      toast.success("コメントを保存しました")
      setCommentItemId(null)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/audits")}>
            <ArrowLeft className="h-4 w-4" />臨店チェック一覧へ戻る
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{String(audit[a.name] ?? "")}</h1>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => { setItemForm(EMPTY_ITEM); setIsItemFormOpen(true) }}>
          <Plus className="h-3.5 w-3.5" />項目を追加
        </Button>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Store className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">店舗</div>
                <div className="truncate text-sm font-medium">{storeName || "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">巡回担当 / 実施日</div>
                <div className="truncate text-sm font-medium">
                  {String(audit[a.auditor] ?? "—")} / {String(audit[a.audit_date] ?? "—")}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Gauge className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">スコア</div>
                <div className={`text-sm font-semibold ${stats.score != null && stats.score < 70 ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {stats.score != null ? `${stats.score} 点` : "未実施"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    （合格 {stats.pass} / 不合格 {stats.fail}）
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ListChecks className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">進捗</div>
                <div className="text-sm font-medium">{stats.checked} / {stats.total} 項目</div>
                <Progress value={stats.progress} className="mt-1 h-2" />
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={AUDIT_STAGE_PATH_ITEMS}
              current={status}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* チェックリスト */}
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">チェック項目がありません</CardTitle>
            <CardDescription>
              標準チェックリスト（{STANDARD_CHECKLIST.length} 項目）を一括生成するか、「項目を追加」から個別に登録してください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="gap-2" onClick={handleGenerate} disabled={isGenerating}>
              <ListChecks className="h-4 w-4" />
              {isGenerating ? "生成中..." : "標準チェックリストを生成"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        grouped.map(([category, categoryItems]) => {
          const catStats = computeChecklistStats(
            categoryItems.map(item => (item[it.result] as number) ?? RESULT_UNCHECKED)
          )
          return (
            <Card key={category}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{category}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    合格 {catStats.pass} / 不合格 {catStats.fail} / 全 {catStats.total} 項目
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {categoryItems.map((item, idx) => {
                  const result = (item[it.result] as number) ?? RESULT_UNCHECKED
                  const comment = String(item[it.comment] ?? "")
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${result === RESULT_FAIL ? "border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{String(item[it.name] ?? "")}</p>
                        {comment && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">💬 {comment}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <ResultToggle
                          options={RESULT_TOGGLE_OPTIONS}
                          value={result === RESULT_UNCHECKED ? undefined : result}
                          onSelect={(v) => handleResultSelect(item, v)}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openComment(item)}
                          title="コメント"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteItemId(String(item[it.id] ?? ""))}
                          title="削除"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })
      )}

      {/* 所感 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">所感</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(audit[a.notes] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 項目追加フォーム */}
      <FormModal
        open={isItemFormOpen}
        onOpenChange={setIsItemFormOpen}
        title="チェック項目追加"
        onSave={handleAddItem}
        isSaving={createItem.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="item_name">項目名 <span className="text-destructive">*</span></Label>
            <Input
              id="item_name"
              value={itemForm.name}
              onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))}
              placeholder="確認する内容"
            />
          </div>
          <FormColumns columns={1}>
            <div className="space-y-1.5">
              <Label htmlFor="item_category">カテゴリ</Label>
              <Input
                id="item_category"
                value={itemForm.category}
                onChange={e => setItemForm(p => ({ ...p, category: e.target.value }))}
                placeholder="例: 清掃・衛生, 陳列・売場, 接客, 安全"
              />
            </div>
          </FormColumns>
        </div>
      </FormModal>

      {/* コメント編集 */}
      <FormModal
        open={!!commentItemId}
        onOpenChange={open => { if (!open) setCommentItemId(null) }}
        title="コメント"
        onSave={handleSaveComment}
        isSaving={updateItem.isPending}
        maxWidth="md"
      >
        <div className="space-y-1.5">
          <Label htmlFor="item_comment">指摘事項・気づき</Label>
          <Textarea
            id="item_comment"
            value={commentDraft}
            onChange={e => setCommentDraft(e.target.value)}
            placeholder="不合格の理由や改善指示を記録"
            rows={4}
          />
        </div>
      </FormModal>

      {/* 項目削除確認 */}
      <ConfirmDialog
        open={!!deleteItemId}
        onOpenChange={open => { if (!open) setDeleteItemId(null) }}
        title="チェック項目を削除しますか？"
        description="この操作は取り消せません。項目を削除し、スコアを再計算します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDeleteItem}
      />
    </div>
  )
}
