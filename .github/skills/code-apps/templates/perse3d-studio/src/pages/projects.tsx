import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Box, Building2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useCreateProject, useProjects } from "@/hooks/use-projects"
import { STAGES, stageLabel, type ProjectInput, type Stage } from "@/types/project"
import { STAGE_TONE, projectThumbnail } from "@/lib/project-utils"
import { ListingImport } from "@/components/listing-import"
import { listingNotes, parseYen, type ListingInfo } from "@/lib/listing"

const EMPTY: ProjectInput = { name: "", clientName: "", address: "", stage: "received", budget: null, designOwner: "", salesOwner: "", notes: "" }

export default function Projects() {
  const { data = [], isLoading } = useProjects()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const create = useCreateProject()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(params.get("new") === "1")
  const [form, setForm] = useState<ProjectInput>(EMPTY)
  const stage = (params.get("stage") as Stage | null) ?? "all"

  const rows = useMemo(
    () =>
      data.filter(
        p =>
          (stage === "all" || p.stage === stage) &&
          (!q || [p.name, p.clientName, p.address, p.designOwner, p.salesOwner].some(v => v.toLowerCase().includes(q.toLowerCase()))),
      ),
    [data, q, stage],
  )

  // 取り込んだ物件情報で、空の項目だけを埋める（手で入れた値は上書きしない）。メモには物件概要を残す
  const applyListing = (info: ListingInfo) =>
    setForm(f => {
      const summary = listingNotes(info)
      const notes = !f.notes.trim() ? summary : f.notes.includes(summary) ? f.notes : `${f.notes}\n\n${summary}`
      return {
        ...f,
        listing: info,
        name: f.name.trim() ? f.name : info.title ?? "",
        address: f.address.trim() ? f.address : info.address ?? "",
        budget: f.budget ?? parseYen(info.price),
        notes,
      }
    })

  const submit = () => {
    if (!form.name.trim()) return
    create.mutate(form, {
      onSuccess: p => {
        setOpen(false)
        setForm(EMPTY)
        navigate(`/projects/${p.id}?tab=analyze`)
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">案件</h1>
          <p className="text-sm text-muted-foreground">依頼主から受け取ったパース・間取り図ごとに案件を作成し、3D 化から提案までを管理します。</p>
        </div>
        <Button className="gap-1" onClick={() => setOpen(true)} data-tour="new-project"><Plus className="h-4 w-4" />新規案件</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="案件名・依頼主・担当者で検索" className="pl-8" />
        </div>
        <Select value={stage} onValueChange={v => setParams(v === "all" ? {} : { stage: v })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのステージ</SelectItem>
            {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingSkeletonList count={3} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">該当する案件はありません。</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {rows.map((p, i) => {
            const thumb = projectThumbnail(p)
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                data-tour={i === 0 ? "project-card" : undefined}
                onClick={() => navigate(`/projects/${p.id}`)}
                onKeyDown={e => e.key === "Enter" && navigate(`/projects/${p.id}`)}
                className="group min-w-0 cursor-pointer overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-[16/9] bg-muted">
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Building2 className="absolute inset-0 m-auto h-10 w-10 text-muted-foreground" />}
                  <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-[11px] font-medium text-white ${STAGE_TONE[p.stage]}`}>{stageLabel(p.stage)}</span>
                  {p.spec && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white"><Box className="h-3 w-3" />3D</span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate font-semibold group-hover:text-primary">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.clientName}・{p.address}</p>
                  <div className="flex flex-wrap gap-1 pt-1 text-[11px]">
                    {p.designOwner && <Badge variant="outline">{p.designOwner}</Badge>}
                    {p.salesOwner && <Badge variant="outline">{p.salesOwner}</Badge>}
                    {p.variants.length > 0 && <Badge variant="secondary">プラン {p.variants.length}</Badge>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <FormModal
        open={open}
        onOpenChange={o => {
          setOpen(o)
          if (!o && params.get("new")) setParams({})
        }}
        title="新規案件"
        description="物件ページの URL から物件情報と外観・間取り図の画像を取り込めます（間取り図は階ごとに切り出します）。作成すると、続けて 3D 化できます。"
        onSave={submit}
        saveLabel={form.images && (form.images.perspective || Object.keys(form.images.floorplans).length) ? "作成して 3D 化へ進む" : "作成して画像を取り込む"}
        isSaving={create.isPending}
        maxWidth="2xl"
      >
        <div className="mb-4">
          <ListingImport listing={form.listing} onImported={applyListing} onImages={r => setForm(f => ({ ...f, images: r.images }))} />
        </div>
        <FormColumns>
          <div className="space-y-1">
            <Label>案件名 *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例: 山田邸 新築計画" />
          </div>
          <div className="space-y-1">
            <Label>依頼主</Label>
            <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>建設地</Label>
            <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>予算（円）</Label>
            <Input type="number" value={form.budget ?? ""} onChange={e => setForm({ ...form, budget: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>設計担当</Label>
            <Input value={form.designOwner} onChange={e => setForm({ ...form, designOwner: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>営業担当</Label>
            <Input value={form.salesOwner} onChange={e => setForm({ ...form, salesOwner: e.target.value })} />
          </div>
        </FormColumns>
        <div className="mt-4 space-y-1">
          <Label>要望・メモ</Label>
          <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="SUUMO の参考物件 URL、希望の間取り、外観テイストなど" />
        </div>
      </FormModal>
    </div>
  )
}
