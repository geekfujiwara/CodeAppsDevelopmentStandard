import type { Project, Stage } from "@/types/project"

export const STAGE_TONE: Record<Stage, string> = {
  received: "bg-slate-500",
  analyzing: "bg-sky-600",
  "design-review": "bg-indigo-600",
  proposal: "bg-amber-600",
  won: "bg-emerald-600",
  lost: "bg-rose-600",
}

export function projectThumbnail(p: Project) {
  return p.variants.find(v => v.id === p.activeVariantId)?.thumbnail ?? p.images.perspective ?? Object.values(p.images.floorplans)[0]
}

/** JSON をファイルとしてダウンロードさせる（data: URL のため CSP の追加設定は不要） */
export function downloadJson(name: string, value: unknown) {
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(value, null, 1))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
}
