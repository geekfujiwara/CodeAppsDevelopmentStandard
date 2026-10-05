// Code Apps の既定 CSP で「エラーにならず黙って動かない」書き方を検出する。
//
// 既定 CSP（references/csp.md）: connect-src 'none' / worker-src 未指定（= default-src 'self'）/ img-src 'self' data:
// - fetch / XMLHttpRequest / EventSource / WebSocket は connect-src でブロックされる（コンソールに CSP 違反が出るだけ）
// - three.js の FileLoader 系（GLTFLoader.load / FileLoader / ObjectLoader.load）は内部で fetch する
// - Draco / KTX2 / Basis のデコーダーは Web Worker を作る（worker-src）
// - URL.createObjectURL の blob: は img-src・media-src・frame-src に含まれない
//
// 環境に CSP を追加設定した場合（configure_code_app_csp.py）は、許可した種類を allow に渡して検出から外す。
// 例外にしたい行には `// csp-ok: <理由>` を書く（同じ行か直前の行）。
import fs from "node:fs"
import path from "node:path"

export const CSP_RULES = [
  { id: "fetch", directive: "connect-src", re: /(?<![\w.])fetch\s*\(/, hint: "データは Code Apps SDK（生成サービス）経由で取得する。静的 JSON はビルド時に import する" },
  { id: "xhr", directive: "connect-src", re: /\bnew\s+XMLHttpRequest\b/, hint: "Code Apps SDK 経由にする" },
  { id: "eventsource", directive: "connect-src", re: /\bnew\s+EventSource\b/, hint: "Code Apps SDK 経由にする" },
  { id: "websocket", directive: "connect-src", re: /\bnew\s+WebSocket\s*\(/, hint: "接続先を connect-src に追加する（configure_code_app_csp.py）" },
  { id: "three-file-loader", directive: "connect-src", re: /\bnew\s+(?:GLTFLoader|FileLoader|ObjectLoader|FBXLoader|OBJLoader|PLYLoader|STLLoader|RGBELoader|EXRLoader|HDRLoader)\s*\([^)]*\)\s*\.load(?:Async)?\s*\(/, hint: "File.arrayBuffer() と parseAsync を使う。画像は TextureLoader（<img> 経由）なら読める" },
  { id: "worker-decoder", directive: "worker-src", re: /\b(?:DRACOLoader|KTX2Loader|BasisTextureLoader)\b/, hint: "Draco / KTX2 は Web Worker を使う。圧縮しない GLB と JPEG/WebP に寄せるか worker-src を設定する" },
  { id: "worker", directive: "worker-src", re: /\bnew\s+(?:Shared)?Worker\s*\(/, hint: "worker-src を設定するか、Worker を使わない設定にする（references/csp.md）" },
  { id: "blob-url", directive: "img-src/media-src/frame-src", re: /\bURL\.createObjectURL\s*\(/, hint: "画像は FileReader.readAsDataURL で data: URL にする（img-src に data: は含まれる）" },
  // drei の <Environment preset> は HDR を CDN（raw.githack.com）から取得する。失敗は Suspense から ErrorBoundary まで伝わり、画面全体が落ちる
  { id: "drei-environment", directive: "connect-src", re: /<Environment\b[^>]*\b(?:preset|files)\s*=|^\s*preset\s*=\s*["'](?:apartment|city|dawn|forest|lobby|night|park|studio|sunset|warehouse)["']/, hint: "<Environment> を外し、hemisphereLight / directionalLight で照らす（troubleshooting #77）" },
  // drei / R3F のローダー フックは URL を fetch する（同じアプリの assets でも connect-src に 'self' が無いと失敗）
  { id: "three-loader-hook", directive: "connect-src", re: /\b(?:useGLTF|useFBX|useKTX2|useEnvironment|useLoader)\s*\(/, hint: "?inline で同梱し createCspSafeGltfLoader().parseAsync で解析する（templates/csp-safe-gltf.ts）" },
  // ?inline の無い 3D 素材の import は URL になり、読み込み時に自オリジンへ fetch される
  { id: "asset-url-import", directive: "connect-src", re: /\bfrom\s+["'][^"']+\.(?:glb|gltf|hdr|exr|ktx2|fbx|bin)(?:\?url)?["']|import\s*\(\s*["'][^"']+\.(?:glb|gltf|hdr|exr|ktx2|fbx|bin)(?:\?url)?["']\s*\)/, hint: "?inline を付けて base64 で埋め込み、parseAsync で解析する" },
]

const SKIP_DIRS = new Set(["node_modules", "dist", "generated", ".power", "test", "tests", "__tests__"])
const OK_MARK = /csp-ok\s*:/

/** src/ 以下を走査し、[{ file, line, rule, directive, hint, text }] を返す */
export function findCspHazards(root, { allow = [] } = {}) {
  const base = path.join(root, "src")
  const out = []
  if (!fs.existsSync(base)) return out
  const rules = CSP_RULES.filter(r => !allow.includes(r.id) && !allow.includes(r.directive))
  const pending = [base]
  while (pending.length) {
    const dir = pending.pop()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) pending.push(p)
        continue
      }
      if (!/\.[cm]?[jt]sx?$/.test(entry.name) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) continue
      const lines = fs.readFileSync(p, "utf-8").split(/\r?\n/)
      const source = lines.join("\n")
      lines.forEach((text, i) => {
        const code = text.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "")
        if (!code.trim() || OK_MARK.test(text) || OK_MARK.test(lines[i - 1] ?? "")) return
        for (const r of rules) {
          if (!r.re.test(code)) continue
          // blob: URL を <a download> に渡すだけのダウンロードはナビゲーションで、CSP の対象外（誤検出を除く）
          if (r.id === "blob-url" && /\.download\s*=/.test(source) && !/\.(src|srcObject|data)\s*=\s*url\b/.test(source)) continue
          out.push({ file: path.relative(root, p).replaceAll("\\", "/"), line: i + 1, rule: r.id, directive: r.directive, hint: r.hint, text: text.trim().slice(0, 140) })
        }
      })
    }
  }
  return out
}

/** .env の CODE_APP_CSP_ALLOW（カンマ区切り。ルール ID か directive 名）を読む */
export function cspAllowFromEnv(envContent) {
  const m = /^CODE_APP_CSP_ALLOW=(.*)$/m.exec(envContent ?? "")
  return m ? m[1].split(",").map(s => s.trim()).filter(Boolean) : []
}
