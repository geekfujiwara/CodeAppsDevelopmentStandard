import { useEffect, useMemo, useRef, useState } from "react"
import { Check, CheckCircle2, MapPin, MessageSquarePlus, Save, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { BuildingViewer3D, type ViewerHandle } from "@/components/building-viewer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DEFAULT_MATERIALS, MATERIAL_PRESETS, ROOF_LABELS, computeQuantities, sanitizeMaterials, type Materials, type RoofType } from "@/lib/building-spec"
import { FinishSelects } from "@/components/finish-selects"
import { FurniturePanel } from "@/components/furniture-panel"
import { autoStage, isOutdoor, newFurnitureId, rotateItem, sanitizeFurniture, snapItem, type FurnitureItem } from "@/lib/furniture"
import type { Pin } from "@/lib/building-scene"
import { useAddComment, useComments, useDeleteComment, useUpdateComment, useUpdateProject } from "@/hooks/use-projects"
import { newId } from "@/data/repository"
import { ROLES, roleOf, type Project, type Role, type Variant } from "@/types/project"
import { cn } from "@/lib/utils"
import { safeStorage } from "@/lib/safe-storage"
import { getPowerContext } from "@/lib/power-context"

const ME_KEY = "perse3d:me"

function loadMe(): { role: Role; name: string } {
  try {
    const v = JSON.parse(safeStorage.get(ME_KEY) ?? "")
    if (v?.role && v?.name) return v
  } catch {
    // 未設定
  }
  return { role: "design", name: "" }
}

export function ProposalWorkspace({ project }: { project: Project }) {
  const viewer = useRef<ViewerHandle>(null)
  const update = useUpdateProject()
  const { data: comments = [] } = useComments(project.id)
  const addComment = useAddComment()
  const updateComment = useUpdateComment(project.id)
  const deleteComment = useDeleteComment(project.id)
  const active = project.variants.find(v => v.id === project.activeVariantId) ?? null
  const [materials, setMaterials] = useState<Materials>(() => sanitizeMaterials(active?.materials ?? project.spec?.materials ?? DEFAULT_MATERIALS))
  const [roof, setRoof] = useState<RoofType | undefined>(active?.roofType)
  const [pickMode, setPickMode] = useState(false)
  const [draft, setDraft] = useState<{ position: [number, number, number] } | null>(null)
  const [draftBody, setDraftBody] = useState("")
  const [me, setMe] = useState(loadMe)
  const [glb, setGlb] = useState<ArrayBuffer | null>(null)
  const [glbName, setGlbName] = useState<string | null>(null)
  const [variantName, setVariantName] = useState("")
  const [deleteVariant, setDeleteVariant] = useState<Variant | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const spec = useMemo(() => {
    if (!project.spec) return null
    return roof ? { ...project.spec, roof: { ...project.spec.roof, type: roof } } : project.spec
  }, [project.spec, roof])

  const visibleComments = comments.filter(c => showResolved || !c.resolved)
  const pins: Pin[] = useMemo(
    () =>
      visibleComments
        .filter(c => c.position)
        .map(c => ({ id: c.id, position: c.position!, color: roleOf(c.role).color, label: String(comments.indexOf(c) + 1) })),
    [visibleComments, comments],
  )

  useEffect(() => {
    if (me.name) return
    getPowerContext().then(ctx => {
      const name = ctx?.user?.fullName
      if (name) setMe(m => (m.name ? m : { ...m, name }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveMe = (next: { role: Role; name: string }) => {
    setMe(next)
    safeStorage.set(ME_KEY, JSON.stringify(next))
  }

  const applyVariant = (v: Variant) => {
    setMaterials(sanitizeMaterials(v.materials))
    setRoof(v.roofType)
    update.mutate({ id: project.id, patch: { activeVariantId: v.id } })
  }

  const saveVariant = () => {
    const thumb = viewer.current?.capture(320) ?? undefined
    const preset = MATERIAL_PRESETS.find(p => Object.entries(p.materials).every(([k, val]) => materials[k as keyof Materials] === val))
    const v: Variant = {
      id: newId(),
      name: variantName.trim() || `プラン${String.fromCharCode(65 + project.variants.length)}${preset ? `（${preset.name}）` : ""}`,
      presetId: preset?.id,
      materials,
      roofType: roof,
      note: preset?.description ?? "",
      thumbnail: thumb,
      createdOn: new Date().toISOString(),
    }
    update.mutate(
      { id: project.id, patch: { variants: [...project.variants, v], activeVariantId: v.id } },
      { onSuccess: () => toast.success(`「${v.name}」を提案プランとして保存しました`) },
    )
    setVariantName("")
  }

  const submitComment = () => {
    if (!draftBody.trim()) return
    if (!me.name.trim()) {
      toast.error("先に表示名を入力してください")
      return
    }
    addComment.mutate(
      { projectId: project.id, role: me.role, author: me.name.trim(), body: draftBody.trim(), position: draft?.position ?? null, pose: viewer.current?.getPose() ?? null, resolved: false },
      {
        onSuccess: () => {
          setDraft(null)
          setDraftBody("")
          toast.success("コメントを追加しました")
        },
      },
    )
  }

  const q = spec ? computeQuantities(spec) : null

  // ── 家具・車 ──────────────────────────────────────
  const [furniture, setFurnitureState] = useState<FurnitureItem[]>(() => sanitizeFurniture(project.spec?.furniture))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [placeType, setPlaceType] = useState<string | null>(null)
  const [confirmAuto, setConfirmAuto] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const pendingSave = useRef<FurnitureItem[] | null>(null)
  const latestProject = useRef(project)
  latestProject.current = project
  const selectedItem = furniture.find(f => f.id === selectedId) ?? null

  const flushSave = () => {
    window.clearTimeout(saveTimer.current)
    const next = pendingSave.current
    const p = latestProject.current
    pendingSave.current = null
    setSavePending(false)
    if (!next || !p.spec) return
    update.mutate({ id: p.id, patch: { spec: { ...p.spec, furniture: next } } })
  }

  /** 家具の変更は画面に即反映し、保存はまとめて 0.8 秒後に行う */
  const changeFurniture = (next: FurnitureItem[]) => {
    setFurnitureState(next)
    pendingSave.current = next
    setSavePending(true)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flushSave, 800)
  }

  useEffect(() => () => flushSave(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const runAutoStage = () => {
    if (!spec) return
    const prevCar = furniture.find(f => isOutdoor(f.type))
    const next = autoStage(spec, { ...(prevCar ? { car: prevCar.type, carColor: prevCar.color } : {}), models: true })
    changeFurniture(next)
    setSelectedId(null)
    toast.success(`${next.length} 点の家具と車を配置しました`)
  }

  const startPlace = (type: string | null) => {
    setPlaceType(type)
    setPickMode(false)
    setSelectedId(null)
    // 屋内の家具は屋根の下になるため、外観表示ならドールハウスに切り替える
    if (type && !isOutdoor(type) && viewer.current?.getMode() === "orbit") viewer.current.setMode("dollhouse")
  }

  const rotateSelected = (delta: number) => {
    if (!selectedItem || !spec) return
    const turned = rotateItem(spec, selectedItem, furniture, delta)
    changeFurniture(furniture.map(f => (f.id === selectedItem.id ? turned : f)))
  }

  const deleteSelected = () => {
    if (!selectedItem) return
    changeFurniture(furniture.filter(f => f.id !== selectedItem.id))
    setSelectedId(null)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-2">
        <BuildingViewer3D
          ref={viewer}
          spec={spec}
          materials={materials}
          pins={pins}
          pickMode={pickMode}
          glb={glb}
          furniture={furniture}
          selectedFurniture={selectedId}
          placeType={placeType}
          onFurnitureSelect={setSelectedId}
          onFurnitureMove={(id, x, z) => {
            const it = furniture.find(f => f.id === id)
            if (!it || !spec) return
            const snapped = snapItem(spec, { ...it, x, z }, furniture)
            changeFurniture(furniture.map(f => (f.id === id ? snapped : f)))
          }}
          onFurniturePlace={(type, x, z, level) => {
            if (!spec) return
            const item = snapItem(spec, { id: newFurnitureId(), type, level: isOutdoor(type) ? 0 : level, x, z, ry: 0 }, furniture)
            changeFurniture([...furniture, item])
            setSelectedId(item.id)
            setPlaceType(null)
          }}
          onFurnitureAction={action => {
            if (action === "rotate") rotateSelected(selectedItem && isOutdoor(selectedItem.type) ? 180 : 90)
            else if (action === "delete") deleteSelected()
            else {
              setPlaceType(null)
              setSelectedId(null)
            }
          }}
          onPick={p => {
            setDraft({ position: p })
            setPickMode(false)
          }}
          onPinClick={id => {
            const c = comments.find(x => x.id === id)
            if (c?.pose) viewer.current?.setPose(c.pose)
            document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
          }}
          className="h-[min(70vh,640px)] min-h-[420px]"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {q && (
            <>
              <Badge variant="outline" className="max-w-full whitespace-normal break-words">延床 {q.floorArea}㎡（{q.floorAreaTsubo}坪）</Badge>
              <Badge variant="outline">部屋 {q.roomCount}</Badge>
              <Badge variant="outline">開口 {q.windowCount}</Badge>
              <Badge variant="outline">外壁 約{q.exteriorWallArea}㎡</Badge>
              <Badge variant="outline">屋根 約{q.roofArea}㎡</Badge>
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            {glbName && (
              <Badge className="max-w-full gap-1 whitespace-normal break-words">
                Blender GLB: {glbName}
                <button type="button" onClick={() => { setGlb(null); setGlbName(null) }} aria-label="GLB 表示を解除"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" title="Blender で書き出した model.glb を重ねて表示">
              <Upload className="h-3.5 w-3.5" />Blender GLB を表示
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setGlb(await f.arrayBuffer())
                  setGlbName(f.name)
                }}
              />
            </label>
          </span>
        </div>
      </div>

      <Tabs defaultValue="variants" className="min-w-0">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="variants">提案プラン</TabsTrigger>
          <TabsTrigger value="furniture" data-tour="tab-furniture">家具・車</TabsTrigger>
          <TabsTrigger value="comments">コメント（{comments.filter(c => !c.resolved).length}）</TabsTrigger>
        </TabsList>

        <TabsContent value="furniture">
          <FurniturePanel
            items={furniture}
            selected={selectedItem}
            placeType={placeType}
            disabled={!spec || !!glb}
            saving={update.isPending || savePending}
            onAuto={() => (furniture.length ? setConfirmAuto(true) : runAutoStage())}
            onClear={() => setConfirmClear(true)}
            onStartPlace={startPlace}
            onRotate={rotateSelected}
            onDelete={deleteSelected}
            onColor={color => selectedItem && changeFurniture(furniture.map(f => (f.id === selectedItem.id ? { ...f, color } : f)))}
          />
        </TabsContent>

        <TabsContent value="variants" className="space-y-3">
          <Card data-tour="presets">
            <CardHeader className="pb-2"><CardTitle className="text-sm">カラーバリエーション</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {MATERIAL_PRESETS.map(p => {
                  const m = { ...materials, ...p.materials }
                  const selected = Object.entries(p.materials).every(([k, v]) => materials[k as keyof Materials] === v)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setMaterials(m)}
                      className={cn("flex min-w-0 items-center gap-2 rounded-md border p-2 text-left text-xs hover:border-primary", selected && "border-primary ring-1 ring-primary")}
                    >
                      <span className="flex shrink-0 overflow-hidden rounded">
                        {[m.exteriorWall, m.roof, m.floor].map((c, i) => <span key={i} className="h-6 w-3" style={{ background: c }} />)}
                      </span>
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["exteriorWall", "roof", "floor"] as const).map(k => (
                  <label key={k} className="flex items-center gap-1 text-xs">
                    <input type="color" value={materials[k]} onChange={e => setMaterials({ ...materials, [k]: e.target.value })} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
                    {{ exteriorWall: "外壁", roof: "屋根", floor: "床" }[k]}
                  </label>
                ))}
              </div>
              <FinishSelects materials={materials} onChange={setMaterials} compact />
              <Select value={roof ?? "spec"} onValueChange={v => setRoof(v === "spec" ? undefined : (v as RoofType))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spec">屋根: 設計どおり（{project.spec ? ROOF_LABELS[project.spec.roof.type] : "-"}）</SelectItem>
                  {(Object.keys(ROOF_LABELS) as RoofType[]).map(r => <SelectItem key={r} value={r}>屋根: {ROOF_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input value={variantName} onChange={e => setVariantName(e.target.value)} placeholder="プラン名（省略可）" className="h-8 text-xs" />
                <Button size="sm" className="gap-1" onClick={saveVariant} disabled={!spec || update.isPending} data-tour="save-variant">
                  <Save className="h-3.5 w-3.5" />保存
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {project.variants.length === 0 && <p className="text-sm text-muted-foreground">保存した提案プランはまだありません。</p>}
            {project.variants.map(v => (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => applyVariant(v)}
                onKeyDown={e => e.key === "Enter" && applyVariant(v)}
                className={cn("flex cursor-pointer gap-3 rounded-md border p-2 hover:border-primary", v.id === project.activeVariantId && "border-primary bg-primary/5")}
              >
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-14 w-20 shrink-0 overflow-hidden rounded">
                    {[v.materials.exteriorWall, v.materials.roof, v.materials.floor].map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">
                    {v.id === project.activeVariantId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    <span className="truncate">{v.name}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{v.roofType ? `${ROOF_LABELS[v.roofType]}屋根・` : ""}{v.note}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  aria-label="プランを削除"
                  onClick={e => {
                    e.stopPropagation()
                    setDeleteVariant(v)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="comments" className="space-y-3">
          <Card>
            <CardContent className="space-y-2 pt-4">
              <div className="flex gap-2">
                <Select value={me.role} onValueChange={v => saveMe({ ...me, role: v as Role })}>
                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={me.name} onChange={e => saveMe({ ...me, name: e.target.value })} placeholder="表示名（例: 設計 佐藤）" className="h-8 text-xs" />
              </div>
              <Textarea rows={3} value={draftBody} onChange={e => setDraftBody(e.target.value)} placeholder="気づき・修正依頼・お客様の要望など" />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={pickMode ? "default" : "outline"} className="gap-1" onClick={() => setPickMode(!pickMode)} disabled={!spec} data-tour="pin">
                  <MapPin className="h-3.5 w-3.5" />{draft ? "位置を選び直す" : "3D 上に位置を指定"}
                </Button>
                {draft && <span className="text-xs text-muted-foreground">位置: {draft.position.map(v => v.toFixed(1)).join(", ")}</span>}
                <Button size="sm" className="ml-auto gap-1" onClick={submitComment} disabled={!draftBody.trim() || addComment.isPending}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />投稿
                </Button>
              </div>
            </CardContent>
          </Card>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />解決済みも表示
          </label>
          <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {visibleComments.map(c => {
              const r = roleOf(c.role)
              return (
                <div
                  key={c.id}
                  id={`comment-${c.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => c.pose && viewer.current?.setPose(c.pose)}
                  onKeyDown={e => e.key === "Enter" && c.pose && viewer.current?.setPose(c.pose)}
                  className={cn("rounded-md border p-2 text-sm", c.pose && "cursor-pointer hover:border-primary", c.resolved && "opacity-60")}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: r.color }}>{comments.indexOf(c) + 1}</span>
                    <span className="font-medium" style={{ color: r.color }}>{r.label}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{c.author}・{new Date(c.createdOn).toLocaleDateString("ja-JP")}</span>
                    <span className="ml-auto flex shrink-0 gap-1">
                      <button type="button" title={c.resolved ? "未解決に戻す" : "解決済みにする"} onClick={e => { e.stopPropagation(); updateComment.mutate({ id: c.id, patch: { resolved: !c.resolved } }) }}>
                        <CheckCircle2 className={cn("h-4 w-4", c.resolved ? "text-emerald-600" : "text-muted-foreground")} />
                      </button>
                      <button type="button" title="削除" onClick={e => { e.stopPropagation(); deleteComment.mutate(c.id) }}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{c.body}</p>
                  {c.position && <p className="mt-1 text-[11px] text-muted-foreground">📍 3D 上にピンあり{c.pose ? "（クリックで視点を再現）" : ""}</p>}
                </div>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmAuto}
        onOpenChange={setConfirmAuto}
        title="家具を置き直しますか？"
        description={`いま置いている ${furniture.length} 点を片付けて、全室におまかせで配置し直します。`}
        confirmLabel="置き直す"
        onConfirm={runAutoStage}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="家具と車をすべて片付けますか？"
        description={`${furniture.filter(f => !f.fixed).length} 点を削除します。間取り図から置いた設備（${furniture.filter(f => f.fixed).length} 点）は残します。`}
        confirmLabel="片付ける"
        variant="destructive"
        onConfirm={() => {
          changeFurniture(furniture.filter(f => f.fixed))
          setSelectedId(null)
        }}
      />
      <ConfirmDialog
        open={!!deleteVariant}
        onOpenChange={o => !o && setDeleteVariant(null)}
        title="提案プランを削除しますか？"
        description={`「${deleteVariant?.name ?? ""}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除"
        variant="destructive"
        onConfirm={() => {
          if (!deleteVariant) return
          const rest = project.variants.filter(v => v.id !== deleteVariant.id)
          update.mutate({ id: project.id, patch: { variants: rest, activeVariantId: project.activeVariantId === deleteVariant.id ? rest[0]?.id ?? null : project.activeVariantId } })
        }}
      />
    </div>
  )
}
