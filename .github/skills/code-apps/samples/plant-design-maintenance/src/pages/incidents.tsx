import { useEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DetailPanel, Field } from "@/components/detail-panel"
import { ListTable, type FilterConfig, type TableColumn } from "@/components/list-table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  useDeleteIncident,
  useIncidents,
  useSaveIncident,
  useTags,
  type IncidentInput,
  type IncidentRecord,
  type IncidentStatus,
  type Zone,
} from "@/data/kb-repository"

const STATUSES: IncidentStatus[] = ["未対応", "対応中", "完了"]
const ZONES: Zone[] = ["社内", "現地", "顧客"]
const NO_TAG = "__none__"

const statusVariant: Record<IncidentStatus, "default" | "secondary" | "outline"> = {
  未対応: "outline",
  対応中: "secondary",
  完了: "default",
}

function toOptions(values: string[]): ComboboxOption[] {
  return [...new Set(values.filter(Boolean))].sort().map((v) => ({ value: v, label: v }))
}

function emptyForm(status: IncidentStatus): IncidentInput {
  return { title: "", detail: "", status, zone: "現地", when: "", where: "", tagId: null }
}

function toForm(record: IncidentRecord): IncidentInput {
  return {
    id: record.id,
    title: record.title,
    detail: record.detail,
    status: record.status,
    zone: (ZONES.find((z) => z === record.zone) ?? "社内") as Zone,
    when: record.when,
    where: record.where,
    tagId: record.tagId,
    closedOn: record.closedOn,
  }
}

export default function IncidentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: incidents, isLoading, isError, error } = useIncidents()
  const tagsQuery = useTags()
  const saveIncident = useSaveIncident()
  const deleteIncident = useDeleteIncident()

  const [form, setForm] = useState<IncidentInput | null>(null)
  const [pendingDelete, setPendingDelete] = useState<IncidentInput | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  // ライフサイクル画面からの ?id= / ?new=1 を受けて詳細を開く
  useEffect(() => {
    const id = searchParams.get("id")
    const isNew = searchParams.get("new") === "1"
    if (!id && !isNew) return
    if (isNew) {
      const status = (STATUSES.find((s) => s === searchParams.get("status")) ?? "未対応") as IncidentStatus
      setForm(emptyForm(status))
      setSearchParams({}, { replace: true })
      return
    }
    const record = incidents?.find((i) => i.id === id)
    if (!record) return
    setForm(toForm(record))
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, incidents])

  useEffect(() => {
    if (form) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [form])

  const rows = useMemo(() => incidents ?? [], [incidents])

  const tagOptions: ComboboxOption[] = useMemo(
    () => [
      { value: NO_TAG, label: "未指定" },
      ...(tagsQuery.data ?? []).map((t) => ({ value: t.id, label: `${t.label}（${t.categoryName}）` })),
    ],
    [tagsQuery.data],
  )

  const submit = () => {
    if (!form) return
    if (!form.title.trim()) {
      toast.error("タイトルは必須です")
      return
    }
    saveIncident.mutate(form, {
      onSuccess: () => {
        toast.success(form.id ? "問い合わせを更新しました" : "問い合わせを登録しました")
        setForm(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "保存に失敗しました"),
    })
  }

  const confirmDelete = () => {
    if (!pendingDelete?.id) return
    deleteIncident.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success("削除しました")
        setForm(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "削除に失敗しました"),
    })
    setPendingDelete(null)
  }

  const columns: TableColumn<IncidentRecord>[] = [
    { key: "title", label: "タイトル", sortable: true, render: (i) => <span className="font-medium">{i.title}</span> },
    { key: "tagLabel", label: "対象タグ" },
    { key: "zone", label: "ゾーン" },
    { key: "where", label: "発生場所" },
    { key: "when", label: "発生日時" },
    { key: "status", label: "状態", render: (i) => <Badge variant={statusVariant[i.status]}>{i.status}</Badge> },
    {
      key: "knowledgeGenerated",
      label: "資産化",
      align: "center",
      render: (i) => (i.knowledgeGenerated ? <Badge>済み</Badge> : <Badge variant="outline">未</Badge>),
    },
  ]

  const filters: FilterConfig<IncidentRecord>[] = [
    { key: "status", label: "状態", options: toOptions(rows.map((i) => i.status)) },
    { key: "zone", label: "ゾーン", options: toOptions(rows.map((i) => i.zone)) },
    { key: "tagLabel", label: "対象タグ", options: toOptions(rows.map((i) => i.tagLabel)) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">問い合わせ</h1>
          <p className="text-muted-foreground">一覧から行を選ぶと詳細が開きます。完了にするとナレッジ化の対象になります。</p>
        </div>
        <Button onClick={() => setForm(emptyForm("未対応"))}>
          <Plus className="mr-1 h-4 w-4" />新規登録
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeletonList count={6} />
      ) : isError ? (
        <Card>
          <CardHeader>
            <CardTitle>問い合わせを取得できませんでした</CardTitle>
            <CardDescription className="[overflow-wrap:anywhere]">
              {error instanceof Error ? error.message : "Dataverse への接続を確認してください。"}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div ref={detailRef} className="scroll-mt-4">
            {form && (
              <DetailPanel
                title={form.id ? "問い合わせの詳細" : "問い合わせの新規登録"}
                description="5W1H と対象タグを揃えるほど、後段のナレッジ生成精度が上がります。"
                onClose={() => setForm(null)}
                onDelete={form.id ? () => setPendingDelete(form) : undefined}
                onSave={submit}
                isSaving={saveIncident.isPending}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="タイトル" className="md:col-span-2">
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="例: B-301 の圧力計が振り切れる"
                    />
                  </Field>
                  <Field label="内容" className="md:col-span-2">
                    <Textarea rows={4} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
                  </Field>
                  <Field label="状態">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as IncidentStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="ゾーン">
                    <Select value={form.zone} onValueChange={(v) => setForm({ ...form, zone: v as Zone })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="発生日時">
                    <Input
                      value={form.when}
                      onChange={(e) => setForm({ ...form, when: e.target.value })}
                      placeholder="2026-03-01 09:30"
                    />
                  </Field>
                  <Field label="発生場所">
                    <Input value={form.where} onChange={(e) => setForm({ ...form, where: e.target.value })} />
                  </Field>
                  <Field label="対象タグ" className="md:col-span-2">
                    <Combobox
                      options={tagOptions}
                      value={form.tagId ?? NO_TAG}
                      onValueChange={(v) => setForm({ ...form, tagId: v === NO_TAG ? null : v })}
                      placeholder="タグを選択"
                    />
                  </Field>
                </div>
              </DetailPanel>
            )}
          </div>

          <div data-tour="incident-list">
            <ListTable<IncidentRecord>
              data={rows}
              columns={columns}
              title="問い合わせ一覧"
              description={`${rows.length} 件`}
              searchPlaceholder="タイトル・内容・タグ・場所で検索..."
              searchKeys={["title", "detail", "tagLabel", "where", "when"]}
              filters={filters}
              emptyMessage="問い合わせがありません"
              onRowClick={(record) => setForm(toForm(record))}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="削除しますか？"
        description={`「${pendingDelete?.title ?? ""}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
