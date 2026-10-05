// Dataverse のファイル列・画像列とやり取りするためのバイナリ変換。
// Code Apps の SDK は応答の Content-Type によって Uint8Array / base64 文字列 / 1 バイト 1 文字の文字列を返すため、
// どの形でもバイト列に戻せるようにする。ブラウザと Node（テスト）の両方で動く。

/** Dataverse のファイル列は 1 回の取得が 4 MB まで（Range で分割して取得する） */
export const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const BASE64_HEAD = /^[A-Za-z0-9+/=\r\n]+$/

/** 文字列が base64 か、1 バイト 1 文字の生データかを先頭から判定する（GLB は "glTF"、JPEG/PNG は非 ASCII で始まる） */
function looksLikeBase64(value: string): boolean {
  if (value.startsWith("glTF")) return false
  return BASE64_HEAD.test(value.slice(0, 512))
}

export function responseToBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data && typeof data === "object" && "$content" in data) return responseToBytes((data as { $content: unknown }).$content)
  if (typeof data === "string") {
    if (data.startsWith("data:")) return base64ToBytes(data.slice(data.indexOf(",") + 1))
    if (looksLikeBase64(data)) return base64ToBytes(data)
    const bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff
    return bytes
  }
  if (data === undefined || data === null) return new Uint8Array(0)
  throw new Error("ファイルの応答を解釈できません。")
}

/**
 * Range を進めながら取得して連結する。期待サイズ（保存時に記録したバイト数）に達するか、
 * 1 回の応答がチャンクより短くなったら終える。サーバーが Range を無視して全体を返した場合も 1 回で終わる。
 */
export async function downloadInChunks(
  fetchChunk: (range: string) => Promise<unknown>,
  expectedBytes?: number,
  chunkBytes = DOWNLOAD_CHUNK_BYTES,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  let total = 0
  const maxCalls = expectedBytes ? Math.ceil(expectedBytes / chunkBytes) + 1 : 64
  for (let call = 0; call < maxCalls; call++) {
    // Dataverse はファイル末尾を超える Range に 416 を返すため、サイズが分かっていれば末尾で止める
    const end = (expectedBytes !== undefined ? Math.min(total + chunkBytes, expectedBytes) : total + chunkBytes) - 1
    const chunk = responseToBytes(await fetchChunk(`bytes=${total}-${end}`))
    if (!chunk.length) break
    parts.push(chunk)
    total += chunk.length
    if (chunk.length < end - (total - chunk.length) + 1 || (expectedBytes !== undefined && total >= expectedBytes)) break
  }
  if (expectedBytes !== undefined && total < expectedBytes) {
    throw new Error(`ファイルを最後まで取得できませんでした（${total} / ${expectedBytes} バイト）。`)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return expectedBytes !== undefined && total > expectedBytes ? result.subarray(0, expectedBytes) : result
}

export function sniffImageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif"
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp"
  return "image/jpeg"
}

export function bytesToDataUrl(bytes: Uint8Array): string {
  return `data:${sniffImageMime(bytes)};base64,${bytesToBase64(bytes)}`
}

/** x-ms-file-name ヘッダーは ASCII だけを安全に通せるため、保存用のファイル名を ASCII に整える */
export function asciiFileName(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "") : ""
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80)
  return stem ? `${stem}${ext}` : fallback
}
