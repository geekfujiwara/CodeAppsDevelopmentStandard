// 選択中の作業の「施工位置イメージ」を作る。3D の現在の表示（進捗・完成形の点線・選択の強調）を
// 作業の部位に寄せたカメラで描き、工事名・作業名・進捗を書き込んだ JPEG（data: URL）にする。
// CSP で blob: URL は使えないため、canvas.toDataURL だけで完結させる。
import { Box3, PerspectiveCamera, Vector3 } from "three"
import type { Vec3 } from "./kit.ts"

export const SNAPSHOT_SIZE = { width: 1280, height: 720 }

/** 部位のバウンディングボックス全体が画角に収まるカメラ位置を、既定の視線方向に沿って求める */
export function frameBox(box: Box3, viewFrom: Vec3, viewTarget: Vec3, fov: number, aspect: number): { position: Vector3; target: Vector3; near: number; far: number } {
  const target = box.getCenter(new Vector3())
  const radius = Math.max(0.5, box.getSize(new Vector3()).length() / 2)
  const direction = new Vector3(...viewFrom).sub(new Vector3(...viewTarget))
  if (direction.lengthSq() < 1e-6) direction.set(1, 0.8, 1)
  direction.normalize()
  // 真上・真横すぎると形が読み取りにくいため、仰角を 20〜55 度に収める
  const elevation = Math.asin(Math.min(1, Math.max(-1, direction.y)))
  const clamped = Math.min(Math.PI * 0.3, Math.max(Math.PI / 9, elevation))
  const horizontal = new Vector3(direction.x, 0, direction.z)
  if (horizontal.lengthSq() < 1e-6) horizontal.set(1, 0, 1)
  horizontal.normalize().multiplyScalar(Math.cos(clamped))
  direction.set(horizontal.x, Math.sin(clamped), horizontal.z)
  const vertical = (fov * Math.PI) / 180 / 2
  const horizontalFov = Math.atan(Math.tan(vertical) * aspect)
  const distance = (radius / Math.sin(Math.min(vertical, horizontalFov))) * 1.15
  return { position: target.clone().add(direction.multiplyScalar(distance)), target, near: Math.max(0.05, distance / 200), far: distance * 20 }
}

export function snapshotCamera(box: Box3, viewFrom: Vec3, viewTarget: Vec3, aspect: number): PerspectiveCamera {
  const fov = 40
  const frame = frameBox(box, viewFrom, viewTarget, fov, aspect)
  const camera = new PerspectiveCamera(fov, aspect, frame.near, frame.far)
  camera.position.copy(frame.position)
  camera.lookAt(frame.target)
  camera.updateMatrixWorld(true)
  return camera
}

export type SnapshotCaption = {
  projectName: string
  taskName: string
  stateLabel: string
  stateColor: string
  progress: number
  expected: number
  period: string
  modelTitle: string
}

const fontFamily = '"Yu Gothic UI", "Meiryo", "Hiragino Sans", sans-serif'

/** 3D の描画結果（canvas）を 16:9 に切り出し、作業の情報を書き込んだ JPEG にする */
export function composeSnapshot(source: HTMLCanvasElement, caption: SnapshotCaption, createdAt = new Date()): string {
  const { width, height } = SNAPSHOT_SIZE
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("画像を作成できません（canvas が使えません）。")
  // 元の描画を中央で 16:9 に切り出す
  const scale = Math.max(width / source.width, height / source.height)
  const drawWidth = source.width * scale
  const drawHeight = source.height * scale
  context.fillStyle = "#0b1220"
  context.fillRect(0, 0, width, height)
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)

  // 上部: 自動生成の明示
  context.fillStyle = "rgba(2, 6, 23, 0.72)"
  context.fillRect(24, 24, 360, 40)
  context.fillStyle = "#fde047"
  context.font = `700 20px ${fontFamily}`
  context.textBaseline = "middle"
  context.fillText("● 施工位置イメージ（自動生成）", 38, 44)

  // 下部: 作業の情報と進捗バー
  const band = 150
  const gradient = context.createLinearGradient(0, height - band - 40, 0, height)
  gradient.addColorStop(0, "rgba(2, 6, 23, 0)")
  gradient.addColorStop(0.25, "rgba(2, 6, 23, 0.82)")
  gradient.addColorStop(1, "rgba(2, 6, 23, 0.94)")
  context.fillStyle = gradient
  context.fillRect(0, height - band - 40, width, band + 40)
  context.fillStyle = "#94a3b8"
  context.font = `600 20px ${fontFamily}`
  context.fillText(`${caption.projectName} ／ ${caption.modelTitle}`, 40, height - band + 6)
  context.fillStyle = "#ffffff"
  context.font = `800 40px ${fontFamily}`
  context.fillText(caption.taskName, 40, height - band + 50, width - 420)
  context.fillStyle = "#cbd5e1"
  context.font = `600 20px ${fontFamily}`
  context.fillText(`${caption.period}  作成 ${createdAt.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}`, 40, height - band + 96)

  const barX = width - 360
  const barY = height - band + 58
  context.fillStyle = caption.stateColor
  roundRect(context, barX, height - band - 6, 120, 34, 17)
  context.fill()
  context.fillStyle = "#0f172a"
  context.font = `800 18px ${fontFamily}`
  context.textAlign = "center"
  context.fillText(caption.stateLabel, barX + 60, height - band + 11)
  context.textAlign = "left"
  context.fillStyle = "#ffffff"
  context.font = `800 22px ${fontFamily}`
  context.fillText(`実績 ${caption.progress}%  予定 ${caption.expected}%`, barX, barY - 10 + 22)
  context.fillStyle = "rgba(148, 163, 184, 0.35)"
  roundRect(context, barX, barY + 34, 320, 14, 7)
  context.fill()
  context.fillStyle = "rgba(226, 232, 240, 0.65)"
  roundRect(context, barX, barY + 34, (320 * Math.min(100, caption.expected)) / 100, 14, 7)
  context.fill()
  context.fillStyle = caption.stateColor
  roundRect(context, barX, barY + 34, Math.max(14, (320 * Math.min(100, caption.progress)) / 100), 14, 7)
  context.fill()
  return canvas.toDataURL("image/jpeg", 0.88)
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}
