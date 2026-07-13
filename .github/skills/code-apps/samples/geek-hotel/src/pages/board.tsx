import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { RoomGrid, type GridGroup } from "@/components/room-grid"
import { useRooms, useUpdateRoom, useCreateCleaningLog } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ROOM_STATUS_LABEL, ROOM_STATUS_CELL, ROOM_STATUS_BADGE, ROOM_STATUS_ORDER, ROOM_STATUS_OPTIONS,
  ROOM_TYPE_LABEL, type RoomStatus, type RoomType,
} from "@/types/dataverse"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX
const r = {
  id:          `${P}_roomid`,
  name:        `${P}_name`,
  floor:       `${P}_floor`,
  roomType:    `${P}_room_type`,
  capacity:    `${P}_capacity`,
  status:      `${P}_status`,
  housekeeper: `${P}_housekeeper`,
}
const l = {
  room_ref:  `${P}_room_ref`,
  log_date:  `${P}_log_date`,
  task_type: `${P}_task_type`,
  staff:     `${P}_staff`,
  result:    `${P}_result`,
}

/** 状況遷移で清掃記録を残す作業区分（残さない遷移は null） */
function taskTypeForStatus(status: RoomStatus): number | null {
  if (status === 100000002) return 100000000 // 清掃済 → 清掃を記録
  if (status === 100000005) return 100000002 // 整備中 → 整備を記録
  return null
}

export default function BoardPage() {
  const { data: rooms = [], isLoading } = useRooms()
  const updateRoom = useUpdateRoom()
  const createLog = useCreateCleaningLog()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [housekeeper, setHousekeeper] = useState("")

  const selected = useMemo(
    () => rooms.find(x => String(x[r.id] ?? "") === selectedId) ?? null,
    [rooms, selectedId],
  )

  const groups = useMemo<GridGroup[]>(() => {
    const byFloor = new Map<number, Record<string, unknown>[]>()
    for (const room of rooms) {
      const floor = Number(room[r.floor] ?? 0)
      const arr = byFloor.get(floor) ?? []
      arr.push(room)
      byFloor.set(floor, arr)
    }
    return [...byFloor.entries()]
      .sort((a, b) => b[0] - a[0]) // 上階を先頭に
      .map(([floor, list]) => ({
        key: String(floor),
        label: `${floor}F`,
        cells: list
          .slice()
          .sort((a, b) => String(a[r.name] ?? "").localeCompare(String(b[r.name] ?? ""), "ja"))
          .map(room => {
            const status = (room[r.status] as RoomStatus | null) ?? 100000000
            const type = room[r.roomType] != null ? ROOM_TYPE_LABEL[room[r.roomType] as RoomType] : ""
            const hk = String(room[r.housekeeper] ?? "")
            return {
              id: String(room[r.id] ?? ""),
              label: String(room[r.name] ?? ""),
              sublabel: [type, hk].filter(Boolean).join(" · "),
              colorClass: ROOM_STATUS_CELL[status] ?? ROOM_STATUS_CELL[100000000],
              statusLabel: ROOM_STATUS_LABEL[status] ?? "—",
            }
          }),
      }))
  }, [rooms])

  const openRoom = (id: string) => {
    const room = rooms.find(x => String(x[r.id] ?? "") === id)
    setHousekeeper(String(room?.[r.housekeeper] ?? ""))
    setSelectedId(id)
  }

  const handleSetStatus = async (status: RoomStatus) => {
    if (!selected) return
    const id = String(selected[r.id] ?? "")
    try {
      await updateRoom.mutateAsync({
        id,
        data: { [r.status]: status, [r.housekeeper]: housekeeper.trim() || null },
      })
      const taskType = taskTypeForStatus(status)
      if (taskType != null) {
        await createLog.mutateAsync({
          [`${P}_name`]: `${String(selected[r.name] ?? "")} ${ROOM_STATUS_LABEL[status]}`,
          [l.room_ref]:  id,
          [l.log_date]:  new Date().toISOString().slice(0, 10),
          [l.task_type]: taskType,
          [l.staff]:     housekeeper.trim() || null,
          [l.result]:    100000000, // 完了
        })
      }
      toast.success(`${String(selected[r.name] ?? "")} を「${ROOM_STATUS_LABEL[status]}」にしました`)
      setSelectedId(null)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">客室ボード</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  const currentStatus = selected ? ((selected[r.status] as RoomStatus | null) ?? 100000000) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">客室ボード</h1>
        <p className="text-muted-foreground text-sm mt-1">階ごとの客室状況を俯瞰。セルをクリックして状況を更新します</p>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-2">
        {ROOM_STATUS_ORDER.map(s => (
          <span key={s} className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", ROOM_STATUS_BADGE[s])}>
            {ROOM_STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {rooms.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          客室がありません。客室マスタ（<code className="bg-muted px-1 rounded">VITE_FEATURE_ROOMS=true</code>）で「標準客室を投入」すると、ボードにデモ用の客室が並びます。
        </p>
      ) : (
        <RoomGrid groups={groups} onCellClick={openRoom} />
      )}

      {/* 状況変更ダイアログ */}
      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected ? `${String(selected[r.name] ?? "")} 号室` : ""}
            </DialogTitle>
            <DialogDescription>
              {selected && (
                <>
                  {Number(selected[r.floor] ?? 0)}F ·{" "}
                  {selected[r.roomType] != null ? ROOM_TYPE_LABEL[selected[r.roomType] as RoomType] : "—"} ·{" "}
                  定員 {Number(selected[r.capacity] ?? 0)} 名
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {currentStatus != null && (
              <div className="text-sm">
                現在の状況：
                <span className={cn("ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", ROOM_STATUS_BADGE[currentStatus])}>
                  {ROOM_STATUS_LABEL[currentStatus]}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="hk">清掃担当</Label>
              <Input id="hk" value={housekeeper} onChange={e => setHousekeeper(e.target.value)} placeholder="例: 田中" />
            </div>

            <div className="space-y-1.5">
              <Label>状況を変更</Label>
              <div className="grid grid-cols-2 gap-2">
                {ROOM_STATUS_OPTIONS.map(o => (
                  <Button
                    key={o.value}
                    variant={o.value === currentStatus ? "default" : "outline"}
                    size="sm"
                    disabled={updateRoom.isPending || createLog.isPending}
                    onClick={() => handleSetStatus(o.value)}
                    className="justify-start"
                  >
                    <span className={cn("mr-2 h-2.5 w-2.5 rounded-full", ROOM_STATUS_BADGE[o.value].split(" ")[0])} />
                    {o.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                「清掃済」「整備中」への変更時は清掃記録が自動で作成されます。
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
