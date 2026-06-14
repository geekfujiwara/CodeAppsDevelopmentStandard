import { useState } from "react"
import { useContracts, useCreateContract, useUpdateContract, useDeleteContract } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX as P } from "@/config"
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_COLOR,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPE_OPTIONS,
  AUTO_RENEWAL_OPTIONS,
  type ContractStatus,
  type ContractType,
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
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Contract } from "@/types/dataverse"

const f = {
  id:             `${P}_contractid`,
  name:           `${P}_name`,
  contract_number:`${P}_contract_number`,
  counterparty:   `${P}_counterparty`,
  type:           `${P}_contract_type`,
  start:          `${P}_start_date`,
  end:            `${P}_end_date`,
  auto_renewal:   `${P}_auto_renewal`,
  status:         `${P}_status`,
  value:          `${P}_value`,
  notes:          `${P}_notes`,
}

function StatusBadge({ value }: { value: number }) {
  const label = CONTRACT_STATUS_LABEL[value as ContractStatus] ?? String(value)
  const color = CONTRACT_STATUS_COLOR[value as ContractStatus] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function ContractTypeBadge({ value }: { value: number }) {
  const label = CONTRACT_TYPE_LABEL[value as ContractType] ?? String(value)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {label}
    </span>
  )
}

type FormData = {
  name: string
  contract_number: string
  counterparty: string
  type: string
  status: string
  start: string
  end: string
  auto_renewal: string
  value: string
  notes: string
}

const emptyForm: FormData = {
  name: "", contract_number: "", counterparty: "", type: "", status: "",
  start: "", end: "", auto_renewal: "", value: "", notes: "",
}

function ContractForm({
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
      title={initial.name ? "契約を編集" : "契約を追加"}
      onSave={() => {
        if (!form.name.trim()) { toast.error("件名は必須です"); return }
        onSave(form)
      }}
      onCancel={onCancel}
      isSaving={isSaving}
    >
      <div className="space-y-4">
        {/* 件名 full width */}
        <div className="space-y-1">
          <Label>件名 <span className="text-red-500">*</span></Label>
          <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="件名を入力" />
        </div>

        <FormColumns columns={2}>
          <div className="space-y-1">
            <Label>契約番号</Label>
            <Input value={form.contract_number} onChange={e => set("contract_number")(e.target.value)} placeholder="例: CTR-2024-001" />
          </div>
          <div className="space-y-1">
            <Label>取引先名</Label>
            <Input value={form.counterparty} onChange={e => set("counterparty")(e.target.value)} placeholder="取引先名を入力" />
          </div>
          <div className="space-y-1">
            <Label>契約種別</Label>
            <Select value={form.type} onValueChange={set("type")}>
              <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ステータス</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
              <SelectContent>
                {CONTRACT_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>開始日</Label>
            <Input type="date" value={form.start} onChange={e => set("start")(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>終了日</Label>
            <Input type="date" value={form.end} onChange={e => set("end")(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>自動更新</Label>
            <Select value={form.auto_renewal} onValueChange={set("auto_renewal")}>
              <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
              <SelectContent>
                {AUTO_RENEWAL_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>契約金額</Label>
            <Input type="number" value={form.value} onChange={e => set("value")(e.target.value)} placeholder="0" />
          </div>
        </FormColumns>

        {/* 備考 full width */}
        <div className="space-y-1">
          <Label>備考</Label>
          <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)} placeholder="備考を入力" rows={3} />
        </div>
      </div>
    </FormModal>
  )
}

export default function Contracts() {
  const { data: contracts = [], isLoading } = useContracts()
  const createMutation  = useCreateContract()
  const updateMutation  = useUpdateContract()
  const deleteMutation  = useDeleteContract()

  const [formOpen, setFormOpen]   = useState(false)
  const [editItem, setEditItem]   = useState<Contract | null>(null)
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  function toFormData(c: Contract): FormData {
    return {
      name:            String(c[f.name] ?? ""),
      contract_number: String(c[f.contract_number] ?? ""),
      counterparty:    String(c[f.counterparty] ?? ""),
      type:            c[f.type] != null ? String(c[f.type]) : "",
      status:          c[f.status] != null ? String(c[f.status]) : "",
      start:           c[f.start] ? String(c[f.start]).slice(0, 10) : "",
      end:             c[f.end]   ? String(c[f.end]).slice(0, 10)   : "",
      auto_renewal:    c[f.auto_renewal] != null ? String(c[f.auto_renewal]) : "",
      value:           c[f.value] != null ? String(c[f.value]) : "",
      notes:           String(c[f.notes] ?? ""),
    }
  }

  function toPayload(d: FormData): Record<string, unknown> {
    const payload: Record<string, unknown> = { [f.name]: d.name }
    if (d.contract_number) payload[f.contract_number] = d.contract_number
    if (d.counterparty)    payload[f.counterparty]    = d.counterparty
    if (d.type)            payload[f.type]            = Number(d.type)
    if (d.status)          payload[f.status]          = Number(d.status)
    if (d.start)           payload[f.start]           = d.start
    if (d.end)             payload[f.end]             = d.end
    if (d.auto_renewal)    payload[f.auto_renewal]    = Number(d.auto_renewal)
    if (d.value !== "")    payload[f.value]           = Number(d.value)
    if (d.notes)           payload[f.notes]           = d.notes
    return payload
  }

  async function handleSave(data: FormData) {
    try {
      if (editItem) {
        const id = String(editItem[f.id])
        await updateMutation.mutateAsync({ id, data: toPayload(data) })
        toast.success("契約を更新しました")
      } else {
        await createMutation.mutateAsync(toPayload(data))
        toast.success("契約を追加しました")
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
      toast.success("契約を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  const columns: TableColumn<Contract>[] = [
    {
      key: f.name,
      label: "件名",
      sortable: true,
      render: c => <span className="font-medium">{String(c[f.name] ?? "")}</span>,
    },
    { key: f.counterparty, label: "取引先", sortable: true, render: c => String(c[f.counterparty] ?? "") },
    {
      key: f.type,
      label: "契約種別",
      render: c => c[f.type] != null ? <ContractTypeBadge value={Number(c[f.type])} /> : null,
    },
    {
      key: f.status,
      label: "ステータス",
      render: c => c[f.status] != null ? <StatusBadge value={Number(c[f.status])} /> : null,
    },
    {
      key: f.start,
      label: "開始日",
      sortable: true,
      render: c => c[f.start] ? String(c[f.start]).slice(0, 10) : "",
    },
    {
      key: f.end,
      label: "終了日",
      sortable: true,
      render: c => c[f.end] ? String(c[f.end]).slice(0, 10) : "",
    },
    {
      key: f.auto_renewal,
      label: "自動更新",
      render: c => {
        const v = c[f.auto_renewal]
        if (v == null) return ""
        return v === 100000000 ? "あり" : "なし"
      },
    },
    {
      key: f.value,
      label: "契約金額",
      align: "right",
      render: c => {
        const v = c[f.value]
        if (v == null) return ""
        return `¥${Number(v).toLocaleString("ja-JP")}`
      },
    },
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

  const filters: FilterConfig<Contract>[] = [
    {
      key: f.status as keyof Contract,
      label: "ステータス",
      placeholder: "ステータスで絞り込み",
      options: CONTRACT_STATUS_OPTIONS.map(o => ({ value: String(o.value), label: o.label })),
    },
    {
      key: f.type as keyof Contract,
      label: "契約種別",
      placeholder: "種別で絞り込み",
      options: CONTRACT_TYPE_OPTIONS.map(o => ({ value: String(o.value), label: o.label })),
    },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">契約台帳</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">契約台帳</h1>
        <Button onClick={() => { setEditItem(null); setFormOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          契約を追加
        </Button>
      </div>

      <ListTable
        data={contracts}
        columns={columns}
        searchable
        searchPlaceholder="件名・取引先名・契約番号で検索..."
        searchKeys={[f.name as keyof Contract, f.counterparty as keyof Contract, f.contract_number as keyof Contract]}
        filters={filters}
        itemsPerPage={10}
        emptyMessage="契約データがありません"
      />

      {formOpen && (
        <ContractForm
          initial={editItem ? toFormData(editItem) : emptyForm}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditItem(null) }}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="契約を削除"
        description="この契約を削除しますか？この操作は元に戻せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
