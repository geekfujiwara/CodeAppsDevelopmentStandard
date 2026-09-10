export type PlantPageImage = { drawingNumber: string; revision: string; page: number; width: number; height: number; src: string; sha256: string }

export async function parsePlantPageImage(raw: unknown, expected: { page: number; path: string; drawingNumber: string; revision: string }): Promise<PlantPageImage | null> {
  if (typeof raw !== "string" || raw.length > 450000) return null
  try {
    const value = JSON.parse(raw)
    if (value.mimeType !== "image/png" || value.path !== expected.path || value.page !== expected.page || value.drawingNumber !== expected.drawingNumber || value.revision !== expected.revision) return null
    if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > 4096 || value.height > 4096 || value.width * value.height > 8000000) return null
    if (typeof value.data !== "string" || value.data.length > 400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data) || !/^[a-f0-9]{64}$/.test(value.sha256)) return null
    const bytes = Uint8Array.from(atob(value.data), character => character.charCodeAt(0))
    if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return null
    const dimensions = new DataView(bytes.buffer)
    if (dimensions.getUint32(16) !== value.width || dimensions.getUint32(20) !== value.height) return null
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("")
    if (hash !== value.sha256) return null
    return { drawingNumber: value.drawingNumber, revision: value.revision, page: value.page, width: value.width, height: value.height, sha256: hash, src: "data:image/png;base64," + value.data }
  } catch { return null }
}