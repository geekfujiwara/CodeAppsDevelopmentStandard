import { useState } from "react"
import { FEATURE_COUNTERPARTIES } from "@/config"
import { useCounterparties, useCreateCounterparty, useUpdateCounterparty, useDeleteCounterparty } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX as P } from "@/config"
import {
  COUNTERPARTY_TYPE_LABEL,
  COUNTERPARTY_TYPE_OPTIONS,
  type CounterpartyType,
} from "@/types/dataverse"
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Plus, Pencil, Trash2, Lock } from "lucide-react"
import { toast } from "sonner"
import type { Counterparty } from "@/types/dataverse"

const f = {
  id:            `${P}_counterpartyid`,
  name:          `${P}_name`,
  company_type:  `${P}_company_type`,
  contact_name:  `${P}_contact_name`,
  contact_email: `${P}_contact_email`,
  phone:         `${P}_phone`,
  notes:         `${P}_notes`,
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <Lock className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle>取引先管理は無効です</CardTitle>
          <CardDescription>
            この機能を有効にするには、環境変数を設定してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="text-sm bg-muted px-2 py-1 rounded">
            VITE_FEATURE_COUNTERPARTIES=true
          </code>
        </CardContent>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  company_type: string
  contact_name: string
  contact_email: string
  phone: string
  notes: string
}

const emptyForm: FormData = {
  name: "", company_type: "", contact_name: "", contact_email: "", phone: "", notes: "",
}

function CounterpartyForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: FormData
  onSave: (data: FormData) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<FormData>(initial)
  const set = (k: keyof FormData) => (v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <FormModal
      open
      onOpenChange={open => { if (!open) onCancel() }}
      title={initial.name ? "取引先を編集" : "取引先を追加"}
      onSave={() => {
        if (!form.name.trim()) { toast.error("取引先名は必須です"); return }
        onSave(form)
      }}
      onCancel={onCancel}
      isSaving={isSaving}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>取引先名 <span className="text-red-500">*</span></Label>
          <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="取引先名を入力" />
        </div>

        <FormColumns columns={2}>
          <div className="space-y-1">
            <Label>会社種別</Label>
            <Select value={form.company_type} onValueChange={set("company_type")}>
              <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
              <SelectContent>
                {COUNTERPARTY_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>担当者名</Label>
            <Input value={form.contact_name} onChange={e => set("contact_name")(e.target.value)} placeholder="担当者名を入力" />
          </div>
          <div className="space-y-1">
            <Label>メール</Label>
            <Input type="email" value={form.contact_email} onChange={e => set("contact_email")(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-1">
            <Label>電話</Label>
            <Input value={form.phone} onChange={e => set("phone")(e.target.value)} placeholder="03-0000-0000" />
          </div>
        </FormColumns>

        <div className="space-y-1">
          <Label>備考</Label>
          <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)} placeholder="備考を入力" rows={3} />
        </div>
      </div>
    </FormModal>
  )
}

export default function Counterparties() {
  if (!FEATURE_COUNTERPARTIES) return <DisabledFeatureCard />

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: counterparties = [], isLoading } = useCounterparties()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createMutation = useCreateCounterparty()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateMutation = useUpdateCounterparty()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const deleteMutation = useDeleteCounterparty()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [formOpen, setFormOpen] = useState(false)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [editItem, setEditItem] = useState<Counterparty | null>(null)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function toFormData(c: Counterparty): FormData {
    return {
      name:          String(c[f.name] ?? ""),
      company_type:  c[f.company_type] != null ? String(c[f.company_type]) : "",
      contact_name:  String(c[f.contact_name] ?? ""),
      contact_email: String(c[f.contact_email] ?? ""),
      phone:         String(c[f.phone] ?? ""),
      notes:         String(c[f.notes] ?? ""),
    }
  }

  function toPayload(d: FormData): Record<string, unknown> {
    const payload: Record<string, unknown> = { [f.name]: d.name }
    if (d.company_type)  payload[f.company_type]  = Number(d.company_type)
    if (d.contact_name)  payload[f.contact_name]  = d.contact_name
    if (d.contact_email) payload[f.contact_email] = d.contact_email
    if (d.phone)         payload[f.phone]         = d.phone
    if (d.notes)         payload[f.notes]         = d.notes
    return payload
  }

  async function handleSave(data: FormData) {
    try {
      if (editItem) {
        const id = String(editItem[f.id])
        await updateMutation.mutateAsync({ id, data: toPayload(data) })
        toast.success("取引先を更新しました")
      } else {
        await createMutation.mutateAsync(toPayload(data))
        toast.success("取引先を追加しました")
      }
      setFormOpen(false)
      setEditItem(null)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("取引先を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  const columns: TableColumn<Counterparty>[] = [
    {
      key: f.name,
      label: "取引先名",
      sortable: true,
      render: c => <span className="font-medium">{String(c[f.name] ?? "")}</span>,
    },
    {
      key: f.company_type,
      label: "会社種別",
      render: c => {
        const v = c[f.company_type]
        if (v == null) return null
        const label = COUNTERPARTY_TYPE_LABEL[Number(v) as CounterpartyType] ?? String(v)
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {label}
          </span>
        )
      },
    },
    { key: f.contact_name,  label: "担当者名", render: c => String(c[f.contact_name] ?? "")  },
    { key: f.contact_email, label: "メール",   render: c => String(c[f.contact_email] ?? "") },
    { key: f.phone,         label: "電話",     render: c => String(c[f.phone] ?? "")         },
    {
      key: "actions",
      label: "操作",
      align: "center",
      render: c => (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={e => { e.stopPropagation(); setEditItem(c); setFormOpen(true) }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            onClick={e => { e.stopPropagation(); setDeleteId(String(c[f.id])) }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const filters: FilterConfig<Counterparty>[] = [
    {
      key: f.company_type as keyof Counterparty,
      label: "会社種別",
      placeholder: "種別で絞り込み",
      options: COUNTERPARTY_TYPE_OPTIONS.map(o => ({ value: String(o.value), label: o.label })),
    },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">取引先管理</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">取引先管理</h1>
        <Button onClick={() => { setEditItem(null); setFormOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          取引先を追加
        </Button>
      </div>

      <ListTable
        data={counterparties}
        columns={columns}
        searchable
        searchPlaceholder="取引先名・担当者名で検索..."
        searchKeys={[f.name as keyof Counterparty, f.contact_name as keyof Counterparty]}
        filters={filters}
        itemsPerPage={10}
        emptyMessage="取引先データがありません"
      />

      {formOpen && (
        <CounterpartyForm
          initial={editItem ? toFormData(editItem) : emptyForm}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditItem(null) }}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="取引先を削除"
        description="この取引先を削除しますか？この操作は元に戻せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
