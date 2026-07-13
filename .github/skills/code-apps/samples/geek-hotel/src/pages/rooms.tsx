import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_ROOMS } from "@/config"
import {
  ROOM_TYPE_LABEL, ROOM_TYPE_OPTIONS,
  ROOM_STATUS_LABEL, ROOM_STATUS_BADGE, ROOM_STATUS_OPTIONS,
  STANDARD_ROOMS, type RoomType, type RoomStatus,
} from "@/types/dataverse"
import { cn } from "@/lib/utils"
import { Plus, Pencil, Trash2, LayoutGrid } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX
const f = {
  id:          `${P}_roomid`,
  name:        `${P}_name`,
  floor:       `${P}_floor`,
  roomType:    `${P}_room_type`,
  capacity:    `${P}_capacity`,
  status:      `${P}_status`,
  housekeeper: `${P}_housekeeper`,
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            客室マスタは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_ROOMS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = { name: string; floor: string; roomType: string; capacity: string; status: string }
const EMPTY_FORM: FormData = {
  name: "", floor: "", roomType: String(100000000), capacity: "1", status: String(100000000),
}

export default function RoomsPage() {
  if (!FEATURE_ROOMS) return <DisabledFeatureCard />
  return <RoomsContent />
}

function RoomsContent() {
  const { data: rooms = [], isLoading } = useRooms()
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const deleteRoom = useDeleteRoom()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (room: Record<string, unknown>) => {
    setEditingId(String(room[f.id] ?? ""))
    setFormData({
      name:     String(room[f.name] ?? ""),
      floor:    room[f.floor] != null ? String(room[f.floor]) : "",
      roomType: room[f.roomType] != null ? String(room[f.roomType]) : String(100000000),
      capacity: room[f.capacity] != null ? String(room[f.capacity]) : "1",
      status:   room[f.status] != null ? String(room[f.status]) : String(100000000),
    })
    setIsFormOpen(true)
  }

  const buildData = (d: FormData): Record<string, unknown> => ({
    [f.name]:     d.name,
    [f.floor]:    d.floor.trim() === "" ? null : parseInt(d.floor, 10),
    [f.roomType]: Number(d.roomType),
    [f.capacity]: d.capacity.trim() === "" ? null : parseInt(d.capacity, 10),
    [f.status]:   Number(d.status),
  })

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("部屋番号は必須です")
      return
    }
    try {
      if (editingId) {
        await updateRoom.mutateAsync({ id: editingId, data: buildData(formData) })
        toast.success("客室を更新しました")
      } else {
        await createRoom.mutateAsync(buildData(formData))
        toast.success("客室を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleSeed = async () => {
    setIsSeeding(true)
    try {
      for (const tpl of STANDARD_ROOMS) {
        await createRoom.mutateAsync({
          [f.name]:     tpl.name,
          [f.floor]:    tpl.floor,
          [f.roomType]: tpl.roomType,
          [f.capacity]: tpl.capacity,
          [f.status]:   tpl.status,
        })
      }
      toast.success(`標準客室 ${STANDARD_ROOMS.length} 室を登録しました`)
    } catch {
      toast.error("登録に失敗しました")
    } finally {
      setIsSeeding(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteRoom.mutateAsync(deleteId)
      toast.success("客室を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">客室マスタ</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  const sorted = rooms.slice().sort((a, b) => {
    const fa = Number(a[f.floor] ?? 0), fb = Number(b[f.floor] ?? 0)
    if (fa !== fb) return fa - fb
    return String(a[f.name] ?? "").localeCompare(String(b[f.name] ?? ""), "ja")
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">客室マスタ</h1>
          <p className="text-muted-foreground text-sm mt-1">客室の部屋番号・階・タイプ・定員・状況</p>
        </div>
        <div className="flex items-center gap-2">
          {rooms.length === 0 && (
            <Button variant="outline" className="gap-2" onClick={handleSeed} disabled={isSeeding}>
              <LayoutGrid className="h-4 w-4" />
              {isSeeding ? "登録中..." : "標準客室を投入"}
            </Button>
          )}
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            新規登録
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>客室一覧</CardTitle>
          <CardDescription>{rooms.length} 室</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>部屋番号</TableHead>
                  <TableHead className="text-right">階</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead className="text-right">定員</TableHead>
                  <TableHead>状況</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      客室がありません。「標準客室を投入」でデモ用の客室を登録できます
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((room, idx) => {
                    const status = (room[f.status] as RoomStatus | null) ?? 100000000
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium tabular-nums">{String(room[f.name] ?? "")}</TableCell>
                        <TableCell className="text-right tabular-nums">{room[f.floor] != null ? `${room[f.floor]}F` : "—"}</TableCell>
                        <TableCell>{room[f.roomType] != null ? ROOM_TYPE_LABEL[room[f.roomType] as RoomType] : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{room[f.capacity] != null ? `${room[f.capacity]}名` : "—"}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", ROOM_STATUS_BADGE[status])}>
                            {ROOM_STATUS_LABEL[status]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(room)} title="編集">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(String(room[f.id] ?? ""))}
                              title="削除" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "客室編集" : "客室新規登録"}
        onSave={handleSave}
        isSaving={createRoom.isPending || updateRoom.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">部屋番号 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 301"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="floor">階</Label>
              <Input
                id="floor"
                type="number"
                value={formData.floor}
                onChange={e => setFormData(p => ({ ...p, floor: e.target.value }))}
                placeholder="例: 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity">定員</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={formData.capacity}
                onChange={e => setFormData(p => ({ ...p, capacity: e.target.value }))}
                placeholder="例: 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label>客室タイプ</Label>
              <Select value={formData.roomType} onValueChange={v => setFormData(p => ({ ...p, roomType: v }))}>
                <SelectTrigger><SelectValue placeholder="タイプを選択" /></SelectTrigger>
                <SelectContent>
                  {ROOM_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状況</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue placeholder="状況を選択" /></SelectTrigger>
                <SelectContent>
                  {ROOM_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormColumns>
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="客室を削除しますか？"
        description="この操作は取り消せません。客室を削除します（過去の清掃記録は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
