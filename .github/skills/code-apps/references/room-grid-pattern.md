# ルームグリッド/ステータスボードパターン（Room Grid / Status Board）

客室の清掃状況、座席・テーブルの空き、駐車枠の使用状況、ロッカーの割当、病床の状態など、
**物理的・カテゴリ的に配置された対象を「状況で色分けしたセルの格子」で俯瞰し、クリックで状況を更新する**汎用実装パターン。
追加ライブラリ不要（プレーンな `<button>` グリッド + Tailwind）。
参考実装は [geek-hotel サンプル](../samples/geek-hotel/)（ホテル・客室ボード）。

- カテゴリ（階・エリア・ゾーン）でグループ化し、各対象を格子状のセルで表示
- セルの背景色 = 状況。凡例を添えてひと目で全体像が分かる
- セルクリックで操作（状況変更・担当割当）につなげ、閲覧と操作を 1 画面に統合

> 日付軸で並べるなら [月間カレンダーパターン](calendar-pattern.md)、ステータス列でカードを流すなら [カンバン](../samples/geek-kaizen/)、2 軸の件数集計なら [クロス集計](cross-tab-pattern.md)。
> ルームグリッドは**対象そのものが定位置に並ぶ**（部屋・席・枠）ときに向く。

---

## 状況の色体系を一元管理する

このパターンの肝は「状況 → 色」の対応表を 1 か所に持ち、セル・バッジ・グラフで使い回すこと。
`src/types/dataverse.ts`:

```ts
export type RoomStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004 | 100000005
export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = { /* 清掃待ち / 清掃中 / … */ }

/** グリッドのセル配色（背景+枠線+文字・ライト/ダーク両対応） */
export const ROOM_STATUS_CELL: Record<RoomStatus, string> = {
  100000000: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200",
  // …状況ごとに
}
/** 凡例・一覧用の丸ピル */
export const ROOM_STATUS_BADGE: Record<RoomStatus, string> = { 100000000: "bg-amber-100 text-amber-800", /* … */ }
/** グラフ用の実カラー */
export const ROOM_STATUS_HEX: Record<RoomStatus, string> = { 100000000: "#f59e0b", /* … */ }
```

---

## グリッドコンポーネント（汎用）

`src/components/room-grid.tsx` — 対象の種類に依存しない汎用セル格子。客室・座席・駐車枠に流用できる:

```tsx
import { cn } from "@/lib/utils"

export interface GridCell {
  id: string
  label: string          // セル主表示（部屋番号など）
  sublabel?: string      // 補助（タイプ・担当者など）
  colorClass: string     // セル配色（ROOM_STATUS_CELL[status]）
  statusLabel: string    // セル下部の状況ラベル
}
export interface GridGroup {
  key: string
  label: string          // グループ見出し（「3F」など）
  cells: GridCell[]
}

export function RoomGrid({ groups, onCellClick, emptyText = "対象がありません" }: {
  groups: GridGroup[]
  onCellClick?: (cellId: string) => void
  emptyText?: string
}) {
  const isEmpty = groups.every(g => g.cells.length === 0)
  if (isEmpty) return <p className="py-12 text-center text-sm text-muted-foreground">{emptyText}</p>

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.key}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
            <span className="text-xs text-muted-foreground">{group.cells.length} 室</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {group.cells.map(cell => (
              <button
                key={cell.id}
                type="button"
                disabled={!onCellClick}
                onClick={() => onCellClick?.(cell.id)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-shadow",
                  cell.colorClass,
                  onCellClick && "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                )}
              >
                <span className="text-base font-bold leading-none tabular-nums">{cell.label}</span>
                {cell.sublabel && <span className="text-[11px] leading-tight opacity-80 truncate w-full">{cell.sublabel}</span>}
                <span className="mt-1 text-[11px] font-medium leading-none">{cell.statusLabel}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## 使い方（Dataverse レコード → GridGroup 変換）

グループ化（階）とセルへの変換、色の割当は呼び出し側の責務:

```tsx
const groups = useMemo<GridGroup[]>(() => {
  const byFloor = new Map<number, Record<string, unknown>[]>()
  for (const room of rooms) {
    const floor = Number(room[r.floor] ?? 0)
    byFloor.set(floor, [...(byFloor.get(floor) ?? []), room])
  }
  return [...byFloor.entries()]
    .sort((a, b) => b[0] - a[0])                       // 上階を先頭に
    .map(([floor, list]) => ({
      key: String(floor),
      label: `${floor}F`,
      cells: list.map(room => {
        const status = (room[r.status] as RoomStatus | null) ?? 100000000
        return {
          id: String(room[r.id] ?? ""),
          label: String(room[r.name] ?? ""),
          sublabel: String(room[r.housekeeper] ?? ""),
          colorClass: ROOM_STATUS_CELL[status],        // ← 一元管理した配色
          statusLabel: ROOM_STATUS_LABEL[status],
        }
      }),
    }))
}, [rooms])

<RoomGrid groups={groups} onCellClick={openRoom} />
```

セルクリック → ダイアログで状況を更新。**操作に連動して子レコード（作業記録）を自動生成**すると、状態と履歴が同時に残る:

```tsx
const handleSetStatus = async (status: RoomStatus) => {
  await updateRoom.mutateAsync({ id, data: { [r.status]: status } })
  const taskType = taskTypeForStatus(status)     // 清掃済→清掃 / 整備中→整備 / それ以外→null
  if (taskType != null) {
    await createLog.mutateAsync({ [l.room_ref]: id, [l.log_date]: today, [l.task_type]: taskType, [l.result]: 100000000 })
  }
}
```

適用例:

| 業務 | グループ（行見出し） | セル | 状況 |
|---|---|---|---|
| 客室清掃（ホテル） | 階 | 客室 | 清掃待ち/清掃中/清掃済/滞在中/整備中 |
| 座席管理（飲食） | フロア・エリア | テーブル | 空席/予約/利用中/片付け中 |
| 駐車場管理 | ゾーン | 駐車枠 | 空き/使用中/予約/障害 |
| ロッカー管理 | 設置場所 | ロッカー | 空き/貸出中/故障 |
| 病床管理 | 病棟 | ベッド | 空床/入院中/清掃待ち/使用不可 |

---

## 設計上の注意

- **色は 1 か所に集約する**: `ROOM_STATUS_CELL`（セル）/ `ROOM_STATUS_BADGE`（凡例）/ `ROOM_STATUS_HEX`（グラフ）を状況キーで引く。散らばると状況追加時に色がズレる。
- **凡例を必ず添える**: 色だけでは意味が伝わらない。グリッド上部に全状況のバッジを並べ、色覚多様性にも配慮してラベルを併記する（セル下部にも状況名を出す）。
- **ダークモードを最初から**: セル背景は淡色になりがちなので `dark:` バリアントを色定義に含める。`bg-amber-50` だけだと暗所で沈む。
- **グループ化・並び順は呼び出し側**: コンポーネントは渡された順に描画する。階の降順・部屋番号の昇順などのソートは変換側で行う。
- **クリックは操作の入口に留める**: セル内に複数ボタンを詰め込まず、クリック→ダイアログで状況変更や担当割当を行うと、狭い画面でもタップしやすい。
- **状態と履歴を分ける**: 現在の状況は親（room）に、作業の記録は子（cleaning_log）に持つ。状況変更時に子を自動生成すると、ボードの即時性と監査可能な履歴を両立できる。
- **レスポンシブな列数**: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6` のように画面幅でセル数を増やす。1 行に詰め込みすぎると番号が読めない。
