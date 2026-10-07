import { useSyncExternalStore } from "react"

/**
 * 「3D モデルを生成して保存」の進み具合。画像解析タブ → 3D 内見タブへ切り替わっても続けて表示するため、
 * コンポーネントの外に置く（案件画面のオーバーレイが購読する）
 */
export type StepState = "pending" | "active" | "done" | "error"
export type ProgressStep = { label: string; detail?: string; state: StepState }
export type ProgressState = { open: boolean; title: string; steps: ProgressStep[]; startedAt: number; error?: string }

let state: ProgressState = { open: false, title: "", steps: [], startedAt: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const set = (next: ProgressState) => {
  state = next
  emit()
}

/** 画面を描き直す機会を与えてから続ける（重い同期処理の前に進み具合を見せる） */
// 画面を描き直す機会を与えてから続ける。
// - requestAnimationFrame は、画面に見えていないタブ・自動操作のブラウザでは呼ばれない
// - 見えていないページのタイマー（setTimeout）は間引かれ、数分たつと 1 分に 1 回しか動かない
// どちらにも頼らないよう、見えていないときは MessageChannel（間引かれない）で次のタスクに回し、
// 見えているときは requestAnimationFrame と 50ms のタイマーの早い方で進める
const nextTask = (fn: () => void) => {
  const ch = new MessageChannel()
  ch.port1.onmessage = () => {
    ch.port1.close()
    fn()
  }
  ch.port2.postMessage(null)
}
export const nextFrame = () =>
  new Promise<void>(resolve => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      nextTask(resolve)
      return
    }
    let done = false
    const go = () => {
      if (done) return
      done = true
      nextTask(resolve)
    }
    requestAnimationFrame(go)
    setTimeout(go, 50)
  })

let closeTimer: ReturnType<typeof setTimeout> | null = null
let waitTimer: ReturnType<typeof setTimeout> | null = null

export const generationProgress = {
  start(title: string, labels: string[]) {
    if (closeTimer) clearTimeout(closeTimer)
    if (waitTimer) clearTimeout(waitTimer)
    set({ open: true, title, steps: labels.map((label, i) => ({ label, state: i === 0 ? "active" : "pending" })), startedAt: Date.now() })
  },
  /** i 番目を完了にして次を進行中にする */
  done(i: number, detail?: string) {
    if (!state.open) return
    const steps = state.steps.map((s, k) => (k === i ? { ...s, state: "done" as const, ...(detail ? { detail } : {}) } : k === i + 1 && s.state === "pending" ? { ...s, state: "active" as const } : s))
    set({ ...state, steps })
    if (steps.every(s => s.state === "done")) closeTimer = setTimeout(() => generationProgress.close(), 900)
  },
  fail(i: number, message: string) {
    if (!state.open) return
    set({ ...state, error: message, steps: state.steps.map((s, k) => (k === i ? { ...s, state: "error" as const } : s)) })
  },
  /** 3D ビューアの読み込みが終わった（最後の段を待っているときだけ完了にする） */
  viewerReady(detail?: string) {
    const last = state.steps.length - 1
    if (state.open && last >= 0 && state.steps[last].state === "active") generationProgress.done(last, detail)
  },
  /** 最後の段（3D の構築）を待つ。来なければ timeoutMs で完了扱いにして閉じる */
  waitViewer(timeoutMs = 20000) {
    if (waitTimer) clearTimeout(waitTimer)
    waitTimer = setTimeout(() => generationProgress.viewerReady("時間がかかっています（表示は続けて読み込みます）"), timeoutMs)
  },
  close() {
    if (waitTimer) clearTimeout(waitTimer)
    set({ ...state, open: false })
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,
}

export function useGenerationProgress(): ProgressState {
  return useSyncExternalStore(generationProgress.subscribe, generationProgress.get, generationProgress.get)
}
