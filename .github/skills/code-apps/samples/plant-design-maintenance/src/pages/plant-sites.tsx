import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Box, ExternalLink, MapPin, Pencil, Plus, Workflow } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DetailPanel, Field } from "@/components/detail-panel"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { PlantMap } from "@/components/plant-map"
import { usePlantAgentDock } from "@/hooks/use-plant-agent-dock"
import { PLANT_SAMPLES } from "@/data/plant-catalog"
import { unresolvedFailures } from "@/data/plant-maintenance"
import {
  OPERATION_STATUSES,
  STATUS_COLOR,
  useDeletePlantSite,
  usePlantSites,
  useSavePlantSite,
  type OperationStatus,
  type PlantSite,
  type PlantSiteInput,
} from "@/data/plant-site-repository"

const STATUS_VARIANT: Record<OperationStatus, "default" | "secondary" | "outline" | "destructive"> = {
  稼働中: "default",
  一部停止: "secondary",
  定期点検: "outline",
  停止中: "destructive",
}

function emptyForm(): PlantSiteInput {
  return {
    name: "",
    code: "",
    modelId: PLANT_SAMPLES[0].id,
    postalCode: "",
    address: "",
    latitude: 35.681236,
    longitude: 139.767125,
    status: "稼働中",
    utilization: 0,
    manager: "",
    note: "",
  }
}

function modelName(modelId: string) {
  return PLANT_SAMPLES.find((sample) => sample.id === modelId)?.name ?? modelId
}

export default function PlantSitesPage() {
  const [params, setParams] = useSearchParams()
  const { data, isLoading, isError, error } = usePlantSites()
  const saveSite = useSavePlantSite()
  const deleteSite = useDeletePlantSite()

  const sites = useMemo(() => data ?? [], [data])
  const [form, setForm] = useState<PlantSiteInput | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PlantSite | null>(null)

  const selectedId = params.get("id")
  const selected = sites.find((site) => site.id === selectedId) ?? null

  // 拠点が 1 件も選ばれていないときは先頭を開き、地図と詳細の対応関係を保つ
  useEffect(() => {
    if (!selected && sites.length) setParams({ id: sites[0].id }, { replace: true })
  }, [selected, sites, setParams])

  const failures = useMemo(() => (selected ? unresolvedFailures(selected.modelId) : []), [selected])

  usePlantAgentDock({
    unavailableReason: selected ? undefined : "拠点を選択してください。",
    selection: {
      modelId: selected?.modelId ?? PLANT_SAMPLES[0].id,
      modelRevision: 1,
      nodeId: null,
      label: selected ? `${selected.name} / 図面全体` : "拠点未選択",
    },
  })

  const submit = () => {
    if (!form) return
    if (!form.name.trim()) {
      toast.error("拠点名は必須です")
      return
    }
    saveSite.mutate(form, {
      onSuccess: () => {
        toast.success(form.id ? "拠点を更新しました" : "拠点を登録しました")
        setForm(null)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "保存に失敗しました"),
    })
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    deleteSite.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success("削除しました")
        setForm(null)
        setParams({}, { replace: true })
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "削除に失敗しました"),
    })
    setPendingDelete(null)
  }

  if (isLoading) return <LoadingSkeletonList count={5} />

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>プラント拠点を取得できませんでした</CardTitle>
          <CardDescription className="[overflow-wrap:anywhere]">
            {error instanceof Error ? error.message : "Dataverse への接続を確認してください。"}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">プラント拠点</h1>
          <p className="text-muted-foreground">
            拠点の住所と稼働状況を管理します。地図のピンから 3D モデル・設計・未解決の故障へ辿れます。
          </p>
        </div>
        <Button onClick={() => setForm(emptyForm())}>
          <Plus className="mr-1 h-4 w-4" />新規登録
        </Button>
      </div>

      {form && (
        <DetailPanel
          title={form.id ? "拠点の詳細" : "拠点の新規登録"}
          description="住所と緯度経度を揃えると、地図上の正しい位置にピンが立ちます。"
          onClose={() => setForm(null)}
          onDelete={form.id ? () => setPendingDelete(sites.find((site) => site.id === form.id) ?? null) : undefined}
          onSave={submit}
          isSaving={saveSite.isPending}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="拠点名">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 鹿島原料処理プラント" />
            </Field>
            <Field label="拠点コード">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="例: PLT-KSM" />
            </Field>
            <Field label="郵便番号">
              <Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="例: 314-0102" />
            </Field>
            <Field label="住所">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="例: 茨城県神栖市東和田 20" />
            </Field>
            <Field label="緯度">
              <Input type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} />
            </Field>
            <Field label="経度">
              <Input type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} />
            </Field>
            <Field label="3D モデル">
              <Select value={form.modelId} onValueChange={(v) => setForm({ ...form, modelId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANT_SAMPLES.map((sample) => <SelectItem key={sample.id} value={sample.id}>{sample.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="稼働状況">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as OperationStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATION_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="稼働率 (%)">
              <Input type="number" step="0.1" min={0} max={100} value={form.utilization} onChange={(e) => setForm({ ...form, utilization: Number(e.target.value) })} />
            </Field>
            <Field label="拠点責任者">
              <Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
            </Field>
            <Field label="備考" className="md:col-span-2">
              <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        </DetailPanel>
      )}

      <PlantMap sites={sites} selectedId={selectedId} onSelect={(site) => setParams({ id: site.id }, { replace: true })} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">拠点一覧</CardTitle>
            <CardDescription>{sites.length} 件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sites.map((site) => (
              <button
                key={site.id}
                type="button"
                aria-pressed={site.id === selectedId}
                onClick={() => setParams({ id: site.id }, { replace: true })}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 aria-pressed:border-primary aria-pressed:bg-primary/5"
              >
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: STATUS_COLOR[site.status] }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium [overflow-wrap:anywhere]">{site.name}</span>
                  <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{site.code} · {site.address}</span>
                </span>
                <Badge variant={STATUS_VARIANT[site.status]}>{site.status}</Badge>
              </button>
            ))}
            {!sites.length && <p className="text-sm text-muted-foreground">拠点が登録されていません。</p>}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          {selected ? (
            <>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="[overflow-wrap:anywhere]">{selected.name}</CardTitle>
                  <CardDescription className="[overflow-wrap:anywhere]">
                    {selected.code} · {modelName(selected.modelId)}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge variant={STATUS_VARIANT[selected.status]}>{selected.status}</Badge>
                  <Button variant="outline" size="icon" aria-label="拠点を編集" onClick={() => setForm({ ...selected })}>
                    <Pencil />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">住所</dt>
                    <dd className="[overflow-wrap:anywhere]">〒{selected.postalCode} {selected.address}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">拠点責任者</dt>
                    <dd>{selected.manager || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">稼働率</dt>
                    <dd>{selected.utilization.toFixed(1)} %</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">緯度 / 経度</dt>
                    <dd>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</dd>
                  </div>
                  {selected.note && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">備考</dt>
                      <dd className="[overflow-wrap:anywhere]">{selected.note}</dd>
                    </div>
                  )}
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to={`/plant-3d?plant=${encodeURIComponent(selected.modelId)}`}><Box />プラント 3D</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/plant-designer"><Workflow />プラント設計</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`} target="_blank" rel="noopener noreferrer">
                      <MapPin />Google マップ<ExternalLink />
                    </a>
                  </Button>
                </div>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">未解決の故障 <span className="text-muted-foreground">{failures.length} 件</span></h3>
                  {failures.slice(0, 6).map((failure) => (
                    <div key={failure.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="font-medium [overflow-wrap:anywhere]">{failure.title}</p>
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {failure.occurredOn} · {failure.location} · {failure.status === "open" ? "未着手" : "調査中"}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/traceability?failure=${encodeURIComponent(failure.id)}`}>対応状況を横断で見る</Link>
                      </Button>
                    </div>
                  ))}
                  {!failures.length && <p className="text-sm text-muted-foreground">未解決の故障はありません。</p>}
                </section>

                <p className="text-xs text-muted-foreground">
                  右下の Copilot ボタンから、この拠点について直接質問できます。
                </p>
              </CardContent>
            </>
          ) : (
            <CardHeader>
              <CardTitle className="text-base">拠点を選択してください</CardTitle>
              <CardDescription>地図のピンか一覧から拠点を選ぶと詳細が表示されます。</CardDescription>
            </CardHeader>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title="拠点を削除しますか？"
        description={`${pendingDelete?.name ?? ""} を削除します。この操作は元に戻せません。`}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
