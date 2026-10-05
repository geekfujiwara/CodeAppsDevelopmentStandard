// glTF / GLB の施工モデルを読み込む（ブラウザ専用）。
// Code Apps の CSP は connect-src に 'self' を含まないことがあるため、同梱モデルは base64 で JS に埋め込み、
// fetch を使わずに解析する。GLB は code-apps の共通部品 csp-safe-gltf.ts で読む
// （埋め込みテクスチャを blob: URL を介さずにデコードする。素の GLTFLoader ではテクスチャが黙って落ちる）。
import { Group, Mesh } from "three"
import type { ConstructionModel, Vec3 } from "@/lib/models"
import { createCspSafeGltfLoader, decodeDataUrl } from "./csp-safe-gltf.ts"

const BUNDLED = import.meta.glob("../../assets/models/*.glb", { query: "?inline", import: "default" }) as Record<string, () => Promise<string>>

export function bundledModelNames(): string[] {
  return Object.keys(BUNDLED).map((path) => path.replace(/^.*\/(.+)\.glb$/, "$1"))
}

/**
 * BIM/CIM から書き出した glTF でも使えるよう、extras が無い場合はノード名から部位を復元する。
 * 規約: 「P1-column#2/5」（部位キー#順番/総数）または「zone:P1-footing」。それ以外のノードは周辺物として扱う。
 */
function normalize(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const data = object.userData as Record<string, unknown>
    if (!data.zone) {
      const name = object.name || object.parent?.name || ""
      const segmented = /^(?:zone:)?([A-Za-z0-9_-]+)#(\d+)\/(\d+)$/.exec(name)
      const plain = /^zone:([A-Za-z0-9_-]+)$/.exec(name)
      if (segmented) {
        Object.assign(data, { zone: segmented[1], label: segmented[1], segment: [Number(segmented[2]) - 1, Number(segmented[3])] })
      } else if (plain) {
        Object.assign(data, { zone: plain[1], label: plain[1] })
      }
    }
    if (!data.zone) data.context = true
    if (object.name.startsWith("terrain")) data.terrain = true
    object.castShadow = !data.terrain
    object.receiveShadow = true
  })
}

export async function loadModelAsset(url: string): Promise<ConstructionModel> {
  const loader = createCspSafeGltfLoader()
  let root: Group
  if (url.startsWith("bundled:")) {
    const name = url.slice("bundled:".length)
    const load = BUNDLED[`../../assets/models/${name}.glb`]
    if (!load) throw new Error(`同梱モデル「${name}」が見つかりません`)
    const gltf = await loader.parseAsync(decodeDataUrl(await load()), "")
    root = gltf.scene
  } else {
    // csp-ok: connect-src に許可したホストの URL だけを読む。読めなければ呼び出し側が標準モデルに切り替える
    const gltf = await loader.loadAsync(url)
    root = gltf.scene
  }
  normalize(root)
  // GLTFExporter はルートの userData をシーン直下のノードの extras に保存する
  const data = { ...root.children[0]?.userData, ...root.userData } as { title?: string; camera?: Vec3; target?: Vec3 }
  const fallbackTitle = url.startsWith("bundled:") ? url.slice(8) : url.split("/").pop() ?? "モデル"
  return { title: data.title ?? fallbackTitle, root, camera: data.camera ?? [60, 40, 60], target: data.target ?? [0, 0, 0] }
}
