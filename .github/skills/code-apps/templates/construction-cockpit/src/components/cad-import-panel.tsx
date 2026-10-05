import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCcw, Save, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConstructionService, type Project, type Task } from "@/services/construction-service"
import {
  CAD_ACCEPT,
  CAD_FORMAT_LABEL,
  CAD_MODEL_URL,
  CAD_TERRAIN,
  defaultCadMapping,
  detectCadFormat,
  parseCadMapping,
  suggestCadRules,
  UNIT_LABEL,
  type CadFormat,
  type CadMapping,
  type CadRule,
  type CadRuleKind,
  type CadUnit,
} from "@/lib/models/cad-import"
import { analyzeCadFile, summarizeCadUnits, type CadAnalysis } from "@/lib/models/cad-loader"
import type { GrowAxis } from "@/lib/models"
import type { CadPreview } from "@/components/project-model-3d"

type Source = { buffer: ArrayBuffer; bytes?: Uint8Array; format: CadFormat; fileName: string }

const GROW_LABEL: Record<GrowAxis, string> = { y: "下から上へ", "-y": "上から下へ", x: "+X 方向へ", "-x": "-X 方向へ", z: "+Z 方向へ", "-z": "-Z 方向へ" }
const KIND_LABEL: Record<CadRuleKind, string> = { build: "施工（出来上がる）", remove: "撤去・掘削（無くなる）", temporary: "仮設（未着手は非表示）" }
const selectClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"

type Props = {
  project: Project
  tasks: Task[]
  onPreview: (preview: CadPreview | undefined) => void
  onClose: () => void
}

/** CAD モデルの取り込み: ファイル選択 → 検査 → 座標・単位 → 部位と作業の対応付け → 3D でプレビュー → Dataverse に保存 */
export function CadImportPanel({ project, tasks, onPreview, onClose }: Props) {
  const queryClient = useQueryClient()
  const [source, setSource] = useState<Source>()
  const [mapping, setMapping] = useState<CadMapping>()
  const [analysis, setAnalysis] = useState<CadAnalysis>()
  const [busy, setBusy] = useState<"reading" | "analyzing" | "saving" | "">("")
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("")
  const [onlyAssigned, setOnlyAssigned] = useState(false)
  const nonce = useRef(0)
  const zones = useMemo(() => {
    const seen = new Map<string, string>()
    for (const task of tasks) if (!seen.has(task.zone || task.id)) seen.set(task.zone || task.id, task.name)
    return [...seen].map(([zone, label]) => ({ zone, label }))
  }, [tasks])
  const hasSavedModel = Boolean(project.modelFileId && parseCadMapping(project.modelMapping))
  const usingCad = project.modelUrl === CAD_MODEL_URL

  // 座標・単位を変えたら寸法と候補を再計算する（対応付けはノード名で持つため維持される）
  const analysisKey = source && mapping ? `${source.fileName}:${mapping.upAxis}:${mapping.unit}` : ""
  useEffect(() => {
    if (!source || !mapping) return
    let cancelled = false
    setBusy("analyzing")
    setError("")
    analyzeCadFile(source.buffer, source.format, source.fileName, mapping)
      .then((result) => {
        if (cancelled) return
        setAnalysis(result)
        // 新しいファイルで対応付けが空なら、ノード名から自動で候補を入れる
        if (source.bytes && !Object.keys(mapping.rules).length && !result.inspection.errors.length) {
          setMapping((value) => value && { ...value, rules: suggestCadRules(result.nodes, zones) })
        }
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "モデルを解析できませんでした。") })
      .finally(() => { if (!cancelled) setBusy("") })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisKey])

  // 対応付けの変更を少し待ってから 3D に反映する（連続操作で毎回解析し直さない）
  useEffect(() => {
    if (!source || !mapping || !analysis || analysis.inspection.errors.length) return
    const timer = window.setTimeout(() => { nonce.current += 1; onPreview({ buffer: source.buffer, mapping, nonce: nonce.current }) }, 600)
    return () => window.clearTimeout(timer)
  }, [analysis, mapping, onPreview, source])

  const pickFile = async (file: File) => {
    setError("")
    setAnalysis(undefined)
    setBusy("reading")
    try {
      const buffer = await file.arrayBuffer()
      const format = detectCadFormat(file.name, buffer)
      if (!format) throw new Error("対応していない形式です。GLB / OBJ / STL / FBX のいずれかで書き出してください。")
      setSource({ buffer, bytes: new Uint8Array(buffer), format, fileName: file.name })
      setMapping(defaultCadMapping(format, file.name, buffer.byteLength))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ファイルを読み込めませんでした。")
    } finally {
      setBusy("")
    }
  }

  const editSaved = async () => {
    const saved = parseCadMapping(project.modelMapping)
    if (!saved) return
    setError("")
    setBusy("reading")
    try {
      const buffer = await ConstructionService.downloadProjectModel(project, saved.fileSize)
      setSource({ buffer, format: saved.format, fileName: saved.fileName })
      setMapping(saved)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存済みのモデルを取得できませんでした。")
    } finally {
      setBusy("")
    }
  }

  const close = () => { onPreview(undefined); onClose() }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["projects"] })

  const save = async () => {
    if (!source || !mapping) return
    setBusy("saving")
    try {
      const units = await summarizeCadUnits(source.buffer, mapping, zones)
      await ConstructionService.saveProjectCadModel(project, { ...mapping, units }, source.bytes)
      await refresh()
      toast.success("CAD モデルと部位の対応付けを保存しました。進捗の報告に合わせて 3D が更新されます。")
      close()
    } catch (reason) {
      setError(reason instanceof Error ? `保存できませんでした: ${reason.message}` : "保存できませんでした。")
    } finally {
      setBusy("")
    }
  }

  const switchModel = async (useCad: boolean) => {
    setBusy("saving")
    try {
      await (useCad ? ConstructionService.showSavedCadModel(project) : ConstructionService.resetProjectModel(project))
      await refresh()
      toast.success(useCad ? "保存済みの CAD モデルを表示します。" : "標準モデルに戻しました（CAD ファイルは残っています）。")
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "切り替えできませんでした。")
    } finally {
      setBusy("")
    }
  }

  const setRule = (name: string, patch: Partial<CadRule> | null) => {
    setMapping((value) => {
      if (!value) return value
      const rules = { ...value.rules }
      if (patch === null || patch.zone === "") delete rules[name]
      else {
        const base: CadRule = rules[name] ?? { zone: "", grow: "y", kind: "build" }
        rules[name] = { ...base, ...patch }
      }
      return { ...value, rules }
    })
  }

  const nodes = analysis?.nodes ?? []
  const keyword = filter.trim().toLowerCase()
  const visibleNodes = nodes.filter((node) => (!keyword || node.name.toLowerCase().includes(keyword)) && (!onlyAssigned || mapping?.rules[node.name] || node.presetZone))
  const covered = new Set([...Object.values(mapping?.rules ?? {}).map((rule) => rule.zone), ...nodes.map((node) => node.presetZone ?? "")])
  const uncovered = zones.filter((zone) => !covered.has(zone.zone))
  const blocking = analysis?.inspection.errors ?? []

  return (
    <section className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-950/30" data-tour="cad-import" aria-label="CAD モデルの取り込み">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-black">CAD モデルの取り込み</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">CAD・BIM/CIM から書き出したモデル（{Object.values(CAD_FORMAT_LABEL).join(" / ")}）を読み込み、部品を工程の作業に対応付けます。報告された進捗に応じて、出来上がった部分が 3D に表示されます。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={close} aria-label="取り込みを閉じる"><X className="h-4 w-4" /></Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-700">
          <FileUp className="h-4 w-4" />ファイルを選択
          <input type="file" accept={CAD_ACCEPT} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void pickFile(file); event.target.value = "" }} />
        </label>
        {hasSavedModel && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void editSaved()}>保存済みモデルの対応付けを編集</Button>}
        {hasSavedModel && !usingCad && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void switchModel(true)}>保存済み CAD モデルを表示</Button>}
        {usingCad && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void switchModel(false)}><RotateCcw className="mr-1 h-4 w-4" />標準モデルに戻す</Button>}
        {busy && <span className="inline-flex items-center gap-1 text-sm font-bold text-cyan-800 dark:text-cyan-200"><Loader2 className="h-4 w-4 animate-spin" />{busy === "reading" ? "ファイルを読み込み中…" : busy === "analyzing" ? "モデルを解析中…" : "保存中…"}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">推奨: GLB（部品名・階層・色を保持）。50 MB 以下、Draco / meshopt 圧縮なし。部品名に作業の部位キー（例: frame, slab）や「柱」「床」などを含めると自動で対応付けます。</p>

      {error && <p className="mt-3 rounded-lg bg-rose-100 p-3 text-sm font-bold text-rose-800" role="alert"><AlertTriangle className="mr-1 inline h-4 w-4" />{error}</p>}
      {!source && !busy && !error && <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">まだファイルが選択されていません。</p>}

      {source && mapping && analysis && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="ファイル" value={`${source.fileName}（${(mapping.fileSize / 1048576).toFixed(1)} MB）`} />
            <Stat label="形式" value={`${CAD_FORMAT_LABEL[source.format]}${analysis.inspection.generator && source.format === "glb" ? ` · ${analysis.inspection.generator}` : ""}`} />
            <Stat label="部品" value={`${analysis.meshes.toLocaleString()} メッシュ / ${(analysis.triangles / 1000).toFixed(0)}k 三角形`} />
            <Stat label="寸法（幅 × 高さ × 奥行）" value={analysis.size.map((value) => `${value.toFixed(1)}m`).join(" × ")} />
          </div>
          {blocking.map((message) => <p key={message} className="rounded-lg bg-rose-100 p-3 text-sm font-bold text-rose-800" role="alert"><AlertTriangle className="mr-1 inline h-4 w-4" />{message}</p>)}
          {analysis.inspection.warnings.map((message) => <p key={message} className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">{message}</p>)}

          {!blocking.length && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">上方向（CAD の座標系）
                <select className={`${selectClass} mt-1`} value={mapping.upAxis} onChange={(event) => setMapping({ ...mapping, upAxis: event.target.value as CadMapping["upAxis"] })}>
                  <option value="y">Y が上（glTF 標準・多くの BIM 書き出し）</option>
                  <option value="z">Z が上（CAD・STL に多い）</option>
                </select>
                {analysis.suggestedUpAxis !== mapping.upAxis && <span className="mt-1 block text-xs font-normal text-amber-700">形状からは「{analysis.suggestedUpAxis === "z" ? "Z" : "Y"} が上」の可能性があります。3D が横倒しなら切り替えてください。</span>}
              </label>
              <label className="text-sm font-bold">単位
                <select className={`${selectClass} mt-1`} value={mapping.unit} onChange={(event) => setMapping({ ...mapping, unit: event.target.value as CadUnit })}>
                  {(Object.keys(UNIT_LABEL) as CadUnit[]).map((unit) => <option key={unit} value={unit}>{unit === "auto" ? `${UNIT_LABEL.auto}（${UNIT_LABEL[analysis.detectedUnit]}）` : UNIT_LABEL[unit]}</option>)}
                </select>
              </label>
            </div>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h4 className="font-black">部品と作業の対応付け</h4>
                  <p className="text-xs text-slate-500">親の部品に割り当てると配下の部品にも適用されます。配下に複数の部品（階・区画）がある場合は、下から順に出来上がるよう自動で分割します。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMapping({ ...mapping, rules: { ...suggestCadRules(nodes, zones), ...mapping.rules } })}><Sparkles className="mr-1 h-4 w-4" />名前から自動で対応付け</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMapping({ ...mapping, rules: {} })}>すべて解除</Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="部品名で絞り込み" className="h-9 min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" aria-label="部品名で絞り込み" />
                <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={onlyAssigned} onChange={(event) => setOnlyAssigned(event.target.checked)} />割り当て済みのみ</label>
              </div>
              {!nodes.length ? <p className="mt-2 text-sm text-slate-500">名前の付いた部品がありません。</p> : (
                <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-left text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      <tr><th className="p-2">部品（ノード）</th><th className="p-2">メッシュ</th><th className="p-2">作業</th><th className="p-2">施工方向</th><th className="p-2">種別</th></tr>
                    </thead>
                    <tbody>
                      {visibleNodes.slice(0, 200).map((node) => {
                        const rule = mapping.rules[node.name]
                        return (
                          <tr key={node.name} className="border-t border-slate-100 dark:border-slate-800" data-cad-node={node.name}>
                            <td className="p-2" style={{ paddingLeft: `${0.5 + Math.min(6, node.depth - 1) * 0.9}rem` }}>
                              <span className="font-bold [overflow-wrap:anywhere]">{node.name}</span>
                              {node.occurrences > 1 && <span className="ml-1 text-xs text-slate-500">×{node.occurrences}</span>}
                              {node.presetZone && !rule && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-xs font-bold text-emerald-800">モデル内で指定済み: {node.presetZone}</span>}
                            </td>
                            <td className="p-2 text-slate-500">{node.meshes}</td>
                            <td className="p-2">
                              <select className={selectClass} value={rule?.zone ?? ""} onChange={(event) => setRule(node.name, { zone: event.target.value })} aria-label={`${node.name} の作業`}>
                                <option value="">（未割当・周辺物）</option>
                                <option value={CAD_TERRAIN}>地盤（透過表示の対象）</option>
                                {zones.map((zone) => <option key={zone.zone} value={zone.zone}>{zone.label}</option>)}
                              </select>
                            </td>
                            <td className="p-2">
                              <select className={selectClass} disabled={!rule || rule.zone === CAD_TERRAIN} value={rule?.grow ?? "y"} onChange={(event) => setRule(node.name, { grow: event.target.value as GrowAxis })} aria-label={`${node.name} の施工方向`}>
                                {(Object.keys(GROW_LABEL) as GrowAxis[]).map((grow) => <option key={grow} value={grow}>{GROW_LABEL[grow]}</option>)}
                              </select>
                            </td>
                            <td className="p-2">
                              <select className={selectClass} disabled={!rule || rule.zone === CAD_TERRAIN} value={rule?.kind ?? "build"} onChange={(event) => setRule(node.name, { kind: event.target.value as CadRuleKind })} aria-label={`${node.name} の種別`}>
                                {(Object.keys(KIND_LABEL) as CadRuleKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {visibleNodes.length > 200 && <p className="p-2 text-xs text-slate-500">先頭 200 件を表示しています。絞り込みで対象を探してください。</p>}
                </div>
              )}
            </div>

            {uncovered.length > 0 ? (
              <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />3D に位置が無い作業（{uncovered.length} 件）: {uncovered.map((zone) => zone.label).join("、")}</p>
            ) : (
              <p className="rounded-lg bg-emerald-100 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" />すべての作業が 3D の部品に対応付いています。</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={Boolean(busy)} onClick={() => void save()}><Save className="mr-1 h-4 w-4" />{source.bytes ? "モデルと対応付けを保存" : "対応付けを保存"}</Button>
              <Button variant="outline" disabled={busy === "saving"} onClick={close}>キャンセル</Button>
            </div>
          </>}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white p-2 dark:bg-slate-950"><p className="text-xs font-bold text-slate-500">{label}</p><p className="font-bold [overflow-wrap:anywhere]">{value}</p></div>
}
