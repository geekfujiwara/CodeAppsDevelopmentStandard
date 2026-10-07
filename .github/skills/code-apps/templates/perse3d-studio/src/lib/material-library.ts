import * as THREE from "three"
import libraryJson from "../data/material-library.json" with { type: "json" }

/**
 * 実写 PBR 材質ライブラリ（scripts/fetch_materials.py が生成）
 *
 * - テクスチャはアプリに同梱（public/materials）し、<img> で読む。Code Apps の既定 CSP は
 *   connect-src 'none'（fetch 不可）だが img-src 'self' は許可されているため、TextureLoader（Image 要素）なら読める。
 * - 利用者が選んだ色は「色 / 素材の平均色（リニア）」を material.color に掛けて合わせる。写真の陰影・目地は残る。
 * - Blender（blender/materials.py）も同じマニフェスト・同じ平均色で合わせるので、見え方が揃う。
 */

export type LibraryEntry = {
  slot: string
  asset: string
  tile: number
  rotate: number
  path: string
  avgLinear: [number, number, number]
  keepColor?: boolean
  normalStrength?: number
  /** 選ばれた色を実在の反射率に合わせる係数（芝は 0.55。物理ベースの光で明るすぎないように） */
  albedoScale?: number
  /** 鏡面反射の強さ（0.5 = 標準）。three.js では環境光の映り込みの強さとして使う */
  specular?: number
  license: string
  source: string
}

export const MATERIAL_LIBRARY = (libraryJson as unknown as { materials: LibraryEntry[] }).materials

export const libraryEntry = (slot: string) => MATERIAL_LIBRARY.find(e => e.slot === slot)

export type LibrarySet = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; entry: LibraryEntry }

const cache = new Map<string, Promise<LibrarySet>>()

function load(url: string, srgb: boolean, entry: LibraryEntry): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(1 / entry.tile, 1 / entry.tile)
        if (entry.rotate) {
          t.center.set(0.5, 0.5)
          t.rotation = THREE.MathUtils.degToRad(entry.rotate)
        }
        t.anisotropy = 8
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        resolve(t)
      },
      undefined,
      () => reject(new Error(`材質テクスチャを読み込めませんでした: ${url}`)),
    )
  })
}

/** スロットの実写材質を読む（同じスロットは 1 回だけ読む）。未登録なら null */
export function loadLibrarySet(slot: string): Promise<LibrarySet> | null {
  const entry = libraryEntry(slot)
  if (!entry) return null
  let p = cache.get(slot)
  if (!p) {
    // Code Apps では index.html の位置がアプリの基点になる（base: "./"）。相対 URL で読む
    const base = new URL(`./${entry.path}/`, document.baseURI).href
    p = Promise.all([load(`${base}color.jpg`, true, entry), load(`${base}normal.jpg`, false, entry), load(`${base}rough.jpg`, false, entry)]).then(
      ([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap, entry }),
    )
    p.catch(() => cache.delete(slot))
    cache.set(slot, p)
  }
  return p
}

/** 利用者の色（sRGB の #RRGGBB）を写真の平均色で割って、乗算用の色にする */
export function tintFor(entry: LibraryEntry, hex: string | null): THREE.Color {
  if (!hex || entry.keepColor) return new THREE.Color(1, 1, 1)
  const c = new THREE.Color(hex) // three.js は #RRGGBB をリニアに変換して保持する
  const [r, g, b] = entry.avgLinear
  const s = entry.albedoScale ?? 1
  // 極端な増幅は白飛びするので上限を設ける
  const k = (v: number, a: number) => Math.min(4, (v * s) / Math.max(a, 0.002))
  return new THREE.Color(k(c.r, r), k(c.g, g), k(c.b, b))
}

export function applyLibrary(mat: THREE.MeshStandardMaterial, set: LibrarySet, hex: string | null, metalness = 0) {
  mat.map = set.map
  mat.normalMap = set.normalMap
  mat.roughnessMap = set.roughnessMap
  const ns = set.entry.normalStrength ?? 1
  mat.normalScale.set(ns, ns)
  mat.envMapIntensity = (set.entry.specular ?? 0.5) * 2
  mat.roughness = 1
  mat.metalness = metalness
  mat.color.copy(tintFor(set.entry, hex))
  mat.needsUpdate = true
}

export function disposeLibrary() {
  for (const p of cache.values()) {
    p.then(s => {
      s.map.dispose()
      s.normalMap.dispose()
      s.roughnessMap.dispose()
    }).catch(() => undefined)
  }
  cache.clear()
}
