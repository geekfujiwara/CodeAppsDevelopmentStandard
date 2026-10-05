/**
 * Code Apps の既定 CSP の中で GLB を読むための GLTFLoader（単一ファイル。プロジェクトの src/lib/ にコピーして使う）
 *
 * 既定 CSP: connect-src 'none' / img-src 'self' data:（blob: なし）/ worker-src なし
 * - GLTFLoader.load(url) は fetch するので使えない → バイト列を用意して parseAsync
 *   - 利用者が選んだファイル: await file.arrayBuffer()
 *   - アプリに同梱: import.meta.glob("./models/*.glb", { query: "?inline", import: "default" }) で base64 のモジュールにし、decodeDataUrl
 *     （vite.config の assetsInclude に "**\/*.glb"）
 * - 埋め込み画像（bufferView / data: URI）は GLTFLoader が blob: URL や fetch で読むため拒否され、テクスチャなしで表示される（Console にだけ出る）
 *   → CspSafeTexturePlugin が createImageBitmap(Blob) で直接デコードする（URL を介さないので CSP の対象外）
 * - 外部ファイル参照（.bin / 画像の URI）は読めない → createCspSafeGltfLoader が分かりやすいエラーにする
 * - Draco / KTX2 / meshopt は Web Worker・WASM が要るので使わない（書き出し側で無効にする）
 */
import * as THREE from "three"
import { GLTFLoader, type GLTFParser } from "three/addons/loaders/GLTFLoader.js"

const GL_FILTERS: Record<number, THREE.MagnificationTextureFilter | THREE.MinificationTextureFilter> = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
}
const GL_WRAP: Record<number, THREE.Wrapping> = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping }

type GltfJson = {
  textures?: { source?: number; sampler?: number; name?: string }[]
  images?: { bufferView?: number; mimeType?: string; uri?: string; name?: string }[]
  samplers?: { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }[]
}

/** 埋め込み画像（bufferView）を blob: URL を使わずにテクスチャにする GLTFLoader プラグイン */
export class CspSafeTexturePlugin {
  readonly name = "CSP_SAFE_EMBEDDED_TEXTURES"
  private cache = new Map<number, Promise<THREE.Texture>>()
  private parser: GLTFParser
  constructor(parser: GLTFParser) {
    this.parser = parser
  }

  loadTexture(textureIndex: number): Promise<THREE.Texture> | null {
    const json = this.parser.json as GltfJson
    const def = json.textures?.[textureIndex]
    const img = def?.source !== undefined ? json.images?.[def.source] : undefined
    // 外部ファイルの画像は本体に任せる（createCspSafeGltfLoader が拒否する）
    const inline = img?.uri?.startsWith("data:") ? img.uri : null
    if (!def || !img || (img.bufferView === undefined && !inline)) return null
    const hit = this.cache.get(textureIndex)
    if (hit) return hit
    const bytes: Promise<ArrayBuffer> = inline ? Promise.resolve(decodeDataUrl(inline)) : this.parser.getDependency("bufferView", img.bufferView!)
    const mime = img.mimeType ?? (inline ? inline.slice(5, inline.indexOf(";")) : "image/jpeg")
    const p = bytes
      .then((buf: ArrayBuffer) => createImageBitmap(new Blob([buf], { type: mime }), { premultiplyAlpha: "none", colorSpaceConversion: "none" }))
      .then(bitmap => {
        const t = new THREE.Texture(bitmap)
        t.flipY = false
        t.name = def.name ?? img.name ?? ""
        const s = (def.sampler !== undefined ? json.samplers?.[def.sampler] : undefined) ?? {}
        t.magFilter = (GL_FILTERS[s.magFilter ?? 0] as THREE.MagnificationTextureFilter) ?? THREE.LinearFilter
        t.minFilter = GL_FILTERS[s.minFilter ?? 0] ?? THREE.LinearMipmapLinearFilter
        t.wrapS = GL_WRAP[s.wrapS ?? 0] ?? THREE.RepeatWrapping
        t.wrapT = GL_WRAP[s.wrapT ?? 0] ?? THREE.RepeatWrapping
        t.needsUpdate = true
        // 色空間・UV チャンネルの割り当ては GLTFLoader 本体に任せる
        this.parser.associations.set(t, { textures: textureIndex })
        return t
      })
      // GLTFLoader 本体と同じく、テクスチャが読めなければ null（テクスチャなしで表示）
      .catch(() => null as unknown as THREE.Texture)
    this.cache.set(textureIndex, p)
    return p
  }
}

/** 既定 CSP で読める GLTFLoader。外部ファイル参照は分かりやすいエラーにする */
export function createCspSafeGltfLoader(manager = new THREE.LoadingManager()): GLTFLoader {
  manager.setURLModifier(url => {
    if (url.startsWith("data:")) return url
    throw new Error("外部ファイル参照は読み込めません。形状・テクスチャを内包した GLB を選択してください。")
  })
  const loader = new GLTFLoader(manager)
  loader.register(parser => new CspSafeTexturePlugin(parser))
  return loader
}

/** ?inline で取り込んだ data URL（base64）を ArrayBuffer にする */
export function decodeDataUrl(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(",") + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
