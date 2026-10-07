import { useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Box, Cpu, FileImage, LayoutGrid, Pencil, Share2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StagePath } from "@/components/stage-path"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { ImageAnalysisPanel } from "@/components/image-analysis-panel"
import { ProposalWorkspace } from "@/components/proposal-workspace"
import { BlenderJobPanel } from "@/components/blender-job-panel"
import { GenerationProgressOverlay } from "@/components/generation-progress-overlay"
import { ListingImport } from "@/components/listing-import"
import { useDeleteProject, useProject, useUpdateProject } from "@/hooks/use-projects"
import { computeQuantities, ROOF_LABELS } from "@/lib/building-spec"
import { buildProjectLink } from "@/lib/power-context"
import { STAGES, stageLabel, type Project, type ProjectInput, type Stage } from "@/types/project"

const TABS = ["overview", "analyze", "viewer", "blender"] as const
type Tab = (typeof TABS)[number]

export default function ProjectDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: project, isLoading } = useProject(id)
  const update = useUpdateProject()
  const remove = useDeleteProject()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tabParam = params.get("tab") as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview"

  if (isLoading) return <LoadingSkeletonList count={3} />
  if (!project) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">案件が見つかりません。</p>
        <Button variant="outline" asChild><Link to="/projects">案件一覧へ</Link></Button>
      </div>
    )
  }

  const setTab = (t: string) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })
  const stageIndex = STAGES.findIndex(s => s.value === project.stage)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/projects" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3 w-3" />案件一覧
          </Link>
          <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.clientName}・{project.address}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={async () => {
              const url = await buildProjectLink(project.id, "viewer")
              const copied = navigator.clipboard?.writeText(url) ?? Promise.reject(new Error("clipboard"))
              copied.then(
                () => toast.success("内見リンクをコピーしました"),
                // iframe の権限でクリップボードが使えない場合は URL を表示して手動コピーしてもらう
                () => toast("内見リンク（選択してコピーしてください）", { description: url, duration: 20000 }),
              )
            }}
          >
            <Share2 className="h-4 w-4" />内見リンク
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />削除
          </Button>
        </div>
      </div>

      <StagePath
        stages={STAGES.map((s, i) => ({ value: i, label: s.label }))}
        current={stageIndex}
        negativeValue={STAGES.length - 1}
        onSelect={i => update.mutate({ id: project.id, patch: { stage: STAGES[i].value } })}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview" className="gap-1"><LayoutGrid className="h-4 w-4" />概要</TabsTrigger>
          <TabsTrigger value="analyze" className="gap-1" data-tour="tab-analyze"><FileImage className="h-4 w-4" />画像から 3D 化</TabsTrigger>
          <TabsTrigger value="viewer" className="gap-1" data-tour="tab-viewer"><Box className="h-4 w-4" />3D 内見・提案</TabsTrigger>
          <TabsTrigger value="blender" className="gap-1" data-tour="tab-blender"><Cpu className="h-4 w-4" />Blender 出力</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview project={project} onOpenTab={setTab} /></TabsContent>
        <TabsContent value="analyze">
          <ImageAnalysisPanel
            projectName={project.name}
            images={project.images}
            spec={project.spec}
            listing={project.listing}
            saving={update.isPending}
            onImagesChange={images => update.mutate({ id: project.id, patch: { images } })}
            onGenerate={async spec => {
              const nextStage: Stage = stageIndex < 2 ? "design-review" : project.stage
              await update.mutateAsync({ id: project.id, patch: { spec, stage: nextStage } })
              toast.success("3D モデルを生成しました。内見できます。")
              setTab("viewer")
            }}
          />
        </TabsContent>
        <TabsContent value="viewer">
          {/* key で案件・モデル更新時にビューアを作り直す */}
          {tab === "viewer" && <ProposalWorkspace key={project.id} project={project} />}
        </TabsContent>
        <TabsContent value="blender"><BlenderJobPanel project={project} /></TabsContent>
      </Tabs>

      <GenerationProgressOverlay />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="案件を削除しますか？"
        description={`「${project.name}」と、関連するコメントを削除します。この操作は取り消せません。`}
        confirmLabel="削除"
        variant="destructive"
        onConfirm={() => remove.mutate(project.id, { onSuccess: () => navigate("/projects") })}
      />
    </div>
  )
}

function Overview({ project, onOpenTab }: { project: Project; onOpenTab: (t: string) => void }) {
  const update = useUpdateProject()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ProjectInput>(project)
  useEffect(() => setForm(project), [project])
  const q = project.spec ? computeQuantities(project.spec) : null
  const fields: { key: keyof ProjectInput; label: string; type?: "number" | "textarea" }[] = [
    { key: "name", label: "案件名" },
    { key: "clientName", label: "依頼主" },
    { key: "address", label: "建設地" },
    { key: "budget", label: "予算（円）", type: "number" },
    { key: "designOwner", label: "設計担当" },
    { key: "salesOwner", label: "営業担当" },
    { key: "notes", label: "要望・メモ", type: "textarea" },
  ]
  const display = (k: keyof ProjectInput) => {
    const v = project[k]
    if (k === "budget") return v == null ? "—" : `${Number(v).toLocaleString("ja-JP")} 円`
    if (k === "stage") return stageLabel(v as Stage)
    return (v as string) || "—"
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">案件情報</CardTitle>
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setForm(project); setEditing(false) }}>キャンセル</Button>
              <Button
                size="sm"
                disabled={!form.name.trim() || update.isPending}
                onClick={() => update.mutate({ id: project.id, patch: form }, { onSuccess: () => { setEditing(false); toast.success("保存しました") } })}
              >
                保存
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />編集</Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3">
            {fields.map(f => (
              <div key={f.key} className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
                <dt className="min-w-0 text-xs text-muted-foreground sm:pt-2">{f.label}</dt>
                <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">
                  {editing ? (
                    f.type === "textarea" ? (
                      <Textarea rows={3} value={String(form[f.key] ?? "")} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                    ) : (
                      <Input
                        type={f.type ?? "text"}
                        value={form[f.key] == null ? "" : String(form[f.key])}
                        onChange={e => setForm({ ...form, [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
                      />
                    )
                  ) : (
                    <span className="block whitespace-pre-wrap sm:pt-2">{display(f.key)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">物件情報</CardTitle></CardHeader>
          <CardContent>
            <ListingImport
              listing={project.listing}
              onImported={info =>
                update.mutate(
                  { id: project.id, patch: { listing: info, ...(project.address.trim() ? {} : { address: info.address ?? "" }) } },
                  { onSuccess: () => toast.success("物件情報を保存しました。間取り図の縮尺は建物面積に合わせられます") },
                )
              }
              onImages={r => {
                // 既に受け取った画像は置き換えない（空いている外観・間取り図だけを埋める）
                const hasPlans = Object.keys(project.images.floorplans).length > 0
                const hasPlansNew = Object.keys(r.images.floorplans).length > 0
                const images = {
                  ...project.images,
                  ...(!project.images.perspective && r.images.perspective ? { perspective: r.images.perspective } : {}),
                  ...(!hasPlans && hasPlansNew ? { floorplans: r.images.floorplans, floorplanSheet: r.images.floorplanSheet } : {}),
                }
                if (images.perspective === project.images.perspective && images.floorplans === project.images.floorplans) {
                  toast.info("受領した画像が既にあるため、取り込んだ画像では置き換えませんでした。差し替えるときは画像解析タブで削除してから取り込んでください")
                  return
                }
                update.mutate({ id: project.id, patch: { images } }, { onSuccess: () => toast.success("取り込んだ画像を案件に保存しました。画像解析タブで 3D 化できます") })
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">受領した画像</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {project.images.perspective && (
                <figure className="min-w-0">
                  <img src={project.images.perspective} alt="外観パース" className="aspect-[4/3] w-full rounded border bg-muted object-cover" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">外観パース</figcaption>
                </figure>
              )}
              {Object.entries(project.images.floorplans).map(([k, src]) => (
                <figure key={k} className="min-w-0">
                  <img src={src} alt={`${Number(k) + 1}F 間取り図`} className="aspect-[4/3] w-full rounded border bg-white object-contain" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">{Number(k) + 1}F 間取り図</figcaption>
                </figure>
              ))}
            </div>
            {!project.images.perspective && !Object.keys(project.images.floorplans).length && (
              <p className="text-sm text-muted-foreground">まだ画像がありません。</p>
            )}
            <Button size="sm" variant="outline" className="mt-3" onClick={() => onOpenTab("analyze")}>画像を追加・解析する</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">3D モデル</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {project.spec && q ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{project.spec.floors.length} 階建て</Badge>
                  <Badge variant="secondary" className="max-w-full whitespace-normal break-words">{ROOF_LABELS[project.spec.roof.type]}屋根 {project.spec.roof.pitch}°</Badge>
                  <Badge variant="secondary" className="max-w-full whitespace-normal break-words">{project.spec.footprint.width}m × {project.spec.footprint.depth}m</Badge>
                  <Badge variant="secondary">{{ floorplan: "間取り図から生成", perspective: "パースから生成", both: "間取り図＋パース", manual: "手入力/JSON" }[project.spec.source]}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Kpi label="延床面積" value={`${q.floorArea}㎡`} sub={`${q.floorAreaTsubo} 坪`} />
                  <Kpi label="部屋数" value={String(q.roomCount)} />
                  <Kpi label="窓・掃き出し" value={String(q.windowCount)} />
                  <Kpi label="屋根面積" value={`${q.roofArea}㎡`} />
                </div>
                <Button size="sm" onClick={() => onOpenTab("viewer")}>3D で内見する</Button>
              </>
            ) : (
              <p className="text-muted-foreground">まだ 3D モデルがありません。「画像から 3D 化」で生成してください。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
