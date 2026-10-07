import type * as THREE from "three"
import { CATALOG } from "@/lib/furniture"
import { createCspSafeGltfLoader, decodeDataUrl } from "@/lib/csp-safe-gltf"

/**
 * 家具カタログの 3D モデル（GLB）を、Code Apps の既定 CSP の中で読む。
 * - GLB は fetch できない（connect-src 'none'）ため、base64 のモジュールとしてバンドルし、使うときに動的 import する（script-src 'self'）
 * - 埋め込み画像は csp-safe-gltf.ts のプラグインで createImageBitmap から直接デコードする（blob: URL は既定 CSP で拒否される）
 */

const sources = import.meta.glob("../assets/models/*.glb", { query: "?inline", import: "default" }) as Record<string, () => Promise<string>>

const loaded = new Map<string, Promise<THREE.Object3D | null>>()

/** カタログのアイテムのモデル（読めなければ null）。同じ種類は 1 回だけ読み、呼び出し側で clone して使う */
export function loadCatalogModel(type: string): Promise<THREE.Object3D | null> {
  const file = CATALOG.items[type]?.model?.file
  if (!file) return Promise.resolve(null)
  let p = loaded.get(file)
  if (!p) {
    const src = sources[`../assets/models/${file}`]
    p = !src
      ? Promise.resolve(null)
      : src()
          .then(async dataUrl => {
            const gltf = await createCspSafeGltfLoader().parseAsync(decodeDataUrl(dataUrl), "")
            gltf.scene.traverse(o => {
              const m = o as THREE.Mesh
              if (!m.isMesh) return
              m.castShadow = true
              m.receiveShadow = true
            })
            return gltf.scene as THREE.Object3D
          })
          .catch(err => {
            console.warn(`3D モデル ${file} を読み込めませんでした（外形の箱で表示します）`, err)
            return null
          })
    loaded.set(file, p)
  }
  return p
}
