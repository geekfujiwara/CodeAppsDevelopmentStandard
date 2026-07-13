import { cn } from "@/lib/utils"

/**
 * ステータスグリッド（客室ボード）。
 * カテゴリ（階など）でグループ化したエンティティを、状況で色分けしたセルの格子で俯瞰する。
 * セルクリックで操作（状況変更など）につなげる。客室以外にも座席・駐車枠・ロッカー等に流用可。
 */
export interface GridCell {
  id: string
  /** セル主表示（部屋番号など） */
  label: string
  /** 補助表示（客室タイプ・担当者など） */
  sublabel?: string
  /** セル配色クラス（背景+枠線+文字） */
  colorClass: string
  /** セル下部の状況ラベル */
  statusLabel: string
}
export interface GridGroup {
  key: string
  /** グループ見出し（「3F」など） */
  label: string
  cells: GridCell[]
}

export function RoomGrid({ groups, onCellClick, emptyText = "対象がありません" }: {
  groups: GridGroup[]
  onCellClick?: (cellId: string) => void
  emptyText?: string
}) {
  const isEmpty = groups.every(g => g.cells.length === 0)
  if (isEmpty) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.key}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
            <span className="text-xs text-muted-foreground">{group.cells.length} 室</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {group.cells.map(cell => {
              const clickable = !!onCellClick
              return (
                <button
                  key={cell.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onCellClick?.(cell.id)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-shadow",
                    cell.colorClass,
                    clickable && "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                  )}
                >
                  <span className="text-base font-bold leading-none tabular-nums">{cell.label}</span>
                  {cell.sublabel && (
                    <span className="text-[11px] leading-tight opacity-80 truncate w-full">{cell.sublabel}</span>
                  )}
                  <span className="mt-1 text-[11px] font-medium leading-none">{cell.statusLabel}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
