import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useRooms, useCleaningLogs } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  ROOM_TYPE_OPTIONS, OCCUPIED_STATUS, TASK_TYPE_OPTIONS,
  type RoomStatus, type TaskType, type TaskResult,
} from "@/types/dataverse"

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            レポートは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_REPORTS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function ReportsPage() {
  if (!FEATURE_REPORTS) return <DisabledFeatureCard />
  return <ReportsContent />
}

function ReportsContent() {
  const { data: rooms = [], isLoading } = useRooms()
  const { data: logs = [] } = useCleaningLogs()
  const P = PUBLISHER_PREFIX
  const r = { roomType: `${P}_room_type`, status: `${P}_status` }
  const l = { staff: `${P}_staff`, task_type: `${P}_task_type`, result: `${P}_result` }

  /** 担当者別 作業実績（完了 / 差し戻し） */
  const staffData = useMemo(() => {
    const map = new Map<string, { total: number; done: number; reject: number }>()
    for (const log of logs) {
      const staff = String(log[l.staff] ?? "（未記入）")
      const e = map.get(staff) ?? { total: 0, done: 0, reject: 0 }
      e.total++
      if ((log[l.result] as TaskResult) === 100000000) e.done++
      else if ((log[l.result] as TaskResult) === 100000001) e.reject++
      map.set(staff, e)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [logs])

  /** 作業区分別 件数 */
  const taskData = useMemo(() => {
    const counts = new Map<TaskType, number>()
    for (const log of logs) {
      const t = log[l.task_type] as TaskType | null
      if (t != null) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return TASK_TYPE_OPTIONS.map(o => ({ label: o.label, count: counts.get(o.value as TaskType) ?? 0 }))
  }, [logs])

  /** 客室タイプ別 稼働（滞在中 / 全室） */
  const typeData = useMemo(() => {
    const map = new Map<number, { total: number; occupied: number }>()
    for (const room of rooms) {
      const t = room[r.roomType] as number | null
      if (t == null) continue
      const e = map.get(t) ?? { total: 0, occupied: 0 }
      e.total++
      if ((room[r.status] as RoomStatus) === OCCUPIED_STATUS) e.occupied++
      map.set(t, e)
    }
    return ROOM_TYPE_OPTIONS
      .filter(o => map.has(o.value))
      .map(o => {
        const v = map.get(o.value)!
        return { name: o.label, total: v.total, occupied: v.occupied, rate: v.total > 0 ? Math.round((v.occupied / v.total) * 100) : 0 }
      })
  }, [rooms])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">レポート</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">レポート</h1>
        <p className="text-sm text-muted-foreground mt-1">清掃実績・稼働統計（クライアント集計）</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">担当者別 作業実績</CardTitle>
          <CardDescription>作業件数の多い順。差し戻しが多い担当は再教育の目安にする</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>担当者</TableHead>
                  <TableHead className="text-right">作業数</TableHead>
                  <TableHead className="text-right">完了</TableHead>
                  <TableHead className="text-right">差し戻し</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">記録がありません</TableCell></TableRow>
                ) : (
                  staffData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{row.done}</TableCell>
                      <TableCell className={`text-right tabular-nums ${row.reject > 0 ? "font-semibold text-rose-600" : ""}`}>{row.reject}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">作業区分別 件数</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>作業区分</TableHead>
                    <TableHead className="text-right">件数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">客室タイプ別 稼働</CardTitle>
            <CardDescription>滞在中 ÷ 全室</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>タイプ</TableHead>
                    <TableHead className="text-right">滞在中</TableHead>
                    <TableHead className="text-right">全室</TableHead>
                    <TableHead className="text-right">稼働率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeData.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">客室がありません</TableCell></TableRow>
                  ) : (
                    typeData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.occupied}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.rate}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
