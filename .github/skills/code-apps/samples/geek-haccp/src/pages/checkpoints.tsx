import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
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
  useCheckpoints,
  useCreateCheckpoint,
  useUpdateCheckpoint,
  useDeleteCheckpoint,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_CHECKPOINTS } from "@/config"
import {
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  CATEGORY_OPTIONS,
  STANDARD_CHECKPOINTS,
} from "@/types/dataverse"
import { formatRange } from "@/lib/threshold"
import { Plus, Pencil, Trash2, ListPlus } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:       `${P}_checkpointid`,
  name:     `${P}_name`,
  category: `${P}_category`,
  unit:     `${P}_unit`,
  min:      `${P}_min_value`,
  max:      `${P}_max_value`,
}

function CategoryBadge({ category }: { category: number }) {
  const label = CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? String(category)
  const color = CATEGORY_COLOR[category as keyof typeof CATEGORY_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            点検項目マスタは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_CHECKPOINTS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  category: string
  unit: string
  min: string
  max: string
}

const EMPTY_FORM: FormData = {
  name: "", category: String(100000000), unit: "℃", min: "", max: "",
}

export default function CheckpointsPage() {
  if (!FEATURE_CHECKPOINTS) return <DisabledFeatureCard />
  return <CheckpointsContent />
}

function CheckpointsContent() {
  const { data: checkpoints = [], isLoading } = useCheckpoints()
  const createCheckpoint = useCreateCheckpoint()
  const updateCheckpoint = useUpdateCheckpoint()
  const deleteCheckpoint = useDeleteCheckpoint()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (cp: Record<string, unknown>) => {
    setEditingId(String(cp[f.id] ?? ""))
    setFormData({
      name:     String(cp[f.name] ?? ""),
      category: cp[f.category] != null ? String(cp[f.category]) : String(100000000),
      unit:     String(cp[f.unit] ?? ""),
      min:      cp[f.min] != null ? String(cp[f.min]) : "",
      max:      cp[f.max] != null ? String(cp[f.max]) : "",
    })
    setIsFormOpen(true)
  }

  const buildData = (d: FormData): Record<string, unknown> => {
    const data: Record<string, unknown> = {
      [f.name]: d.name,
      [f.unit]: d.unit,
    }
    if (d.category) data[f.category] = Number(d.category)
    data[f.min] = d.min.trim() === "" ? null : parseFloat(d.min)
    data[f.max] = d.max.trim() === "" ? null : parseFloat(d.max)
    return data
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("項目名は必須です")
      return
    }
    try {
      if (editingId) {
        await updateCheckpoint.mutateAsync({ id: editingId, data: buildData(formData) })
        toast.success("点検項目を更新しました")
      } else {
        await createCheckpoint.mutateAsync(buildData(formData))
        toast.success("点検項目を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleSeed = async () => {
    setIsSeeding(true)
    try {
      for (const tpl of STANDARD_CHECKPOINTS) {
        await createCheckpoint.mutateAsync({
          [f.name]:     tpl.name,
          [f.category]: tpl.category,
          [f.unit]:     tpl.unit,
          [f.min]:      tpl.min,
          [f.max]:      tpl.max,
        })
      }
      toast.success(`標準点検項目 ${STANDARD_CHECKPOINTS.length} 件を登録しました`)
    } catch {
      toast.error("登録に失敗しました")
    } finally {
      setIsSeeding(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteCheckpoint.mutateAsync(deleteId)
      toast.success("点検項目を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">点検項目</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">点検項目</h1>
          <p className="text-muted-foreground text-sm mt-1">温度・衛生の点検項目と管理基準（上下限）</p>
        </div>
        <div className="flex items-center gap-2">
          {checkpoints.length === 0 && (
            <Button variant="outline" className="gap-2" onClick={handleSeed} disabled={isSeeding}>
              <ListPlus className="h-4 w-4" />
              {isSeeding ? "登録中..." : "標準項目を投入"}
            </Button>
          )}
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            新規登録
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>点検項目一覧</CardTitle>
          <CardDescription>{checkpoints.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>項目名</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>単位</TableHead>
                  <TableHead>管理基準</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkpoints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      点検項目がありません。「標準項目を投入」で HACCP の代表的な項目を登録できます
                    </TableCell>
                  </TableRow>
                ) : (
                  checkpoints.map((cp, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{String(cp[f.name] ?? "")}</TableCell>
                      <TableCell>
                        {cp[f.category] != null && <CategoryBadge category={cp[f.category] as number} />}
                      </TableCell>
                      <TableCell>{String(cp[f.unit] ?? "")}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatRange((cp[f.min] as number | null) ?? null, (cp[f.max] as number | null) ?? null, String(cp[f.unit] ?? ""))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(cp)} title="編集">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(String(cp[f.id] ?? ""))}
                            title="削除" className="text-destructive hover:text-destructive">
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
        </CardContent>
      </Card>

      {/* フォームモーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "点検項目編集" : "点検項目新規登録"}
        onSave={handleSave}
        isSaving={createCheckpoint.isPending || updateCheckpoint.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">項目名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 冷蔵庫 庫内温度"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label>カテゴリ</Label>
              <Select value={formData.category} onValueChange={v => setFormData(p => ({ ...p, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="カテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">単位</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))}
                placeholder="例: ℃"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min">下限（≥）</Label>
              <Input
                id="min"
                type="number"
                step="0.1"
                value={formData.min}
                onChange={e => setFormData(p => ({ ...p, min: e.target.value }))}
                placeholder="例: 75（加熱）"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">上限（≤）</Label>
              <Input
                id="max"
                type="number"
                step="0.1"
                value={formData.max}
                onChange={e => setFormData(p => ({ ...p, max: e.target.value }))}
                placeholder="例: 5（冷蔵）"
              />
            </div>
          </FormColumns>
          <p className="text-xs text-muted-foreground">
            片側だけの規格（例: 加熱は下限のみ、冷蔵は上限のみ）は、一方を空欄にします。両方空欄なら測定値は常に「適合」になります。
          </p>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="点検項目を削除しますか？"
        description="この操作は取り消せません。点検項目を削除します（既存の測定記録は残りますが基準判定ができなくなります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
