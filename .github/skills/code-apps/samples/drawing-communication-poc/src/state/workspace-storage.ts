/**
 * 下書きのローカル保存。
 *
 * Power Apps は iframe で動くため、ストレージ制限のあるブラウザ設定では例外になる。
 * 失敗してもアプリを落とさず、保存しないだけにする。
 * ここは共有保存ではない。共有保存は Dataverse アダプター側の明示操作。
 */
import type { WorkspaceState } from "@/state/workspace"
import { createInitialWorkspace } from "@/state/workspace"
import { assertDrawing } from "@/drawing/drawing-schema"

export const STORAGE_KEY = import.meta.env.VITE_DRAWING_STORAGE_KEY?.trim() || "drawing-communication-poc-draft"

const MAX_STORED_BYTES = 400_000

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || raw.length > MAX_STORED_BYTES) return createInitialWorkspace()
    const parsed = JSON.parse(raw) as WorkspaceState
    assertDrawing(parsed.drawing)
    return {
      ...createInitialWorkspace(),
      ...parsed,
      // 復元直後は未解決の待機を持たない
      turns: (parsed.turns ?? []).map((turn) => (turn.status === "pending" || turn.status === "running" ? { ...turn, status: "failed", error: "再読み込みにより待機を打ち切りました" } : turn)),
    }
  } catch {
    return createInitialWorkspace()
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 保存できなくても編集は続行する
  }
}

export function clearWorkspace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 何もしない
  }
}
