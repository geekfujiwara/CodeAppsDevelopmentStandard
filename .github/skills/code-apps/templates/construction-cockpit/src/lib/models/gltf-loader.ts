// glTF / GLB の施工モデルを読み込む（ブラウザ専用）。
// Code Apps の CSP は connect-src に 'self' を含まないことがあるため、同梱モデルは base64 で JS に埋め込み、
// fetch を使わずに GLTFLoader.parse で解析する。外部 URL は CSP の connect-src に許可が必要。
import { Group, Mesh } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { ConstructionModel, Vec3 } from "@/lib/models"

const BUNDLED = import.meta.glob("../../assets/models/*.glb", { query: "?inline", import: "default" }) as Record<string, () => Promise<string>>

export function bundledModelNames(): string[] {
  return Object.keys(BUNDLED).map((path) => path.replace(/^.*\/(.+)\.glb$/, "$1"))
}

function decodeDataUrl(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
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
  const loader = new GLTFLoader()
  let root: Group
  if (url.startsWith("bundled:")) {
    const name = url.slice("bundled:".length)
    const load = BUNDLED[`../../assets/models/${name}.glb`]
    if (!load) throw new Error(`同梱モデル「${name}」が見つかりません`)
    const gltf = await loader.parseAsync(decodeDataUrl(await load()), "")
    root = gltf.scene
  } else {
    const gltf = await loader.loadAsync(url)
    root = gltf.scene
  }
  normalize(root)
  // GLTFExporter はルートの userData をシーン直下のノードの extras に保存する
  const data = { ...root.children[0]?.userData, ...root.userData } as { title?: string; camera?: Vec3; target?: Vec3 }
  const fallbackTitle = url.startsWith("bundled:") ? url.slice(8) : url.split("/").pop() ?? "モデル"
  return { title: data.title ?? fallbackTitle, root, camera: data.camera ?? [60, 40, 60], target: data.target ?? [0, 0, 0] }
}
