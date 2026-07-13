// ── 客室ステータス（客室ボードの中核）─────────────────────────────
export type RoomStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004 | 100000005

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  100000000: "清掃待ち",
  100000001: "清掃中",
  100000002: "清掃済",
  100000003: "点検待ち",
  100000004: "滞在中",
  100000005: "整備中",
}

/** 客室ボードのセル配色（背景 + 枠線 + 文字）。ひと目で状況が分かる強めの色。 */
export const ROOM_STATUS_CELL: Record<RoomStatus, string> = {
  100000000: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200",
  100000001: "bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-200",
  100000002: "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200",
  100000003: "bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950/40 dark:border-violet-700 dark:text-violet-200",
  100000004: "bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800/60 dark:border-slate-600 dark:text-slate-200",
  100000005: "bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-200",
}

/** バッジ（一覧・凡例用の丸ピル） */
export const ROOM_STATUS_BADGE: Record<RoomStatus, string> = {
  100000000: "bg-amber-100 text-amber-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-emerald-100 text-emerald-800",
  100000003: "bg-violet-100 text-violet-800",
  100000004: "bg-slate-200 text-slate-700",
  100000005: "bg-rose-100 text-rose-800",
}

/** 円グラフ・棒グラフ用の実カラー */
export const ROOM_STATUS_HEX: Record<RoomStatus, string> = {
  100000000: "#f59e0b",
  100000001: "#3b82f6",
  100000002: "#10b981",
  100000003: "#8b5cf6",
  100000004: "#64748b",
  100000005: "#f43f5e",
}

export const ROOM_STATUS_OPTIONS: { value: RoomStatus; label: string }[] = [
  { value: 100000000, label: "清掃待ち" },
  { value: 100000001, label: "清掃中" },
  { value: 100000002, label: "清掃済" },
  { value: 100000003, label: "点検待ち" },
  { value: 100000004, label: "滞在中" },
  { value: 100000005, label: "整備中" },
]
export const ROOM_STATUS_ORDER: RoomStatus[] = [100000000, 100000001, 100000002, 100000003, 100000004, 100000005]

/** 「清掃側の対応が必要」な状況（KPI・要対応抽出用） */
export const ATTENTION_STATUSES: RoomStatus[] = [100000000, 100000003]
/** 稼働中（客が滞在している）＝稼働率の分子 */
export const OCCUPIED_STATUS: RoomStatus = 100000004

// ── 客室タイプ ────────────────────────────────────────────────
export type RoomType = 100000000 | 100000001 | 100000002 | 100000003
export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  100000000: "シングル",
  100000001: "ダブル",
  100000002: "ツイン",
  100000003: "スイート",
}
export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string }[] = [
  { value: 100000000, label: "シングル" },
  { value: 100000001, label: "ダブル" },
  { value: 100000002, label: "ツイン" },
  { value: 100000003, label: "スイート" },
]

// ── 作業区分（清掃記録）─────────────────────────────────────────
export type TaskType = 100000000 | 100000001 | 100000002
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  100000000: "清掃",
  100000001: "点検",
  100000002: "整備",
}
export const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 100000000, label: "清掃" },
  { value: 100000001, label: "点検" },
  { value: 100000002, label: "整備" },
]

// ── 作業結果 ──────────────────────────────────────────────────
export type TaskResult = 100000000 | 100000001
export const RESULT_LABEL: Record<TaskResult, string> = {
  100000000: "完了",
  100000001: "差し戻し",
}
export const RESULT_OPTIONS: { value: TaskResult; label: string }[] = [
  { value: 100000000, label: "完了" },
  { value: 100000001, label: "差し戻し" },
]

/**
 * 標準客室テンプレート（客室マスタが空のときの初期投入用）。
 * 2〜4 階に各 6 室、タイプと初期状況を混在させてボードのデモに使える構成。
 */
export const STANDARD_ROOMS: {
  name: string; floor: number; roomType: RoomType; capacity: number; status: RoomStatus
}[] = (() => {
  const floors = [2, 3, 4]
  const typeByCol: RoomType[] = [100000000, 100000000, 100000001, 100000002, 100000002, 100000003]
  const capByType: Record<RoomType, number> = { 100000000: 1, 100000001: 2, 100000002: 2, 100000003: 4 }
  const statusCycle: RoomStatus[] = [
    100000002, 100000004, 100000000, 100000004, 100000001, 100000003, // 2F
    100000004, 100000002, 100000004, 100000000, 100000005, 100000004, // 3F
    100000000, 100000004, 100000002, 100000004, 100000003, 100000004, // 4F
  ]
  const rooms: { name: string; floor: number; roomType: RoomType; capacity: number; status: RoomStatus }[] = []
  let i = 0
  for (const floor of floors) {
    for (let col = 0; col < 6; col++) {
      const roomType = typeByCol[col]
      rooms.push({
        name: `${floor}0${col + 1}`,
        floor,
        roomType,
        capacity: capByType[roomType],
        status: statusCycle[i] ?? 100000002,
      })
      i++
    }
  }
  return rooms
})()

export type Room = Record<string, unknown>
export type CleaningLog = Record<string, unknown>
