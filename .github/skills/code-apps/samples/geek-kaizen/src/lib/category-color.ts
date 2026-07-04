/** 低彩度色を含まない識別しやすいパレット（分野などの自由文字列のハッシュ配色に使う） */
export const PALETTE = ["#e60012", "#2563eb", "#f59e0b", "#16a34a", "#8b5cf6", "#0ea5e9", "#db2777", "#ea580c"]

/** 自由文字列を安定したパレット色に割り当てる（同じ文字列は常に同じ色） */
export function categoryColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
