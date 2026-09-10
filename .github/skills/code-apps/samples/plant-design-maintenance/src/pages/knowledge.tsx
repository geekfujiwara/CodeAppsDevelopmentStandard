import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, Plus, ShieldCheck, ShieldX } from "lucide-react"
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
  useApproveKnowledge,
  useDeleteKnowledge,
  useKnowledgeEntries,
  useSaveKnowledge,
  useTags,
  type KnowledgeInput,
  type KnowledgeRecord,
  type KnowledgeSourceRecord,
  type KnowledgeStatus,
  type Visibility,
} from "@/data/kb-repository"

const STATUSES: KnowledgeStatus[] = ["未承認", "承認済み", "要確認"]
const VISIBILITIES: Visibility[] = ["社内限定", "公開可"]
const NO_TAG = "__none__"

function toOptions(values: string[]): ComboboxOption[] {
  return [...new Set(values.filter(Boolean))].sort().map((v) => ({ value: v, label: v }))
}

function emptyForm(status: KnowledgeStatus, visibility: Visibility): KnowledgeInput {
  return {
    title: "",
    summary: "",
    symptom: "",
    countermeasure: "",
    status,
    visibility,
    occurrenceCount: 1,
    tagId: null,
  }
}

function toForm(record: KnowledgeRecord): KnowledgeInput {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    symptom: record.symptom,
    countermeasure: record.countermeasure,
    status: (STATUSES.find((s) => s === record.status) ?? "未承認") as KnowledgeStatus,
    visibility: (VISIBILITIES.find((v) => v === record.visibility) ?? "社内限定") as Visibility,
    occurrenceCount: record.occurrenceCount,
    tagId: record.tagId,
    approvedOn: record.approvedOn,
  }
}

export default function KnowledgePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: entries, isLoading, isError, error } = useKnowledgeEntries()
  const tagsQuery = useTags()
  const saveKnowledge = useSaveKnowledge()
  const deleteKnowledge = useDeleteKnowledge()
  const approveKnowledge = useApproveKnowledge()

  const [form, setForm] = useState<KnowledgeInput | null>(null)
  const [sources, setSources] = useState<KnowledgeSourceRecord[]>([])
  const [pendingDelete, setPendingDelete] = useState<KnowledgeInput | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const open = (record: KnowledgeRecord) => {
    setSources(record.sources)
    setForm(toForm(record))
  }

  const openNew = (status: KnowledgeStatus, visibility: Visibility) => {
    setSources([])
    setForm(emptyForm(status, visibility))
  }

  // ライフサイクル画面からの ?id= / ?new=1 を受けて詳細を開く
  useEffect(() => {
    const id = searchParams.get("id")
    const isNew = searchParams.get("new") === "1"
    if (!id && !isNew) return
    if (isNew) {
      const status = (STATUSES.find((s) => s === searchParams.get("status")) ?? "未承認") as KnowledgeStatus
      const visibility = (VISIBILITIES.find((v) => v === searchParams.get("visibility")) ?? "社内限定") as Visibility
      openNew(status, visibility)
      setSearchParams({}, { replace: true })
      return
    }
    const record = entries?.find((k) => k.id === id)
    if (!record) return
    open(record)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, entries])

  useEffect(() => {
    if (form) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [form])

  const rows = useMemo(() => entries ?? [], [entries])

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
    saveKnowledge.mutate(form, {
      onSuccess: () => {
        toast.success(form.id ? "ナレッジを更新しました" : "ナレッジを登録しました")
        setForm(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "保存に失敗しました"),
    })
  }

  const approve = (publicAllowed: boolean) => {
    if (!form?.id) return
    approveKnowledge.mutate(
      { id: form.id, publicAllowed },
      {
        onSuccess: () => {
          toast.success(publicAllowed ? "承認し、公開可にしました" : "社内限定として承認しました")
          setForm(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "承認に失敗しました"),
      },
    )
  }

  const confirmDelete = () => {
    if (!pendingDelete?.id) return
    deleteKnowledge.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success("削除しました")
        setForm(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "削除に失敗しました"),
    })
    setPendingDelete(null)
  }

  const columns: TableColumn<KnowledgeRecord>[] = [
    { key: "title", label: "タイトル", sortable: true, render: (k) => <span className="font-medium">{k.title}</span> },
    { key: "categoryName", label: "カテゴリ" },
    { key: "tagLabel", label: "対象タグ" },
    { key: "occurrenceCount", label: "発生件数", sortable: true, align: "right" },
    {
      key: "sourceCount",
      label: "出典",
      align: "center",
      render: (k) =>
        k.sourceCount > 0 ? <Badge variant="secondary">{k.sourceCount} 件</Badge> : <Badge variant="destructive">なし</Badge>,
    },
    {
      key: "status",
      label: "状態",
      render: (k) => <Badge variant={k.status === "承認済み" ? "default" : "secondary"}>{k.status}</Badge>,
    },
    {
      key: "visibility",
      label: "公開範囲",
      render: (k) => (
        <Badge variant={k.visibility === "公開可" ? "default" : "outline"}>{k.visibility || "社内限定"}</Badge>
      ),
    },
  ]

  const filters: FilterConfig<KnowledgeRecord>[] = [
    { key: "status", label: "状態", options: toOptions(rows.map((k) => k.status)) },
    { key: "categoryName", label: "カテゴリ", options: toOptions(rows.map((k) => k.categoryName)) },
    { key: "visibility", label: "公開範囲", options: toOptions(rows.map((k) => k.visibility)) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ナレッジ</h1>
          <p className="text-muted-foreground">一覧から行を選ぶと詳細が開きます。出典を確認してから承認してください。</p>
        </div>
        <Button onClick={() => openNew("未承認", "社内限定")}>
          <Plus className="mr-1 h-4 w-4" />新規登録
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeletonList count={4} />
      ) : isError ? (
        <Card>
          <CardHeader>
            <CardTitle>ナレッジを取得できませんでした</CardTitle>
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
                title={form.id ? "ナレッジの詳細" : "ナレッジの新規登録"}
                description="出典のないナレッジは公開できません。承認前に根拠を確認してください。"
                onClose={() => setForm(null)}
                onDelete={form.id ? () => setPendingDelete(form) : undefined}
                onSave={submit}
                isSaving={saveKnowledge.isPending}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="タイトル" className="md:col-span-2">
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </Field>
                  <Field label="要約" className="md:col-span-2">
                    <Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                  </Field>
                  <Field label="症状">
                    <Textarea rows={4} value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} />
                  </Field>
                  <Field label="対策">
                    <Textarea
                      rows={4}
                      value={form.countermeasure}
                      onChange={(e) => setForm({ ...form, countermeasure: e.target.value })}
                    />
                  </Field>
                  <Field label="状態">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as KnowledgeStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="公開範囲">
                    <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as Visibility })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VISIBILITIES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="発生件数">
                    <Input
                      type="number"
                      min={0}
                      value={form.occurrenceCount}
                      onChange={(e) => setForm({ ...form, occurrenceCount: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="対象タグ">
                    <Combobox
                      options={tagOptions}
                      value={form.tagId ?? NO_TAG}
                      onValueChange={(v) => setForm({ ...form, tagId: v === NO_TAG ? null : v })}
                      placeholder="タグを選択"
                    />
                  </Field>

                  <div className="rounded-lg border p-3 md:col-span-2">
                    <p className="text-sm font-semibold">出典</p>
                    {sources.length > 0 ? (
                      <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                        {sources.map((s) => (
                          <li key={s.id} className="flex min-w-0 items-start gap-2">
                            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="[overflow-wrap:anywhere]">
                              [{s.sourceType}] {s.title} / {s.reference}
                              {s.verified ? "（検証済み）" : "（要検証）"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        出典が登録されていません。根拠付与率 (K-03) の未達要因です。
                      </p>
                    )}
                  </div>

                  {form.id && form.status !== "承認済み" && (
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <Button variant="outline" disabled={approveKnowledge.isPending} onClick={() => approve(false)}>
                        <ShieldX className="mr-1 h-4 w-4" />社内限定で承認
                      </Button>
                      <Button
                        disabled={approveKnowledge.isPending || sources.length === 0}
                        title={sources.length === 0 ? "出典が無いナレッジは公開できません" : undefined}
                        onClick={() => approve(true)}
                      >
                        <ShieldCheck className="mr-1 h-4 w-4" />公開可で承認
                      </Button>
                    </div>
                  )}
                </div>
              </DetailPanel>
            )}
          </div>

          <div data-tour="knowledge-list">
            <ListTable<KnowledgeRecord>
              data={rows}
              columns={columns}
              title="ナレッジ一覧"
              description={`${rows.length} 件`}
              searchPlaceholder="タイトル・要約・症状・対策で検索..."
              searchKeys={["title", "summary", "symptom", "countermeasure", "tagLabel"]}
              filters={filters}
              emptyMessage="ナレッジがありません"
              onRowClick={open}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="削除しますか？"
        description={`「${pendingDelete?.title ?? ""}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
