import type { DrawingIndex, DrawingRecord, FeatureRecord } from "@/data/drawing-repository"

export type SimilarDrawing = {
  drawing: DrawingRecord
  /** ① キー一致で重なった製品カテゴリ・部位タグ */
  matchedCategories: string[]
  matchedTags: string[]
  /** ② 特徴量近傍で比較できた諸元 */
  comparedSpecs: { name: string; base: string; candidate: string; unit: string }[]
  /** 0〜1。1 に近いほど近い */
  score: number
}

type Keyed = {
  categories: Set<string>
  tags: Set<string>
  numeric: Map<string, { value: number; unit: string }>
  text: Map<string, string>
}

/**
 * 図面の「探すためのキー」だけを取り出す。図面本文は Dataverse に無いため、
 * ここで使えるのは設計特徴量・カテゴリ・部位タグに限られる。
 */
function keysOf(drawing: DrawingRecord, features: FeatureRecord[]): Keyed {
  const revisionIds = new Set(drawing.revisions.map((r) => r.id))
  const mine = features.filter((ft) => ft.revisionId && revisionIds.has(ft.revisionId))
  const numeric = new Map<string, { value: number; unit: string }>()
  const text = new Map<string, string>()
  for (const ft of mine) {
    if (ft.numericValue != null) numeric.set(ft.name, { value: ft.numericValue, unit: ft.unit })
    else if (ft.value) text.set(ft.name, ft.value)
  }
  return {
    categories: new Set(mine.map((ft) => ft.categoryName).filter(Boolean)),
    tags: new Set(mine.map((ft) => ft.tagLabel).filter(Boolean)),
    numeric,
    text,
  }
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((v) => b.has(v))
}

/** 相対差 0 で 1、相対差 1 以上で 0 になる線形の近さ */
function closeness(base: number, candidate: number): number {
  const scale = Math.max(Math.abs(base), Math.abs(candidate))
  if (scale === 0) return 1
  return Math.max(0, 1 - Math.abs(base - candidate) / scale)
}

/**
 * 類似図面を返す（Dataverse 内で完結する2段構え）。
 * ① 製品カテゴリ・部位タグのキー一致で候補を絞る
 * ② 一致した候補を設計諸元の近さで並べ替える
 * ベクトル検索は使わない（設計決定 2026-09-05）。
 */
export function findSimilarDrawings(
  baseId: string,
  index: DrawingIndex,
  limit = 5,
): SimilarDrawing[] {
  const base = index.drawings.find((d) => d.id === baseId)
  if (!base) return []

  const baseKeys = keysOf(base, index.features)
  if (baseKeys.categories.size === 0 && baseKeys.tags.size === 0) return []

  const results: SimilarDrawing[] = []
  for (const candidate of index.drawings) {
    if (candidate.id === baseId) continue

    const keys = keysOf(candidate, index.features)
    const matchedCategories = overlap(baseKeys.categories, keys.categories)
    const matchedTags = overlap(baseKeys.tags, keys.tags)
    // ① キー一致：カテゴリも部位タグも重ならない図面は候補にしない
    if (matchedCategories.length === 0 && matchedTags.length === 0) continue

    // ② 特徴量近傍
    const comparedSpecs: SimilarDrawing["comparedSpecs"] = []
    let closenessSum = 0
    for (const [name, mine] of baseKeys.numeric) {
      const theirs = keys.numeric.get(name)
      if (!theirs) continue
      closenessSum += closeness(mine.value, theirs.value)
      comparedSpecs.push({
        name,
        base: `${mine.value}${mine.unit}`,
        candidate: `${theirs.value}${theirs.unit}`,
        unit: mine.unit,
      })
    }
    for (const [name, mine] of baseKeys.text) {
      const theirs = keys.text.get(name)
      if (!theirs) continue
      closenessSum += mine === theirs ? 1 : 0
      comparedSpecs.push({ name, base: mine, candidate: theirs, unit: "" })
    }

    const keyScore =
      (matchedCategories.length ? 1 : 0) * 0.3 +
      (matchedTags.length ? 1 : 0) * 0.3
    const specScore = comparedSpecs.length ? (closenessSum / comparedSpecs.length) * 0.4 : 0

    results.push({
      drawing: candidate,
      matchedCategories,
      matchedTags,
      comparedSpecs,
      score: keyScore + specScore,
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}
